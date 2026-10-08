// @ts-nocheck
// ── QSRSoft Forms — MCDOK People confidential review occurrences ────────────────────────────────
// Crew Review / Crew Trainer Review / Maintenance Review / Shift Manager Review. Pure functions:
// no Supabase, no fetch, no wall-clock read. Turns one raw `forms/schedules/scheduled` entry into
// the shape `qsr_forms_reviews` stores (supabase/schema-qsr-forms-reviews.sql).
//
// Deliberately a SEPARATE table/engine file from forms-completion.js's qsr_forms_completion, not
// an extension of it. MEASURED live 2026-10-08 (memory/finding-qsrsoft-review-forms-schedules-
// endpoint-2026-10-08.md): these 4 forms return ZERO rows from BOTH completionDetail (0 of
// 133,324 rows in a 90-day/all-store probe) and completionByForm (0 rows with the 4 formIds
// supplied explicitly) -- the server's compliance/schedule system does not route confidential,
// approval-gated review forms through either endpoint. They DO appear via a third endpoint,
// `forms/schedules/scheduled`, which carries no missed/open/schedule concept at all -- only
// occurrences that have actually been started, each as a `{response, form}` pair.
//
// 🔴 There is NO "submitted" flag on the source. Measured across every captured entry, including
// live in-progress ones started minutes before the probe ran: the raw `response` object carries
// only `answeredQuestions`/`totalQuestions`, no `completedAt`/`status`/`submitted` field anywhere,
// and no `schedule` object either (unlike the routine checklist forms completionDetail covers).
// `completionRatio` below is a raw fact (answered/total); whether a given ratio means "done" is a
// consumer-side judgment call, not something normalizeFormsReviewRow asserts. These forms also
// plateau a few questions short of total even when genuinely finished (completionByForm's own
// documented conditional-branching caveat applies here too) -- do not treat ratio < 1 as "still
// open" without a fresh measurement to justify a threshold.

export const REVIEW_FORMS = {
  '24409bc6-a228-473b-b070-ed4160f3c93a': 'MCDOK Shift Manager Review',
  '2af5d678-329b-4378-945f-d40eddaf17e1': 'MCDOK Crew Trainer Review',
  '5c0cc473-c394-4fa7-b76f-e8cf80fb0156': 'MCDOK Maintenance Review',
  '8c430399-a218-4b1f-aa85-89aca8cc441d': 'MCDOK Crew Review',
};

// Same convention as forms-completion.js's normalizeLoc (padded NSN, 'NOLOC' sentinel for an
// unparseable/missing location) -- kept as its own small copy rather than importing that file's
// unexported internal, matching how every other QSRSoft-sourced loader in this repo pads locally
// rather than sharing one helper (src/lib/supabase.js has ~15 independent copies of this exact
// one-liner; this is the established pattern, not a gap).
function normalizeLoc(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? String(n).padStart(7, '0') : 'NOLOC';
}

/**
 * Normalizes one raw `{response, form}` entry from `forms/schedules/scheduled` into the shape
 * `qsr_forms_reviews` stores. Returns null for an entry this table cannot key or that isn't one
 * of the 4 target review forms (not started yet -- i.e. no `response` -- missing formId/startedAt,
 * or a different form entirely; `schedules/scheduled` returns every form type, routine checklists
 * included, and this function is deliberately scoped to REVIEW_FORMS only).
 *
 * `reviewedWith` (a PLAINTEXT EMPLOYEE NAME on the raw payload, alongside userId) is reduced to
 * userIds ONLY here -- same PII rule as qsr_forms_completion's completed_by, same reason
 * (schema-qsr-forms-completion.sql's own header: the name never needs to be stored at all). The
 * raw payload's `sessions` array (which also carries the REVIEWER's own plaintext name per
 * sub-session) is not read at all; `reviewerUserId` (response.userId, a stable QSRSoft UUID) is
 * the person key this table uses.
 */
export function normalizeFormsReviewRow(raw) {
  const resp = raw?.response;
  const form = raw?.form;
  if (!resp || !form?.formId || !REVIEW_FORMS[form.formId]) return null;
  if (!resp.startedAt) return null;

  const rawLoc = Array.isArray(resp.locations) ? resp.locations[0] : resp.locations;
  const total = typeof resp.totalQuestions === 'number' ? resp.totalQuestions : null;
  const answered = typeof resp.answeredQuestions === 'number' ? resp.answeredQuestions : null;

  return {
    loc: normalizeLoc(rawLoc),
    formId: form.formId,
    formTitle: String(form.title || REVIEW_FORMS[form.formId]).trim(),
    startedAt: resp.startedAt,
    totalQuestions: total,
    answeredQuestions: answered,
    completionRatio: (total && answered != null) ? answered / total : null,
    reviewerUserId: resp.userId || null,
    reviewedWith: Array.isArray(resp.reviewedWith)
      ? [...new Set(resp.reviewedWith.map(p => p?.userId).filter(Boolean))]
      : [],
    isConfidential: resp.isConfidential === true,
    sharedWith: Array.isArray(resp.sharedWith) ? resp.sharedWith : [],
    isDeleted: resp.isDeleted === true,
  };
}

/** Normalizes a batch, dropping (not throwing on) any entry normalizeFormsReviewRow rejects. */
export function normalizeFormsReviewRows(rawRows) {
  return (Array.isArray(rawRows) ? rawRows : [])
    .map(normalizeFormsReviewRow)
    .filter(Boolean);
}
