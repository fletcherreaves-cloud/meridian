// @ts-nocheck
export default {version:'5.747', date:'2026-11-12', changes:[
  '**Security: day-level flagged events — Phase 1 of the camera-hint fix.** Owner\'s own standing ' +
  'complaint, sharpened by a real case: a CASH-004 card for an employee at Holdenville showed ' +
  '"157.18 per $1,000 drawer sales" against a 45.62 peer average, with the camera-review hint ' +
  'telling the reader to pull a full 28-day window of footage. Traced it: that figure matched ' +
  'EXACTLY one single day inside the window (the other days were at or below the peer average) — ' +
  'the batch job (`scripts/security-rules-run.mjs`) evaluates a rolling window and stores ONE ' +
  'verdict for the whole thing (`security_findings`), so one outlier shift gets reported as if the ' +
  'whole window were bad. New sibling table `security_flagged_events` (schema file included, not ' +
  'yet run) stores one row per (rule, subject, SPECIFIC day) instead — computed by ' +
  '`src/engine/security-daily-events.js`\'s `deriveDailyBreaches()`, which re-runs the exact same ' +
  '`evaluateRule()` interpreter the window verdict already trusts, one calendar day at a time, ' +
  'against the rows the window-level call already had in hand. No new query, no new math. Wired ' +
  'into `computeFindingsForRule()` (the CASH-* / audit_rows rule family — the one the motivating ' +
  'case belongs to); EVENT-*/LABOR-*/INV-004 are the natural next increment, not done in this pass. ' +
  '`cameraReviewHint()` now accepts an optional list of specific dates and names them instead of ' +
  'the window when supplied — backward-compatible, falls back to the window when no dates are ' +
  'available yet. New read loader `loadSecurityFlaggedEventsForSubject()`. The full per-person/' +
  'per-location list view and the UI wiring to fetch+pass real dates are Phase 1b, not built yet. ' +
  '10 new tests; build clean.',
]};
