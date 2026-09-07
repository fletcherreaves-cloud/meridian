// @ts-nocheck
export default {version:'5.393', date:'2026-09-07', changes:[
  'District View Action Plan: added the missing TPPH action item. generatePlan() ' +
  '(store-dash.js) already built action items for OT/Cash O/S/OEPE/T-Red After/Labor % but ' +
  'never TPPH, despite TPPH being a scored metric with its own target (t.tTpph) and its own ' +
  'tile on this same panel. Fires when TPPH is >10% below target (higher-is-better, unlike ' +
  'OEPE/T-Red above it).',
  'Re-verified the rest of a 4-part compound backlog item and found 3 of 4 sub-claims already ' +
  'fixed: Forecast Table already has Goal/OEPE/TPPH/Labor% columns, Scorecards -> Controls ' +
  'already renders all 5 groups with completeness guards, and the Forecast Accuracy "Scheduled ' +
  'Projection" pagination bug was already fixed 2026-08-08 (loadQsrProjections()). Only the ' +
  'TPPH gap was real -- see memory/backlog-open-2026-09-06.md §4.',
  '3 new tests (store-dash-action-plan-tpph.test.js) calling generatePlan() directly, plus the ' +
  'existing dispatch-208 tab-digest suite re-verified unaffected (OT still deterministically ' +
  'fires first in that fixture). Full suite 483 files/4614 tests, build clean, eager budget ' +
  '537.96 KB / 850 KB (unchanged -- store-dash is lazy-loaded).',
]};
