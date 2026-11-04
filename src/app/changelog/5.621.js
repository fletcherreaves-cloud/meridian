// @ts-nocheck
export default {version:'5.621', date:'2026-11-04', changes:[
  '**Monthly Targets: Labor %/TPPH suggestions from the owner\'s own forecast model (task #80 ' +
  'Phase 2).** Phase 1 ported his sales-comp model (Level + damped Momentum + shrink-to-fleet, ' +
  'v5.614). This ports the OTHER half of the same reverse-engineered workbook: a simpler ' +
  'recency-weighted blend across four trailing windows (L3M 10% / L6W 20% / LM 30% / MTD 40%, ' +
  'most recent counting most) for Crew Labor % and TPPH, with TPPH additionally rounded UP to ' +
  'the nearest 0.05 (a deliberate conservative bias -- never rounds a labor-efficiency target ' +
  'down). Same "model proposes, he decides" UX as Phase 1: a clickable "Suggested X" badge next ' +
  'to each cell, never auto-applied -- clicking it fills the normal edit flow exactly like a ' +
  'hand-typed override. Computed from cloud data already auto-pulled (laborPct/tpph\'s existing ' +
  'Sum/Sum ratio sourcing in metric-source.js) -- no new upload, ever. The suggestion badge ' +
  '(EditableProjCell) is now generic across both models instead of hardcoded to the sales field, ' +
  'so a future third model needs no UI change, just a new entry in the one suggestionFor() map. ' +
  'New engine module src/engine/owner-labor-tpph-forecast.js, 6 tests ' +
  '(src/__tests__/dispatch-80-phase2-labor-tpph-forecast-2026-11-04.test.js).',
]};
