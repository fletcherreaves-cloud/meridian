// @ts-nocheck
export default {version:'5.639', date:'2026-11-05', changes:[
  '**Pay Rate History: added a store/district rollup + OK rollout tracker (owner request, ' +
  'live).** Owner and his wife are hand-entering a round of OK-only raises store by store ' +
  '(him high-to-low loc numbers, her low-to-high, not finished) — "will be interesting to see ' +
  'if we start picking these up." The panel already detected every pay-rate change and computed ' +
  'its $ impact (Δrate × that employee\'s own real measured hours for crew, assumed 40h/wk for ' +
  'management); this just regroups the SAME detected changes by store and by state — no new ' +
  'detection, no new math. New collapsible "📍 Store / district rollup" block: "<N> / <total> OK ' +
  'stores reporting a detected change" with a progress bar, a per-store table (employees, ' +
  'weekly $, annualized $, latest effective date), and OK/FL district subtotals. Store state ' +
  'comes from `constants.js`\'s real `INV_ORG_COORDS`/`unpadLoc`, not a guess. 7 tests (2 new), ' +
  '734/734 test files, 6675/6675 tests; build clean.',
]};
