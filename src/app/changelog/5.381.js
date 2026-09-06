// @ts-nocheck
export default {version:'5.381', date:'2026-09-06', changes:[
  'Fixed #300: "6-Week District Sales Trend has no completeness guard on either window" -- ' +
  'confirmed still genuinely open (unlike its sibling #299, already shipped). At A Glance\'s ' +
  'weekly sparkline summed whatever days a source happened to have with no check on how much of ' +
  'the window it actually covered, so a sparse window (a data gap, an in-progress week) produced ' +
  'a real-looking but meaningless total or vs-LY ratio that then dominated the chart\'s shared ' +
  'Y-axis scale (reported: one week read "+391.69%" and flattened the other five bars).',
  'Extracted the computation to a pure, exported computeWeeklyTrend(ds, allLocs, weekStartDay, ' +
  'today). A week whose CURRENT-side window covers less than half its (loc x day) cells now ' +
  'renders as the pre-existing no-data placeholder instead of a real-looking total. A week whose ' +
  'LY-side window is sparse still shows its real, complete current sales -- only the misleading ' +
  'vsLY comparison is suppressed, same shape as the existing "lySales>0" guard, just extended to ' +
  'require real LY coverage rather than merely a nonzero sum.',
  '5 new tests (weekly-trend-completeness-guard-300.test.js): full coverage renders real numbers; ' +
  'sparse current-side blanks the week; sparse LY-side keeps sales but nulls vsLY; genuinely ' +
  'zero-sales weeks still hit the original no-data path.',
  'Also confirmed #299 (FOB Root-Cause Matrix ranking Base Food despite claiming to exclude it) ' +
  'was already fixed -- FOB_COMP\'s actionable:false + the rootCauseItems filter already do this. ' +
  'And confirmed #228 (resend count-completion notification) and #231 (Customer Complaints pull + ' +
  'metric) are both genuinely done -- verified against the actual shipped code (script, workflow, ' +
  'button wiring; live production capture run), not just a dispatch file\'s existence.',
  'Bundle: 536.86 KB eager / 850 KB budget (536.87 KB before -- no meaningful change).',
]};
