-- ============================================================================
-- Meridian RLS — PHASE 2 (LOC): per-store isolation within a tenant
-- ============================================================================
-- Fills the one genuinely missing layer. Current state as of 2026-08-07:
--   schema-rls-phase1.sql .............. closes anonymous access        (written)
--   schema-multitenant-phase1.sql ...... adds + backfills tenant_id     (written)
--   schema-multitenant-phase2-rls.sql .. tenant isolation, 70 tables    (written)
--   THIS FILE ........................... per-LOC isolation, 51 tables    (new)
--
-- Tenant scoping stops operator A seeing operator B. It does NOT stop a GM inside
-- your own org from seeing all 27 stores. That is what this file adds.
--
-- ⚠️  accessible_locs IS text[], NOT jsonb — verified against the live database
-- 2026-08-07 (information_schema.columns: data_type=ARRAY, udt_name=_text). An earlier
-- draft of this file used jsonb_array_length()/jsonb_array_elements_text() and would
-- have failed on execution. The existing inline policies on event_impact and org_events
-- already used array syntax (`loc = any(p.accessible_locs)`), which was the clue.
--
-- ⚠️  WHY THESE POLICIES ARE `AS RESTRICTIVE`
-- Postgres ORs permissive policies together. Adding a permissive per-loc policy
-- beside the existing permissive `auth.uid() is not null` policy would GRANT MORE
-- ACCESS, not less — the broad policy would still pass on its own. RESTRICTIVE
-- policies AND with everything else, so this layer intersects with Phase 1 and with
-- tenant scoping instead of competing with them. It can therefore be applied before
-- or after those, in any order, without rewriting them.
--
-- ⚠️  LOC PADDING — the reason can_see_loc() normalizes both sides
-- Store identity has two representations in this database: qsr_* tables store a
-- 7-char zero-padded NSN, most others store it unpadded. That mismatch has already
-- caused four separate production bugs (v4.809, v4.823, v4.827, v4.831). A naive
-- `loc = any(accessible_locs)` comparison here would fail CLOSED — a restricted user
-- would silently see nothing, on some tables but not others. Both sides are stripped
-- of leading zeros before comparing.
--
-- NOTE: event_impact and org_events already carry hand-written inline accessible_locs
-- checks (and no padding normalization). The restrictive policy here ANDs with those;
-- it is redundant but harmless on those two, and it fixes their padding exposure.
--
-- PRE-REQ: profiles.accessible_locs is null/empty for full-access users (the owner),
-- or a JSON array of store codes for restricted users. Null/empty = sees everything,
-- so applying this changes NOTHING for existing users until you restrict someone.
--
-- Idempotent. Rollback at the bottom.
-- ============================================================================

-- ── Helper: can the caller see this store? ──────────────────────────────────
create or replace function public.can_see_loc(p_loc text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and (
        -- null / empty accessible_locs = unrestricted (owner, admin)
        pr.accessible_locs is null
        or cardinality(pr.accessible_locs) = 0
        -- otherwise compare with BOTH sides zero-stripped (see padding note above)
        or ltrim(coalesce(p_loc, ''), '0') in (
             select ltrim(x, '0')
             from unnest(pr.accessible_locs) as t(x)
           )
      )
  );
$$;

comment on function public.can_see_loc(text) is
  'True when the calling user may see this store. Null/empty accessible_locs = full access. Compares with leading zeros stripped from both sides because qsr_* tables store 7-char padded NSNs while other tables store unpadded.';

-- ── Apply a RESTRICTIVE per-loc policy to every loc-keyed table ─────────────
do $$
declare
  t text;
  tbls text[] := array[
    'audit_rows','cash_sheet_daily','ctrl_rows','daily_glimpse_daily',
    'dar_rows','digital_app_monthly','employee_skills','eom_count_exceptions',
    'eom_count_progress_log','eom_count_status','eom_count_status_history','eom_integrity_flags',
    'eom_secondary_review','eom_share_links','eom_snapshots','event_impact',
    'fob_rows','forecast_snapshots','graded_visits','labor_rows',
    'lifelenz_job_hours','lifelenz_labor_week','lifelenz_schedule','mcdelivery_monthly',
    'monthly_targets','one_pager_action_items','ops_rows','org_events',
    'org_school_config','peaks_rows','qsr_cash_sheet','qsr_ebos_daily',
    'qsr_fob','qsr_inventory_summary','qsr_onhand','qsr_raw_item_detail',
    'qsr_transfers','qsr_variance_stat','qsr_waste','roster_role_counts',
    'roster_statistics','sales_ledger_daily','shift_manager_monthly','smart_target_adjustments',
    'smg_comments','smg_fullscale','smg_voice_daypart','smg_voice_performance',
    'store_labor_config','tenant_stores','turnover_monthly'
  ];
begin
  foreach t in array tbls loop
    -- skip tables that don't exist in this database yet (schema files are optional)
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, not present', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_loc_scope', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (public.can_see_loc(loc)) with check (public.can_see_loc(loc))',
      t || '_loc_scope', t
    );
  end loop;
end $$;

-- ============================================================================
-- VERIFY (run logged in as the owner — accessible_locs should be null → all rows)
-- ============================================================================
--   select public.can_see_loc('0003708');  -- expect true
--   select public.can_see_loc('3708');     -- expect true (padding-insensitive)
--   select count(*) from public.qsr_fob;   -- expect your normal row count
--
-- Then with a THROWAWAY restricted profile (accessible_locs = '["3708"]'::jsonb):
--   select count(distinct loc) from public.qsr_fob;   -- expect 1
--   select count(distinct loc) from public.labor_rows;-- expect 1
-- Confirm BOTH a padded table (qsr_*) and an unpadded one, or the padding fix is
-- untested where it matters most.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- do $$
-- declare t text; tbls text[] := array[
--     'audit_rows','cash_sheet_daily','ctrl_rows','daily_glimpse_daily',
    'dar_rows','digital_app_monthly','employee_skills','eom_count_exceptions',
    'eom_count_progress_log','eom_count_status','eom_count_status_history','eom_integrity_flags',
    'eom_secondary_review','eom_share_links','eom_snapshots','event_impact',
    'fob_rows','forecast_snapshots','graded_visits','labor_rows',
    'lifelenz_job_hours','lifelenz_labor_week','lifelenz_schedule','mcdelivery_monthly',
    'monthly_targets','one_pager_action_items','ops_rows','org_events',
    'org_school_config','peaks_rows','qsr_cash_sheet','qsr_ebos_daily',
    'qsr_fob','qsr_inventory_summary','qsr_onhand','qsr_raw_item_detail',
    'qsr_transfers','qsr_variance_stat','qsr_waste','roster_role_counts',
    'roster_statistics','sales_ledger_daily','shift_manager_monthly','smart_target_adjustments',
    'smg_comments','smg_fullscale','smg_voice_daypart','smg_voice_performance',
    'store_labor_config','tenant_stores','turnover_monthly'
--   ];
-- begin
--   foreach t in array tbls loop
--     if to_regclass('public.' || t) is null then continue; end if;
--     execute format('drop policy if exists %I on public.%I', t || '_loc_scope', t);
--   end loop;
-- end $$;
-- drop function if exists public.can_see_loc(text);
