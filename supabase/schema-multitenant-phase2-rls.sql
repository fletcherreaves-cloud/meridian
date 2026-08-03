-- ═══════════════════════════════════════════════════════════════════════════════
-- Meridian — Multi-tenant migration, PHASE 2 (THE RLS FLIP — enforces isolation)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️  DO NOT RUN until ALL of the following are true:
--   1. schema-multitenant-phase1.sql has run (tenant_id exists + backfilled).
--   2. EVERY real user's profile has tenant_id set:
--        select id, email, tenant_id from public.profiles;   -- no NULLs for real users
--   3. select public.current_tenant_id() returns your tenant uuid when logged in.
--   4. You've verified isolation with a THROWAWAY second-tenant profile (see bottom).
--
-- This file replaces the loose policies (using(true) / auth.uid() is not null) with
-- tenant-scoped ones: a row is visible only when tenant_id = the caller's tenant.
-- After this, a second operator sees ONLY their own tenant's rows.
--
-- service_role (pull scripts, email-parse, edge fns that use the service key) BYPASSES
-- RLS entirely — automated ingestion keeps working. But service-role INSERTs have no
-- auth.uid(), so the trigger below defaults their tenant_id to the current owner's
-- tenant. That is correct WHILE single-tenant. ⚠️ Before onboarding operator #2's
-- automated pulls, parameterize the pull scripts to stamp the correct tenant_id
-- (Track-B P1 item 5) and remove the owner-tenant fallback in set_tenant_id().
--
-- Idempotent. Rollback section at the bottom.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Update the default-tenant trigger fn with the single-tenant-era fallback ────
create or replace function public.set_tenant_id()
returns trigger language plpgsql security definer as $$
begin
  if new.tenant_id is null then
    -- caller's tenant when a user is logged in; else (service-role ingestion) the
    -- current owner's tenant. ⚠️ replace the fallback before multi-tenant ingestion.
    new.tenant_id := coalesce(public.current_tenant_id(),
                              '00000000-0000-0000-0000-000000000001');
  end if;
  return new;
end $$;

-- ── Flip data tables to tenant-scoped RLS ──────────────────────────────────────
-- Same table list as Phase 1, EXCLUDING profiles + org_config (handled specially).
do $$
declare
  t text;
  pol record;
  tbls text[] := array[
    'reviews','staff_assignments','monthly_targets','smg_fullscale',
    'smg_comments','smg_voice_performance','smg_voice_daypart','qsr_fob','fob_rows',
    'labor_rows','ops_rows','ctrl_rows','dar_rows','audit_rows','peaks_rows',
    'lifelenz_schedule','lifelenz_job_hours','lifelenz_labor_week','store_labor_config',
    'pending_reports','sales_ledger_daily','daily_glimpse_daily','cash_sheet_daily',
    'qsr_cash_sheet','qsr_ebos_daily','qsr_inventory_summary','qsr_labor_summary',
    'qsr_onhand','qsr_peaks_sales','qsr_raw_item_detail','qsr_sales_mix',
    'qsr_service_stats','qsr_transfers','qsr_variance_stat','qsr_waste',
    'one_pagers','one_pager_action_items','roster_statistics','roster_role_counts',
    'turnover_monthly','shift_manager_monthly','digital_app_monthly','mcdelivery_monthly',
    'graded_visits','forecast_snapshots','smart_target_adjustments','sage_prompts',
    'sage_prompt_runs','custom_signals','saved_correlations','event_impact',
    'org_events','org_school_config','report_subscriptions','employee_skills',
    'eom_count_status','eom_count_status_history','eom_count_progress_log',
    'eom_count_exceptions','eom_item_disposition','eom_integrity_flags',
    'eom_secondary_review','eom_snapshots','eom_share_links','eom_notification_settings'
  ];
begin
  foreach t in array tbls loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      -- Drop the Phase-1 column DEFAULT (owner tenant). Phase 1 added tenant_id WITH a
      -- constant default purely so the add was metadata-only (instant backfill). With the
      -- default in place a new row's tenant_id is never NULL, so the trigger below could
      -- not override it with the CALLER's tenant — every operator's inserts would land on
      -- the owner tenant. Dropping the default lets the trigger set the right tenant.
      -- (profiles + org_config are handled specially below and KEEP their default so
      -- single-tenant user/config onboarding still auto-joins the owner tenant.)
      execute format('alter table public.%I alter column tenant_id drop default', t);
      -- default tenant_id on insert
      execute format('drop trigger if exists set_tenant_id_trg on public.%I', t);
      execute format('create trigger set_tenant_id_trg before insert on public.%I for each row execute function public.set_tenant_id()', t);
      -- enable RLS + drop ALL existing policies (clears the loose using(true)/uid ones)
      execute format('alter table public.%I enable row level security', t);
      for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, t);
      end loop;
      -- tenant-scoped CRUD (authenticated caller, same tenant only)
      execute format('create policy tenant_select on public.%I for select using (tenant_id = public.current_tenant_id())', t);
      execute format('create policy tenant_insert on public.%I for insert with check (tenant_id = public.current_tenant_id())', t);
      execute format('create policy tenant_update on public.%I for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())', t);
      execute format('create policy tenant_delete on public.%I for delete using (tenant_id = public.current_tenant_id())', t);
    end if;
  end loop;
end $$;

-- ── profiles: own row + same-tenant read + admin ───────────────────────────────
alter table public.profiles enable row level security;
drop policy if exists "profiles: own read"    on public.profiles;
drop policy if exists "profiles: admin all"   on public.profiles;
drop policy if exists "profiles: tenant read" on public.profiles;
create policy "profiles: own read"  on public.profiles for select using (auth.uid() = id);
create policy "profiles: tenant read" on public.profiles for select using (tenant_id = public.current_tenant_id());
create policy "profiles: admin all" on public.profiles for all using (get_my_role() = 'admin' and tenant_id = public.current_tenant_id());

-- ── org_config: tenant-scoped read/write ───────────────────────────────────────
-- NOTE: key stays the PK for now (single-tenant safe). Before operator #2 shares
-- this table, change the PK to (key, tenant_id) and update the app upsert onConflict.
alter table public.org_config enable row level security;
drop policy if exists "config: authenticated read"     on public.org_config;
drop policy if exists "config: admin/supervisor write" on public.org_config;
drop policy if exists "config: tenant read"  on public.org_config;
drop policy if exists "config: tenant write" on public.org_config;
create policy "config: tenant read"  on public.org_config for select using (tenant_id = public.current_tenant_id());
create policy "config: tenant write" on public.org_config for all
  using (get_my_role() in ('admin','supervisor') and tenant_id = public.current_tenant_id());

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFY ISOLATION (do this on a COPY/branch first, or with a throwaway tenant):
--   1. insert into public.tenants (id,name) values (gen_random_uuid(),'Test Op') returning id;
--   2. create a throwaway auth user; set their profile.tenant_id = that test id.
--   3. Log in as them → they must see ZERO of the owner's rows in every panel.
--   4. Log in as the owner → everything still present and correct.
--
-- ROLLBACK (revert to pre-Phase-2 behavior — wide-open authenticated read):
--   -- for each table in the list above:
--   --   drop policy tenant_select/insert/update/delete;
--   --   create policy open_all on public.<t> for all using (auth.uid() is not null);
--   --   drop trigger set_tenant_id_trg on public.<t>;
--   (Keep tenant_id columns — they're harmless. Only the policies gate visibility.)
-- ═══════════════════════════════════════════════════════════════════════════════
