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

-- ── qsr_onhand: add recipe_item (dispatch16, #374 KB verification, 2026-08-18) ─────────────
-- The KB (QSRSoft's own Inventory Analysis Report) does NOT treat active_in_recipe=false as
-- one thing. It distinguishes Topic 3 ("items not in any recipe, inventory > 0" — legacy/
-- obsolete, correctly excluded above) from Topic 6 ("items that are not active but are part
-- of an Active Recipe" — recommended action is "contact DC to restrict", i.e. still real
-- to-count work, NOT something to drop from the denominator). Excluding on `active` alone
-- conflates the two.
--
-- MEASURED before adding this column: a second DUMP_RAW_FIELDS run (2026-08-17, live, all 27
-- stores) confirmed the raw payload carries a SECOND, independent field — `recipe_item`
-- ('Yes'/'No') — and cross-tabulated it against active_in_recipe=0: of 2316 such items, 144
-- (6.2%) are recipe_item='Yes', i.e. genuine Topic 6, spread across 23 of 27 stores (Harrah/
-- 43701 worst, 13 items). Not large enough to invalidate the `active` exclusion itself
-- (93.8% of active_in_recipe=0 items really are recipe_item='No', matching Topic 3/15) but
-- real enough that dropping all 2316 uniformly would silently lose 144 items of genuine work.
alter table public.qsr_onhand add column if not exists recipe_item boolean;

comment on column public.qsr_onhand.recipe_item is
  'On-Hand API''s recipe_item flag (''Yes''/''No''), normalized to boolean. Used alongside `active` to rescue Topic 6 items (inactive but still in an active recipe) from Count Cycle''s denominator exclusion — count-cycle.js''s isActive() treats `active !== false OR recipe_item === true` as real to-count work. NULL for rows pulled before this column existed, same backward-compat behavior as `active`.';
