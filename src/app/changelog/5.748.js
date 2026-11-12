// @ts-nocheck
export default {version:'5.748', date:'2026-11-12', changes:[
  '**Security: day-level flagged events — Phase 1b, extends v5.747\'s camera-hint fix to every ' +
  'remaining day-grain rule family.** v5.747 wired `deriveDailyBreaches()` into CASH-*/audit_rows ' +
  'only (the family the motivating Ryan A/Holdenville case belongs to). This pass wires the exact ' +
  'same helper into EVENT-* (`computeSecurityEventFindingsForRule`), LABOR-001/002 ' +
  '(`computeLaborEmployeeFindingsForRule`), LABOR-003 (`computeManagerEditFindingsForRule`), and ' +
  'INV-004 (`computeManagerDaypartFindingsForRule`) — each already produces one-row-per-subject-' +
  'per-day rows with a `date` field, the one precondition the helper needs, so this is wiring, not ' +
  'new logic. INV-001/002 (`computeItemFindingsForRule`) stay deliberately excluded — ' +
  '`qsr_variance_stat` is monthly grain, so there is no finer "which day" for that data to answer. ' +
  'Every day-grain rule now writes to `security_flagged_events` (schema shipped in v5.747, still ' +
  'not yet run) alongside its existing rolling-window verdict. 3 new tests (one per newly-wired ' +
  'family, confirming a flagged subject gets its real day back and a clear one gets none); full ' +
  'suite (7908 tests) and build pass clean. Still open: the panel\'s own UI wiring to fetch and ' +
  'pass real dates into `cameraReviewHint()`, and the dedicated per-person/per-location list view ' +
  '— Phase 1c, not done in this pass.',
]};
