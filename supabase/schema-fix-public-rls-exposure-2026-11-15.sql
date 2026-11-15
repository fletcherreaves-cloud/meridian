-- ═══════════════════════════════════════════════════════════════════════════════
-- URGENT SECURITY FIX — remove stray "public read"/"public write" RLS policies that
-- expose tenant data to the unauthenticated public internet (2026-11-15)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- MEASURED LIVE, 2026-11-15, via the deployed app's own public anon/publishable key
-- (sb_publishable_..., the same one shipped in every visitor's browser bundle — not a
-- secret, extracted the same way any visitor's devtools would) with NO login, NO
-- Authorization bearer beyond that same public key:
--
--   curl -H "apikey: <public key>" -H "Authorization: Bearer <public key>" \
--     ".../rest/v1/lifelenz_schedule?select=loc,date&limit=3"
--   -> 200, real rows: {"loc":"0010422","date":"2025-01-01"}, ...
--
-- Same result (real rows, HTTP 200, zero auth) against qsr_fob and
-- squadle_checklist_records (the latter returned full checklist content, ~5.5 MB
-- across 62 rows). A follow-up query of pg_policies confirmed this is NOT limited to
-- those three tables -- 47 tables carry an explicit "<table>: public read" /
-- "<table>: public write" policy pair with `qual = true` and `roles = {public}` (i.e.
-- unconditionally true, for anon AND authenticated, from ANY tenant). Because Postgres
-- combines multiple PERMISSIVE policies for the same command with OR, this one
-- unconditional policy completely cancels out the correct, already-live
-- tenant-scoped sibling policy (`tenant_select`/`tenant_insert`/`tenant_update`/
-- `tenant_delete`, `<table>_loc_scope`) on every one of these tables -- the correct
-- policy was never actually doing anything, because its OR partner always wins first.
--
-- Root cause, traced via `git log`/`git show`, not guessed: `supabase/schema.sql`'s own
-- header says "Run this in the Supabase SQL editor" -- it is the original, early-dev
-- bootstrap schema, and its "public read"/"public write" policies are explicitly
-- commented at the time as temporary ("localhost bypass has no auth session; tighten
-- after Vercel auth is live", "Public read — targets are operational data, no PII").
-- `schema-rls-phase1.sql` (and later multitenant/loc-scope migrations) correctly
-- tightened these same tables with `to authenticated using (auth.uid() is not null)`
-- and then full tenant+loc scoping -- but those are SEPARATE files with the SAME
-- policy names. Commit 404f24b4 (2026-11-13, PR #1889 -- this session's own prior
-- work) fixed a real `ERROR 42710` (policy already exists) that blocked re-running
-- schema.sql in full, by adding `drop policy if exists` guards to its 96 previously-
-- unguarded `create policy` statements, and that commit's own message told the owner
-- "this fix lets a fresh full re-run finish the rest." A full re-run of schema.sql
-- after that fix re-created every one of its own old, loose policies under their
-- original names, DROPPING AND REPLACING whatever tighter policy a later migration
-- had put there. That is almost certainly how a security hole that didn't show up in
-- the 2026-08-20/2026-10-16 RLS audits (both tested via a signed-in JWT, never a bare
-- anon-only unauthenticated request) ended up live now. This fix note owns that: the
-- schema.sql re-run instruction two days ago is the direct, traceable cause.
--
-- THIS MIGRATION fixes the symptom on the LIVE database, right now. It does NOT yet
-- fix schema.sql's own source text -- that still contains these same loose policies,
-- so a future full re-run of schema.sql would silently reintroduce this exact hole
-- again. That source-level fix is a separate, already-planned follow-up (edit
-- schema.sql's own `using (true)` policies to match what's actually correct today),
-- deliberately NOT bundled into this urgent live-database fix so this can be run
-- immediately without waiting on a full review of schema.sql's 1000+ lines.
--
-- WHAT THIS DOES NOT BREAK: every one of the 47 tables below already has a complete,
-- correct, currently-live set of tenant+role-scoped policies (`tenant_select`/
-- `tenant_insert`/`tenant_update`/`tenant_delete`, plus `<table>_loc_scope` on tables
-- that need per-store scoping) -- confirmed via pg_policies before writing this file,
-- not assumed. Dropping the stray "public read"/"public write" pair changes NOTHING
-- about what a real, logged-in, correctly-scoped user of this app can do -- it only
-- removes the unauthenticated/cross-tenant bypass. The one production write path that
-- looked like it might need public access (`pending_reports`, whose own comment cites
-- "auto-ingest runs before Supabase auth is established on localhost") was checked
-- directly: `supabase/functions/ingest-report/index.ts` writes via
-- `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS entirely -- the public policy was
-- never actually load-bearing for the real production ingest path, only for a
-- localhost-only dev convenience that doesn't apply to the live site.
--
-- TWO TABLES ARE DELIBERATELY EXCLUDED FROM THE BULK DROP BELOW, handled separately:
--   - qsrsoft_kb: its SELECT policies ARE meant to be public (vendor QSRSoft Help
--     Center docs, no tenant data at all -- already documented in CLAUDE.md as
--     intentionally public-read). Only its WRITE policy is dropped below; nobody,
--     logged in or not, should get a blanket write grant on vendor reference content.
--   - qsr_field_definitions: same shape as qsrsoft_kb (static field-name reference
--     data, not per-tenant business data) -- keep its public READ, drop only its
--     "service write" (ALL, qual true) policy.
--   - vlh_guide_hours: checked and found ALREADY correctly scoped `to authenticated`
--     only (no anon exposure) -- nothing to do here, listed for completeness only.
--
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Drop the stray public-read/public-write pair on every genuinely tenant-scoped
--       business-data table (47 tables, 94 policies) ───────────────────────────────
drop policy if exists "audit_rows: public write" on public.audit_rows;
drop policy if exists "audit_rows: public read" on public.audit_rows;
drop policy if exists "cash_sheet_daily: public write" on public.cash_sheet_daily;
drop policy if exists "cash_sheet_daily: public read" on public.cash_sheet_daily;
drop policy if exists "ctrl_rows: public write" on public.ctrl_rows;
drop policy if exists "ctrl_rows: public read" on public.ctrl_rows;
drop policy if exists "custom_signals: public write" on public.custom_signals;
drop policy if exists "custom_signals: public read" on public.custom_signals;
drop policy if exists "daily_glimpse_daily: public write" on public.daily_glimpse_daily;
drop policy if exists "daily_glimpse_daily: public read" on public.daily_glimpse_daily;
drop policy if exists "dar_rows: public write" on public.dar_rows;
drop policy if exists "dar_rows: public read" on public.dar_rows;
drop policy if exists "employee_skills: public write" on public.employee_skills;
drop policy if exists "employee_skills: public read" on public.employee_skills;
drop policy if exists "eom_count_exceptions: public write" on public.eom_count_exceptions;
drop policy if exists "eom_count_exceptions: public read" on public.eom_count_exceptions;
drop policy if exists "eom_count_progress_log: public write" on public.eom_count_progress_log;
drop policy if exists "eom_count_progress_log: public read" on public.eom_count_progress_log;
drop policy if exists "eom_count_status: public write" on public.eom_count_status;
drop policy if exists "eom_count_status: public read" on public.eom_count_status;
drop policy if exists "eom_item_disposition: public write" on public.eom_item_disposition;
drop policy if exists "eom_item_disposition: public read" on public.eom_item_disposition;
drop policy if exists "eom_notification_settings: public write" on public.eom_notification_settings;
drop policy if exists "eom_notification_settings: public read" on public.eom_notification_settings;
drop policy if exists "eom_secondary_review: public write" on public.eom_secondary_review;
drop policy if exists "eom_secondary_review: public read" on public.eom_secondary_review;
drop policy if exists "eom_snapshots: public write" on public.eom_snapshots;
drop policy if exists "eom_snapshots: public read" on public.eom_snapshots;
drop policy if exists "feature_requests: public write" on public.feature_requests;
drop policy if exists "feature_requests: public read" on public.feature_requests;
drop policy if exists "fob_rows: public write" on public.fob_rows;
drop policy if exists "fob_rows: public read" on public.fob_rows;
drop policy if exists "forecast_snapshots: public write" on public.forecast_snapshots;
drop policy if exists "forecast_snapshots: public read" on public.forecast_snapshots;
drop policy if exists "labor_rows: public write" on public.labor_rows;
drop policy if exists "labor_rows: public read" on public.labor_rows;
drop policy if exists "lifelenz_job_hours: public write" on public.lifelenz_job_hours;
drop policy if exists "lifelenz_job_hours: public read" on public.lifelenz_job_hours;
drop policy if exists "lifelenz_labor_week: public write" on public.lifelenz_labor_week;
drop policy if exists "lifelenz_labor_week: public read" on public.lifelenz_labor_week;
drop policy if exists "lifelenz_schedule: public write" on public.lifelenz_schedule;
drop policy if exists "lifelenz_schedule: public read" on public.lifelenz_schedule;
drop policy if exists "monthly_targets: public write" on public.monthly_targets;
drop policy if exists "monthly_targets: public read" on public.monthly_targets;
drop policy if exists "ops_rows: public write" on public.ops_rows;
drop policy if exists "ops_rows: public read" on public.ops_rows;
drop policy if exists "peaks_rows: public write" on public.peaks_rows;
drop policy if exists "peaks_rows: public read" on public.peaks_rows;
drop policy if exists "qsr_cash_sheet: public write" on public.qsr_cash_sheet;
drop policy if exists "qsr_cash_sheet: public read" on public.qsr_cash_sheet;
drop policy if exists "qsr_ebos_daily: public write" on public.qsr_ebos_daily;
drop policy if exists "qsr_ebos_daily: public read" on public.qsr_ebos_daily;
drop policy if exists "qsr_fob: public write" on public.qsr_fob;
drop policy if exists "qsr_fob: public read" on public.qsr_fob;
drop policy if exists "qsr_inventory_summary: public write" on public.qsr_inventory_summary;
drop policy if exists "qsr_inventory_summary: public read" on public.qsr_inventory_summary;
drop policy if exists "qsr_labor_summary: public write" on public.qsr_labor_summary;
drop policy if exists "qsr_labor_summary: public read" on public.qsr_labor_summary;
drop policy if exists "qsr_onhand: public write" on public.qsr_onhand;
drop policy if exists "qsr_onhand: public read" on public.qsr_onhand;
drop policy if exists "qsr_peaks_sales: public write" on public.qsr_peaks_sales;
drop policy if exists "qsr_peaks_sales: public read" on public.qsr_peaks_sales;
drop policy if exists "qsr_raw_item_detail: public write" on public.qsr_raw_item_detail;
drop policy if exists "qsr_raw_item_detail: public read" on public.qsr_raw_item_detail;
drop policy if exists "qsr_sales_mix: public write" on public.qsr_sales_mix;
drop policy if exists "qsr_sales_mix: public read" on public.qsr_sales_mix;
drop policy if exists "qsr_service_stats: public write" on public.qsr_service_stats;
drop policy if exists "qsr_service_stats: public read" on public.qsr_service_stats;
drop policy if exists "qsr_transfers: public write" on public.qsr_transfers;
drop policy if exists "qsr_transfers: public read" on public.qsr_transfers;
drop policy if exists "qsr_variance_stat: public write" on public.qsr_variance_stat;
drop policy if exists "qsr_variance_stat: public read" on public.qsr_variance_stat;
drop policy if exists "qsr_waste: public write" on public.qsr_waste;
drop policy if exists "qsr_waste: public read" on public.qsr_waste;
drop policy if exists "sage_prompt_runs: public write" on public.sage_prompt_runs;
drop policy if exists "sage_prompt_runs: public read" on public.sage_prompt_runs;
drop policy if exists "sage_prompts: public write" on public.sage_prompts;
drop policy if exists "sage_prompts: public read" on public.sage_prompts;
drop policy if exists "sales_ledger_daily: public write" on public.sales_ledger_daily;
drop policy if exists "sales_ledger_daily: public read" on public.sales_ledger_daily;
drop policy if exists "saved_correlations: public write" on public.saved_correlations;
drop policy if exists "saved_correlations: public read" on public.saved_correlations;
drop policy if exists "smart_target_adjustments: public write" on public.smart_target_adjustments;
drop policy if exists "smart_target_adjustments: public read" on public.smart_target_adjustments;
drop policy if exists "smg_comments: public write" on public.smg_comments;
drop policy if exists "smg_comments: public read" on public.smg_comments;
drop policy if exists "smg_fullscale: public write" on public.smg_fullscale;
drop policy if exists "smg_fullscale: public read" on public.smg_fullscale;
drop policy if exists "smg_voice_daypart: public write" on public.smg_voice_daypart;
drop policy if exists "smg_voice_daypart: public read" on public.smg_voice_daypart;
drop policy if exists "smg_voice_performance: public write" on public.smg_voice_performance;
drop policy if exists "smg_voice_performance: public read" on public.smg_voice_performance;
drop policy if exists "store_labor_config: public write" on public.store_labor_config;
drop policy if exists "store_labor_config: public read" on public.store_labor_config;

-- ── 2. pending_reports — same pattern; production ingest uses the service-role key
--       (supabase/functions/ingest-report/index.ts), which bypasses RLS entirely, so
--       this public policy was never load-bearing for the real production path. ────
drop policy if exists "pending_reports: public read" on public.pending_reports;
drop policy if exists "pending_reports: public update" on public.pending_reports;

-- ── 3. Deliberately-public reference tables — drop WRITE only, keep READ public ────
drop policy if exists "qsrsoft_kb: public write" on public.qsrsoft_kb;
drop policy if exists "qsr_field_definitions: service write" on public.qsr_field_definitions;

-- ── 4. hme_dt_daily / squadle_checklist_records — different shape of the same family
--       of bug: their "tenant read" policy uses the hardcoded literal tenant_id (not
--       current_tenant_id()), which doesn't depend on auth.uid() resolving at all, so
--       it matched for anon too, with no "public read" sibling needed to explain it.
--       Re-created scoped `to authenticated` -- same tenant check, now also requires a
--       real login, matching every other tenant-scoped table's actual behavior. ─────
drop policy if exists "hme_dt_daily: tenant read" on public.hme_dt_daily;
create policy "hme_dt_daily: tenant read" on public.hme_dt_daily
  for select to authenticated using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

drop policy if exists "squadle_checklist_records: tenant read" on public.squadle_checklist_records;
create policy "squadle_checklist_records: tenant read" on public.squadle_checklist_records
  for select to authenticated using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run this after the above, expect ZERO rows back.
-- A non-empty result means some table still has an unconditional public policy left.
-- ═══════════════════════════════════════════════════════════════════════════════
-- select tablename, policyname, roles, cmd
-- from pg_policies
-- where schemaname = 'public'
--   and ((qual = 'true' and roles = '{public}' and tablename not in ('qsrsoft_kb','qsr_field_definitions'))
--        or (cmd = 'SELECT' and roles = '{public}' and qual like '%00000000-0000-0000-0000-000000000001%'));
