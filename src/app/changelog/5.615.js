// @ts-nocheck
export default {version:'5.615', date:'2026-11-04', changes:[
  '**Owner\'s real sales-forecast model, ported into the engine (owner-approved, task #80).** ' +
  'Reverse-engineered directly from his own Aug/Oct/Nov 2026 monthly projections workbooks ' +
  '(`memory/finding-owner-sales-forecast-model-2026-11-04.md`) — a backtested statistical model ' +
  '(6-week Level + damped/capped Momentum + 15% shrink-to-fleet, 1.9pp mean error on his own held-' +
  'out test), not a guess. New `src/engine/owner-sales-forecast.js` computes it from cloud data ' +
  'already auto-pulled daily (matched-day vs-LY comp% per week) — no weekly export/upload ' +
  'required, and every dial (damp 0.10, cap ±2pts, shrink 15%, review threshold 5pts) is his own ' +
  'fitted value, unchanged. The Monthly Targets editor (Planning → Monthly) now shows a ' +
  '**Suggested** figure under the Sales $ cell for every store with enough comp history, amber ' +
  'and flagged ⚠ when the store\'s recent swing crosses his own review threshold (the same signal ' +
  'his workbook\'s `REVIEW` column computes) — click to accept it into the normal editable cell, ' +
  'or ignore it and type a different number as always. Purely additive: nothing is auto-applied, ' +
  'the existing click-to-edit flow and manual workbook upload fallback are both unchanged. 14 new ' +
  'tests (`src/__tests__/dispatch-80-owner-sales-forecast-model.test.js`) check the arithmetic ' +
  'against his own formulas, not just that the function returns something. Labor%/TPPH\'s ' +
  'recency-weighted blend (the other half of his workbook) is a deliberate fast-follow, not in ' +
  'this pass — see `memory/plan-forecasting-command-center-2026-11-04.md` for the staged build.',
]};
