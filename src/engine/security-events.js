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
export const EVENT_TOKENS = Object.freeze([
  'all_promo', 't_red_before', 't_red_after', 'cash_refund', 'cashless_refund',
  'employee_meal', 'manager_meal', 'pos_overring',
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
 * `loc` is NOT checked here -- it isn't on the raw row at all (see parseSecurityEventRow's own
 * comment); the caller-supplied loc is checked separately. */
function isUsableRow(raw) {
  return !!(raw && raw.event_token && raw.event_dt && raw.event_tm);
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
 * was scoped to), padded via the same convention every other QSRSoft table uses.
 */
export function parseSecurityEventRow(raw, { loc } = {}) {
  if (!isUsableRow(raw) || loc == null) return null;
  const crew = parseNameBadge(raw.crew);
  const mgr = parseNameBadge(raw.mgr);
  return {
    loc: String(loc),
    eventToken: raw.event_token,
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
    mgrCode: raw.mgr_code != null ? String(raw.mgr_code) : null,
    posSessionStartDt: raw.pos_session_start_dt || null,
    posSessionStartTm: raw.pos_session_start_tm || null,
  };
}

/** Batch wrapper -- drops (not throws on) any row parseSecurityEventRow rejects. */
export function parseSecurityEventRows(rawRows, opts) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .map(r => parseSecurityEventRow(r, opts))
    .filter(Boolean);
}
