// @ts-nocheck
export default {version:'5.643', date:'2026-11-05', changes:[
  '**Store Cockpit "Coach" box (Labor & Scheduling): configurable ±hrs/day coaching threshold, ' +
  'not a bare bigger-of-two comparison.** Owner-flagged: "the direction to coach to plan may not ' +
  'be accurate." Measured why: the box compared |planningGapHrs| vs |executionGapHrs| (the ' +
  'Needed→Scheduled and Scheduled→Actual weekly gaps) with NO magnitude threshold at all — a ' +
  'trivial few-hour gap still produced a confident "coach the shift managers" verdict. Owner\'s ' +
  'stated rule of thumb: "+/- 10 hour per day has always been a good rule of thumb" — a PER-DAY ' +
  'guideline, but `computeLaborGapSplit` only operates at the pay-WEEK grain. New ' +
  '`laborCoachVerdict()` (`src/engine/labor-gap-split.js`) applies hrsPerDay × the week\'s own ' +
  'day count as the threshold (not a hardcoded 70), picked after measuring a live complete pay ' +
  'week across all 27 stores (2026-10-28..11-03): each store\'s daily gaps run overwhelmingly ' +
  'one-signed within the week, not oscillating and cancelling, so weeklyGap/days is a faithful ' +
  'per-day figure for the stores measured. Four states, not two: `within-tolerance` ("On track" — ' +
  'no coaching signal), `plan-leads`/`exec-leads` (exactly one side over, same wording as before), ' +
  'and a new `both-over-*` state — the screenshot\'s own real numbers (228.3 vs 217.3 hrs/week) ' +
  'land here, where the old logic would have called the smaller side "tracks the guide" even ' +
  'though both are over the line. Threshold is per-tenant configurable: `DEF_SETTINGS.' +
  'laborCoachHrsPerDay` (default 10, `constants.js`), editable in Settings → Labor % Thresholds ' +
  '(`management.js`). The condensed "one-clause" mirror of this same verdict on the Overview tab ' +
  '(`TabDigestRow`\'s `shortVerdict`, `store-analytics.js`) now reuses the identical ' +
  '`laborCoachVerdict()` call rather than its own unthresholded comparison, so the two tabs can\'t ' +
  'disagree on the same store/week. 15 new/updated tests (`labor-gap-split.test.js`, ' +
  '`dispatch-204-store-cockpit.test.js`, `dispatch-208-tab-digest.test.js` — the latter\'s own ' +
  'fixture was also fixed to supply 7 real daily rows instead of one fake whole-week row, since ' +
  'the day COUNT now feeds the threshold); build clean. Labor Tools\' district-wide split table ' +
  '(`labor-tools.js`) keeps its own, separately-reasoned combined-gap banding for its "On plan" ' +
  'gate — not touched here; flagged as a follow-on worth reconciling, not fixed in this pass.',
]};
