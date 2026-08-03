-- ═══════════════════════════════════════════════════════════════════════════════
-- Meridian — Multi-tenant migration, PHASE 1 (ADDITIVE, NON-BREAKING)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Goal: introduce a real tenant boundary so a 2nd operator's data can be isolated.
--
-- Naming note: this codebase already uses `org` to mean a BRAND/STATE split within
-- THIS owner (mcdok = Oklahoma, emerald = Florida). A second *operator* is a
-- different TENANT above that. So we introduce `tenant_id` + a `tenants` table and
-- LEAVE `org` alone as the intra-tenant brand label.
--
-- SAFETY: This file is safe to run on the live DB. It only ADDS a nullable
-- `tenant_id` column, backfills every existing row to the current owner's tenant,
-- and creates helper objects. It does NOT change any RLS policy, so behavior is
-- identical afterward. The RLS flip that actually enforces isolation is a SEPARATE
-- file (schema-multitenant-phase2-rls.sql) — run that LAST, after verifying with a
-- throwaway second-tenant profile.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tenants registry ────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text,
  created_at  timestamptz default now()
);

-- Seed the current owner's tenant with a FIXED uuid so Phase 2 can reference it.
insert into public.tenants (id, name, short_name)
values ('00000000-0000-0000-0000-000000000001', 'McDOK | Emerald Arches', 'McDOK')
on conflict (id) do nothing;

-- ── 2. Tenant → store map ──────────────────────────────────────────────────────
-- Which stores belong to which tenant (and their intra-tenant brand `org`).
-- Used later to stamp tenant_id on newly-ingested rows by their loc.
create table if not exists public.tenant_stores (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  loc        text not null,
  org        text,                     -- intra-tenant brand: 'mcdok' | 'emerald' (this owner)
  primary key (tenant_id, loc)
);

-- Seed all 27 current stores to the owner's tenant (generated from constants.js).
insert into public.tenant_stores (tenant_id, loc, org) values
  ('00000000-0000-0000-0000-000000000001','10034','emerald'),
  ('00000000-0000-0000-0000-000000000001','10422','mcdok'),
  ('00000000-0000-0000-0000-000000000001','10915','mcdok'),
  ('00000000-0000-0000-0000-000000000001','11657','mcdok'),
  ('00000000-0000-0000-0000-000000000001','13113','mcdok'),
  ('00000000-0000-0000-0000-000000000001','18213','mcdok'),
  ('00000000-0000-0000-0000-000000000001','20475','mcdok'),
  ('00000000-0000-0000-0000-000000000001','24471','mcdok'),
  ('00000000-0000-0000-0000-000000000001','29760','mcdok'),
  ('00000000-0000-0000-0000-000000000001','31357','mcdok'),
  ('00000000-0000-0000-0000-000000000001','32525','mcdok'),
  ('00000000-0000-0000-0000-000000000001','33109','mcdok'),
  ('00000000-0000-0000-0000-000000000001','33222','mcdok'),
  ('00000000-0000-0000-0000-000000000001','33704','mcdok'),
  ('00000000-0000-0000-0000-000000000001','34222','mcdok'),
  ('00000000-0000-0000-0000-000000000001','35064','mcdok'),
  ('00000000-0000-0000-0000-000000000001','35242','emerald'),
  ('00000000-0000-0000-0000-000000000001','3708','mcdok'),
  ('00000000-0000-0000-0000-000000000001','37566','emerald'),
  ('00000000-0000-0000-0000-000000000001','38609','emerald'),
  ('00000000-0000-0000-0000-000000000001','43380','mcdok'),
  ('00000000-0000-0000-0000-000000000001','43701','emerald'),
  ('00000000-0000-0000-0000-000000000001','5183','mcdok'),
  ('00000000-0000-0000-0000-000000000001','5985','mcdok'),
  ('00000000-0000-0000-0000-000000000001','6178','emerald'),
  ('00000000-0000-0000-0000-000000000001','6838','emerald'),
  ('00000000-0000-0000-0000-000000000001','6972','mcdok')
on conflict (tenant_id, loc) do nothing;

-- ── 3. Add nullable tenant_id to profiles + every tenant-scoped data table ──────
-- Nullable + backfilled = existing rows keep working; no RLS change here.
-- EXCLUDED (intentionally shared/global, no tenant): qsrsoft_kb, qsr_field_definitions.
-- org_config is handled separately in Phase 2 (its key becomes tenant-scoped).
do $$
declare
  t text;
  tbls text[] := array[
    'profiles','reviews','staff_assignments','monthly_targets','smg_fullscale',
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
    -- only touch tables that actually exist in this DB
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      execute format(
        'alter table public.%I add column if not exists tenant_id uuid references public.tenants(id)', t);
      -- backfill: everything currently in the DB is the current owner's tenant
      execute format(
        'update public.%I set tenant_id = ''00000000-0000-0000-0000-000000000001'' where tenant_id is null', t);
      -- index for the Phase-2 RLS predicate
      execute format(
        'create index if not exists %I on public.%I (tenant_id)', t||'_tenant_idx', t);
    end if;
  end loop;
end $$;

-- ── 3b. org_config gets tenant_id too (kept out of the loop; special backfill) ──
-- Its PK stays `key` for now (single-tenant safe). Before operator #2 SHARES this
-- table, change the PK to (key, tenant_id) and update the app upsert onConflict.
alter table public.org_config add column if not exists tenant_id uuid references public.tenants(id);
update public.org_config set tenant_id = '00000000-0000-0000-0000-000000000001' where tenant_id is null;

-- ── 4. current_tenant_id() helper (SECURITY DEFINER, avoids RLS recursion) ──────
-- Reads the caller's tenant from their profile. Phase-2 policies use this.
-- MUST be created AFTER profiles.tenant_id exists: a `language sql` function has
-- its body validated at CREATE time, so defining it before the column above fails
-- with 42703 (column "tenant_id" does not exist).
create or replace function public.current_tenant_id()
returns uuid language sql security definer stable as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- ── 5. Default-tenant trigger (fills tenant_id on INSERT from the caller) ────────
-- Attached to tables in Phase 2. Defined here so it exists for review.
-- If a row is inserted without tenant_id, set it to the caller's tenant.
create or replace function public.set_tenant_id()
returns trigger language plpgsql security definer as $$
begin
  if new.tenant_id is null then
    new.tenant_id := public.current_tenant_id();
  end if;
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- AFTER RUNNING: the app behaves EXACTLY as before (no RLS change). tenant_id is
-- populated on every existing row. Next: set the current owner's profile tenant:
--
--   update public.profiles
--     set tenant_id = '00000000-0000-0000-0000-000000000001'
--     where email = 'fletcher.reaves@mcreaves.com';   -- and any other real users
--
-- Then verify (should return the tenant uuid for your logged-in user):
--   select public.current_tenant_id();
--
-- Only once that's confirmed for ALL real users, run schema-multitenant-phase2-rls.sql.
-- ═══════════════════════════════════════════════════════════════════════════════
