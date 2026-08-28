-- ── qsr_menu_item_activity — dispatch #193 ─────────────────────────────────────────────────────
-- Per-item, per-day activity + $ cost from the pair of eBOS endpoints dispatch #185 designed but
-- couldn't ship (no known way to enumerate `store_menuitem_id`) and dispatch #186 unblocked
-- (GET /api/inv/{nsn}/menuitems → qsr_menu_items, the item_number -> store_menuitem_id lookup):
--
--   POST /api/inv/{nsn}/menu_item_activity2
--     body: store_menuitem_id, start_date/start_time, end_date/end_time, item_long_desc
--     -> activity/sold/emp_meal/mgr_meal/waste/promo/free_choice_qty
--   GET  /api/inv/{nsn}/menu_item_activity_cost?store_busn_dt=&menu_item_id=
--     -> food_cost/paper_cost/total_cost/last_close_business_date
--
-- Both endpoints key off the SAME `store_menuitem_id` id space (confirmed exact match, dispatch
-- #185) -- one row per (loc, store_menuitem_id, date) covers both endpoints' data, per dispatch
-- #185's original design. Pulled DAILY (scripts/qsrsoft-menu-item-activity-pull.mjs), bounded to
-- each store's own real-activity subset (items sold in the trailing 90 days per qsr_product_mix,
-- ~330-390/store per memory/finding-menu-item-activity-subset-2026-08-28.md) -- NOT the full
-- ~5,466-item catalog. Reference/lookup for that subset lives in qsr_menu_items (dispatch #186).
--
-- Brand-new, empty table -- tenant_id + tenant-scoped RLS set up directly in ONE step, same as
-- schema-qsr-menu-items.sql / schema-qsr-raw-item-info.sql. Assumes public.current_tenant_id() /
-- public.set_tenant_id() already exist (schema-multitenant-phase1.sql, redefined by
-- schema-multitenant-phase2-rls.sql).
create table if not exists public.qsr_menu_item_activity (
  loc                  text        not null,
  store_menuitem_id    bigint      not null,
  date                 date        not null,
  item_number          integer,               -- denormalized from qsr_menu_items at pull time, for
                                               -- querying without a join back to the catalog table
  activity             numeric,
  sold                 numeric,
  emp_meal             numeric,
  mgr_meal             numeric,
  waste                numeric,
  promo                numeric,
  free_choice_qty      numeric,
  food_cost            numeric,
  paper_cost           numeric,
  total_cost           numeric,
  last_close_business_date date,               -- from menu_item_activity_cost, as returned
  tenant_id            uuid,
  updated_at           timestamptz default now(),
  primary key (loc, store_menuitem_id, date)
);
create index if not exists qsr_menu_item_activity_loc_date_idx on public.qsr_menu_item_activity (loc, date);
create index if not exists qsr_menu_item_activity_loc_item_number_idx on public.qsr_menu_item_activity (loc, item_number);

alter table public.qsr_menu_item_activity enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_menu_item_activity;
create trigger set_tenant_id_trg before insert on public.qsr_menu_item_activity
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_menu_item_activity: tenant select" on public.qsr_menu_item_activity;
drop policy if exists "qsr_menu_item_activity: tenant insert" on public.qsr_menu_item_activity;
drop policy if exists "qsr_menu_item_activity: tenant update" on public.qsr_menu_item_activity;
drop policy if exists "qsr_menu_item_activity: tenant delete" on public.qsr_menu_item_activity;
create policy "qsr_menu_item_activity: tenant select" on public.qsr_menu_item_activity
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_menu_item_activity: tenant insert" on public.qsr_menu_item_activity
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_item_activity: tenant update" on public.qsr_menu_item_activity
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_item_activity: tenant delete" on public.qsr_menu_item_activity
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream -- but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
