-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix hardcoded tenant-UUID literal, round 2 (found live, 2026-11-11, after the owner ran
-- schema-fix-tenant-id-hardcode-2026-11-03.sql)
--
-- That migration (task #76) was grepped against the repo as it stood on 2026-11-03. After the
-- owner ran it today, I re-measured LIVE (never assume a fix landed -- query it) and found 12
-- policies across 11 tables STILL hardcoding '00000000-0000-0000-0000-000000000001' instead of
-- calling public.current_tenant_id(). Root cause, confirmed: every one of these 11 tables was
-- built AFTER the 2026-11-03 audit (forecast_commit_history/forecast_commits/
-- forecast_rolling_captures, lifelenz_employee_roster, lifelenz_payroll_readiness,
-- new_store_launch_plan, qsr_employee_pay_period_history, qsr_onhand_item_history,
-- runtime_error_reports, security_finding_actions, spot_check_ruler_notes) -- each copy-pasted
-- the same now-stale literal pattern from an existing file, same way the originally-audited 51
-- did. This is not a second gap in the original migration's LOGIC, it's the natural effect of
-- building 11 more tables in the 8 days between the audit and the owner's run.
--
-- The original migration's own profiles/org_config exclusion (deliberate bootstrap behavior,
-- see that file's header) does NOT apply to any of the 11 below -- confirmed by reading each
-- current policy definition live (pg_policies), not assumed. Re-verified the SAME way as the
-- original: `exists(select 1 from pg_policies where qual/with_check like '%<literal>%')` across
-- the full public schema came back true again after round 1 -- this file is what made it false.
--
-- Two tables' loc-scoped policies (lifelenz_employee_roster: loc/role,
-- qsr_employee_pay_period_history: loc/role, qsr_onhand_item_history_loc,
-- spot_check_ruler_notes_loc, lifelenz_payroll_readiness: loc scope) do NOT reference the
-- literal at all -- correctly left untouched below, same as the original migration left every
-- table's own non-tenant policies alone.
--
-- security_finding_actions' two policies are the one real wrinkle: their qual/with_check
-- combine the tenant check with gm_identity_reveal_enabled role logic (see
-- src/views/security-panel.js's securityPanelAccess() for what this mirrors). Full expression
-- preserved verbatim below, literal-only swap -- not simplified, not re-derived.
--
-- lifelenz_payroll_readiness's "tenant read" policy is SELECT-only, role `public` (not `for all
-- to authenticated` like its siblings) -- preserved exactly, not normalized to the common shape.
--
-- Idempotent: safe to re-run. Same fix shape as the original (phase2-rls.sql's proven pattern):
--   1. tenant_id column DEFAULT -> drop the hardcoded literal default, add a BEFORE INSERT
--      trigger calling the existing public.set_tenant_id() (unchanged, not touched here)
--   2. every affected policy -> full replacement using public.current_tenant_id()
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Step 1: tenant_id column defaults + insert triggers (11 tables) ─────────────────────────
alter table public.forecast_commit_history alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.forecast_commit_history;
create trigger set_tenant_id_trg before insert on public.forecast_commit_history
  for each row execute function public.set_tenant_id();

alter table public.forecast_commits alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.forecast_commits;
create trigger set_tenant_id_trg before insert on public.forecast_commits
  for each row execute function public.set_tenant_id();

alter table public.forecast_rolling_captures alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.forecast_rolling_captures;
create trigger set_tenant_id_trg before insert on public.forecast_rolling_captures
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_employee_roster alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_employee_roster;
create trigger set_tenant_id_trg before insert on public.lifelenz_employee_roster
  for each row execute function public.set_tenant_id();

alter table public.lifelenz_payroll_readiness alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.lifelenz_payroll_readiness;
create trigger set_tenant_id_trg before insert on public.lifelenz_payroll_readiness
  for each row execute function public.set_tenant_id();

alter table public.new_store_launch_plan alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.new_store_launch_plan;
create trigger set_tenant_id_trg before insert on public.new_store_launch_plan
  for each row execute function public.set_tenant_id();

alter table public.qsr_employee_pay_period_history alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_employee_pay_period_history;
create trigger set_tenant_id_trg before insert on public.qsr_employee_pay_period_history
  for each row execute function public.set_tenant_id();

alter table public.qsr_onhand_item_history alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.qsr_onhand_item_history;
create trigger set_tenant_id_trg before insert on public.qsr_onhand_item_history
  for each row execute function public.set_tenant_id();

alter table public.runtime_error_reports alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.runtime_error_reports;
create trigger set_tenant_id_trg before insert on public.runtime_error_reports
  for each row execute function public.set_tenant_id();

alter table public.security_finding_actions alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.security_finding_actions;
create trigger set_tenant_id_trg before insert on public.security_finding_actions
  for each row execute function public.set_tenant_id();

alter table public.spot_check_ruler_notes alter column tenant_id drop default;
drop trigger if exists set_tenant_id_trg on public.spot_check_ruler_notes;
create trigger set_tenant_id_trg before insert on public.spot_check_ruler_notes
  for each row execute function public.set_tenant_id();

-- ── Step 2: policy replacements (12 policies, literal -> public.current_tenant_id()) ────────

-- forecast_commit_history / forecast_commit_history_tenant
drop policy if exists forecast_commit_history_tenant on public.forecast_commit_history;
create policy forecast_commit_history_tenant on public.forecast_commit_history
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- forecast_commits / forecast_commits_tenant
drop policy if exists forecast_commits_tenant on public.forecast_commits;
create policy forecast_commits_tenant on public.forecast_commits
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- forecast_rolling_captures / forecast_rolling_captures_tenant
drop policy if exists forecast_rolling_captures_tenant on public.forecast_rolling_captures;
create policy forecast_rolling_captures_tenant on public.forecast_rolling_captures
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- lifelenz_employee_roster / "lifelenz_employee_roster: tenant"  (loc/role policies on this
-- table untouched -- no literal in either)
drop policy if exists "lifelenz_employee_roster: tenant" on public.lifelenz_employee_roster;
create policy "lifelenz_employee_roster: tenant" on public.lifelenz_employee_roster
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- lifelenz_payroll_readiness / "lifelenz_payroll_readiness: tenant read"  (SELECT-only, role
-- `public`, qual-only -- preserved exactly, not normalized to the ALL/authenticated shape its
-- siblings use. "loc scope" policy on this table untouched -- no literal in it.)
drop policy if exists "lifelenz_payroll_readiness: tenant read" on public.lifelenz_payroll_readiness;
create policy "lifelenz_payroll_readiness: tenant read" on public.lifelenz_payroll_readiness
  for select to public
  using (tenant_id = public.current_tenant_id());

-- new_store_launch_plan / new_store_launch_plan_tenant
drop policy if exists new_store_launch_plan_tenant on public.new_store_launch_plan;
create policy new_store_launch_plan_tenant on public.new_store_launch_plan
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_employee_pay_period_history / "qsr_employee_pay_period_history: tenant"  (loc/role
-- policies on this table untouched -- no literal in either)
drop policy if exists "qsr_employee_pay_period_history: tenant" on public.qsr_employee_pay_period_history;
create policy "qsr_employee_pay_period_history: tenant" on public.qsr_employee_pay_period_history
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- qsr_onhand_item_history / qsr_onhand_item_history_tenant  (qsr_onhand_item_history_loc
-- untouched -- no literal in it)
drop policy if exists qsr_onhand_item_history_tenant on public.qsr_onhand_item_history;
create policy qsr_onhand_item_history_tenant on public.qsr_onhand_item_history
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- runtime_error_reports / runtime_error_reports_tenant
drop policy if exists runtime_error_reports_tenant on public.runtime_error_reports;
create policy runtime_error_reports_tenant on public.runtime_error_reports
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- security_finding_actions / "security_finding_actions: gated select" + "...: gated insert" --
-- full expression preserved verbatim (gm_identity_reveal_enabled org_config gate + role check),
-- literal-only swap. Measured live from pg_policies immediately before writing this, not
-- reconstructed from memory of the original migration.
drop policy if exists "security_finding_actions: gated select" on public.security_finding_actions;
create policy "security_finding_actions: gated select" on public.security_finding_actions
  for select to public
  using (
    tenant_id = public.current_tenant_id()
    and (
      get_my_role() = any (array['admin','owner','area_supervisor'])
      or (
        get_my_role() = any (array['manager','gm'])
        and coalesce(
          (select (org_config.data ->> 'enabled')::boolean
             from org_config where org_config.key = 'gm_identity_reveal_enabled'),
          false
        )
      )
    )
  );

drop policy if exists "security_finding_actions: gated insert" on public.security_finding_actions;
create policy "security_finding_actions: gated insert" on public.security_finding_actions
  for insert to public
  with check (
    tenant_id = public.current_tenant_id()
    and created_by = auth.uid()
    and (
      get_my_role() = any (array['admin','owner','area_supervisor'])
      or (
        get_my_role() = any (array['manager','gm'])
        and coalesce(
          (select (org_config.data ->> 'enabled')::boolean
             from org_config where org_config.key = 'gm_identity_reveal_enabled'),
          false
        )
      )
    )
  );

-- spot_check_ruler_notes / spot_check_ruler_notes_tenant  (spot_check_ruler_notes_loc untouched
-- -- no literal in it)
drop policy if exists spot_check_ruler_notes_tenant on public.spot_check_ruler_notes;
create policy spot_check_ruler_notes_tenant on public.spot_check_ruler_notes
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
