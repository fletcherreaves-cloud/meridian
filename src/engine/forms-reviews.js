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
//
// ── The real "Score" (measured 2026-10-08, same session as the endpoint discovery above) ──────
// `GET forms/responses/questions?orgId=...&formId=...&userId=...&startedAt=...` returns the full
// question list for one occurrence, each with its real submitted `answer` (a 0-based INDEX into
// that question's own `options[]`, NOT the points value directly -- confirmed by resolving several
// indices against their options and matching the paired `pointsReceived`) and `pointsReceived`.
// completionRatio (answered/total question COUNT) is NOT the dashboard's displayed Score --
// measured side by side on real responses: two Maintenance Reviews both ~97% answered-by-count
// scored 29% and 91% respectively by points. The real Score is POINTS-WEIGHTED:
// Σ pointsReceived / Σ pointsPossible (summed only over questions that carry positive
// pointsPossible -- free-text/date/tally questions carry 0 and don't participate), landing on a
// 0-100 scale by the form's own design (every form's `pointsPossible` sum was exactly 100 in the
// capture). normalizeFormsReviewContent() below computes this; normalizeFormsReviewRow() above
// does NOT -- it only ever sees the cheap schedules/scheduled list payload, which has no points
// data at all.
//
// 🔴 PII LAND MINE, found inside this SAME content payload: these forms embed at least one
// free-text question ("Current Wage") whose `answer` is the employee's literal hourly pay rate --
// exactly the `pii_payrate`/`hourlyPayRate` scope CLAUDE.md's PII rules already name as sensitive,
// now confirmed to be reachable through a form response, not just employeeRoster/storePeoplePunches.
// normalizeFormsReviewContent() allow-lists by `hasOptions === true` (a structured rating/choice
// question, resolved to its option label) and drops every other question type unconditionally --
// free text is categorically never stored, regardless of title wording, because a title-matching
// denylist would need to anticipate every future PII-risk question text; an allow-list on
// structure does not.
//
// 🔴 Crew Review's content/score is NOT reachable by the owner's own account -- measured
// definitively, not a guess: 11 of 11 sampled responses spread across the form's full history
// returned `403 {"message":"You are not authorized to view this confidential response"}`, while
// the SAME call succeeded on every sampled response for the other 3 forms (Shift Manager Review,
// Crew Trainer Review, Maintenance Review). This is a real, form-specific authorization rule on
// QSRSoft's side (unrelated to this form's `predefinedSharedWith`, which DOES list the owner's
// userId) -- CONTENT_ACCESSIBLE_FORM_IDS below encodes the measurement so the pull script doesn't
// burn an API call per occurrence on a call that is known to always fail. Re-measure before
// changing this if QSRSoft-side permissions are ever adjusted.

export const REVIEW_FORMS = {
  '24409bc6-a228-473b-b070-ed4160f3c93a': 'MCDOK Shift Manager Review',
  '2af5d678-329b-4378-945f-d40eddaf17e1': 'MCDOK Crew Trainer Review',
  '5c0cc473-c394-4fa7-b76f-e8cf80fb0156': 'MCDOK Maintenance Review',
  '8c430399-a218-4b1f-aa85-89aca8cc441d': 'MCDOK Crew Review',
};

// See the header's Crew Review note -- measured 2026-10-08, 11/11 sampled responses denied.
export const CONTENT_ACCESSIBLE_FORM_IDS = new Set([
  '24409bc6-a228-473b-b070-ed4160f3c93a', // MCDOK Shift Manager Review
  '2af5d678-329b-4378-945f-d40eddaf17e1', // MCDOK Crew Trainer Review
  '5c0cc473-c394-4fa7-b76f-e8cf80fb0156', // MCDOK Maintenance Review
  // '8c430399-a218-4b1f-aa85-89aca8cc441d' (MCDOK Crew Review) deliberately excluded -- see header
]);

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

/**
 * Normalizes the raw `{questions: [...]}` payload from `forms/responses/questions` into the
 * real points-weighted score plus a PII-safe content list. See this file's header for the full
 * measurement this is built from (answer-is-an-index confirmation, the wage PII land mine, the
 * hasOptions allow-list rationale).
 *
 * `scorePct` is null when no question on the form carries positive pointsPossible (shouldn't
 * happen for any of the 4 target forms per the capture, but this function makes no assumption
 * about which formId it was called for -- that scoping lives in CONTENT_ACCESSIBLE_FORM_IDS and
 * the caller, not here).
 */
export function normalizeFormsReviewContent(rawQuestions) {
  const questions = Array.isArray(rawQuestions) ? rawQuestions : [];
  let pointsPossible = 0;
  let pointsReceived = 0;
  const content = [];

  for (const q of questions) {
    if (typeof q?.pointsPossible === 'number' && q.pointsPossible > 0) {
      pointsPossible += q.pointsPossible;
      pointsReceived += typeof q.pointsReceived === 'number' ? q.pointsReceived : 0;
    }
    // PII allow-list: only a structured rating/choice question (real options, resolved to its
    // label) is ever stored. Free text -- where the wage field and anything like it lives -- is
    // dropped unconditionally here, never inspected by title. See this file's header.
    if (q?.hasOptions !== true || !Array.isArray(q?.options)) continue;
    const idx = q.answer;
    const answerLabel = typeof idx === 'number' ? (q.options[idx]?.title ?? null) : null;
    content.push({
      questionId: q.id || null,
      title: typeof q.title === 'string' ? q.title.trim() : null,
      answerLabel,
      pointsPossible: typeof q.pointsPossible === 'number' ? q.pointsPossible : null,
      pointsReceived: typeof q.pointsReceived === 'number' ? q.pointsReceived : null,
    });
  }

  return {
    content,
    scorePointsPossible: pointsPossible,
    scorePointsReceived: pointsReceived,
    scorePct: pointsPossible > 0 ? (pointsReceived / pointsPossible) * 100 : null,
  };
}

// ── Panel rollups (Slice 2 — the UI, reads loadQsrFormsReviews()'s ALREADY-NORMALIZED rows) ────
// Same discipline as forms-completion.js's own Slice 2 helpers: pure, no Supabase, no wall-clock
// read, operates on the loader's output shape (camelCase, already out of the DB), not the raw API
// payload normalizeFormsReviewRow consumes.

/**
 * Per-form summary across a set of loaded rows. `avgScorePct` is Σ scorePointsReceived / Σ
 * scorePointsPossible across every row that HAS a score -- never the mean of each row's own
 * scorePct (CLAUDE.md's standing "never average averages" rule: a store with 1 scored occurrence
 * and one with 40 must not count equally). `scoredCount` can be less than `occurrenceCount` for
 * two reasons that look identical from this function alone: the row's form is Crew Review
 * (CONTENT_ACCESSIBLE_FORM_IDS excludes it, see header) or its content/score simply hasn't been
 * fetched yet for that occurrence (`contentAvailable: false` on an otherwise-eligible form) --
 * the panel distinguishes those by checking the formId against CONTENT_ACCESSIBLE_FORM_IDS itself,
 * not by anything returned here.
 */
export function computeReviewFormSummary(rows) {
  const byForm = new Map();
  for (const r of (rows || [])) {
    if (!r) continue;
    if (!byForm.has(r.formId)) {
      byForm.set(r.formId, {
        formId: r.formId, formTitle: r.formTitle,
        occurrenceCount: 0, scoredCount: 0, pointsPossible: 0, pointsReceived: 0,
      });
    }
    const f = byForm.get(r.formId);
    f.occurrenceCount++;
    if (r.contentAvailable && typeof r.scorePct === 'number') {
      f.scoredCount++;
      f.pointsPossible += r.scorePointsPossible || 0;
      f.pointsReceived += r.scorePointsReceived || 0;
    }
  }
  return [...byForm.values()].map(f => ({
    ...f,
    avgScorePct: f.pointsPossible > 0 ? (f.pointsReceived / f.pointsPossible) * 100 : null,
    // worst-scoring form surfaces first -- names a decision (which review type needs attention),
    // same ordering rationale as forms-completion.js's computeFormSummary. Forms with no score at
    // all (Crew Review) sort last, not first -- there's nothing actionable to read from "no score".
  })).sort((a, b) => (a.avgScorePct ?? 101) - (b.avgScorePct ?? 101));
}

/**
 * Loaded rows ordered for the occurrence list: newest first (startedAt), then store, then form
 * title -- same tie-break shape as forms-completion.js's sortOccurrencesForDisplay. A pure
 * passthrough (sorting only), kept here per this file's own standing rule that panels don't
 * reimplement ordering the engine already owns.
 */
export function sortReviewOccurrencesForDisplay(rows) {
  return [...(rows || [])].filter(Boolean).sort((a, b) =>
    (b.startedAt || '').localeCompare(a.startedAt || '') ||
    (a.loc || '').localeCompare(b.loc || '') ||
    (a.formTitle || '').localeCompare(b.formTitle || ''));
}
