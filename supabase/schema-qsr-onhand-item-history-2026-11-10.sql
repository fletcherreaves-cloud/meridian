-- ── Item-level count history ─────────────────────────────────────────────────
-- Owner request 2026-11-10, following memory/finding-variance-recount-signal-2026-11-10.md's
-- research: that pass asked whether an item's own variance (qsr_variance_stat) shows a
-- measurable shape around a recount. The answer was "can't tell" -- not because the analysis
-- was weak, but because qsr_onhand AND qsr_variance_stat both upsert on (loc, period, wrin),
-- so a recount permanently overwrites the previous count's own on-hand qty/price/$ values.
-- supabase/schema-inv-count-sessions.sql already solved this at the SESSION level (how many
-- items were counted, was coverage met) -- this is the same fix at the ITEM level (what was
-- THIS item's on-hand amount at that specific past count).
--
-- THE FIX: an append-only item-level snapshot, one row per (store, count date, item). The
-- On-Hand pull already runs daily and already derives inv_count_sessions from the same rows
-- (scripts/qsrsoft-onhand-pull.mjs's deriveSessionRows()) -- this adds deriveItemHistoryRows()
-- right alongside it, snapshotting each item's current state before qsr_onhand's own upsert
-- (on (loc,period,wrin), no count_date in the key) would otherwise erase it on the next count.
-- The PK makes re-running idempotent: the same (loc, count_date, wrin) seen on consecutive
-- daily pull runs upserts the same row rather than duplicating -- only a genuine recount
-- (last_counted moving to a NEW date) creates a new row, so growth tracks real counting
-- activity, not pull frequency.
--
-- HONEST LIMITATION: same as inv_count_sessions -- this cannot recover history that
-- qsr_onhand has ALREADY overwritten before this table existed. History accumulates from the
-- first run forward; it does not retroactively reconstruct past recounts. It also only
-- captures one snapshot per DAY (the pull's own cadence), so a same-day, same-session
-- correction (count it, catch a mis-entry, fix it, submit) still leaves no trace -- this
-- closes the across-session gap, not the within-session one (see the finding doc's own
-- distinction between the two).
--
-- ⚠️ HANDOFF — this file needs to be run manually in the Supabase SQL editor before the item-
-- history table can write real data (same pattern as every other new-table migration in this
-- repo). Idempotent (`create table if not exists`) — safe to run anytime, including a second
-- time.
create table if not exists public.qsr_onhand_item_history (
  loc            text        not null,      -- NSN, zero-padded to 7 to match every other table
  count_date     date        not null,      -- the item's own last_counted date (the real count event)
  wrin           text        not null,
  period         text        not null,      -- 'YYYY-MM' the pull ran under (for period-scoped reads)
  descr          text,
  cls            text,                      -- Food | Condiment | Paper | Non-Product
  cases          numeric,
  packs          numeric,
  loose          numeric,
  total_units    numeric,
  unit_price     numeric,
  on_hand_amt    numeric,
  tenant_id      uuid        not null default '00000000-0000-0000-0000-000000000001',
  first_seen     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (loc, count_date, wrin)
);

-- Item-history queries are "this item's own history at this store," so wrin+loc lead.
create index if not exists qsr_onhand_item_history_item_idx on public.qsr_onhand_item_history (loc, wrin, count_date desc);
create index if not exists qsr_onhand_item_history_date_idx on public.qsr_onhand_item_history (count_date desc);

alter table public.qsr_onhand_item_history enable row level security;

-- Tenant isolation, matching the pattern used across the other operational tables.
drop policy if exists qsr_onhand_item_history_tenant on public.qsr_onhand_item_history;
create policy qsr_onhand_item_history_tenant on public.qsr_onhand_item_history
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE), so a
-- user only ever sees stores in their accessible_locs. my_locs() returns NULL for
-- unrestricted users. Mirrors supabase/schema-rls-phase2-loc.sql and schema-inv-count-sessions.sql.
drop policy if exists qsr_onhand_item_history_loc on public.qsr_onhand_item_history;
create policy qsr_onhand_item_history_loc on public.qsr_onhand_item_history
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.qsr_onhand_item_history is
  'Append-only history of item-level on-hand snapshots, one row per (store, count date, wrin). Written daily by scripts/qsrsoft-onhand-pull.mjs (deriveItemHistoryRows) from the same rows qsr_onhand upserts, which is rolling-latest and would otherwise lose this detail on recount. Closes the item-level half of the gap inv_count_sessions already closed at the session level.';
