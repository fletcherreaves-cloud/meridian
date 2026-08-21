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
    loc: String(parseInt(raw.location, 10)).padStart(7, '0'),
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

// The finding file's own measurement: the completionDetail window boundary is LOCAL MIDNIGHT at a
// HARDCODED UTC-5 (CDT) offset -- 05:00:00.000Z is midnight-to-midnight, matching every captured
// request's own start/end. This is deliberately NOT the 4am business day (compType=trading) used
// elsewhere in this codebase (src/utils/date.js's businessDate()) -- a different boundary, on a
// different host, and conflating the two would misattribute a form completion to the wrong day.
// Bucketing store-days by this same boundary is measured, not guessed -- it is the boundary the
// API's own request already uses.
const LOCAL_MIDNIGHT_OFFSET_MS = 5 * 60 * 60 * 1000;
function localDayKey(isoString) {
  const shifted = new Date(new Date(isoString).getTime() - LOCAL_MIDNIGHT_OFFSET_MS);
  return shifted.toISOString().slice(0, 10); // 'YYYY-MM-DD'
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
