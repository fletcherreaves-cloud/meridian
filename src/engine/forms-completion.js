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
