// @ts-nocheck
export default {version:'5.580', date:'2026-10-17', changes:[
  '**FOB Reference Table — new live Reports panel** (owner: added a manual FOB reference table ' +
  'to his November Restaurant Projections workbook, then "scope what it would take in Meridian... ' +
  'I am good with your direction of [building it live]", then "And, yes, build it"). New ' +
  'per-store report (Reports Hub > Financial & Promotions) showing the owner\'s own L3M / L6W / ' +
  'LM / MTD / Projected / Trend reference shape for all 16 metrics he XLOOKUPs into the ' +
  'workbook\'s target columns -- Sales Projection, Comp Sales %, Crew Labor %, TPPH Target, Base ' +
  'Food %, Disc Coup %, Comp Waste %, Raw Waste %, Condiment %, Emp Food %, Stat Loss %, Unex ' +
  'Diff %, FOB Target w/o Disc Coup, Total Food Cost %, P&L Paper Cost %, Op Supply Target -- ' +
  'live off auto-pulled Supabase streams instead of a manual paste.',
  'New engine/fob-reference.js deliberately reconstructs TRUE daily $ deltas from qsr_fob\'s ' +
  'cumulative month-to-date snapshot (today\'s cumulative minus yesterday\'s, reset at each ' +
  'month\'s 1st) before summing into any window, rather than averaging the raw cumulative values ' +
  '-- the trap the existing Scanner/monthly-rollup path was in (see next entry). The other 5 ' +
  'metrics reuse existing proven resolvers (vs-ly.js\'s matchedVsLY/autoFirstTotal, ' +
  'metric-source.js\'s metricAvg/metricSumRatio) since their sources are genuinely per-day ' +
  'independent. New src/views/fob-reference-table.js, built on ReportShell like every other ' +
  'report in this redesign. 16 engine tests + 4 panel-render tests.',
  '**Fixed a related, pre-existing bug found while building the above:** signal-registry.js\'s ' +
  '\'monthly\' granularity path for the 7 FOB-sourced metrics bridged through AUTO_FIRST_KEY_MAP ' +
  '(fobPct/compWaste/rawWaste/statVar/condiment/empMeal/unexplained) averaged every day\'s ' +
  'cumulative-MTD value instead of taking the month\'s real final value -- understating the true ' +
  'monthly ratio (a growing cumulative curve\'s mean sits below its endpoint), likely affecting ' +
  'Scanner/Signal Lab correlations at monthly granularity for these metrics (e.g. the seeded FOB ' +
  '% -> Base Food % signal). Now takes the LATEST dated row per (loc, month) for these keys only ' +
  '-- every other metric\'s mean-of-daily monthly rollup is unchanged. 5 regression tests, ' +
  'including a case that proves the old behavior would have understated the ratio by over 40%.',
]};
