-- ============================================================================
-- Meridian RLS Hardening — PHASE 1: require authentication (close the anon hole)
-- Generated from supabase/schema.sql. Safe to run top-to-bottom; idempotent.
--
-- WHAT THIS DOES: every table that was world-open (`using (true)`) now requires a
-- logged-in user (`to authenticated` + `auth.uid() is not null`). The anon key can
-- no longer read or write these tables. NOTHING legitimate breaks:
--   • data-pull scripts + edge functions use the SERVICE ROLE key → bypass RLS.
--   • the app runs as `authenticated` after magic-link login → passes these checks.
-- Per-store isolation (operator A vs B) is PHASE 2. Storage buckets are PHASE 3.
--
-- PRE-REQ: confirm every write GitHub workflow passes SUPABASE_SERVICE_ROLE_KEY
-- (qsrsoft-email-parse falls back to anon without it and would then fail to write).
--
-- ROLLBACK: re-run the original policy blocks in schema.sql (they use `using (true)`),
-- or replace `to authenticated using (auth.uid() is not null)` with `using (true)`.
-- Expected result: "Success. No rows returned."
-- ============================================================================

-- ── public.pending_reports ──
drop policy if exists "pending_reports: public read" on public.pending_reports;
create policy "pending_reports: public read" on public.pending_reports for select to authenticated using (auth.uid() is not null);

drop policy if exists "pending_reports: public update" on public.pending_reports;
create policy "pending_reports: public update" on public.pending_reports for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.monthly_targets ──
drop policy if exists "monthly_targets: public read" on public.monthly_targets;
create policy "monthly_targets: public read" on public.monthly_targets for select to authenticated using (auth.uid() is not null);

drop policy if exists "monthly_targets: public write" on public.monthly_targets;
create policy "monthly_targets: public write" on public.monthly_targets for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.smg_fullscale ──
drop policy if exists "smg_fullscale: public read" on public.smg_fullscale;
create policy "smg_fullscale: public read" on public.smg_fullscale for select to authenticated using (auth.uid() is not null);

drop policy if exists "smg_fullscale: public write" on public.smg_fullscale;
create policy "smg_fullscale: public write" on public.smg_fullscale for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_fob ──
drop policy if exists "qsr_fob: public read" on public.qsr_fob;
create policy "qsr_fob: public read" on public.qsr_fob for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_fob: public write" on public.qsr_fob;
create policy "qsr_fob: public write" on public.qsr_fob for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.lifelenz_schedule ──
drop policy if exists "lifelenz_schedule: public read" on public.lifelenz_schedule;
create policy "lifelenz_schedule: public read" on public.lifelenz_schedule for select to authenticated using (auth.uid() is not null);

drop policy if exists "lifelenz_schedule: public write" on public.lifelenz_schedule;
create policy "lifelenz_schedule: public write" on public.lifelenz_schedule for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.lifelenz_job_hours ──
drop policy if exists "lifelenz_job_hours: public read" on public.lifelenz_job_hours;
create policy "lifelenz_job_hours: public read" on public.lifelenz_job_hours for select to authenticated using (auth.uid() is not null);

drop policy if exists "lifelenz_job_hours: public write" on public.lifelenz_job_hours;
create policy "lifelenz_job_hours: public write" on public.lifelenz_job_hours for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.smg_voice_performance ──
drop policy if exists "smg_voice_performance: public read" on public.smg_voice_performance;
create policy "smg_voice_performance: public read" on public.smg_voice_performance for select to authenticated using (auth.uid() is not null);

drop policy if exists "smg_voice_performance: public write" on public.smg_voice_performance;
create policy "smg_voice_performance: public write" on public.smg_voice_performance for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.smg_voice_daypart ──
drop policy if exists "smg_voice_daypart: public read" on public.smg_voice_daypart;
create policy "smg_voice_daypart: public read" on public.smg_voice_daypart for select to authenticated using (auth.uid() is not null);

drop policy if exists "smg_voice_daypart: public write" on public.smg_voice_daypart;
create policy "smg_voice_daypart: public write" on public.smg_voice_daypart for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.labor_rows ──
drop policy if exists "labor_rows: public read" on public.labor_rows;
create policy "labor_rows: public read" on public.labor_rows for select to authenticated using (auth.uid() is not null);

drop policy if exists "labor_rows: public write" on public.labor_rows;
create policy "labor_rows: public write" on public.labor_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.fob_rows ──
drop policy if exists "fob_rows: public read" on public.fob_rows;
create policy "fob_rows: public read" on public.fob_rows for select to authenticated using (auth.uid() is not null);

drop policy if exists "fob_rows: public write" on public.fob_rows;
create policy "fob_rows: public write" on public.fob_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.ops_rows ──
drop policy if exists "ops_rows: public read" on public.ops_rows;
create policy "ops_rows: public read" on public.ops_rows for select to authenticated using (auth.uid() is not null);

drop policy if exists "ops_rows: public write" on public.ops_rows;
create policy "ops_rows: public write" on public.ops_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.ctrl_rows ──
drop policy if exists "ctrl_rows: public read" on public.ctrl_rows;
create policy "ctrl_rows: public read" on public.ctrl_rows for select to authenticated using (auth.uid() is not null);

drop policy if exists "ctrl_rows: public write" on public.ctrl_rows;
create policy "ctrl_rows: public write" on public.ctrl_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.peaks_rows ──
drop policy if exists "peaks_rows: public read" on public.peaks_rows;
create policy "peaks_rows: public read" on public.peaks_rows for select to authenticated using (auth.uid() is not null);

drop policy if exists "peaks_rows: public write" on public.peaks_rows;
create policy "peaks_rows: public write" on public.peaks_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.audit_rows ──
drop policy if exists "audit_rows: public read" on public.audit_rows;
create policy "audit_rows: public read" on public.audit_rows for select to authenticated using (auth.uid() is not null);

drop policy if exists "audit_rows: public write" on public.audit_rows;
create policy "audit_rows: public write" on public.audit_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.dar_rows ──
drop policy if exists "dar_rows: public read" on public.dar_rows;
create policy "dar_rows: public read" on public.dar_rows for select to authenticated using (auth.uid() is not null);

drop policy if exists "dar_rows: public write" on public.dar_rows;
create policy "dar_rows: public write" on public.dar_rows for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.feature_requests ──
drop policy if exists "feature_requests: public read" on public.feature_requests;
create policy "feature_requests: public read" on public.feature_requests for select to authenticated using (auth.uid() is not null);

drop policy if exists "feature_requests: public write" on public.feature_requests;
create policy "feature_requests: public write" on public.feature_requests for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.custom_signals ──
drop policy if exists "custom_signals: public read" on public.custom_signals;
create policy "custom_signals: public read" on public.custom_signals for select to authenticated using (auth.uid() is not null);

drop policy if exists "custom_signals: public write" on public.custom_signals;
create policy "custom_signals: public write" on public.custom_signals for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_ebos_daily ──
drop policy if exists "qsr_ebos_daily: public read" on public.qsr_ebos_daily;
create policy "qsr_ebos_daily: public read" on public.qsr_ebos_daily for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_ebos_daily: public write" on public.qsr_ebos_daily;
create policy "qsr_ebos_daily: public write" on public.qsr_ebos_daily for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.forecast_snapshots ──
drop policy if exists "forecast_snapshots: public read" on public.forecast_snapshots;
create policy "forecast_snapshots: public read" on public.forecast_snapshots for select to authenticated using (auth.uid() is not null);

drop policy if exists "forecast_snapshots: public write" on public.forecast_snapshots;
create policy "forecast_snapshots: public write" on public.forecast_snapshots for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_field_definitions ──
drop policy if exists "qsr_field_definitions: public read" on public.qsr_field_definitions;
create policy "qsr_field_definitions: public read" on public.qsr_field_definitions for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_field_definitions: service write" on public.qsr_field_definitions;
create policy "qsr_field_definitions: service write" on public.qsr_field_definitions for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.sales_ledger_daily ──
drop policy if exists "sales_ledger_daily: public read" on public.sales_ledger_daily;
create policy "sales_ledger_daily: public read" on public.sales_ledger_daily for select to authenticated using (auth.uid() is not null);

drop policy if exists "sales_ledger_daily: public write" on public.sales_ledger_daily;
create policy "sales_ledger_daily: public write" on public.sales_ledger_daily for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.daily_glimpse_daily ──
drop policy if exists "daily_glimpse_daily: public read" on public.daily_glimpse_daily;
create policy "daily_glimpse_daily: public read" on public.daily_glimpse_daily for select to authenticated using (auth.uid() is not null);

drop policy if exists "daily_glimpse_daily: public write" on public.daily_glimpse_daily;
create policy "daily_glimpse_daily: public write" on public.daily_glimpse_daily for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.cash_sheet_daily ──
drop policy if exists "cash_sheet_daily: public read" on public.cash_sheet_daily;
create policy "cash_sheet_daily: public read" on public.cash_sheet_daily for select to authenticated using (auth.uid() is not null);

drop policy if exists "cash_sheet_daily: public write" on public.cash_sheet_daily;
create policy "cash_sheet_daily: public write" on public.cash_sheet_daily for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.store_labor_config ──
drop policy if exists "store_labor_config: public read" on public.store_labor_config;
create policy "store_labor_config: public read" on public.store_labor_config for select to authenticated using (auth.uid() is not null);

drop policy if exists "store_labor_config: public write" on public.store_labor_config;
create policy "store_labor_config: public write" on public.store_labor_config for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.lifelenz_labor_week ──
drop policy if exists "lifelenz_labor_week: public read" on public.lifelenz_labor_week;
create policy "lifelenz_labor_week: public read" on public.lifelenz_labor_week for select to authenticated using (auth.uid() is not null);

drop policy if exists "lifelenz_labor_week: public write" on public.lifelenz_labor_week;
create policy "lifelenz_labor_week: public write" on public.lifelenz_labor_week for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.smart_target_adjustments ──
drop policy if exists "smart_target_adjustments: public read" on public.smart_target_adjustments;
create policy "smart_target_adjustments: public read" on public.smart_target_adjustments for select to authenticated using (auth.uid() is not null);

drop policy if exists "smart_target_adjustments: public write" on public.smart_target_adjustments;
create policy "smart_target_adjustments: public write" on public.smart_target_adjustments for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.sage_prompts ──
drop policy if exists "sage_prompts: public read" on public.sage_prompts;
create policy "sage_prompts: public read" on public.sage_prompts for select to authenticated using (auth.uid() is not null);

drop policy if exists "sage_prompts: public write" on public.sage_prompts;
create policy "sage_prompts: public write" on public.sage_prompts for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.sage_prompt_runs ──
drop policy if exists "sage_prompt_runs: public read" on public.sage_prompt_runs;
create policy "sage_prompt_runs: public read" on public.sage_prompt_runs for select to authenticated using (auth.uid() is not null);

drop policy if exists "sage_prompt_runs: public write" on public.sage_prompt_runs;
create policy "sage_prompt_runs: public write" on public.sage_prompt_runs for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.employee_skills ──
drop policy if exists "employee_skills: public read" on public.employee_skills;
create policy "employee_skills: public read" on public.employee_skills for select to authenticated using (auth.uid() is not null);

drop policy if exists "employee_skills: public write" on public.employee_skills;
create policy "employee_skills: public write" on public.employee_skills for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.saved_correlations ──
drop policy if exists "saved_correlations: public read" on public.saved_correlations;
create policy "saved_correlations: public read" on public.saved_correlations for select to authenticated using (auth.uid() is not null);

drop policy if exists "saved_correlations: public write" on public.saved_correlations;
create policy "saved_correlations: public write" on public.saved_correlations for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.smg_comments ──
drop policy if exists "smg_comments: public read" on public.smg_comments;
create policy "smg_comments: public read" on public.smg_comments for select to authenticated using (auth.uid() is not null);

drop policy if exists "smg_comments: public write" on public.smg_comments;
create policy "smg_comments: public write" on public.smg_comments for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_onhand ──
drop policy if exists "qsr_onhand: public read" on public.qsr_onhand;
create policy "qsr_onhand: public read" on public.qsr_onhand for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_onhand: public write" on public.qsr_onhand;
create policy "qsr_onhand: public write" on public.qsr_onhand for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_variance_stat ──
drop policy if exists "qsr_variance_stat: public read" on public.qsr_variance_stat;
create policy "qsr_variance_stat: public read" on public.qsr_variance_stat for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_variance_stat: public write" on public.qsr_variance_stat;
create policy "qsr_variance_stat: public write" on public.qsr_variance_stat for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_inventory_summary ──
drop policy if exists "qsr_inventory_summary: public read" on public.qsr_inventory_summary;
create policy "qsr_inventory_summary: public read" on public.qsr_inventory_summary for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_inventory_summary: public write" on public.qsr_inventory_summary;
create policy "qsr_inventory_summary: public write" on public.qsr_inventory_summary for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_waste ──
drop policy if exists "qsr_waste: public read" on public.qsr_waste;
create policy "qsr_waste: public read" on public.qsr_waste for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_waste: public write" on public.qsr_waste;
create policy "qsr_waste: public write" on public.qsr_waste for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_transfers ──
drop policy if exists "qsr_transfers: public read" on public.qsr_transfers;
create policy "qsr_transfers: public read" on public.qsr_transfers for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_transfers: public write" on public.qsr_transfers;
create policy "qsr_transfers: public write" on public.qsr_transfers for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.qsr_raw_item_detail ──
drop policy if exists "qsr_raw_item_detail: public read" on public.qsr_raw_item_detail;
create policy "qsr_raw_item_detail: public read" on public.qsr_raw_item_detail for select to authenticated using (auth.uid() is not null);

drop policy if exists "qsr_raw_item_detail: public write" on public.qsr_raw_item_detail;
create policy "qsr_raw_item_detail: public write" on public.qsr_raw_item_detail for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.eom_count_status ──
drop policy if exists "eom_count_status: public read" on public.eom_count_status;
create policy "eom_count_status: public read" on public.eom_count_status for select to authenticated using (auth.uid() is not null);

drop policy if exists "eom_count_status: public write" on public.eom_count_status;
create policy "eom_count_status: public write" on public.eom_count_status for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── public.eom_notification_settings ──
drop policy if exists "eom_notification_settings: public read" on public.eom_notification_settings;
create policy "eom_notification_settings: public read" on public.eom_notification_settings for select to authenticated using (auth.uid() is not null);

drop policy if exists "eom_notification_settings: public write" on public.eom_notification_settings;
create policy "eom_notification_settings: public write" on public.eom_notification_settings for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

