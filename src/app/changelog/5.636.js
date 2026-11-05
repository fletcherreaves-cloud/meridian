// @ts-nocheck
export default {version:'5.636', date:'2026-11-05', changes:[
  '**Targets Editor Tier 2: add a brand-new metric with a target value (owner req, task #93).** ' +
  'Tier 1 (shipped 2026-11-04) could only hide/rename/regroup EXISTING Monthly/Yearly target ' +
  'fields — there was no way to add a metric that has no existing `monthly_targets`/' +
  '`yearly_targets` column at all. The "⚙️ Customize" editor on both Monthly Projections and ' +
  'Yearly Target Categories now has a **"+ Add a metric"** picker (sourced from the SAME metric ' +
  'list Top/Bottom Performers offers, `engine/top-bottom-performers.js`\'s `PERFORMER_METRICS` — ' +
  'never free-typed), lands the new metric under its own **Custom Metrics** category where it ' +
  'can be hidden/renamed/regrouped exactly like any built-in field (zero special-casing in the ' +
  'shared `applyFieldConfig`/`applyCategoryConfig` engine), and can be removed again with a ✕. ' +
  'Values live in a new dedicated table, `custom_metric_targets` (owner ran the SQL and confirmed ' +
  'the design call: **Monthly and Yearly carry their own value for the same metric**, via ' +
  '`period_type`) — a new `loadCustomMetricTargets`/`saveCustomMetricTarget` pair in ' +
  '`src/lib/supabase.js`, single-field upsert/delete, same shape as the `daypart_tpph_targets` ' +
  'precedent. A custom metric\'s column folds into the exact same per-loc row shape every built-' +
  'in field already uses, so the existing click-to-edit cell, rollups, and print exports need no ' +
  'changes to read it. 4 new tests (`dispatch-93-targets-custom-metric-2026-11-05.test.js`) ' +
  'render the real Monthly/Yearly panels end-to-end: adding a metric via the editor, a pre-' +
  'loaded custom value rendering and routing its edit to the new table (never ' +
  '`monthly_targets`/`yearly_targets`). Live-verified in the browser: added "Avg Check ($)" via ' +
  'the real Customize editor on Monthly Projections, confirmed it rendered under Custom Metrics ' +
  'with its label/category/remove controls and saved correctly — this sandbox has no real ' +
  'monthly/yearly target rows loaded, so the full value-render path is covered by the new tests, ' +
  'not a live screenshot of a populated grid. 733/733 test files, 6672/6672 tests; build clean, ' +
  '616.92 KB / 850 KB payload.',
]};
