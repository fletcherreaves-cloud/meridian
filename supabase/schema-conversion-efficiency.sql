-- ── Conversion Efficiency Ratio (McDonald's corporate "Owner Operator Reports") ──────────────
-- Owner request 2026-10-19: years of monthly emailed PDFs (one per owner, one page per
-- restaurant, 18 fixed raw items × 8 metric columns, a trailing 52-week rolling window) showing
-- actual vs. target food-conversion ratios and the estimated $ opportunity each raw item
-- represents. Parser: src/parsers/conversion-efficiency.js (Oracle Analytics Publisher PDF,
-- X-coordinate column matching -- see that file's own header for why).
--
-- Identity is (loc, raw_item, period) -- a store reports the SAME 18 raw items every period
-- (period = the report's own "52 Weeks Ending <Month> <Year>" label, 'YYYY-MM'), so a re-upload
-- of the same monthly PDF upserts cleanly rather than duplicating.
--
-- Manual-upload-only for now, per CLAUDE.md's "ship manually, then automate" standing rule --
-- no self-service API is known to exist for this corporate program; email ingestion is the
-- intended automation path once this manual path is proven (see memory/project-backlog.md).
create table if not exists public.conversion_efficiency (
  id                           uuid             not null default gen_random_uuid() primary key,
  tenant_id                    uuid             not null default '00000000-0000-0000-0000-000000000001',
  loc                          text             not null,      -- unpadded, matches STORE_NAMES keys
  loc_name                     text,
  period                       text             not null,      -- '2026-09' = "52 Weeks Ending September 2026"
  owner_name                   text,                            -- 'LOPEZ-THORLEY KATHRYN E' -- descriptive only, not identity
  raw_item                     text             not null,      -- 'French Fries', '10 To 1 Beef', ... (18 fixed items)
  conv_eff_52wk                double precision,                -- actual 52-week trailing conversion efficiency
  conv_eff_target               double precision,
  excess_cases_annual          double precision,                -- estimated annual excess cases vs target
  financial_opportunity_annual double precision,                -- estimated annual $ opportunity vs target
  conv_eff_2025_ye             double precision,                -- 2025 year-end baseline -- NULL when the item has none (e.g. a new item)
  conv_eff_ytd                 double precision,                -- Jan-current-month YTD actual
  conv_eff_pct_chg             double precision,                -- YTD vs. 2025 YE, percent
  financial_impact_ytd         double precision,                -- YTD vs. 2025 YE, $
  source_file                  text,
  created_by                   uuid,
  created_at                   timestamptz      not null default now(),
  unique (loc, raw_item, period)
);

create index if not exists conversion_efficiency_loc_idx on public.conversion_efficiency (loc, period desc);
create index if not exists conversion_efficiency_period_idx on public.conversion_efficiency (period desc);

alter table public.conversion_efficiency enable row level security;

drop policy if exists conversion_efficiency_tenant on public.conversion_efficiency;
create policy conversion_efficiency_tenant on public.conversion_efficiency
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE). Mirrors
-- schema-pay-events.sql / schema-rls-phase2-loc.sql.
drop policy if exists conversion_efficiency_loc on public.conversion_efficiency;
create policy conversion_efficiency_loc on public.conversion_efficiency
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) )
  with check ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.conversion_efficiency is
  'Monthly per-store, per-raw-item food conversion efficiency vs. target from McDonald''s corporate "Owner Operator Reports" (Conversion Efficiency Ratio PDFs). Identity (loc, raw_item, period) -- see this file''s header. Parser: src/parsers/conversion-efficiency.js.';
