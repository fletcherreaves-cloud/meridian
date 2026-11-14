// @ts-nocheck
export default {version:'5.783', date:'2026-11-14', changes:[
  '**Location Dossier Phase 2 (task #79): Scanner-curated correlations + plain-language L3M ' +
  'trend reads.** Per the plan doc\'s own §6 staging — Phase 1 (factual grid) and Phase 1.5 ' +
  '(visual density) were already live; this adds the "analyzed/discovered" half §2B always ' +
  'intended. **🔗 What Moves Together** reuses Signals\' own auto-scanner (`scanAllPairs`) as-is, ' +
  'scoped to the dossier\'s one store — same Pearson/Spearman math, same |r|≥0.35 effect-size ' +
  'floor and Benjamini-Hochberg FDR guardrail every other Scanner surface already applies. No new ' +
  'correlation math or materiality threshold invented; curation (not discovery) is the only new ' +
  'logic — `topCorrelations()` re-ranks the already-floored results so an FDR-significant pair ' +
  'always outranks a merely-large-|r| one, then cuts to a top-5 headline + "+N more" (same shape ' +
  '`topFindings()` already established for findings). **L3M Read** is a new grid column: each ' +
  'metric\'s own L3M window split into two halves, compared via the SAME auto-first ' +
  '`dossierMetricValue()` the factual grid\'s own cells use (so a trend read can never disagree ' +
  'with the grid\'s L3M number), with direction (up/down/flat, 3% relative floor) and a separate ' +
  'improving/worsening judgment from each metric\'s own `lowerIsBetter` flag — the SAME good/bad ' +
  'convention `opportunity.js`/`performance-reviews.js` already use for these 9 metrics, not a ' +
  'new scheme. Phase 3 (demographics/layout/equipment/personnel) and Phase 4 (patch/operator/ ' +
  'state rollups) remain not built, per the plan doc\'s own phase boundaries. ' +
  '11 engine tests (`location-dossier-phase2-2026-11-14.test.js`) + 1 render test. ' +
  'memory/plan-location-dossier-report-2026-11-04.md updated (Phase 2 SHIPPED).',
]};
