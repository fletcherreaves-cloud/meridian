// @ts-nocheck
export default {version:'5.830', date:'2026-11-18', changes:[
  '**Fix: OEPE w/o Parked by Daypart report rendering all-blank ("—" in every cell, no error) ' +
  'after v5.829\'s page-load fix deployed.** `qsr_daily_activity` rows carry `loc` zero-padded ' +
  'to 7 chars (`"0003708"`), but the report\'s caller (STORE_NAMES / LocationSelector) supplies ' +
  'the short, un-padded form (`"3708"`) — every other panel that reads raw rows directly already ' +
  'normalizes this mismatch (constants.js\'s `unpadLoc`, used the same way by assignment-graph.js ' +
  'and others); this report was the one place that read qsr_daily_activity rows directly without ' +
  'it. Rows were bucketed under the padded key and looked up under the short one, so every store ' +
  'missed and every cell computed null — confirmed live (Dinner tab, 17,232 real matching rows in ' +
  'Supabase, 0 rendered). `computeDaypartOepeReport` now normalizes both the row loc and the ' +
  'caller loc through `unpadLoc` before bucketing/lookup. 2 new regression tests pin the exact ' +
  'mismatch (padded row vs. short caller loc, and the reverse).',
]};
