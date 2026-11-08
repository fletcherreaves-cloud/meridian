-- ── Count-session history: per-WRIN missing-item detail (task #126, 2026-11-08) ────────────
-- memory/plan-count-cycle-classification-2026-11-08.md's open Q3, resolved: the owner asked
-- for this ("I'm good with widening the log! That sounds like a great idea!!").
--
-- THE GAP THIS CLOSES: inv_count_sessions (schema-inv-count-sessions.sql) stores aggregated
-- counts per (store, count date, class) — items_counted/class_total/covered — not WHICH items.
-- That's enough for a coverage PERCENTAGE (what task #126's main change already added), but
-- not for naming which exact items a near-miss session didn't get to. The live qsr_onhand
-- snapshot DOES have per-WRIN detail, but it's rolling-latest (the same reason this whole log
-- exists in the first place, per that file's own header) — so without this column, a named
-- missing-item list is only ever knowable for the CURRENT period, never for a session once a
-- later recount has moved qsr_onhand's snapshot on.
--
-- THE FIX: one additive, nullable column. Existing rows get NULL (no missing-item detail for
-- any session logged before this column existed and before the pull script is updated to
-- populate it — that data is genuinely gone, same honest limitation the base table's own
-- header already states about pre-migration sessions). Every session logged AFTER both this
-- migration runs and scripts/qsrsoft-onhand-pull.mjs's deriveSessionRows() is updated to
-- populate it (same PR) carries the real list going forward.
--
-- Stores {wrin, descr} pairs, not bare WRIN codes, so a historical display never depends on
-- the CURRENT qsr_onhand snapshot still having that item's description (an item can go
-- inactive/discontinued and drop out of the live universe entirely; this column is the
-- durable record, same reasoning as the rest of this table).
--
-- ⚠️ Run this once in the Supabase SQL editor. Idempotent (add column if not exists).
-- This session has no DDL execution path -- the owner runs this.

alter table public.inv_count_sessions
  add column if not exists missing_items jsonb;

comment on column public.inv_count_sessions.missing_items is
  'Array of {wrin, descr} for this class''s active items NOT counted on this session date — null for any session logged before this column existed (genuinely unrecoverable, qsr_onhand is rolling-latest) or before the pull script was updated to populate it. Lets the UI name exactly which items a near-miss count still needs, surviving past the live snapshot moving on. See memory/plan-count-cycle-classification-2026-11-08.md.';
