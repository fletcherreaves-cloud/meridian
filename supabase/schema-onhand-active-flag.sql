-- ── qsr_onhand: add active ────────────────────────────────────────────────────
-- Issue #357-B2/3 — Count Cycle's per-class denominator (count-cycle.js's `classTotals`)
-- was every WRIN the On-Hand API returned for a store/class, with no active/inactive
-- distinction — discontinued items still carrying a residual on_hand (the Durant #5985
-- case, documented in engine/eom-inventory.js) inflate the denominator without being
-- real to-count work.
--
-- MEASURED (not guessed) before adding this column: a DUMP_RAW_FIELDS=1 probe run against
-- the live On-Hand API (2026-08-17, all 27 stores, 7127 items) confirmed the raw
-- on_hand_records payload already carries `active_in_recipe`, and that it is a real,
-- varying status flag — NOT a constant-1 field that would be useless as a filter:
--   active_in_recipe distribution: {1: 4807 (67.4%), 0: 2320 (32.6%)}
-- This is "a column and a where, not a modelling exercise," per the dispatch's own framing
-- for what to do if such a flag existed. mapOnHandRow (qsrsoft-onhand-pull.mjs) previously
-- kept only 13 named fields and silently dropped this one.
alter table public.qsr_onhand add column if not exists active boolean;

comment on column public.qsr_onhand.active is
  'On-Hand API''s active_in_recipe flag (1/0), normalized to boolean. NULL for rows pulled before this column existed (#357-B2/3) — count-cycle.js treats NULL as active (r.active !== false) so old rows are not silently excluded from the denominator until a fresh pull backfills them.';

-- Historical rows: NULL until the next scheduled/forced pull re-writes them (qsr_onhand
-- upserts on (loc, period, wrin), so the current month's rows refresh naturally within a
-- few hourly runs; prior-month periods stay NULL permanently unless re-pulled with an
-- ONHAND_DATE/ONHAND_PERIOD override, which is fine since Count Cycle only ever grades
-- the current period).
