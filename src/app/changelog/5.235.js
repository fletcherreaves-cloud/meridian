// @ts-nocheck
export default {version:'5.235', date:'2026-08-28', changes:[
  'Dispatch #195 -- merged Metric Correlations into Signals\' Scanner: executed the owner\'s own ' +
  '"best of both worlds" resolution (memory/decisions-panel-inventory-2026-08-10.md), "merge the ' +
  'ENGINE, keep the PRESENTATION." Scanner\'s statistics (Pearson r + Spearman, an effect-size ' +
  'floor, Benjamini-Hochberg FDR correction) already lived in a real importable module (src/' +
  'engine/signal-registry.js), not inline in signals.js as the dispatch anticipated might be the ' +
  'case -- so the actual extraction was pulling the four pure math functions (pearson/spearman/' +
  'pValueFromR/benjaminiHochberg) out of that Signals-specific ~900-line module into a new, ' +
  'dependency-light src/engine/correlation-stats.js, so a panel outside Signals could call them ' +
  'without statically importing Signals\' whole metric-registry machinery. signal-registry.js ' +
  're-exports the same functions, so its existing consumers (csat-signals.js, signals.js\'s own ' +
  'Scanner tab, three test files) see zero behavior change. CORR_TARGETS/CORR_PREDICTORS (the ' +
  'small 9-predictor catalog Metric Correlations used) similarly moved out of analytics.js into ' +
  'src/engine/correlation-predictors.js, shared with District Lens (unchanged, out of scope) ' +
  'without either surface statically importing the other\'s much larger module. Metric ' +
  'Correlations\' presentation (per-store/per-target selector, plain-English finding sentences, ' +
  'strength bars, expandable per-metric detail, raw-stats table) is preserved verbatim as a new ' +
  '"Correlations" tab inside Signals, now computing r via the shared pearson() instead of its own ' +
  'duplicate implementation, and layering Scanner\'s guardrails on top: a p-value + Benjamini-' +
  'Hochberg FDR correction across the batch of predictors tested for the selected target ' +
  '(replacing the old single-test, uncorrected t-statistic significance column), a Spearman rho ' +
  'alongside Pearson r with a non-linearity flag when they diverge, and Scanner\'s own default ' +
  'effect-size floor (|r| >= .35) surfaced per row. The "Top Findings" hero card is now gated on ' +
  'BOTH guardrails (effect-size floor AND FDR significance), not a bare |r| > .25 threshold. ' +
  'corr-explorer retired as a standalone/optional panel (kind:\'internal\' in panel-registry.js, ' +
  'removed from constants.js\'s OPTIONAL_PANELS toggle list, same "kept registered so old deep ' +
  'links redirect" pattern as calendar-manager\'s dispatch #191 retirement) -- onOpenModal(' +
  '\'corr-explorer\') now redirects into Signals\' new Correlations tab. Signals\' own Scanner tab ' +
  '(move-together framing, one-click promote to Signal Lab, predefined seed signals) is untouched. ' +
  'Bonus: MetricCorrelationExplorer\'s hand-rolled position:fixed/inset:0/rgba(0,0,0 backdrop -- a ' +
  'panel-contract violation -- is gone entirely (folded into an already-RoutePanelShell-wrapped ' +
  'tab with no chrome of its own), lowering the backdrop-bypass ratchet 70 -> 69.',
]}
