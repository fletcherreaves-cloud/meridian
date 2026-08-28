-- ── qsr_menu_items (GET /api/inv/{nsn}/menuitems) — dispatch #186 ────────────────────────────────
-- Per-store menu-item CATALOG (reference/lookup data, not a daily time series): every definable
-- item at a store, with its internal eBOS `store_menuitem_id` and its small POS `item_number` code.
-- This is the enumeration path dispatch #185 needed and couldn't find (see
-- memory/finding-menu-item-id-enumeration-2026-08-28.md) -- `store_menuitem_id` (this table's
-- `data`) is the SAME id space `menu_item_activity2`/`menu_item_activity_cost` key off (dispatch
-- #185, confirmed 4194793 matches exactly), landed here so a future bounded pull of those two
-- endpoints can resolve item_number -> store_menuitem_id instead of guessing.
--
-- Response shape (owner-captured 2026-08-28, memory/captures/menu-items-list-2026-08-28.json,
-- 5,466 rows for store 3708): [{ "data": 4194793, "value": "1 - Hamburger" }, ...]. `data` ->
-- store_menuitem_id (unique per row, confirmed 1:1 with item_number in the captured sample).
-- `value` -> "{item_number} - {description}", split into two real columns per the dispatch; the
-- raw string is ALSO kept (`value`) since a handful of future rows could plausibly fail the
-- "digits - text" pattern this pull assumes and a raw fallback beats a dropped row.
--
-- Catalog data changes rarely (new/discontinued items, not daily volume) -- keyed (loc,
-- store_menuitem_id) ONLY, no period/date column, matching qsr_raw_item_info's CURRENT-STATE
-- precedent (dispatch #184): every pull is a FULL REPLACE of that store's catalog (delete then
-- insert, scripts/qsrsoft-menu-items-pull.mjs), not an append.
--
-- Brand-new, empty table -- tenant_id + tenant-scoped RLS set up directly in ONE step (not the
-- historical defaulted-column-then-drop-default split), same as schema-qsr-raw-item-info.sql.
-- Assumes public.current_tenant_id() / public.set_tenant_id() already exist (schema-multitenant-
-- phase1.sql, redefined by schema-multitenant-phase2-rls.sql).
create table if not exists public.qsr_menu_items (
  loc                  text    not null,
  store_menuitem_id    bigint  not null,      -- the response's `data` field (join key for a future
                                               -- menu_item_activity2/menu_item_activity_cost pull)
  item_number          integer,               -- parsed from `value`'s "{N} - ..." prefix
  description          text,                  -- parsed remainder of `value`
  value                text,                  -- raw `value` string, kept verbatim as a parse-failure fallback
  tenant_id            uuid,
  updated_at           timestamptz default now(),
  primary key (loc, store_menuitem_id)
);
create index if not exists qsr_menu_items_loc_idx on public.qsr_menu_items (loc);
create index if not exists qsr_menu_items_loc_item_number_idx on public.qsr_menu_items (loc, item_number);

alter table public.qsr_menu_items enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_menu_items;
create trigger set_tenant_id_trg before insert on public.qsr_menu_items
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_menu_items: tenant select" on public.qsr_menu_items;
drop policy if exists "qsr_menu_items: tenant insert" on public.qsr_menu_items;
drop policy if exists "qsr_menu_items: tenant update" on public.qsr_menu_items;
drop policy if exists "qsr_menu_items: tenant delete" on public.qsr_menu_items;
create policy "qsr_menu_items: tenant select" on public.qsr_menu_items
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_menu_items: tenant insert" on public.qsr_menu_items
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_items: tenant update" on public.qsr_menu_items
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_items: tenant delete" on public.qsr_menu_items
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream -- but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
