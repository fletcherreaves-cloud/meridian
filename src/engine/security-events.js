// @ts-nocheck
// ── QSRSoft event_details parser — dispatch #58, #56 Part E ──────────────────────────────────────
// Pure functions: no Supabase, no fetch, no wall-clock read. Turns one raw `event_details` API row
// into the shape scripts/qsrsoft-security-events-pull.mjs writes to qsr_security_events
// (supabase/schema-qsr-security-events.sql) -- everything EXCEPT the async employee-token
// resolution, which needs a live RPC call and therefore belongs to the pull script's own upsert
// step (mirrors tokenizeRows()'s split in src/engine/identity-vault.js: this module extracts
// plaintext names, the caller tokenizes them right before the DB write, never in between).
//
// See memory/finding-qsrsoft-event-details-endpoint-2026-08-21.md for the full field-level
// capture this is built from, and memory/dispatch-58.md for the scoping.

// The 8 enumerated event_tokens (owner sweep, 2026-08-21) -- global, not per-store. Two negative
// results constrain what this endpoint can ever deliver: cash over/short has NO drill-down (a
// computed variance, not a discrete event) and discount is not on this report at all. Both are
// documented, not silently missing -- see the panel's own explicit caveat text.
//
// 9th token added task #131 (2026-11-10), MEASURED, not guessed: the owner's KB screenshot named
// a new category "General Drawer Open" (a drawer open with no other POS event attached) but gave
// no event_token string. `scripts/qsrsoft-security-events-new-fields-probe-2026-11-08.mjs`'s own
// guess list didn't include the real one either -- the real token was found by brute-force probe
// against the live endpoint: `event_token: 'drawer_open'` returns real rows, every day, every
// store tried (4 stores x 9 dates, 2026-11-01..09 -- 3-21 rows/store/day, far more frequent than
// any of the other 8 tokens). ⚠️ The API's own `event_name` on these rows is **"Unauthorized
// Drawer Open"**, not literally "General Drawer Open" -- the owner's KB screenshot names the QSRSoft
// UI's report CATEGORY, the API calls the discrete event something else; both describe the same
// thing (a drawer opened with no attached order -- `order_key` is the literal sentinel `":0"`,
// `event_amt` is `0`, `tender_type` is `"other"`). Do not "correct" `event_name` to match the KB
// label -- it is passed through verbatim like every other token, and QSRSoft's own two names for
// one category are a fact about their product, not a bug in this parser.
export const EVENT_TOKENS = Object.freeze([
  'all_promo', 't_red_before', 't_red_after', 'cash_refund', 'cashless_refund',
  'employee_meal', 'manager_meal', 'pos_overring', 'drawer_open',
]);

/** The path/body storeRef this API expects -- the unpadded NSN, same conversion the DAR pull
 * already performs. Reused here, not re-derived (finding file's own resolved open question). */
export function storeRefFromLoc(loc) {
  return String(Number(loc));
}

// "Name - 91" -> { name: 'Name', badge: '91' }. Sentinels ("Unavailable", "Unknown", empty) return
// { name: null, badge: null } -- an honest absence, never a fabricated placeholder. The badge is a
// NEW identifier (finding file) -- NOT geid, two digits, a separate namespace -- kept as its own
// column rather than merged into any existing person-id field.
function parseNameBadge(raw) {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!s || /^unavailable$/i.test(s) || /^unknown$/i.test(s)) return { name: null, badge: null };
  const m = s.match(/^(.*?)\s*-\s*(\d+)\s*$/);
  if (!m) return { name: s, badge: null }; // no trailing " - NN" -- keep the name, no badge to extract
  return { name: m[1].trim() || null, badge: m[2] };
}

/** True when a raw event_details row carries the minimum fields this table can key on.
 * `loc` and `eventToken` are NOT checked here -- neither is on the raw row at all (see
 * parseSecurityEventRow's own comment); the caller-supplied values are checked separately.
 * ⚠️ MEASURED 2026-11-09: a real, live event_details response row carries no `event_token`
 * field whatsoever -- confirmed against a live capture, not assumed. The event type is only
 * known from which `event_token` the request itself was scoped to (the pull's own loop
 * variable), never echoed back per-row. Requiring `raw.event_token` here (the original
 * dispatch #58 code, written and unit-tested entirely from a guessed fixture, never against a
 * real response -- see the #83 rebuild's own "NOT live-verified" header) made every single row
 * unkeyable, 100% of the time, regardless of credentials or network -- the real root cause of
 * qsr_security_events staying at zero rows through the entire multi-month investigation in
 * memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md, independent of that
 * investigation's own (real, separate) GitHub-Actions-specific 403 finding. */
function isUsableRow(raw) {
  return !!(raw && raw.event_dt && raw.event_tm);
}

// `drawer_open` rows (task #131) carry a literal `"0000-00-00"`/`"00:00:00"` SENTINEL for
// pos_session_start_dt/_tm, not an absent field -- MEASURED across every drawer_open row sampled
// (4 stores x 9 dates, 2026-11-10 probe): a drawer-open-with-no-POS-event by definition has no
// POS session to report, and QSRSoft encodes that absence as an invalid zero-date rather than
// `null`. `"0000-00-00"` is truthy, so the old `raw.pos_session_start_dt || null` pattern passed
// it straight through -- and `qsr_security_events.pos_session_start_dt` is a Postgres `date`
// column, which REJECTS `'0000-00-00'::date` outright. Left unguarded, wiring drawer_open into
// the real pull would have broken every save, not just left a cosmetic value. Nulled here, keyed
// off the date sentinel (not the time field alone -- `00:00:00` is itself a value a REAL
// midnight session could carry, however unlikely given the 4am ABC boundary; the date sentinel is
// the unambiguous signal).
const NULL_DATE_SENTINEL = '0000-00-00';
function parseSessionStart(raw) {
  const dt = raw?.pos_session_start_dt;
  if (!dt || dt === NULL_DATE_SENTINEL) return { posSessionStartDt: null, posSessionStartTm: null };
  return { posSessionStartDt: dt, posSessionStartTm: raw.pos_session_start_tm || null };
}

/**
 * Parses one raw `event_details` row into the intermediate shape the pull script tokenizes and
 * writes. `crewName`/`mgrName` are PLAINTEXT here -- this function is the one place they exist in
 * memory outside the raw API response; the caller MUST route them through
 * getOrCreateToken()/tokenizeRows() (src/engine/identity-vault.js) before any DB write and must
 * never log, store, or fixture a name past this point. Returns null for an unkeyable row rather
 * than fabricating a placeholder key, matching every other normalizer in this repo
 * (normalizeFormsCompletionRow's own contract).
 *
 * `loc` here is the ALREADY-padded loc (this repo's own convention) -- the caller supplies it
 * (it isn't on the raw row at all; the row belongs to whichever (store, date-range) the request
 * was scoped to), padded via the same convention every other QSRSoft table uses. `eventToken` is
 * the SAME -- the caller's own request-scoped event_token, never read from the raw row (see
 * isUsableRow's comment for why).
 */
export function parseSecurityEventRow(raw, { loc, eventToken } = {}) {
  if (!isUsableRow(raw) || loc == null || eventToken == null) return null;
  const crew = parseNameBadge(raw.crew);
  const mgr = parseNameBadge(raw.mgr);
  const session = parseSessionStart(raw || {});
  return {
    loc: String(loc),
    eventToken,
    eventDt: raw.event_dt,
    eventTm: raw.event_tm,
    regNum: raw.reg_num || null,
    orderKey: raw.order_key || null,
    eventName: raw.event_name || null,
    eventDisplay: raw.event_display || null,
    eventAmt: typeof raw.event_amt === 'number' ? raw.event_amt : (raw.event_amt != null ? Number(raw.event_amt) : null),
    // remaining_amt semantics are UNCONFIRMED (finding file) -- passed through opaquely, never
    // used to compute anything here or in the panel.
    remainingAmt: typeof raw.remaining_amt === 'number' ? raw.remaining_amt : (raw.remaining_amt != null ? Number(raw.remaining_amt) : null),
    tenderType: raw.tender_type || null,
    daypartName: raw.daypart_name || null,
    storeBusnDt: raw.store_busn_dt || null,
    crewName: crew.name,   // PLAINTEXT -- tokenize before persisting, never store/log/fixture as-is
    crewBadge: crew.badge,
    mgrName: mgr.name,     // PLAINTEXT -- same rule
    mgrBadge: mgr.badge,
    // ⚠️ task #131 (2026-11-10): this IS the field the owner's "Manager Authorization Type"
    // (manager code / biometrics / unknown) KB screenshot describes -- it has been captured and
    // mapped here since the ORIGINAL dispatch #58 build (commit 3dddb652), predating task #131,
    // not a gap this dispatch opened. What's new: a live re-probe (164 real pos_overring rows,
    // 4 stores x 9 dates) found a THIRD raw value, `"false"`, that the original 2026-08-21
    // capture (38 rows) never saw -- that capture only documented `"true"`/`"Unknown"`. No row in
    // either sample carried any OTHER raw key (e.g. a literal `mgr_auth_type`), so the 3-way KB
    // label is almost certainly QSRSoft's own display translation of this same raw value, not a
    // separate field this parser is missing. **Not confirmed which raw value maps to
    // "Biometrics"** -- no row in 164 samples exhibited it, so there is nothing to measure that
    // mapping against yet. Stored verbatim, as before; do not invent a true/false/Unknown ->
    // manager-code/biometrics/unknown translation without a captured example of each.
    mgrCode: raw.mgr_code != null ? String(raw.mgr_code) : null,
    posSessionStartDt: session.posSessionStartDt,
    posSessionStartTm: session.posSessionStartTm,
  };
}

/** Batch wrapper -- drops (not throws on) any row parseSecurityEventRow rejects. */
export function parseSecurityEventRows(rawRows, opts) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .map(r => parseSecurityEventRow(r, opts))
    .filter(Boolean);
}
