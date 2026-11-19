// @ts-nocheck
export default {version:'5.832', date:'2026-11-19', changes:[
  '**Task #152 (metric/formula reconciliation), pass 7: FOB Root-Cause Analysis.** Added ' +
  '`fobRecountImpact` and `fobConsistency` entries to Metric Lineage documenting ' +
  '`engine/fob-recount-analysis.js` — the engine behind the "🔬 FOB Root-Cause Analysis" ' +
  'modal (EOM Dashboard, Notes 41) and SAGE\'s `query_eom_recount_impact` tool, genuinely ' +
  'undocumented before this pass. Covers the Toward/Away/Net recount-impact math (base vs. ' +
  'final count comparison, item-level) and the month-final FOB% mean/std-dev consistency ' +
  'read, including why low std-dev is a repeatability signal, not a quality verdict on its ' +
  'own. 4 new tests (`src/__tests__/metric-provenance.test.js`).',
]};
