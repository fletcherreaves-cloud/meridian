// @ts-nocheck
export default {version:'5.443', date:'2026-09-14', changes:[
  'New "📊 Performance Trends" panel (Analytics, Test Kitchen) -- owner request: a store-level ' +
  'report for Current MTD (completed business days only), last complete month, and two months ' +
  'back, one table for All Locations plus an instant OK/FL breakout (LocationSelector, same ' +
  'All->State->Patch->Store pills as every other panel). Works for Labor %, FOB % and every ' +
  'other primary metric via one metric dropdown -- not a one-off build per metric. Sortable by ' +
  'Top 25%/Top 50%/Bottom 50%/Bottom 25%/All, CSV + print export.',
  'New engine/trend-report.js: a thin registry over engine/metric-source.js\'s own METRIC_SOURCES ' +
  '(direction, auto-first sourcing, metricRate\'s Σnumerator÷Σdenominator convention) rather than ' +
  'a fourth parallel metric registry. Never fabricates a row for a store/period with no data.',
  '"📧 Email Summary" mode (same panel): reproduces the owner\'s own reference table exactly -- ' +
  'Combined (OK/FL) / Oklahoma / Florida, each a Month x [Sales/GC/Labor/FOB] scorecard over the ' +
  '3 trailing complete months plus current MTD. Sales/GC are matched-day vs-LY comps via the ' +
  'shared engine/vs-ly.js helper (auto-first + matched-day, never a hand-rolled comp calc); ' +
  'Labor %/FOB % are the same true period Σ÷Σ rate as the Store Detail view.',
  '24 new tests (src/__tests__/dispatch-trend-report-2026-09-14.test.js): period-boundary math ' +
  '(mid-month anchor, January year-rollover), ratio-metric Σ/Σ vs a naive flat average, rank/ ' +
  'percentile assignment, all 4 rank-filter modes, absence-is-honest guards, the vs-LY comp math, ' +
  'and 4 real panel renders (default render, metric switch, rank-mode click, Email Summary toggle).',
  'Fixed a real bug in scripts/refresh-projections-workbook.py (the October projections workbook ' +
  'refresh utility, not part of the deployed app): the documented default usage (omitting ' +
  '--output, which overwrites --input) opened the output zip for writing WHILE still lazily ' +
  'reading other parts from the same path, truncating the file out from under itself ' +
  '(`zipfile.BadZipFile: Truncated file header`) -- reproduced running the exact documented ' +
  'command. Now reads every part into memory before writing anything, which also fixes ' +
  'verify_roundtrip (previously re-read input_path AFTER the overwrite, comparing the new file ' +
  'to itself and proving nothing for the in-place-overwrite case).',
  'Build clean, eager payload 547.50 KB / 850 KB budget (trend-report.js lazy-chunked, not in ' +
  'the entry bundle). Full suite 514/514 files, 4926/4926 tests.',
]};
