-- ── QSRSoft Native MCP Server pulls — the sanctioned-channel alternative to credential-login
-- scraping, stood up in response to QSRSoft's 2026-11 Operator Security Notice Letter (see
-- memory/finding-qsrsoft-security-notice-2026-11-16.md). The MCP server (https://mcp.myqsrsoft.com)
-- exposes exactly 2 report types today — timeSliceSummaryReport and serviceTimeStatsReport —
-- via a proper OAuth2 (PKCE) connection scoped to reports:read, omni:query + offline_access.
--
-- This is DELIBERATELY ADDITIVE, not a replacement: the ~33 existing credential-scraping pull
-- scripts (qsrsoft-ops-pull.mjs, qsrsoft-dar-pull.mjs, etc.) are UNTOUCHED and keep running.
-- These two new tables are a parallel, sanctioned-channel copy of data that overlaps what
-- qsr_daily_activity/qsr_service_stats/daily_glimpse_daily already provide — nothing in the app
-- reads these tables yet. Wiring them into metric-source.js as a preferred/alternate source for
-- OEPE/R2P/KVS/channel-mix chains is a deliberate follow-on decision, not done here (per CLAUDE.md's
-- "measure it, don't reason about it" — the two sources should be diffed against each other first,
-- same discipline as the "two panels disagree on one number" rule, before either is trusted over
-- the other in a live panel).
--
-- Both MCP reports are "completed days only" — no intraday equivalent exists yet (the server's own
-- report description references a "dailyActivityReport" tool that does not exist as a callable tool
-- as of this writing). Pulled once daily, segmentBy=summary (whole business day), one row per
-- (loc, dt). *CompAmt (vs-LY delta) fields are intentionally NOT pulled — Meridian computes its own
-- vs-LY via vs-ly.js, matching the app's standing "never average averages / compute your own
-- aggregates" convention rather than trusting a vendor-computed delta.

-- ── qsr_mcp_token_cache — the rotating OAuth refresh token for the MCP service connection ────
-- QSRSoft's MCP auth server (https://mcp.myqsrsoft.com/auth) issues ROTATING refresh tokens: every
-- refresh_token grant exchange invalidates the old refresh token and returns a new one. A GitHub
-- Secret can't be rewritten by a workflow run without extra plumbing (Actions secrets aren't
-- readable back out, and writing one needs a PAT with repo-secrets scope that doesn't otherwise
-- exist in this codebase), so the rotating value lives here instead — read + immediately
-- rewritten by scripts/lib/qsrsoft-mcp-auth.mjs on every run, BEFORE any data call is made (so a
-- mid-run failure never leaves a stale, already-invalidated token as the only copy — see that
-- script's header for the exact persist-before-use ordering and why it matters).
--
-- Deliberately NOT like every other qsr_* table: no tenant_id, no accessible_locs RLS policy at
-- all. RLS is enabled with ZERO policies, which is a default-deny — the anon and authenticated
-- roles get nothing via PostgREST, by design; only the service-role key (which bypasses RLS
-- entirely) can read or write this table. This is a credential-vault pattern, not a data table,
-- and must never be exposed through the app's client-side Supabase calls.
create table if not exists public.qsr_mcp_token_cache (
  id            text        primary key,   -- fixed slug, e.g. 'qsrsoft_mcp' — one row, one connection
  refresh_token text        not null,
  client_id     text        not null,
  updated_at    timestamptz not null default now()
);
alter table public.qsr_mcp_token_cache enable row level security;
-- No policies — default-deny for anon/authenticated. Service-role only, by omission.

comment on table public.qsr_mcp_token_cache is
  'Rotating OAuth refresh token for the QSRSoft Native MCP Server connection (scripts/lib/qsrsoft-mcp-auth.mjs). RLS enabled with zero policies — service-role access only, never exposed to the app client. Do not add a read policy here.';

-- ── qsr_mcp_time_slice_summary — timeSliceSummaryReport, one row per (loc, dt) ────────────────
create table if not exists public.qsr_mcp_time_slice_summary (
  tenant_id                  uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                        text        not null,   -- store number, 7-char zero-padded
  dt                         date        not null,
  stw_gc                     integer,                -- STW GC — storewide guest count
  all_net_sales              numeric,
  avg_check                  numeric,
  product_sales              numeric,
  oepe                       numeric,                -- seconds
  oepe_no_park               numeric,
  r2p                        numeric,
  kvs_time_per_tran          numeric,
  total_dt_sales             numeric,
  total_dt_transactions      integer,
  dt_avg_check               numeric,
  total_instore_sales        numeric,
  total_instore_transactions integer,
  kiosk_all_net_sales        numeric,
  kiosk_avg_check            numeric,
  delivery_all_net_sales     numeric,                -- 3PO McDelivery
  delivery_avg_check         numeric,
  mop_all_net_sales          numeric,                -- Mobile Order & Pay
  fc_all_net_sales           numeric,
  dt_all_net_sales           numeric,                -- DT-where-ordered sales
  dt_transactions            integer,
  instore_all_net_sales      numeric,
  instore_transactions       integer,
  updated_at                 timestamptz not null default now(),
  primary key (loc, dt)
);
create index if not exists qsr_mcp_time_slice_summary_dt_idx
  on public.qsr_mcp_time_slice_summary (dt desc);

alter table public.qsr_mcp_time_slice_summary enable row level security;
drop policy if exists "qsr_mcp_time_slice_summary: tenant read" on public.qsr_mcp_time_slice_summary;
create policy "qsr_mcp_time_slice_summary: tenant read" on public.qsr_mcp_time_slice_summary
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
drop policy if exists "qsr_mcp_time_slice_summary: loc scope" on public.qsr_mcp_time_slice_summary;
create policy "qsr_mcp_time_slice_summary: loc scope" on public.qsr_mcp_time_slice_summary
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );
-- No insert/update/delete policy for any role — every write comes from
-- scripts/qsrsoft-mcp-pull.mjs's service-role key, which bypasses RLS entirely.

comment on table public.qsr_mcp_time_slice_summary is
  'QSRSoft Native MCP Server — Time Slice Summary report (net sales/GC/avg check, OEPE/R2P/KVS, full channel split), one row per (loc, dt), completed days only. Parallel/sanctioned-channel copy — not yet wired into any panel or metric-source.js chain. Written only by scripts/qsrsoft-mcp-pull.mjs (service role).';

-- ── qsr_mcp_service_time_stats — serviceTimeStatsReport, one row per (loc, dt) ────────────────
create table if not exists public.qsr_mcp_service_time_stats (
  tenant_id                   uuid        not null default '00000000-0000-0000-0000-000000000001',
  loc                         text        not null,
  dt                          date        not null,
  total_dt_transactions       integer,
  ctp                         numeric,                -- Cash To Present
  oepe                        numeric,
  oepe_no_park                numeric,
  dt_ttl                      numeric,                -- Drive Thru Total Time
  dt_order_time               numeric,
  dt_line_time                numeric,
  dt_win1_time                numeric,                -- cashier
  dt_win2_time                numeric,                -- present
  dt_parked_car_time          numeric,
  dt_parked_trans             integer,
  dt_pct_pull_forward         numeric,
  exp_transactions            integer,
  r2p                         numeric,
  kiosk_r2p                   numeric,
  fc_r2p                      numeric,
  exp_order_time              numeric,
  exp_ttl                     numeric,
  kvs_transactions            integer,
  kvs_items                   integer,
  kvs_items_per_tran          numeric,
  kvs_time_per_tran           numeric,
  kvs_time_per_item           numeric,
  healthy_use_pct             numeric,
  mfy1_transactions           integer,
  mfy1_items                  integer,
  mfy1_items_per_order        numeric,
  mfy1_time_per_order         numeric,
  mfy1_time_per_item          numeric,
  mfy2_transactions           integer,
  mfy2_items                  integer,
  mfy2_items_per_order        numeric,
  mfy2_time_per_order         numeric,
  mfy2_time_per_item          numeric,
  bev_trans                   integer,
  bev_order_time              numeric,
  bev_run_time                numeric,
  bev_ttl                     numeric,
  updated_at                  timestamptz not null default now(),
  primary key (loc, dt)
);
create index if not exists qsr_mcp_service_time_stats_dt_idx
  on public.qsr_mcp_service_time_stats (dt desc);

alter table public.qsr_mcp_service_time_stats enable row level security;
drop policy if exists "qsr_mcp_service_time_stats: tenant read" on public.qsr_mcp_service_time_stats;
create policy "qsr_mcp_service_time_stats: tenant read" on public.qsr_mcp_service_time_stats
  for select using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
drop policy if exists "qsr_mcp_service_time_stats: loc scope" on public.qsr_mcp_service_time_stats
  ;
create policy "qsr_mcp_service_time_stats: loc scope" on public.qsr_mcp_service_time_stats
  as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  )
  with check (
    (select public.my_locs()) is null
    or ltrim(loc, '0') in (select unnest((select public.my_locs())))
  );

comment on table public.qsr_mcp_service_time_stats is
  'QSRSoft Native MCP Server — Service Time Statistics report (CTP, OEPE components, DT order/line/window/parked-car times + pull-forward %, R2P split, KVS/MFY1/MFY2/beverage detail), one row per (loc, dt), completed days only. Finer-grained than the DAR-derived equivalent (see memory/finding-qsrsoft-security-notice-2026-11-16.md Track D). Not yet wired into any panel. Written only by scripts/qsrsoft-mcp-pull.mjs (service role).';
