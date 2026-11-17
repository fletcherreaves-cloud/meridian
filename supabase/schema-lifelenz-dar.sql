-- ── lifelenz_dar — LifeLenz's own hourly Daily Activity Report (DAR) data ──────────────────────
-- Source: LifeLenz's `darData` GraphQL query (us01-connect.lifelenz.com/manager/graphql, the
-- same admin endpoint lifelenz-pull.mjs already authenticates against -- NOT the Data Explorer
-- Lakehouse async-report mechanism Schedule Variance/Compliance Audit/Employee Performance use).
-- Built after a 4-dispatch live-introspection discovery (2026-11-17,
-- memory/finding-lifelenz-dar-schema-2026-11-17.md) that pinned down darData's real shape --
-- every field-name guess carried over from the 2026-11-05 finding's write-up
-- (netSales/transactions/avgDtServiceTime/"intervals") turned out to be wrong:
--
--   DarData { totals: [FieldValue!]!, dar: [Dar!]! }
--   Dar     { data: [FieldValue!]!, missingActuals: Boolean!, startTime: ISO8601DateTime! }
--   FieldValue { fieldCode: String!, value: String }
--
-- i.e. both `totals` (whole-window aggregate, NOT stored here -- it is exactly the sum of the
-- per-hour rows this table already holds, so storing it too would be a second copy of the same
-- number, the "never average averages / don't duplicate a derivable total" standing rule) and
-- each `dar[]` element's `data` are a generic [fieldCode,value] list, not named scalar
-- properties -- so every column below is one promoted fieldCode, not a guess.
--
-- Confirmed real fieldCodes (16, live response, run 44181293382, store 0003708, 2026-11-17):
-- net_sales, transactions, total_transactions_variation, drive_through_transactions_variation,
-- window_transactions_variation, sandwiches, sandwich_count_variation, avg_dt_service_time,
-- avg_fc_service_time, avg_mfy_service_time, actual_punch_hours, total_hours_diff,
-- total_hours_ideal_variation, transactions_per_punch_hour, sales_per_punch_hour,
-- labour_percentage_of_sales. All stored as numeric -- FieldValue.value is a bare String on the
-- wire for every one of them (including the two that are logically integer counts,
-- transactions/sandwiches), so parsing as numeric is the honest, non-assuming choice.
--
-- Grain: ONE ROW PER (loc, start_time) -- start_time is the real UTC ISO8601DateTime LifeLenz
-- returned for that hourly interval, used AS-IS, never re-bucketed into a derived business-date
-- column here. Deliberate scope cut (see the memory file's "Phase 1 vs Phase 2" section): this
-- pull was only ever measured against ONE store (0003708, an Oklahoma/Central-time schedule) --
-- whether LifeLenz buckets darData's hourly intervals in each store's OWN local timezone (so a
-- Florida/Eastern store's start_time values would NOT line up with Oklahoma's the same way) is
-- an unmeasured, real question, not an assumption to encode into a `dt`/business-date column.
-- Until a Florida store is measured too, every downstream consumer (stream-freshness.js's
-- STREAMS, metric-source.js's auto-first chains, App.js's ds) stays unwired -- this table is
-- written and watched (sync-failure-watch.yml) in this PR, but not yet READ by the app.
create table if not exists public.lifelenz_dar (
  tenant_id                        uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                               text        not null,   -- store number, 7-char zero-padded (locFromName)
  start_time                        timestamptz not null,   -- the real LifeLenz Dar.startTime, used verbatim
  missing_actuals                   boolean,                -- Dar.missingActuals -- true when this hour has no real data yet
  net_sales                         numeric,
  transactions                      numeric,
  total_transactions_variation      numeric,
  drive_through_transactions_variation numeric,
  window_transactions_variation     numeric,
  sandwiches                        numeric,
  sandwich_count_variation          numeric,
  avg_dt_service_time               numeric,
  avg_fc_service_time               numeric,
  avg_mfy_service_time              numeric,
  actual_punch_hours                numeric,
  total_hours_diff                  numeric,
  total_hours_ideal_variation       numeric,
  transactions_per_punch_hour       numeric,
  sales_per_punch_hour              numeric,
  labour_percentage_of_sales        numeric,
  updated_at                        timestamptz not null default now(),
  primary key (loc, start_time)
);

create index if not exists lifelenz_dar_start_time_idx
  on public.lifelenz_dar (start_time desc);
create index if not exists lifelenz_dar_loc_idx
  on public.lifelenz_dar (loc);

alter table public.lifelenz_dar enable row level security;

-- Same two-layer pattern as every other lifelenz_* table (tenant match + accessible_locs
-- loc-scoping via the existing (select public.my_locs()) RESTRICTIVE predicate).
drop policy if exists "lifelenz_dar: tenant read" on public.lifelenz_dar;
create policy "lifelenz_dar: tenant read" on public.lifelenz_dar
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "lifelenz_dar: loc scope" on public.lifelenz_dar;
create policy "lifelenz_dar: loc scope" on public.lifelenz_dar
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role -- every write comes from
-- scripts/lifelenz-dar-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.lifelenz_dar is
  'LifeLenz''s own hourly Daily Activity Report data (darData GraphQL query) -- one row per (loc, start_time) hourly interval: sales, transactions, DT/FC/MFY service time, punch hours, labour % of sales. Written only by scripts/lifelenz-dar-pull.mjs (service role); read gated by ordinary tenant + accessible_locs RLS. NOT YET read by the app (see the table-level comment in supabase/schema-lifelenz-dar.sql for why).';
