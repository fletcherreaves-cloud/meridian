// @ts-nocheck
export default {version:'5.641', date:'2026-11-05', changes:[
  '**Fix: Pay Rate History\'s crew $/hr rate blended regular and overtime pay — a real ' +
  'wage-accuracy bug, owner-caught live.** Overtime is paid at 1.5x, measured directly against ' +
  'real `lifelenz_payroll_readiness` rows (overtime_earnings/overtime_hours consistently equals ' +
  'exactly 1.5x regular_earnings/regular_hours across every real OT row sampled, not an ' +
  'assumption). The crew rate calc blended regular + OT earnings/seconds into one $/hr figure, ' +
  'so a week with any overtime read ABOVE the employee\'s real base rate by however much OT ' +
  'that week carried — able to flag a false "raise" or "cut" from an OT-mix swing alone, and to ' +
  'feed the $ impact math a contaminated delta. Fixed: `shiftsForEmployeeSchedule()` now splits ' +
  'each shift into regular/overtime earnings+seconds using LifeLenz\'s own `payType` field ' +
  '(already fetched, already used by two sibling rollup functions, never persisted at this ' +
  'grain before); `weeklyCrewRates()` derives the rate from the straight-time split whenever ' +
  'available, falling back to the old blended rate only for pre-migration data or a 100%-OT ' +
  'week. New "Rate basis" column flags any row that isn\'t a clean straight-time comparison. ' +
  '`supabase/schema-lifelenz-shift-pay-ot-split.sql` (owner action required to persist the ' +
  'split going forward) — the pull script degrades gracefully (same pattern as yearly_targets\' ' +
  'prod_sales 42703 handling) until it runs, so the existing daily LifeLenz sync is never at ' +
  'risk. Full measurement + what\'s still gated on the owner: ' +
  '`memory/finding-crew-pay-rate-ot-blending-2026-11-05.md`. 10 new tests, 735/735 test files, ' +
  '6689/6689 tests; build clean.',
]};
