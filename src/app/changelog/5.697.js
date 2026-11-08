// @ts-nocheck
export default {version:'5.697', date:'2026-11-08', changes:[
  '**Count Cycle: identification no longer vanishes on a near-miss (task #126).** A real, '+
  'substantial count — Holdenville, 2026-10-30: 233 items, Food 118/120 (98%), Condiment 31/32 '+
  '(97%), Paper 84/96 (88%) — used to read identically to a 3-item spot check, because isEom/'+
  'satisfiesWeekly/satisfiesMidPaper gated BOTH "which cycle was this" and "was it 100% '+
  'complete" on the same strict bar. `src/engine/count-cycle.js` now splits those into two '+
  'independent axes: Axis 2 (Compliance, the 100% `COVER_FRAC` bar) is completely UNCHANGED — '+
  'still zero-tolerance, still drives every overdue/incomplete alert exactly as before. Axis 1 '+
  '(Cycle Attempt) is new and additive: a session that touches a class in real volume '+
  '(`TOUCHED_FLOOR`, reusing the existing 25-item isPartial/isSpot boundary) is identified as '+
  'a Weekly/Mid-Month-Paper/EOM attempt — covering all three cycles, the same conflation existed '+
  'in each — and carries its own per-class coverage percentage, even when it misses 100%. The '+
  'generic "Partial" label is now the real cycle name + the real numbers (e.g. "End-of-Month — '+
  'Food 98%, Condiment 97%, Paper 88%") wherever that data is available; "Spot check" is '+
  'unchanged. Count Cycle\'s session timeline (Inventory Control → Count Cycle tab) shows the '+
  'richer label automatically. See `memory/plan-count-cycle-classification-2026-11-08.md` for '+
  'the design.',
]};
