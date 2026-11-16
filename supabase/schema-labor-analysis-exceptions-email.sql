-- ── labor_analysis_daily / labor_exceptions_daily / labor_exceptions_detail_daily ──────────
-- QSRSoft Operator Security Notice compliance triage (memory/finding-qsrsoft-security-notice-
-- 2026-11-16.md): with the credential-login pulls paused, these 3 tables capture two reports
-- QSRSoft was ALREADY emailing the owner daily (confirmed live via his own Scheduled Reports
-- admin page + real forwarded CSV samples, 2026-11-16) that scripts/qsrsoft-email-parse.mjs
-- never parsed. The Gmail-poller → Apps Script → ingest-report Edge Function pipeline already
-- classifies both filenames correctly (`detectReportType` → 'labor' / 'labor-exceptions') and
-- has likely been storing them in the `qsr-reports` bucket + `pending_reports` for a while —
-- this is the missing LAST step (parse + store), not a new data source and not new QSRSoft
-- access of any kind.
--
-- "Labor Analysis" (QSRSoft's own report name) is NOT the same thing as this codebase's
-- existing LifeLenz-sourced "Labor Analysis" concept (src/views/labor-analysis.js,
-- src/engine/labor-analysis.js, lifelenz_schedule) — completely different vendor, different
-- data. Named `labor_analysis_daily` here (matching the sales_ledger_daily/daily_glimpse_daily/
-- cash_sheet_daily sibling-table naming convention) to avoid colliding with that existing table
-- name space; do not rename to anything containing a bare "labor_analysis" that could collide.
--
-- Deliberately NOT wired into ds.laborRows/ds.exceptionRows (App.js's startup merge) in this
-- pass — that merge logic is already live, already has documented race-condition history, and
-- deserves its own careful pass. These tables exist and are populated starting now; the ds-
-- merge wiring is a named follow-on, not done here.

-- ── labor_analysis_daily — one row per (loc, date), from QSRSoft's "Labor Analysis" email ──
-- Field set mirrors parseLaborData()'s full output (src/parsers/index.js) — the SAME parser
-- the manual-upload path already uses (zero drift), confirmed field-for-field against a real
-- forwarded sample (labor_analysis_daily_2026-11-15.csv) before this table was written.
create table if not exists public.labor_analysis_daily (
  tenant_id            uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                  text        not null,   -- short form (e.g. '3708'), matching sales_ledger_daily etc.
  date                 date        not null,
  sales                numeric,                -- Product Sales (falls back to All Net Sales — parseLaborData's own rule)
  all_net_sales        numeric,
  proj_sales           numeric,
  gc                   integer,
  actual_gc            integer,
  opp_cost_pct         numeric,
  opp_cost_dollar      numeric,
  avg_check            numeric,
  tpph                 numeric,
  spph                 numeric,
  act_vs_need          numeric,
  punch_labor_pct      numeric,                -- headline Labor % (Notes 35 standardization)
  crew_labor_pct       numeric,
  total_labor_pct      numeric,
  ot_hrs               numeric,
  ot_dollar            numeric,
  act_hrs              numeric,
  avg_rate             numeric,
  salary_mgr_hrs       numeric,
  fixed_contract_hrs   numeric,
  fixed_sched_hrs      numeric,
  variable_needed      numeric,
  floor_mgmt_needed    numeric,
  floor_hrs_sched      numeric,
  sales_vs_ly_pct      numeric,
  dt_sales             numeric, dt_gc integer, dt_avg_chk numeric, dt_pct_total numeric,
  bf_sales             numeric, bf_gc integer, bf_avg_chk numeric, bf_pct_total numeric,
  deliv_sales          numeric, deliv_gc integer, deliv_avg_chk numeric, deliv_pct_total numeric,
  mop_sales            numeric, mop_gc integer, mop_avg_chk numeric, mop_pct_total numeric,
  kiosk_sales          numeric, kiosk_gc integer, kiosk_avg_chk numeric, kiosk_pct_total numeric,
  eat_in_sales         numeric, eat_in_gc integer,
  in_store_sales       numeric, in_store_gc integer, in_store_pct_total numeric,
  fc_sales             numeric, fc_gc integer, fc_pct_total numeric,
  updated_at           timestamptz not null default now(),
  primary key (loc, date)
);
create index if not exists labor_analysis_daily_date_idx on public.labor_analysis_daily (date desc);

alter table public.labor_analysis_daily enable row level security;
drop policy if exists "labor_analysis_daily: tenant read" on public.labor_analysis_daily;
create policy "labor_analysis_daily: tenant read" on public.labor_analysis_daily
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
drop policy if exists "labor_analysis_daily: loc scope" on public.labor_analysis_daily;
create policy "labor_analysis_daily: loc scope" on public.labor_analysis_daily
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
comment on table public.labor_analysis_daily is
  'QSRSoft emailed "Labor Analysis" report (store-level staffing/efficiency: TPPH, SPPH, Act-vs-Need, Opportunity Cost $, OT, channel sales), one row per (loc, date). Parsed by the SAME parseLaborData() the manual-upload path uses. Written only by scripts/qsrsoft-email-parse.mjs (service role). Not yet merged into ds.laborRows — see memory/finding-qsrsoft-security-notice-2026-11-16.md.';

-- ── labor_exceptions_daily — one row per (loc, date), aggregate counts ─────────────────────
-- Matches the exact field shape src/engine/insights.js's joinDaily(exceptionRows,
-- 'totalExceptions', laborRows, 'otHrs') signal and analytics.js's coverage checker already
-- expect (pre-dating this fix) — see parseLaborExceptions()'s own header comment for why.
create table if not exists public.labor_exceptions_daily (
  tenant_id       uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc             text        not null,
  date            date        not null,
  total_exceptions integer    not null default 0,
  missed_breaks   integer     not null default 0,
  early_out       integer     not null default 0,
  late_in         integer     not null default 0,
  ot_exceptions   integer     not null default 0,
  minor_exceptions integer    not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (loc, date)
);
create index if not exists labor_exceptions_daily_date_idx on public.labor_exceptions_daily (date desc);

alter table public.labor_exceptions_daily enable row level security;
drop policy if exists "labor_exceptions_daily: tenant read" on public.labor_exceptions_daily;
create policy "labor_exceptions_daily: tenant read" on public.labor_exceptions_daily
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
drop policy if exists "labor_exceptions_daily: loc scope" on public.labor_exceptions_daily;
create policy "labor_exceptions_daily: loc scope" on public.labor_exceptions_daily
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
comment on table public.labor_exceptions_daily is
  'QSRSoft emailed "Labor Exceptions" report, aggregated per (loc, date) — total/missed-break/early-out/late-in/OT/minor exception counts. Same field shape ds.exceptionRows already carries (activates the pre-existing insights.js correlation signal once merged into ds — not done in this table alone). Written only by scripts/qsrsoft-email-parse.mjs (service role).';

-- ── labor_exceptions_detail_daily — one row per (loc, geid, date, exception) ────────────────
-- The per-employee compliance detail the aggregate above necessarily discards — above all the
-- "Is Manager Authorized" flag. Employee name/GEID stored plainly under ordinary RLS, same
-- precedent as lifelenz_employee_performance/lifelenz_compliance_audit (operational fields,
-- not ssn/DOB/address — see CLAUDE.md's PII standing rules). No panel reads this yet.
create table if not exists public.labor_exceptions_detail_daily (
  tenant_id             uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                   text        not null,
  date                  date        not null,
  geid                  text        not null,
  employee              text,
  exception             text        not null,
  exception_time        timestamptz,
  is_manager_authorized boolean,                -- null = field blank on the source row, not "no"
  act_start             numeric,                -- Excel time-of-day fraction (×24 for hours) —
  act_end               numeric,                -- intentionally raw; format at the display layer
  sch_start             numeric,                -- when a consumer is built, same raw-passthrough
  sch_end               numeric,                -- convention parseRaw-based parsers use elsewhere
  shift_length          numeric,
  updated_at            timestamptz not null default now(),
  primary key (loc, geid, date, exception, exception_time)
);
create index if not exists labor_exceptions_detail_daily_date_idx on public.labor_exceptions_detail_daily (date desc);
create index if not exists labor_exceptions_detail_daily_geid_idx on public.labor_exceptions_detail_daily (geid);

alter table public.labor_exceptions_detail_daily enable row level security;
drop policy if exists "labor_exceptions_detail_daily: tenant read" on public.labor_exceptions_detail_daily;
create policy "labor_exceptions_detail_daily: tenant read" on public.labor_exceptions_detail_daily
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
drop policy if exists "labor_exceptions_detail_daily: loc scope" on public.labor_exceptions_detail_daily;
create policy "labor_exceptions_detail_daily: loc scope" on public.labor_exceptions_detail_daily
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
comment on table public.labor_exceptions_detail_daily is
  'Per-employee detail behind labor_exceptions_daily''s aggregate counts — GEID, employee name, exception type/time, manager-authorization flag, scheduled vs actual punch times. Not yet read by any panel. Written only by scripts/qsrsoft-email-parse.mjs (service role).';
