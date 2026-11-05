-- ── lifelenz_shift_pay: regular/overtime split (owner-caught 2026-11-05, wage-accuracy bug) ────
-- `earnings`/`seconds` on this table blend together every pivotMetrics segment of a shift
-- regardless of payType -- including segments LifeLenz itself tags `payType:'overtime'`.
-- Overtime is paid at 1.5x, not the employee's base rate -- measured directly against real
-- lifelenz_payroll_readiness rows (2026-11-05): overtime_earnings/overtime_hours consistently
-- equals exactly 1.5x regular_earnings/regular_hours across every real OT row sampled, not an
-- assumption. Pay Rate History's weekly $/hr (src/engine/employee-pay-history.js's
-- weeklyCrewRates, earnings/seconds dollar-weighted) is therefore pushed above an employee's
-- real base rate by however much overtime they happened to work that week -- a false "rate
-- change" can be an OT-mix swing, not a raise or cut, and the reported before/after rate and $
-- impact inherit the same contamination.
--
-- src/engine/lifelenz-shift-jobs.js's shiftsForEmployeeSchedule() now computes this split from
-- the SAME per-segment payType field two sibling functions in that file (rollupShiftsByRole/
-- rollupShiftsByEmployee) already use -- nothing new fetched from LifeLenz, just carried through
-- to this per-shift persisted row instead of being discarded at ingest. These 4 columns are
-- additive and nullable-with-default-0 -- existing rows (earnings/seconds only) are unaffected,
-- and the pull script falls back to the old 2-column write until this migration has run (so
-- running this is required before the regular/overtime split starts populating, but NOT running
-- it does not break the existing daily sync).
alter table public.lifelenz_shift_pay
  add column if not exists reg_earnings double precision not null default 0,
  add column if not exists reg_seconds  integer          not null default 0,
  add column if not exists ot_earnings  double precision not null default 0,
  add column if not exists ot_seconds   integer          not null default 0;

comment on column public.lifelenz_shift_pay.reg_earnings is 'Σ earnings across this shift''s pivotMetrics segments where payType != ''overtime''.';
comment on column public.lifelenz_shift_pay.reg_seconds  is 'Σ seconds across this shift''s pivotMetrics segments where payType != ''overtime''.';
comment on column public.lifelenz_shift_pay.ot_earnings  is 'Σ earnings across this shift''s pivotMetrics segments where payType = ''overtime'' (paid at 1.5x, not the employee''s base rate).';
comment on column public.lifelenz_shift_pay.ot_seconds   is 'Σ seconds across this shift''s pivotMetrics segments where payType = ''overtime''.';
