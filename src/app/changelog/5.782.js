// @ts-nocheck
export default {version:'5.782', date:'2026-11-14', changes:[
  '**Metric reconciliation (task #152): the 5 forecast models documented in Metric Lineage.** ' +
  'The single highest-value item this task had deliberately deferred twice already — ' +
  '`forecast.js`\'s `dow`/`di`/`ae`/`ewma`/`simple` model codes (Model Assignment / Forecast ' +
  'Accuracy panel columns) now each have a hand-curated `METRIC_PROVENANCE` entry, traced from ' +
  'the real code and cross-checked against this file\'s own pre-existing owner-facing KB ' +
  'articles so the two surfaces agree. DOW and DI turn out to be the literal same Core Forecast ' +
  'Formula code path (DI just substitutes per-store Dialed-In-calibrated parameters for the ' +
  'district defaults) — documented as two entries since they\'re separately selectable, but each ' +
  'says so explicitly. AE (5-signal blend) and EWMA (pure decay-weighted same-DOW average) never ' +
  'touch that formula at all. Simple\'s entry also notes the later Period-Total Scoreboard ' +
  'finding (AE beats Simple on 28-day totals) so it reads as "what this model computes," not a ' +
  'stale verdict on which model is best. Also found, not fixed: `forecast.js`\'s own `model_types` ' +
  'KB article still says "Four codes exist" (DOW/DI/AE/EWMA) — stale since Simple shipped in ' +
  'v4.532 and was never added there; flagged for the next KB-maintenance pass. ' +
  'memory/plan-metric-reconciliation-2026-11-14.md updated (Pass 3).',
]};
