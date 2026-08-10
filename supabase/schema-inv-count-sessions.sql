-- ── Count-session history ───────────────────────────────────────────────────
-- Notes 58 #1. Fixes the history gap in the count-cycle work.
--
-- THE PROBLEM: qsr_onhand upserts on (loc, period, wrin), so `last_counted` is ROLLING
-- LATEST STATE. Every time an item is recounted its previous count date is overwritten.
-- That means we can answer "was the last weekly count complete?" but never "were all
-- four weekly counts complete last month?" — which is exactly what the owner's rule
-- ("2 classes EVERY WEEK") needs in order to be auditable over time.
--
-- THE FIX: an append-only session log, one row per (store, count date, class). The
-- On-Hand pull already runs daily, so each run snapshots the sessions currently visible
-- in qsr_onhand before they get overwritten. History accumulates from the first run.
-- The PK makes re-running idempotent: the same session seen on five consecutive days
-- upserts the same row five times rather than duplicating.
--
-- HONEST LIMITATION: this cannot recover sessions that qsr_onhand has ALREADY
-- overwritten. Seeding gives us whatever is currently visible (typically the last EOM
-- plus recent weeklies); true multi-week history builds forward from the first run.

create table if not exists public.inv_count_sessions (
  loc            text        not null,      -- NSN, zero-padded to 7 to match every other table
  count_date     date        not null,      -- the physical count date (qsr_onhand.last_counted)
  cls            text        not null,      -- Food | Condiment | Paper | Non-Product
  period         text        not null,      -- YYYY-MM the snapshot came from
  items_counted  integer     not null,      -- items of this class counted that day
  class_total    integer     not null,      -- the store's universe for the class, for coverage
  covered        boolean     not null,      -- items_counted >= class_total * COVER_FRAC
  session_kind   text,                      -- eom | weekly | mid-paper | partial | spot
  tenant_id      uuid        not null default '00000000-0000-0000-0000-000000000001',
  first_seen     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (loc, count_date, cls)
);

-- Cadence queries are "recent sessions for these stores", so date leads.
create index if not exists inv_count_sessions_date_idx on public.inv_count_sessions (count_date desc);
create index if not exists inv_count_sessions_loc_idx  on public.inv_count_sessions (loc, count_date desc);

alter table public.inv_count_sessions enable row level security;

-- Tenant isolation, matching the pattern used across the other operational tables.
drop policy if exists inv_count_sessions_tenant on public.inv_count_sessions;
create policy inv_count_sessions_tenant on public.inv_count_sessions
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE), so a
-- user only ever sees stores in their accessible_locs. my_locs() returns NULL for
-- unrestricted users. Mirrors supabase/schema-rls-phase2-loc.sql.
drop policy if exists inv_count_sessions_loc on public.inv_count_sessions;
create policy inv_count_sessions_loc on public.inv_count_sessions
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.inv_count_sessions is
  'Append-only history of physical inventory count sessions, one row per (store, count date, class). Written daily by scripts/qsrsoft-onhand-pull.mjs from qsr_onhand.last_counted, which is rolling-latest and would otherwise lose history on recount.';
