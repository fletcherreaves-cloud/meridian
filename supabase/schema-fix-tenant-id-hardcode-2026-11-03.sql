-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix hardcoded tenant-UUID literal across all affected tables (owner-authorized 2026-11-03)
--
-- memory/project-multitenant-onboarding.md's 2026-11-02 correction flagged 51 schema files
-- whose RLS policies and tenant_id column DEFAULTs hardcode the literal
-- '00000000-0000-0000-0000-000000000001' instead of calling public.current_tenant_id() --
-- the pattern schema-app-notifications.sql and schema-daypart-tpph-targets.sql already use
-- correctly. Re-grepped live on 2026-11-03 (grep is exact, but the prose list in that memory
-- file was not -- regenerated from the real repo state, not copied from the old list) and
-- widened: 60 files reference the literal in some form; 9 of those are one-time `UPDATE ...
-- WHERE tenant_id = '<literal>'` data-fix scripts already run against the only tenant that
-- has ever existed (schema-security-rules-phase1*.sql / -cash004-authority.sql /
-- -min-stdev.sql / -plain-language.sql) -- correctly scoped at the time, already applied,
-- nothing to fix. schema-multitenant-phase1.sql / schema.sql's own hardcoded defaults on
-- `profiles` and `org_config` are DELIBERATE bootstrap behavior (phase2-rls.sql's own comment:
-- "profiles + org_config are handled specially ... KEEP their default") -- both tables'
-- REAL RLS policies already correctly call public.current_tenant_id(), so there is nothing
-- broken there to fix, same as the already-flagged, already-documented single-tenant-era
-- fallback inside public.set_tenant_id() itself (phase2-rls.sql).
--
-- What's actually broken, confirmed by reading each table's CURRENT (not original) policy
-- text -- several of these tables had their policies patched more than once by LATER files
-- (role fixes, perf fixes); this migration targets the policy text as it stands TODAY, not
-- whatever an early file originally shipped:
--   1. WRITE-SIDE risk (the real-world impact): every affected table's tenant_id column
--      DEFAULTs to the hardcoded literal, so any insert that doesn't explicitly set tenant_id
--      (every pull script today, since they use the service-role key with no tenant param)
--      silently lands tagged as this owner's tenant regardless of true origin. Not a live bug
--      today (only one tenant exists) but becomes real cross-organization mistagging risk the
--      moment a second tenant's automated pulls run.
--   2. READ-SIDE lockout: a hardcoded-literal RLS policy can only ever match THIS tenant's
--      uuid -- a second tenant, even with correctly-tagged rows, would see zero rows on these
--      tables forever, not a leak but a permanent (and confusing) lockout.
--   3. org_assignment_audit (schema-org-assignment-audit.sql) is a DIFFERENT, worse shape:
--      its own policies have NO tenant_id check at all, only a role check -- today a non-issue
--      (one tenant), but once a second tenant exists this would be a genuine cross-tenant READ
--      LEAK (any admin/area_supervisor from ANY tenant sees every tenant's audit rows). Fixed
--      below by adding tenant scoping to its existing policies, not just a literal swap.
--
-- Fix shape, same pattern already proven on ~70 other tables (phase2-rls.sql):
--   - tenant_id DEFAULT dropped (no hardcoded fallback at table level any more)
--   - a BEFORE INSERT set_tenant_id_trg trigger added (calls public.set_tenant_id(), the
--     existing shared helper -- NOT touched here, its own documented single-tenant-era
--     fallback is separately flagged, out of scope for this pass)
--   - every policy that compared tenant_id to the literal now calls public.current_tenant_id()
--     instead -- every OTHER clause in each policy (role checks, loc-scoping, perf-wrapping)
--     is preserved EXACTLY as currently live, verified per-policy against the most recent file
--     that actually touched it (not just the table's original creation file).
--
-- ⚠️ Run this once in the Supabase SQL editor (idempotent -- every statement is drop-if-exists/
-- create, or an ALTER that no-ops if already applied). This session has no DDL execution path.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Drop the hardcoded column DEFAULT + attach the standard tenant-stamping trigger ──
-- (public.set_tenant_id() already exists -- schema-multitenant-phase2-rls.sql -- reused as-is)

alter table public.app_access_log alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.app_access_log;
create trigger set_tenant_id_trg before insert on public.app_access_log
  for each row execute function public.set_tenant_id();

alter table public.coaching_cycle_notes alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.coaching_cycle_notes;
create trigger set_tenant_id_trg before insert on public.coaching_cycle_notes
  for each row execute function public.set_tenant_id();

alter table public.coaching_cycles alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.coaching_cycles;
create trigger set_tenant_id_trg before insert on public.coaching_cycles
  for each row execute function public.set_tenant_id();

alter table public.conversion_efficiency alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.conversion_efficiency;
create trigger set_tenant_id_trg before insert on public.conversion_efficiency
  for each row execute function public.set_tenant_id();

alter table public.custom_reports alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.custom_reports;
create trigger set_tenant_id_trg before insert on public.custom_reports
  for each row execute function public.set_tenant_id();

alter table public.customer_complaints alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.customer_complaints;
create trigger set_tenant_id_trg before insert on public.customer_complaints
  for each row execute function public.set_tenant_id();

alter table public.data_completeness_incidents alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.data_completeness_incidents;
create trigger set_tenant_id_trg before insert on public.data_completeness_incidents
  for each row execute function public.set_tenant_id();

alter table public.employee_identity_vault alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.employee_identity_vault;
create trigger set_tenant_id_trg before insert on public.employee_identity_vault
  for each row execute function public.set_tenant_id();

alter table public.employee_pay_rate_changes alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.employee_pay_rate_changes;
create trigger set_tenant_id_trg before insert on public.employee_pay_rate_changes
  for each row execute function public.set_tenant_id();

alter table public.equipment_catalog alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.equipment_catalog;
create trigger set_tenant_id_trg before insert on public.equipment_catalog
  for each row execute function public.set_tenant_id();

alter table public.equipment_catalog_consumables alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.equipment_catalog_consumables;
create trigger set_tenant_id_trg before insert on public.equipment_catalog_consumables
  for each row execute function public.set_tenant_id();

alter table public.equipment_catalog_settings alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.equipment_catalog_settings;
create trigger set_tenant_id_trg before insert on public.equipment_catalog_settings
  for each row execute function public.set_tenant_id();

alter table public.equipment_survey_entries alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.equipment_survey_entries;
create trigger set_tenant_id_trg before insert on public.equipment_survey_entries
  for each row execute function public.set_tenant_id();

alter table public.equipment_survey_links alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.equipment_survey_links;
create trigger set_tenant_id_trg before insert on public.equipment_survey_links
  for each row execute function public.set_tenant_id();

alter table public.identity_reveal_log alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.identity_reveal_log;
create trigger set_tenant_id_trg before insert on public.identity_reveal_log
  for each row execute function public.set_tenant_id();

alter table public.inv_count_sessions alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.inv_count_sessions;
create trigger set_tenant_id_trg before insert on public.inv_count_sessions
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_attendance_summary alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_attendance_summary;
create trigger set_tenant_id_trg before insert on public.lifelenz_attendance_summary
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_compliance_audit alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_compliance_audit;
create trigger set_tenant_id_trg before insert on public.lifelenz_compliance_audit
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_employee_performance alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_employee_performance;
create trigger set_tenant_id_trg before insert on public.lifelenz_employee_performance
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_forecast_captures alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_forecast_captures;
create trigger set_tenant_id_trg before insert on public.lifelenz_forecast_captures
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_punch_edits alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_punch_edits;
create trigger set_tenant_id_trg before insert on public.lifelenz_punch_edits
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_schedule_variance alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_schedule_variance;
create trigger set_tenant_id_trg before insert on public.lifelenz_schedule_variance
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_shift_assignments alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_shift_assignments;
create trigger set_tenant_id_trg before insert on public.lifelenz_shift_assignments
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_shift_pay alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_shift_pay;
create trigger set_tenant_id_trg before insert on public.lifelenz_shift_pay
  for each row execute function public.set_tenant_id();

alter table public.news_mentions alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.news_mentions;
create trigger set_tenant_id_trg before insert on public.news_mentions
  for each row execute function public.set_tenant_id();

alter table public.oil_efficiency alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.oil_efficiency;
create trigger set_tenant_id_trg before insert on public.oil_efficiency
  for each row execute function public.set_tenant_id();

-- (org_assignment_audit handled in section 3 below, alongside its own policy fix -- it needs
-- a bigger change than a literal swap, see that section's comment)

alter table public.pay_events alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.pay_events;
create trigger set_tenant_id_trg before insert on public.pay_events
  for each row execute function public.set_tenant_id();

alter table public.qsr_checklist_submissions alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_checklist_submissions;
create trigger set_tenant_id_trg before insert on public.qsr_checklist_submissions
  for each row execute function public.set_tenant_id();

alter table public.qsr_employee_tenure alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_employee_tenure;
create trigger set_tenant_id_trg before insert on public.qsr_employee_tenure
  for each row execute function public.set_tenant_id();

alter table public.qsr_forms_completion alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_forms_completion;
create trigger set_tenant_id_trg before insert on public.qsr_forms_completion
  for each row execute function public.set_tenant_id();

alter table public.qsr_forms_reviews alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_forms_reviews;
create trigger set_tenant_id_trg before insert on public.qsr_forms_reviews
  for each row execute function public.set_tenant_id();

alter table public.qsr_product_mix alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_product_mix;
create trigger set_tenant_id_trg before insert on public.qsr_product_mix
  for each row execute function public.set_tenant_id();

alter table public.qsr_punch_times alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_punch_times;
create trigger set_tenant_id_trg before insert on public.qsr_punch_times
  for each row execute function public.set_tenant_id();

alter table public.qsr_sales_quarter_hour alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_sales_quarter_hour;
create trigger set_tenant_id_trg before insert on public.qsr_sales_quarter_hour
  for each row execute function public.set_tenant_id();

alter table public.qsr_security_events alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_security_events;
create trigger set_tenant_id_trg before insert on public.qsr_security_events
  for each row execute function public.set_tenant_id();

alter table public.sched_retention_marks alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.sched_retention_marks;
create trigger set_tenant_id_trg before insert on public.sched_retention_marks
  for each row execute function public.set_tenant_id();

alter table public.security_findings alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.security_findings;
create trigger set_tenant_id_trg before insert on public.security_findings
  for each row execute function public.set_tenant_id();

alter table public.security_rules alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.security_rules;
create trigger set_tenant_id_trg before insert on public.security_rules
  for each row execute function public.set_tenant_id();

alter table public.shift_manager_range alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.shift_manager_range;
create trigger set_tenant_id_trg before insert on public.shift_manager_range
  for each row execute function public.set_tenant_id();

alter table public.store_assessments alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.store_assessments;
create trigger set_tenant_id_trg before insert on public.store_assessments
  for each row execute function public.set_tenant_id();

alter table public.store_demographics alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.store_demographics;
create trigger set_tenant_id_trg before insert on public.store_demographics
  for each row execute function public.set_tenant_id();

alter table public.target_overrides alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.target_overrides;
create trigger set_tenant_id_trg before insert on public.target_overrides
  for each row execute function public.set_tenant_id();

alter table public.weekly_count_day_overrides alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.weekly_count_day_overrides;
create trigger set_tenant_id_trg before insert on public.weekly_count_day_overrides
  for each row execute function public.set_tenant_id();

alter table public.yearly_targets alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.yearly_targets;
create trigger set_tenant_id_trg before insert on public.yearly_targets
  for each row execute function public.set_tenant_id();


-- ── 2. Replace every hardcoded-literal policy with the public.current_tenant_id() form ──
-- (every other clause -- role checks, loc-scoping, perf-wrapping -- preserved exactly)

-- app_access_log / "app_access_log: tenant"  (current definition verified from: schema-app-access-log.sql)
drop policy if exists "app_access_log: tenant" on public.app_access_log;
create policy "app_access_log: tenant" on public.app_access_log
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- coaching_cycle_notes / coaching_cycle_notes_tenant  (current definition verified from: schema-coaching-cycle-notes.sql)
drop policy if exists coaching_cycle_notes_tenant on public.coaching_cycle_notes;
create policy coaching_cycle_notes_tenant on public.coaching_cycle_notes
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- coaching_cycles / coaching_cycles_tenant  (current definition verified from: schema-coaching-cycles.sql)
drop policy if exists coaching_cycles_tenant on public.coaching_cycles;
create policy coaching_cycles_tenant on public.coaching_cycles
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- conversion_efficiency / conversion_efficiency_tenant  (current definition verified from: schema-conversion-efficiency.sql)
drop policy if exists conversion_efficiency_tenant on public.conversion_efficiency;
create policy conversion_efficiency_tenant on public.conversion_efficiency
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- custom_reports / custom_reports_tenant  (current definition verified from: schema-custom-reports.sql)
drop policy if exists custom_reports_tenant on public.custom_reports;
create policy custom_reports_tenant on public.custom_reports
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- customer_complaints / customer_complaints_tenant  (current definition verified from: schema-customer-complaints.sql)
drop policy if exists customer_complaints_tenant on public.customer_complaints;
create policy customer_complaints_tenant on public.customer_complaints
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- data_completeness_incidents / data_completeness_incidents_tenant  (current definition verified from: schema-data-completeness.sql)
drop policy if exists data_completeness_incidents_tenant on public.data_completeness_incidents;
create policy data_completeness_incidents_tenant on public.data_completeness_incidents
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- employee_pay_rate_changes / "employee_pay_rate_changes: tenant"  (current definition verified from: schema-employee-pay-rate-changes.sql)
drop policy if exists "employee_pay_rate_changes: tenant" on public.employee_pay_rate_changes;
create policy "employee_pay_rate_changes: tenant" on public.employee_pay_rate_changes
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- equipment_catalog / "equipment_catalog: admin update"  (current definition verified from: schema-equipment-catalog.sql)
drop policy if exists "equipment_catalog: admin update" on public.equipment_catalog;
create policy "equipment_catalog: admin update" on public.equipment_catalog
  for update to authenticated
  using (get_my_role() in ('admin', 'owner'))
  with check (tenant_id = public.current_tenant_id());

-- equipment_catalog / "equipment_catalog: authenticated insert"  (current definition verified from: schema-equipment-catalog.sql)
drop policy if exists "equipment_catalog: authenticated insert" on public.equipment_catalog;
create policy "equipment_catalog: authenticated insert" on public.equipment_catalog
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and flagged = true);

-- equipment_catalog / "equipment_catalog: tenant read"  (current definition verified from: schema-equipment-catalog.sql)
drop policy if exists "equipment_catalog: tenant read" on public.equipment_catalog;
create policy "equipment_catalog: tenant read" on public.equipment_catalog
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- equipment_catalog_consumables / "equipment_catalog_consumables: admin write"  (current definition verified from: schema-equipment-catalog.sql)
drop policy if exists "equipment_catalog_consumables: admin write" on public.equipment_catalog_consumables;
create policy "equipment_catalog_consumables: admin write" on public.equipment_catalog_consumables
  for all to authenticated
  using (get_my_role() in ('admin', 'owner'))
  with check (tenant_id = public.current_tenant_id());

-- equipment_catalog_consumables / "equipment_catalog_consumables: tenant read"  (current definition verified from: schema-equipment-catalog.sql)
drop policy if exists "equipment_catalog_consumables: tenant read" on public.equipment_catalog_consumables;
create policy "equipment_catalog_consumables: tenant read" on public.equipment_catalog_consumables
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- equipment_catalog_settings / "equipment_catalog_settings: admin write"  (current definition verified from: schema-equipment-catalog-settings.sql)
drop policy if exists "equipment_catalog_settings: admin write" on public.equipment_catalog_settings;
create policy "equipment_catalog_settings: admin write" on public.equipment_catalog_settings
  for all to authenticated
  using (get_my_role() in ('admin', 'owner'))
  with check (tenant_id = public.current_tenant_id());

-- equipment_catalog_settings / "equipment_catalog_settings: tenant read"  (current definition verified from: schema-equipment-catalog-settings.sql)
drop policy if exists "equipment_catalog_settings: tenant read" on public.equipment_catalog_settings;
create policy "equipment_catalog_settings: tenant read" on public.equipment_catalog_settings
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- equipment_survey_entries / "equipment_survey_entries: authenticated"  (current definition verified from: schema-equipment-survey.sql)
drop policy if exists "equipment_survey_entries: authenticated" on public.equipment_survey_entries;
create policy "equipment_survey_entries: authenticated" on public.equipment_survey_entries
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- equipment_survey_links / "equipment_survey_links: authenticated"  (current definition verified from: schema-equipment-survey.sql)
drop policy if exists "equipment_survey_links: authenticated" on public.equipment_survey_links;
create policy "equipment_survey_links: authenticated" on public.equipment_survey_links
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- identity_reveal_log / "identity_reveal_log: admin read"  (current definition verified from: schema-identity-vault.sql)
drop policy if exists "identity_reveal_log: admin read" on public.identity_reveal_log;
create policy "identity_reveal_log: admin read" on public.identity_reveal_log
  for select using (get_my_role() = 'admin' and tenant_id = public.current_tenant_id());

-- inv_count_sessions / inv_count_sessions_tenant  (current definition verified from: schema-inv-count-sessions.sql)
drop policy if exists inv_count_sessions_tenant on public.inv_count_sessions;
create policy inv_count_sessions_tenant on public.inv_count_sessions
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- lifelenz_attendance_summary / "lifelenz_attendance_summary: tenant read"  (current definition verified from: schema-lifelenz-attendance.sql)
drop policy if exists "lifelenz_attendance_summary: tenant read" on public.lifelenz_attendance_summary;
create policy "lifelenz_attendance_summary: tenant read" on public.lifelenz_attendance_summary
  for select using (tenant_id = public.current_tenant_id());

-- lifelenz_compliance_audit / "lifelenz_compliance_audit: tenant read"  (current definition verified from: schema-lifelenz-compliance-audit.sql)
drop policy if exists "lifelenz_compliance_audit: tenant read" on public.lifelenz_compliance_audit;
create policy "lifelenz_compliance_audit: tenant read" on public.lifelenz_compliance_audit
  for select using (tenant_id = public.current_tenant_id());

-- lifelenz_employee_performance / "lifelenz_employee_performance: tenant read"  (current definition verified from: schema-lifelenz-employee-performance.sql)
drop policy if exists "lifelenz_employee_performance: tenant read" on public.lifelenz_employee_performance;
create policy "lifelenz_employee_performance: tenant read" on public.lifelenz_employee_performance
  for select using (tenant_id = public.current_tenant_id());

-- lifelenz_forecast_captures / "lifelenz_forecast_captures: tenant read"  (current definition verified from: schema-lifelenz-forecast-captures.sql)
drop policy if exists "lifelenz_forecast_captures: tenant read" on public.lifelenz_forecast_captures;
create policy "lifelenz_forecast_captures: tenant read" on public.lifelenz_forecast_captures
  for select using (tenant_id = public.current_tenant_id());

-- lifelenz_punch_edits / "lifelenz_punch_edits: tenant read"  (current definition verified from: schema-lifelenz-punch-edits.sql)
drop policy if exists "lifelenz_punch_edits: tenant read" on public.lifelenz_punch_edits;
create policy "lifelenz_punch_edits: tenant read" on public.lifelenz_punch_edits
  for select using (tenant_id = public.current_tenant_id());

-- lifelenz_schedule_variance / "lifelenz_schedule_variance: tenant read"  (current definition verified from: schema-lifelenz-schedule-variance.sql)
drop policy if exists "lifelenz_schedule_variance: tenant read" on public.lifelenz_schedule_variance;
create policy "lifelenz_schedule_variance: tenant read" on public.lifelenz_schedule_variance
  for select using (tenant_id = public.current_tenant_id());

-- lifelenz_shift_assignments / "lifelenz_shift_assignments: tenant read"  (current definition verified from: schema-lifelenz-shift-assignments.sql)
drop policy if exists "lifelenz_shift_assignments: tenant read" on public.lifelenz_shift_assignments;
create policy "lifelenz_shift_assignments: tenant read" on public.lifelenz_shift_assignments
  for select using (tenant_id = public.current_tenant_id());

-- lifelenz_shift_pay / "lifelenz_shift_pay: tenant"  (current definition verified from: schema-lifelenz-shift-pay.sql)
drop policy if exists "lifelenz_shift_pay: tenant" on public.lifelenz_shift_pay;
create policy "lifelenz_shift_pay: tenant" on public.lifelenz_shift_pay
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- news_mentions / news_mentions_tenant  (current definition verified from: schema-news-mentions.sql)
drop policy if exists news_mentions_tenant on public.news_mentions;
create policy news_mentions_tenant on public.news_mentions
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- oil_efficiency / oil_efficiency_tenant  (current definition verified from: schema-oil-efficiency.sql)
drop policy if exists oil_efficiency_tenant on public.oil_efficiency;
create policy oil_efficiency_tenant on public.oil_efficiency
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- pay_events / pay_events_tenant  (current definition verified from: schema-pay-events.sql)
drop policy if exists pay_events_tenant on public.pay_events;
create policy pay_events_tenant on public.pay_events
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_checklist_submissions / qsr_checklist_submissions_tenant  (current definition verified from: schema-checklist-submissions.sql)
drop policy if exists qsr_checklist_submissions_tenant on public.qsr_checklist_submissions;
create policy qsr_checklist_submissions_tenant on public.qsr_checklist_submissions
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_employee_tenure / "qsr_employee_tenure: read scoped"  (current definition verified from: schema-qsr-employee-tenure.sql)
drop policy if exists "qsr_employee_tenure: read scoped" on public.qsr_employee_tenure;
create policy "qsr_employee_tenure: read scoped" on public.qsr_employee_tenure for select
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.accessible_locs is null or public.qsr_employee_tenure.loc = any (p.accessible_locs))
    )
  );

-- qsr_forms_completion / qsr_forms_completion_tenant  (current definition verified from: schema-qsr-forms-completion.sql)
drop policy if exists qsr_forms_completion_tenant on public.qsr_forms_completion;
create policy qsr_forms_completion_tenant on public.qsr_forms_completion
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_forms_reviews / qsr_forms_reviews_tenant  (current definition verified from: schema-qsr-forms-reviews.sql)
drop policy if exists qsr_forms_reviews_tenant on public.qsr_forms_reviews;
create policy qsr_forms_reviews_tenant on public.qsr_forms_reviews
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_product_mix / qsr_product_mix_tenant  (current definition verified from: schema-product-mix.sql)
drop policy if exists qsr_product_mix_tenant on public.qsr_product_mix;
create policy qsr_product_mix_tenant on public.qsr_product_mix
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_punch_times / "qsr_punch_times: read scoped"  (current definition verified from: schema-qsr-punch-times.sql)
drop policy if exists "qsr_punch_times: read scoped" on public.qsr_punch_times;
create policy "qsr_punch_times: read scoped" on public.qsr_punch_times for select
  to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.accessible_locs is null or public.qsr_punch_times.loc = any (p.accessible_locs))
    )
  );

-- qsr_sales_quarter_hour / qsr_sales_quarter_hour_tenant  (current definition verified from: schema-qsr-sales-quarter-hour.sql)
drop policy if exists qsr_sales_quarter_hour_tenant on public.qsr_sales_quarter_hour;
create policy qsr_sales_quarter_hour_tenant on public.qsr_sales_quarter_hour
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_security_events / "qsr_security_events: gated read"  (current definition verified from: schema-security-gm-role-fix-2026-10-28.sql (verified latest, 18:10:58 same day))
drop policy if exists "qsr_security_events: gated read" on public.qsr_security_events;
create policy "qsr_security_events: gated read" on public.qsr_security_events
  for select using (
    tenant_id = public.current_tenant_id()
    and (
      (select get_my_role()) in ('admin', 'owner', 'supervisor', 'area_supervisor')
      or (
        (select get_my_role()) in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- sched_retention_marks / sched_retention_marks_tenant  (current definition verified from: schema-dispatch-141-retention-marks.sql)
drop policy if exists sched_retention_marks_tenant on public.sched_retention_marks;
create policy sched_retention_marks_tenant on public.sched_retention_marks
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- security_findings / "security_findings: gated read"  (current definition verified from: schema-security-gm-role-fix-2026-10-28.sql (verified latest, 18:10:58 same day))
drop policy if exists "security_findings: gated read" on public.security_findings;
create policy "security_findings: gated read" on public.security_findings
  for select using (
    tenant_id = public.current_tenant_id()
    and (
      (select get_my_role()) in ('admin', 'owner', 'area_supervisor')
      or (
        (select get_my_role()) in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- security_rules / "security_rules: admin/supervisor write"  (current definition verified from: schema-security-findings-rls-perf-fix.sql (perf-wrapped, verified latest for this policy))
drop policy if exists "security_rules: admin/supervisor write" on public.security_rules;
create policy "security_rules: admin/supervisor write" on public.security_rules
  for all
  using ((select get_my_role()) in ('admin', 'owner', 'area_supervisor') and tenant_id = public.current_tenant_id())
  with check ((select get_my_role()) in ('admin', 'owner', 'area_supervisor') and tenant_id = public.current_tenant_id());

-- security_rules / "security_rules: authenticated read"  (current definition verified from: schema-security-rules.sql)
drop policy if exists "security_rules: authenticated read" on public.security_rules;
create policy "security_rules: authenticated read" on public.security_rules
  for select
  using (auth.uid() is not null and tenant_id = public.current_tenant_id());

-- shift_manager_range / shift_manager_range_tenant  (current definition verified from: schema-shift-manager-range.sql)
drop policy if exists shift_manager_range_tenant on public.shift_manager_range;
create policy shift_manager_range_tenant on public.shift_manager_range
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- store_assessments / store_assessments_tenant  (current definition verified from: schema-store-assessments.sql)
drop policy if exists store_assessments_tenant on public.store_assessments;
create policy store_assessments_tenant on public.store_assessments
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- store_demographics / store_demographics_tenant  (current definition verified from: schema-store-demographics.sql)
drop policy if exists store_demographics_tenant on public.store_demographics;
create policy store_demographics_tenant on public.store_demographics
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- target_overrides / target_overrides_tenant  (current definition verified from: schema-target-overrides.sql)
drop policy if exists target_overrides_tenant on public.target_overrides;
create policy target_overrides_tenant on public.target_overrides
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- weekly_count_day_overrides / weekly_count_day_overrides_tenant  (current definition verified from: schema-weekly-count-day.sql)
drop policy if exists weekly_count_day_overrides_tenant on public.weekly_count_day_overrides;
create policy weekly_count_day_overrides_tenant on public.weekly_count_day_overrides
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- yearly_targets / yearly_targets_tenant  (current definition verified from: schema-yearly-targets.sql)
drop policy if exists yearly_targets_tenant on public.yearly_targets;
create policy yearly_targets_tenant on public.yearly_targets
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());


-- ── 3. org_assignment_audit -- add real tenant scoping (was role-check only, no tenant filter) ──
alter table public.org_assignment_audit alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.org_assignment_audit;
create trigger set_tenant_id_trg before insert on public.org_assignment_audit
  for each row execute function public.set_tenant_id();

drop policy if exists "org_assignment_audit: admin/supervisor read" on public.org_assignment_audit;
create policy "org_assignment_audit: admin/supervisor read" on public.org_assignment_audit
  for select using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('area_supervisor', 'admin')
    )
  );

drop policy if exists "org_assignment_audit: admin/supervisor insert" on public.org_assignment_audit;
create policy "org_assignment_audit: admin/supervisor insert" on public.org_assignment_audit
  for insert with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('area_supervisor', 'admin')
    )
  );


-- ── 4. reveal_employee_identity() / reveal_employee_identities_bulk() -- same hardcoded
--    v_tenant fallback, same root cause, same commit originally introduced it. Fixed here
--    rather than filing separately since the fix touches the exact same lines this migration
--    is already walking through for schema-security-gm-role-fix-2026-10-28.sql's policies.
--    Current (latest) behavior -- role list, gm/manager branch, NULL-safe reject path -- is
--    otherwise preserved exactly; only v_tenant's source changes.
create or replace function public.reveal_employee_identity(p_token uuid, p_reason text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid    := public.current_tenant_id();
  v_role   text    := get_my_role();
  v_reason text     := btrim(coalesce(p_reason, ''));
  v_gm_ok  boolean;
  v_name   text;
begin
  if v_reason = '' then
    raise exception 'reveal_employee_identity: reason is required';
  end if;

  if v_role in ('admin', 'owner', 'supervisor', 'area_supervisor') then
    -- allowed, fall through to the lookup below
  elsif v_role in ('manager', 'gm') then
    select coalesce((data->>'enabled')::boolean, false) into v_gm_ok
    from public.org_config where key = 'gm_identity_reveal_enabled';
    if not coalesce(v_gm_ok, false) then
      raise exception 'reveal_employee_identity: manager reveal is not enabled for this org';
    end if;
  else
    raise exception 'reveal_employee_identity: role % is not permitted to reveal identities', coalesce(v_role, 'none');
  end if;

  select employee_name into v_name
  from public.employee_identity_vault
  where id = p_token and tenant_id = v_tenant;

  if v_name is null then
    raise exception 'reveal_employee_identity: token not found';
  end if;

  insert into public.identity_reveal_log (tenant_id, person_token, viewer_id, viewer_role, reason)
  values (v_tenant, p_token, auth.uid(), v_role, v_reason);

  return v_name;
end;
$$;

revoke all on function public.reveal_employee_identity(uuid, text) from public;
revoke execute on function public.reveal_employee_identity(uuid, text) from anon;
grant execute on function public.reveal_employee_identity(uuid, text) to authenticated;

comment on function public.reveal_employee_identity(uuid, text) is
  'The ONE path to a real employee name from a token. admin/owner/area_supervisor always allowed (supervisor accepted too, defensively -- never actually stored); manager or gm allowed only if org_config.gm_identity_reveal_enabled is true. Logs every reveal to identity_reveal_log BEFORE returning the name. Reason is required, never optional. v_tenant is now the CALLER''s real tenant (public.current_tenant_id()), not a hardcoded literal.';

create or replace function public.reveal_employee_identities_bulk(p_tokens uuid[], p_reason text)
returns table(token uuid, employee_name text)
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid    := public.current_tenant_id();
  v_role   text    := get_my_role();
  v_reason text     := btrim(coalesce(p_reason, ''));
  v_gm_ok  boolean;
  v_count  integer;
begin
  if v_reason = '' then
    raise exception 'reveal_employee_identities_bulk: reason is required';
  end if;

  if v_role in ('admin', 'owner', 'supervisor', 'area_supervisor') then
    -- allowed, fall through to the lookup below
  elsif v_role in ('manager', 'gm') then
    select coalesce((data->>'enabled')::boolean, false) into v_gm_ok
    from public.org_config where key = 'gm_identity_reveal_enabled';
    if not coalesce(v_gm_ok, false) then
      raise exception 'reveal_employee_identities_bulk: manager reveal is not enabled for this org';
    end if;
  else
    raise exception 'reveal_employee_identities_bulk: role % is not permitted to reveal identities', coalesce(v_role, 'none');
  end if;

  if p_tokens is null or array_length(p_tokens, 1) is null then
    return; -- nothing requested, nothing to log, nothing to return
  end if;

  select count(*) into v_count from unnest(p_tokens);

  insert into public.identity_reveal_log (tenant_id, person_token, token_count, viewer_id, viewer_role, reason)
  values (v_tenant, null, v_count, auth.uid(), v_role, v_reason);

  return query
  select v.id, v.employee_name
  from public.employee_identity_vault v
  where v.id = any(p_tokens) and v.tenant_id = v_tenant;
end;
$$;

revoke all on function public.reveal_employee_identities_bulk(uuid[], text) from public;
revoke execute on function public.reveal_employee_identities_bulk(uuid[], text) from anon;
grant execute on function public.reveal_employee_identities_bulk(uuid[], text) to authenticated;
