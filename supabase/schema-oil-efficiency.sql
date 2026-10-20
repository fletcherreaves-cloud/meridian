-- ── Oil Efficiency ("Oil Management Report", Cargill-generated) ──────────────────────────────
-- Owner request 2026-10-19 ("I want to do the same for oil efficiency reports... build out to
-- app"): same "Owner Operator Reports" email program as Conversion Efficiency Ratio
-- (schema-conversion-efficiency.sql), different report -- a monthly per-store oil-use/filtration
-- scorecard from Cargill, 3/6/12-month trailing averages. Parser: src/parsers/oil-efficiency.js.
--
-- Identity is (loc, period) -- store-level only, no per-item dimension like Conversion
-- Efficiency's 18 raw items. A re-upload of the same monthly PDF upserts cleanly.
--
-- Restaurant Impact (the estimated $ cost of over-target oil use) is EITHER a real dollar figure
-- OR a categorical label ("Quality Concern", "Optimized") when the store has no $ figure -- both
-- are real, measured report values, not an error case, so each trailing window gets a paired
-- dollars/label column rather than forcing one type.
create table if not exists public.oil_efficiency (
  id                   uuid             not null default gen_random_uuid() primary key,
  tenant_id            uuid             not null default '00000000-0000-0000-0000-000000000001',
  loc                  text             not null,      -- unpadded, matches STORE_NAMES keys
  loc_name             text,
  period               text             not null,      -- '2026-03' = "3-Month Rolling Average Ending Mar 31, 2026"
  owner_name           text,                             -- descriptive only, not identity
  oil_use_3mo_pct      double precision,
  oil_use_6mo_pct      double precision,
  oil_use_12mo_pct     double precision,
  impact_3mo_dollars   double precision,
  impact_3mo_label     text,
  impact_6mo_dollars   double precision,
  impact_6mo_label     text,
  impact_12mo_dollars  double precision,
  impact_12mo_label    text,
  filtration_3mo_pct   double precision,
  filtration_6mo_pct   double precision,
  filtration_12mo_pct  double precision,
  source_file          text,
  created_by           uuid,
  created_at           timestamptz      not null default now(),
  unique (loc, period)
);

create index if not exists oil_efficiency_loc_idx on public.oil_efficiency (loc, period desc);
create index if not exists oil_efficiency_period_idx on public.oil_efficiency (period desc);

alter table public.oil_efficiency enable row level security;

drop policy if exists oil_efficiency_tenant on public.oil_efficiency;
create policy oil_efficiency_tenant on public.oil_efficiency
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE). Mirrors
-- schema-conversion-efficiency.sql / schema-pay-events.sql.
drop policy if exists oil_efficiency_loc on public.oil_efficiency;
create policy oil_efficiency_loc on public.oil_efficiency
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) )
  with check ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.oil_efficiency is
  'Monthly per-store oil-use/filtration-compliance scorecard from Cargill "Oil Management Report" PDFs (3/6/12-month trailing averages). Identity (loc, period) -- see this file''s header. Parser: src/parsers/oil-efficiency.js.';
