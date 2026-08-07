-- ============================================================================
-- Per-loc RLS — all 51 loc-keyed tables
-- ============================================================================
-- Uses the predicate proven on qsr_daily_activity (367,562 rows) and confirmed
-- live in the app: T1 ready in 1,976ms, all tiles populating, banner clear.
--
-- MEASURED, not assumed — each of these was tried on the real table:
--   per-row correlated function ....... TIMED OUT (this is what broke production)
--   `= any ((select ...))` ............ parse error: text = text[]
--   bare my_locs() in the filter ...... 590 ms  (profiles hit once PER ROW)
--   (select my_locs()) wrapped ........  13.8 ms (InitPlan, loops=1)
--   restricted list, hashed subplan ...  53 ms, filters correctly
--                                        (2,928 of 39,528 = exactly the 2 stores)
--
-- Three things are load-bearing:
--   AS RESTRICTIVE — permissive policies OR together, so a permissive per-loc
--     policy beside the tenant ones would GRANT more access, not less.
--   (select public.my_locs()) — the wrapper. Without it this is the 590ms version
--     and, under startup concurrency, the timeout that emptied the tiles today.
--   ltrim both sides — qsr_* store '0003708', other tables store '3708'. A padding
--     mismatch inside a security policy fails CLOSED and reads as "RLS is broken".
--
-- SAFE TODAY: both live profiles have accessible_locs = NULL, so my_locs() returns
-- NULL and nobody loses access. It only takes effect once someone is restricted.
--
-- Idempotent — skips tables that don't exist, drops before creating.
-- Requires public.my_locs() (created and verified separately).
-- ============================================================================

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
    if to_regclass('public.' || t) is null then
      raise notice 'skipping %, not present', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_loc_scope', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ( (select public.my_locs()) is null '
      '        or ltrim(loc, ''0'') in (select unnest((select public.my_locs()))) ) '
      'with check ( (select public.my_locs()) is null '
      '        or ltrim(loc, ''0'') in (select unnest((select public.my_locs()))) )',
      t || '_loc_scope', t
    );
  end loop;
end $$;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select count(*) from pg_policies
--    where schemaname='public' and permissive='RESTRICTIVE';   -- expect 51
--
--   select public.can_see_loc is not null;  -- (old fn; should no longer exist)
--   select public.my_locs();                -- expect NULL for an unrestricted caller
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- do $$ declare t text; tbls text[] := array[
--     'audit_rows','cash_sheet_daily','ctrl_rows','daily_glimpse_daily',
--     'dar_rows','digital_app_monthly','employee_skills','eom_count_exceptions',
--     'eom_count_progress_log','eom_count_status','eom_count_status_history','eom_integrity_flags',
--     'eom_secondary_review','eom_share_links','eom_snapshots','event_impact',
--     'fob_rows','forecast_snapshots','graded_visits','labor_rows',
--     'lifelenz_job_hours','lifelenz_labor_week','lifelenz_schedule','mcdelivery_monthly',
--     'monthly_targets','one_pager_action_items','ops_rows','org_events',
--     'org_school_config','peaks_rows','qsr_cash_sheet','qsr_ebos_daily',
--     'qsr_fob','qsr_inventory_summary','qsr_onhand','qsr_raw_item_detail',
--     'qsr_transfers','qsr_variance_stat','qsr_waste','roster_role_counts',
--     'roster_statistics','sales_ledger_daily','shift_manager_monthly','smart_target_adjustments',
--     'smg_comments','smg_fullscale','smg_voice_daypart','smg_voice_performance',
--     'store_labor_config','tenant_stores','turnover_monthly'
--   ];
-- begin
--   foreach t in array tbls loop
--     if to_regclass('public.' || t) is null then continue; end if;
--     execute format('drop policy if exists %I on public.%I', t || '_loc_scope', t);
--   end loop;
-- end $$;
