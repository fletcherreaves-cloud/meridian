-- ═══════════════════════════════════════════════════════════════════════════════
-- MONTHLY TARGETS -- data_source flag (owner request 2026-10-02: "flag them clearly")
--
-- The owner asked for Jan-Mar 2026 monthly_targets to be backfilled (those months were never
-- uploaded) using a strictly-leak-free reconstruction (forecast engine's own 'simple' model +
-- trailing-90-day dollar-weighted actuals, computed as if run in advance of each month -- see
-- memory/finding-jan-mar-2026-reconstruction-2026-10-02.md for the full methodology), with the
-- explicit requirement that reconstructed rows be visibly distinguishable from real approved
-- targets. `updated_by` (uuid references profiles(id)) can't carry this -- it is a real-user FK,
-- not a free-text marker, and misusing it would misattribute the reconstruction as a person's
-- edit.
--
-- Purely additive: one new nullable column, no data migration, no change to any existing row.
-- NULL means "real data" (every row before this ships, and every row saveMonthlyTargets() writes
-- going forward -- see that function, which now explicitly sends data_source: null on every real
-- upload so a future real upload for a previously-reconstructed month clears the flag).
alter table public.monthly_targets
  add column if not exists data_source text; -- null = real upload; else a short reconstruction tag
