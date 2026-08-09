-- ── Hourly Projection Accuracy (2026-08-09) ───────────────────────────────────────────────────
-- Small, purpose-built daily rollup of actual vs QSRSoft-projected sales/GC per (date, hour_slot,
-- store). Exists because the raw qsr_daily_activity table times out on hourly reads past ~30 days
-- (measured live this session — see memory/plan-data-integrity-sweep.md "hourly pacing" entries;
-- the root cause is the SAME one schema-qsr-daily-activity-index.sql already diagnosed: a
-- loc-leading primary key forces a full 367k-row seq scan on every dt-filtered query). This table
-- stays tiny (~675 rows/day, one per loc+hour_slot, appended once daily after the day is
-- complete) so the Projection Accuracy report can look back over weeks or months without ever
-- re-scanning the large raw table.
--
-- Populated by scripts/compute-hourly-projection-accuracy.mjs, run daily via
-- .github/workflows/hourly-projection-accuracy.yml (~6am CT, after the prior day's DAR pulls
-- finish). Read by src/views/signals.js's Projection Accuracy tab.
--
-- RLS here is the simple, self-contained pattern (matches how org_events started — see
-- schema-org-events.sql) rather than the heavier RESTRICTIVE + my_locs() pattern
-- schema-rls-phase2-loc.sql applies to qsr_daily_activity and its 51 siblings — that pattern
-- exists to survive 367k+ rows under concurrent load, which this table is nowhere near. Sweep
-- this table into schema-multitenant-phase2-rls.sql's tenant list and
-- schema-rls-phase2-loc.sql's per-loc list later if/when it grows large enough to need that
-- treatment (the same path org_events took).
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.hourly_projection_accuracy (
  dt            date not null,
  hour_slot     text not null,
  loc           text not null,           -- store number, UNPADDED (matches STORE_NAMES / other loc-keyed tables)
  actual_sales  numeric not null default 0,
  proj_sales    numeric not null default 0,
  actual_gc     integer not null default 0,
  proj_gc       integer not null default 0,
  computed_at   timestamptz default now(),
  primary key (dt, hour_slot, loc)
);
-- dt-leading (not loc-leading) — every consumer filters by date range, per the lesson already
-- learned and documented in schema-qsr-daily-activity-index.sql.
create index if not exists hourly_projection_accuracy_dt_idx on public.hourly_projection_accuracy (dt);

alter table public.hourly_projection_accuracy enable row level security;
create policy "hourly_projection_accuracy: read scoped" on public.hourly_projection_accuracy for select
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.accessible_locs is null or public.hourly_projection_accuracy.loc = any (p.accessible_locs))
  ));
-- Write: service role only — this table is entirely computed/automated, never user-entered.
create policy "hourly_projection_accuracy: write service role" on public.hourly_projection_accuracy
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── VERIFY (expect real numbers once the workflow has run at least once) ──────────────────────
--   select count(*) from public.hourly_projection_accuracy;
--   select dt, hour_slot, sum(actual_sales), sum(proj_sales)
--     from public.hourly_projection_accuracy
--    where dt = current_date - 1 group by dt, hour_slot order by hour_slot limit 5;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop table if exists public.hourly_projection_accuracy;
