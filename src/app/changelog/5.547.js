// @ts-nocheck
export default {version:'5.547', date:'2026-10-13', changes:[
  'District View / Store Tile Scorecard -- fixed the Controls Integrity panel reading "—" for ' +
  'every metric (2-Wk/4-Wk/6-Wk) despite Target being populated, and the "CTRL" score showing ' +
  'the exact same 75/100 for every store regardless of real performance (owner-reported, mass-' +
  'review notes 70). Root cause: compute6wk()\'s observation-coverage map (`_cov`) counted ONLY ' +
  'raw manual Controls/Ops upload rows, never the auto-first metric-source.js chain ' +
  '(glimpseRows/opsCashRows/cashRows) the underlying VALUES were already resolving through. A ' +
  'store with zero manual uploads -- the normal case now, per this app\'s auto/emailed-first ' +
  'standard -- read zero coverage for every Controls field even when real data existed, which ' +
  'blanked the scorecard\'s UI to all dashes and made computeCtrlScore skip every scoring ' +
  'component, collapsing to the same degenerate 75/100 floor for every store. Live-measured ' +
  '(Supabase service-role read): qsr_cash_sheet held real, current drawer-opens/T-Red/refund/ ' +
  'overring data for a sample store the whole time. `_cov` now counts real observations via the ' +
  'same metricSeries() resolution every value already uses, so coverage and the value it gates ' +
  'can never disagree about whether data exists. Removed the now-dead manual-rows-only obs6().',
]};
