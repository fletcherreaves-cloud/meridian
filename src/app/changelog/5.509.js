// @ts-nocheck
export default {version:'5.509', date:'2026-10-08', changes:[
  'Data pipeline: pull the 4 MCDOK People confidential review forms (Crew Review, Crew Trainer ' +
  'Review, Maintenance Review, Shift Manager Review) -- measured live that these never reach ' +
  'the existing Forms Completion pull\'s endpoints, but a separate endpoint ' +
  '(forms/schedules/scheduled) does carry them, including in-progress occurrences. New table ' +
  'qsr_forms_reviews, new daily pull (scripts/qsrsoft-forms-reviews-pull.mjs), watched by ' +
  'sync-failure-watch.yml. No UI panel yet -- data pipeline only; see ' +
  'memory/finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08.md for the full capture.',
]};
