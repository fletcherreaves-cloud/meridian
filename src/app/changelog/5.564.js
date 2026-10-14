// @ts-nocheck
export default {version:'5.564', date:'2026-10-14', changes:[
  'Coaching cycles -- added the ability to backdate "when did this happen?" (owner, live, ' +
  '2026-10-14): a real cycle for Madill was logged today but its own note described training ' +
  'from a month earlier. Because coachedAt was always hardcoded to "today," the auto-captured ' +
  'baseline came from a trailing window ending AFTER the real intervention -- if the training ' +
  'changed behavior, that baseline already included the improvement, which would have silently ' +
  'erased the measured effect a month later at review.',
  'The Start-Coaching modal now has a "When did this happen?" date field (owner: "maybe we add ' +
  'ability to add effective date"), defaulting to today -- the common one-tap flow is unchanged ' +
  '-- but editable backward; a future date is rejected. engine/coaching-loop.js\'s ' +
  'startCoachingCycle() now anchors BOTH the baseline\'s trailing window and the 30-day review ' +
  'clock to that date instead of always today. Baseline/result stay auto-captured, never typed ' +
  '(rule 1 unchanged) -- the caller supplies a DATE, never a metric value.',
  'Anchored the new date at noon, not midnight, when computing the baseline: ' +
  'snapshotMetricValue() routes through lastClosedBusinessDay(), and CLAUDE.md\'s own 4am-' +
  'business-day-cutover rule treats 00:00-04:00 as still the PREVIOUS business day -- a ' +
  'midnight anchor would have silently rolled the backdated window back one more day. The live ' +
  'modal preview uses the identical anchor, so what the user sees before saving never disagrees ' +
  'with what actually gets persisted.',
  '11 new tests across coaching-loop.test.js (explicit coachedAt anchors the baseline to that ' +
  'window not today\'s, rejects a future date, defaults to today when omitted) and new ' +
  'coaching-modal-backdate.test.js (end-to-end through the real component: changing the date ' +
  'input changes both the live baseline preview and the saved payload, max attribute blocks a ' +
  'future date). Full suite green (604/604 files, 5651/5651 tests), npm run build clean, ' +
  'within the entry-chunk budget.',
]};
