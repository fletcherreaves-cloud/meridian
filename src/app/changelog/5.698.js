// @ts-nocheck
export default {version:'5.698', date:'2026-11-08', changes:[
  '**Count Cycle: named missing items, not just a percentage (task #126 follow-on).** '+
  'Yesterday\'s change split "which cycle was this" from "was it 100% complete" and showed a '+
  'per-class coverage percentage for a near-miss count. This closes the open question that '+
  'left — hovering a near-miss class chip in the Count Cycle session timeline now names the '+
  'exact items not yet counted (e.g. "Not counted: Pour Spout 12oz, Clamshell Box…"), not just '+
  '"88%". Works today for the CURRENT period off the live on-hand snapshot, which already has '+
  'per-item detail. For the durable history that survives a later recount, `inv_count_sessions` '+
  'gets one additive, nullable column (`missing_items`, '+
  '`supabase/schema-inv-count-sessions-missing-items-2026-11-08.sql` — owner runs this) and '+
  '`scripts/qsrsoft-onhand-pull.mjs` now populates it going forward; any session logged before '+
  'both land shows the percentage only, same as before — that history genuinely cannot be '+
  'reconstructed, the same honest limitation this whole log was built around. See '+
  '`memory/plan-count-cycle-classification-2026-11-08.md`.',
]};
