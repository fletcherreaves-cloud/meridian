-- ── qsr_raw_item_info (raw_info/{itemId}) — dispatch #184 ───────────────────────────────────────
-- Recipe/serving-factor (BOM) + combo composition + current distributor cost, per raw item, per
-- store. A genuine sibling of qsr_raw_item_detail (scripts/qsrsoft-variance-pull.mjs's existing
-- raw_detail call, same actionable-WRIN loop -- top-50 by |$| variance, dispatch #179 -- same
-- auth/header shape via ebosGetObj()) but this endpoint returns a CURRENT-STATE snapshot, not a
-- per-transaction forensic log. So this table is keyed (loc, wrin) ONLY -- no period column,
-- unlike qsr_raw_item_detail's (loc, period, wrin) -- every pull just overwrites the latest known
-- values for that item. See memory/dispatch-184.md for the full field list + the owner-captured
-- sample response this schema was built from.
--
-- This table did not exist before the multi-tenant migration (schema-multitenant-phase1.sql /
-- schema-multitenant-phase2-rls.sql) landed, so tenant_id + tenant-scoped RLS are set up directly
-- below in ONE step -- matching how every other stream table now works in production -- instead
-- of the historical two-phase (defaulted-column-then-drop-default) split those two files used,
-- which existed only to keep a live ALTER on tables that already held rows lock-cheap. A brand
-- new, empty table has no such row to protect, so it can start in the end state directly.
-- Assumes public.current_tenant_id() / public.set_tenant_id() already exist (created by
-- schema-multitenant-phase1.sql, redefined by schema-multitenant-phase2-rls.sql) — same
-- assumption org_config's own tenant_id column comment already carries.
create table if not exists public.qsr_raw_item_info (
  loc                  text    not null,
  wrin                 text    not null,               -- v.wrin from the variance row (the join key)
  full_wrin            text,                            -- raw_info's own full_wrin field, kept separately
  long_desc            text,
  invty_category_type  text,
  case_qty             numeric,
  latest_case_price    numeric,
  case_price_avg       numeric,
  primary_vdr_name     text,
  primary_vdr          text,                            -- vendor id, kept as text (format unconfirmed)
  mid_range_yield      numeric,
  recipe_item          boolean,
  current_upt          numeric,
  menu_items           jsonb   not null default '[]'::jsonb,  -- [{ recipe_serving_factor, on_pos, ... }]
  menu_item_combos     jsonb   not null default '[]'::jsonb,  -- [{ main_item_number, quantity, ... }]
  upt_hist             jsonb   not null default '[]'::jsonb,  -- date/price history, sparse per the captured sample
  tenant_id            uuid,
  updated_at           timestamptz default now(),
  primary key (loc, wrin)
);
create index if not exists qsr_raw_item_info_loc_idx on public.qsr_raw_item_info (loc);

alter table public.qsr_raw_item_info enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_raw_item_info;
create trigger set_tenant_id_trg before insert on public.qsr_raw_item_info
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_raw_item_info: tenant select" on public.qsr_raw_item_info;
drop policy if exists "qsr_raw_item_info: tenant insert" on public.qsr_raw_item_info;
drop policy if exists "qsr_raw_item_info: tenant update" on public.qsr_raw_item_info;
drop policy if exists "qsr_raw_item_info: tenant delete" on public.qsr_raw_item_info;
create policy "qsr_raw_item_info: tenant select" on public.qsr_raw_item_info
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_raw_item_info: tenant insert" on public.qsr_raw_item_info
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_raw_item_info: tenant update" on public.qsr_raw_item_info
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_raw_item_info: tenant delete" on public.qsr_raw_item_info
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream -- but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes (coalesce(current_tenant_id(),
-- owner-tenant-constant) inside set_tenant_id(), per schema-multitenant-phase2-rls.sql). The
-- pull script itself needs no tenant_id-stamping change to rely on this -- it already doesn't for
-- qsr_raw_item_detail either.
