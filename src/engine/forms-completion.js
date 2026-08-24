// @ts-nocheck
// ── QSRSoft Forms completion normalizer — Forms dashboard Slice 1 of 3 ───────────────────────────
// Pure functions: no Supabase, no fetch, no wall-clock read. Turns one raw `completionDetail` API
// row into the shape `qsr_forms_completion` stores (schema-qsr-forms-completion.sql). Every trap
// guarded against here is MEASURED, not assumed — see
// memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md for the full 4,714-row capture
// this is built from. This is the ONE place the raw payload's polymorphic status gets read; every
// other consumer (the panel, a future pull script) reads `statusState`/`completionRatio`, never
// the raw `status` field again.

/** True when a raw row carries the minimum fields this table can key and classify. */
function isUsableRow(raw) {
  return !!(raw && raw.location != null && raw.formId && raw.formTitle);
}

// "noLocation" is a REAL, documented member of every completionDetail request's `locations`
// array (28 entries for 27 stores) -- it catches submissions with no store attached, and the
// finding file is explicit these are worth surfacing, not dropping. parseInt('noLocation', 10)
// is NaN, so a naive `String(parseInt(...)).padStart(7,'0')` silently produced the garbage loc
// "0000NaN" -- a row that looked keyed but wasn't a real store. 'NOLOC' is an explicit sentinel,
// distinguishable from every zero-padded 7-digit NSN, so a consumer can special-case it rather
// than silently mis-group it with a real location.
function normalizeLoc(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? String(n).padStart(7, '0') : 'NOLOC';
}

// dispatch-adjacent finding: status IS POLYMORPHIC -- a string enum ("MISSED"/"--") OR a float
// (the within-form completion ratio on a completed row). missed === (status === 'MISSED') held on
// all 4,714 captured rows with zero disagreements, so branch on missed/hasResponse FIRST and only
// THEN read status as a number -- never String(status), never a switch on the raw value itself.
function classifyStatus(raw) {
  const missed = raw.missed === true;
  const hasResponse = raw.hasResponse === true;
  if (missed) return { statusState: 'missed', completionRatio: null };
  if (hasResponse) {
    const n = typeof raw.status === 'number' ? raw.status : Number(raw.status);
    return { statusState: 'completed', completionRatio: Number.isFinite(n) ? n : null };
  }
  // the "--" case -- scheduled, evaluation window not yet passed. NOT a miss.
  return { statusState: 'open', completionRatio: null };
}

/**
 * Normalizes one raw `completionDetail` row into a `qsr_forms_completion` row shape. Returns
 * null for a row this table cannot key or classify (missing required fields, or neither
 * scheduledAt nor completedOn present) rather than fabricating a placeholder key.
 *
 * `completedBy` (a PLAINTEXT EMPLOYEE NAME on the raw payload) is deliberately never read here
 * and never appears in the output — userId (a stable QSRSoft UUID) is the person key this table
 * uses. Never add a name field to this function without re-reading the finding file's PII section.
 */
export function normalizeFormsCompletionRow(raw) {
  if (!isUsableRow(raw)) return null;

  const { statusState, completionRatio } = classifyStatus(raw);

  // scheduledAt can be NULL -- captured on 32 ad-hoc completed submissions with no scheduled
  // occurrence behind them. completedOn is guaranteed present whenever scheduledAt is not (every
  // non-completed row IS scheduled), so this coalesce is always defined UNLESS the row is
  // malformed -- in which case there is nothing to key it on, and it is dropped.
  const occurrenceKey = raw.scheduledAt || raw.completedOn;
  if (!occurrenceKey) return null;

  return {
    loc: normalizeLoc(raw.location),
    formId: raw.formId,
    formTitle: String(raw.formTitle).trim(), // dirty titles (trailing spaces, one typo) -- display only
    occurrenceKey,
    statusState,
    completionRatio,
    missed: raw.missed === true,
    hasResponse: raw.hasResponse === true,
    scheduledAt: raw.scheduledAt || null,
    startedAt: raw.startedAt || null,
    completedOn: raw.completedOn || null,
    // ACTIVE time, not wall-clock elapsed -- never derive this from completedOn - startedAt (the
    // floor case in the capture: 28.97 days elapsed against 109 seconds of active time).
    timeToCompleteMs: typeof raw.timeToComplete === 'number' ? raw.timeToComplete : null,
    userId: raw.userId || null,
    score: typeof raw.score === 'number' ? raw.score : null,
    reviewedWith: raw.reviewedWith || null,
    assignedTo: Array.isArray(raw.assignedTo) ? raw.assignedTo : [],
  };
}

/** Normalizes a batch, dropping (not throwing on) any row normalizeFormsCompletionRow rejects. */
export function normalizeFormsCompletionRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .map(normalizeFormsCompletionRow)
    .filter(Boolean);
}

// ── Slice 2 — the store-day rollup the panel renders ─────────────────────────────────────────────
// Same pure-function discipline: no Supabase, no wall-clock read (the caller supplies the rows;
// nothing here calls Date.now()). Operates on ALREADY-NORMALIZED rows (normalizeFormsCompletionRow's
// output), never on the raw API payload.

// The finding file's own measurement: the completionDetail window boundary is LOCAL MIDNIGHT in
// the estate's own timezone -- the captured sample requests all used 05:00:00.000Z, which reads
// as midnight-to-midnight ONLY during Central Daylight Time (UTC-5). A fixed 5h offset is wrong
// for the CST half of the year (UTC-6): a row at 2026-12-21T04:30:00Z is 22:30 CST on Dec 20, but
// the naive offset bucketed it into Dec 21 -- a silent day-of misattribution (a real completion
// reads as a miss on one day and a phantom completion on the next) that would surface ~10 weeks
// after this shipped, exactly when nobody would think to look here. Fixed by asking the real IANA
// timezone via Intl instead of hardcoding either offset. This is deliberately NOT the 4am business
// day (compType=trading) used elsewhere in this codebase (src/utils/date.js's businessDate()) --
// a different boundary, on a different host, and conflating the two would misattribute a form
// completion to the wrong day regardless of DST.
//
// America/Chicago is correct for the WHOLE estate, not just the Oklahoma stores -- worth a
// comment because "Florida" reads as Eastern: all seven FL stores are Panhandle, west of the
// Apalachicola river, and therefore Central time (see CLAUDE.md's Organization Context).
const ESTATE_TZ = 'America/Chicago';
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ESTATE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
// hourCycle explicitly 'h23' (NOT just hour12:false) -- hour12:false alone leaves the actual
// midnight-hour rendering to the runtime's default hourCycle resolution for the locale, which
// is NOT guaranteed portable: this exact code rendered midnight as "00:00" on the sandbox's
// Node 22 locally but "24:00" on CI's Node **20.20.2** (ci.yml:42's pin -- confirmed by reading
// the actual CI job log's "Environment details" block, not assumed from the runner's own
// unrelated "Node 20 is being deprecated, running Node 24 by default" banner, which is about the
// Actions runner's own JS-action execution environment, a different layer from the pinned
// setup-node version that actually runs `npm test`/`npm run build` -- see dispatch #60), breaking
// chicagoMidnightUTC's string match on every input and failing CI while passing locally (measured,
// not assumed -- see the CI job log this comment was added in response to). Forcing hourCycle
// explicitly removes the ambiguity outright. Guarded by
// src/__tests__/ratchet-intl-hourcycle.test.js so this can't silently regress again.
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: ESTATE_TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
});

// Exported (Slice 4, dispatch #101) so the panel's per-occurrence detail view can show "the" date
// for a row on the SAME boundary computeFormStoreDayRollup buckets it into -- an occurrence shown
// as Aug 20 in the detail list must be the same Aug 20 its store-day rollup counted it toward.
export function localDayKey(isoString) {
  return DAY_FMT.format(new Date(isoString)); // 'YYYY-MM-DD' in the estate's real local time, DST-aware
}

// The reverse direction: given a calendar day (as the estate reckons it), the UTC instant of
// that day's real local midnight. No IANA-aware "construct an instant from a zoned wall-clock
// time" primitive exists in plain JS, so this tries both US Central offsets (-05:00 CDT / -06:00
// CST) and keeps whichever one actually round-trips back to `dayStr` at 00:00 through the SAME
// Intl formatter localDayKey() uses -- one owner for "what counts as this day," in both
// directions. Midnight is never the ambiguous/skipped hour on a US DST transition (that's 2am),
// so exactly one of the two candidates always matches, transition days included.
function chicagoMidnightUTC(dayStr) {
  for (const offsetHours of [5, 6]) {
    const candidate = new Date(`${dayStr}T${String(offsetHours).padStart(2, '0')}:00:00.000Z`);
    if (DAY_FMT.format(candidate) === dayStr && TIME_FMT.format(candidate) === '00:00') return candidate;
  }
  throw new Error(`chicagoMidnightUTC: could not resolve local midnight for ${dayStr}`);
}

/**
 * The `{startDate, endDate}` window the completionDetail API itself expects for a run of
 * calendar days from `startDay` through `endDay` inclusive (both `'YYYY-MM-DD'`), on the SAME
 * real-timezone local-midnight boundary `localDayKey()` buckets rollups on -- one owner for the
 * boundary, not a second inline offset in the pull script. `startDate` is `startDay`'s local
 * midnight; `endDate` is one millisecond before the local midnight AFTER `endDay`.
 */
export function apiWindowForDays(startDay, endDay) {
  // The END boundary is the local midnight AFTER endDay, resolved through the SAME
  // chicagoMidnightUTC() as the start -- NOT startMs + 24h, which is wrong by an hour on
  // either DST transition day (a "day" is 23h or 25h of real elapsed time, never a clean 24).
  const [y, m, d] = endDay.split('-').map(Number);
  const dayAfterEndDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const startMs = chicagoMidnightUTC(startDay).getTime();
  const endMs = chicagoMidnightUTC(dayAfterEndDay).getTime() - 1;
  return { startDate: new Date(startMs).toISOString(), endDate: new Date(endMs).toISOString() };
}

const DEFAULT_THRESHOLD = 0.8;

/**
 * Rolls normalized rows up to one entry per (loc, formId, local day) -- "a store-day," in the
 * finding file's own vocabulary. Judged on RESOLVED occurrences only: 'open' ("--", still due)
 * rows are excluded from BOTH the numerator and the denominator, per the dispatch's own explicit
 * instruction -- including them would mark the current day red at every store, every day, since
 * a not-yet-due form always reads as unresolved.
 *
 * `thresholds` is a caller-supplied `{[formId]: number}` map (the per-form tunable, not a single
 * global bar -- a 1/day pre-shift and a 27-45/day Travel Path cannot share one line). Any formId
 * not in the map falls back to `defaultThreshold` (0.8, the owner-stated default).
 *
 * Total-day attribution ONLY -- this function never reads userId/completedBy and the output rows
 * carry no person dimension. Manager attribution is not possible from this data alone (measured:
 * 0 of 3,886 missed rows in the capture carry a person), so this is the correct grain, not a
 * simplification pending a future upgrade.
 */
export function computeFormStoreDayRollup(rows, { thresholds = {}, defaultThreshold = DEFAULT_THRESHOLD } = {}) {
  const groups = new Map(); // `${loc}|${formId}|${day}` -> accumulator
  for (const r of (rows || [])) {
    if (!r || r.statusState === 'open') continue; // excluded from numerator AND denominator
    const day = localDayKey(r.occurrenceKey);
    const key = `${r.loc}|${r.formId}|${day}`;
    if (!groups.has(key)) {
      groups.set(key, { loc: r.loc, formId: r.formId, formTitle: r.formTitle, day, resolvedCount: 0, completedCount: 0 });
    }
    const g = groups.get(key);
    g.resolvedCount++;
    if (r.statusState === 'completed') g.completedCount++;
  }
  return [...groups.values()].map(g => {
    const threshold = thresholds[g.formId] ?? defaultThreshold;
    const passRate = g.resolvedCount ? g.completedCount / g.resolvedCount : null;
    return { ...g, passRate, threshold, pass: passRate == null ? null : passRate >= threshold };
  }).sort((a, b) => a.day.localeCompare(b.day) || a.formTitle.localeCompare(b.formTitle) || a.loc.localeCompare(b.loc));
}

/**
 * Per-form summary across a set of store-day rollup rows (computeFormStoreDayRollup's own output).
 * `passRate` here is Σcompleted / Σresolved across every store-day for that form -- NEVER a mean
 * of the individual store-day rates (CLAUDE.md's standing "never average averages" rule; a store
 * with 1 resolved occurrence and a store with 40 must not count equally toward the estate number).
 * `storeDaysPassed`/`storeDaysTotal` is the OTHER reading -- how many store-days individually
 * cleared that form's own threshold -- and the two numbers can legitimately disagree (a form could
 * be 79% complete in aggregate while still clearing >80% pass on most individual store-days, or
 * vice versa); the panel shows both rather than picking one.
 */
export function computeFormSummary(rollupRows) {
  const byForm = new Map();
  for (const g of (rollupRows || [])) {
    if (!byForm.has(g.formId)) {
      byForm.set(g.formId, {
        formId: g.formId, formTitle: g.formTitle, threshold: g.threshold,
        resolvedCount: 0, completedCount: 0, storeDaysTotal: 0, storeDaysPassed: 0,
      });
    }
    const f = byForm.get(g.formId);
    f.resolvedCount += g.resolvedCount;
    f.completedCount += g.completedCount;
    f.storeDaysTotal++;
    if (g.pass) f.storeDaysPassed++;
  }
  return [...byForm.values()].map(f => ({
    ...f,
    passRate: f.resolvedCount ? f.completedCount / f.resolvedCount : null,
    storeDaysPassRate: f.storeDaysTotal ? f.storeDaysPassed / f.storeDaysTotal : null,
  })).sort((a, b) => (a.passRate ?? 1) - (b.passRate ?? 1)); // worst-performing form first -- the one that names a decision
}

// ── Slice 4 (dispatch #101) — per-occurrence detail, sort + format helpers ─────────────────────
// Same discipline as Slices 1-2: pure, no Supabase, no wall-clock read. The panel already owns a
// filtered `rows` array (loadQsrFormsCompletion's own output, scope/window already applied
// server-side) -- these two functions are the "light transformation" the dispatch anticipated
// belonging here rather than inline in forms-panel.js, exactly like computeFormStoreDayRollup
// already does for the rollup view.

/**
 * `timeToCompleteMs` (ACTIVE time -- see normalizeFormsCompletionRow's own comment on why this is
 * never derived from completedOn-startedAt) as a human duration, not raw milliseconds. Measured
 * range in the capture is p10 24s to max 6,878s (~115min) -- h/m/s covers the whole spread.
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Per-occurrence rows ordered for the detail view: newest occurrence first (by `occurrenceKey`,
 * the SAME field computeFormStoreDayRollup buckets days on -- see localDayKey above), then store,
 * then form title, so a reader scanning top-to-bottom sees "what happened most recently" first.
 * A passthrough shape (adds nothing to each row) -- sorting is the only transformation, kept here
 * rather than inline in the panel per this file's own header comment ("panels don't reimplement
 * math the engine already owns"). Deliberately does NOT drop 'open' rows the way
 * computeFormStoreDayRollup does for pass-rate math -- a reader looking at individual occurrences
 * should still see what is currently scheduled/not-yet-due, just not counted against anyone.
 */
export function sortOccurrencesForDisplay(rows) {
  return [...(rows || [])].filter(Boolean).sort((a, b) =>
    (b.occurrenceKey || '').localeCompare(a.occurrenceKey || '') ||
    (a.loc || '').localeCompare(b.loc || '') ||
    (a.formTitle || '').localeCompare(b.formTitle || ''));
}
