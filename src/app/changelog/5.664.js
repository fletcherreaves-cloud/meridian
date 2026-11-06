// @ts-nocheck
export default {version:'5.664', date:'2026-11-06', changes:[
  '**Knowledge Base: 4 new Panel Guide articles (task #75, batch 12) — first pass at the ' +
  'kind:\'hub-tab\'/\'internal\' panel-registry.js tier.** Measured all 18 real hub-tab + 14 ' +
  'real internal entries directly (not the prompt\'s own "18+14" estimate, which matched — ' +
  '32 total); 28 of 32 turned out to already be covered, under a different name, by an ' +
  'existing nav-parent article (e.g. `scheduling_hub` already names Labor Allocation/Labor ' +
  'Analytics/Schedule Summary/Training Retention/Retention Rollup/Skills explicitly; ' +
  '`planning_hub` already names Monthly/Pace/Yearly/Targets/Smart). **4 genuine gaps found ' +
  'and written up:** `review_target_overrides_guide` (Performance Reviews → Customize → ' +
  'Targets — company/state/patch/store override cascade for review fields with no workbook ' +
  'source, a real, different feature from the Monthly/Yearly Targets grids despite the ' +
  'near-identical name — the existing `targets_editor` KB key actually documents the latter, ' +
  'not this), `performance_calculator_guide` (Customize → Calculator — a drive-thru ' +
  'throughput slider tool, confirmed to share nothing with the review-scoring engine beyond ' +
  'a tab shell), `calendar_manager_guide` (Events → Calendar/Rules pills — month grid, ' +
  'recurring annual rules, and an AI-search-assisted pending-review queue, previously ' +
  'undocumented even though `events_guide` already existed), and `fcst_accuracy_guide` ' +
  '(Forecast Reports → Forecast Accuracy — the live 6-model backtest UI behind the MAPE ' +
  'numbers the engine-concept articles describe). **Also fixed:** `events_guide`\'s own ' +
  '"five pills" sentence had silently dropped the real 📆 Calendar pill and listed the ' +
  '"✎ Full ledger" button (not a pill) in its place — corrected to the real pill set. ' +
  '**Flagged, not acted on this batch:** `signals_guide` is substantially stale (lists 5 ' +
  'tabs; the real panel has 10 — Projection Accuracy/Park×OEPE/Store Controls/Correlations/ ' +
  'CSAT Drivers/Graveyard are all unmentioned), and `proj-brief`\'s host panel (\'proj\', ' +
  'kind:\'test-kitchen\') is itself outside this batch\'s nav/optional+hub-tab/internal scope ' +
  '— both recorded in memory/finding-kb-panel-guide-2026-11-03.md as real, named follow-ons. ' +
  '8 new tests, 114 KB_ARTICLES keys total; build clean.',
]};
