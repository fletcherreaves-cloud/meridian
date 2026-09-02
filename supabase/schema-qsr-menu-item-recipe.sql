-- ── qsr_menu_item_recipe (GET /menuitems/{store_menuitem_id}) — Pricing Engine recipe/BOM ──────
-- Per-menu-item, per-store recipe/BOM + cost breakdown, straight from QSRSoft's own recipe engine
-- (owner-captured live, 2026-09-01 — memory/finding-ebos-menu-item-activity-cost-endpoint-
-- 2026-09-01.md). Closes the gap memory/finding-legacy-pricing-workbook-structure-2026-08-27.md
-- flagged as "no current Meridian source at all": which raw ingredients (WRIN), at what quantity
-- and cost, make up a given menu item's food/paper cost.
--
-- NOT the same data as qsr_raw_item_info (dispatch #184): that table is ingredient-centric,
-- scoped to only the top ~50 raw items BY VARIANCE $ per store per period (an EOM diagnostic
-- subset) — most menu items' ingredients never appear there. This table is menu-item-centric and
-- covers every item actually sold (same trailing-90-day qsr_product_mix scope
-- qsrsoft-menu-item-activity-pull.mjs already uses, reused rather than re-derived), regardless of
-- variance.
--
-- Also NOT a duplicate of qsr_menu_item_activity's own food_cost/paper_cost columns — dispatch
-- #212 already established those match qsr_product_mix's unit_food_cost/unit_paper_cost exactly
-- (see src/engine/pricing-engine.js's enrichItemMargins header), so re-deriving the SAME aggregate
-- number a third time would add nothing. What THIS table adds is the ingredient-level breakdown
-- (recipe[]) and change history (hist_recipe[]) behind that aggregate — a genuinely new grain, not
-- a second copy of a number already trusted.
--
-- CURRENT-STATE snapshot, not a daily time series — recipes change rarely (hist_recipe's own
-- versions span months), so this is keyed (loc, store_menuitem_id) ONLY, no date column, matching
-- qsr_raw_item_info / qsr_menu_items' precedent for "point-in-time, overwrite on re-pull" tables.
create table if not exists public.qsr_menu_item_recipe (
  loc                  text        not null,
  store_menuitem_id    bigint      not null,
  item_number          integer,               -- denormalized from qsr_menu_items at pull time, for
                                               -- querying without a join back to the catalog table
  description          text,
  daypart_code         text,
  family_group         text,
  combination_item     boolean,
  on_pos               boolean,
  food_cost            numeric,               -- cost_breakdown.food
  paper_cost           numeric,               -- cost_breakdown.paper
  total_cost           numeric,               -- cost_breakdown.total
  recipe               jsonb       not null default '[]'::jsonb,  -- [{fullWrin, longDesc, startDate, servings, class, looseUnitCost, costPrice}]
  hist_recipe          jsonb       not null default '[]'::jsonb,  -- prior recipe versions, same shape + endDate
  tenant_id            uuid,
  updated_at           timestamptz default now(),
  primary key (loc, store_menuitem_id)
);
create index if not exists qsr_menu_item_recipe_loc_item_number_idx on public.qsr_menu_item_recipe (loc, item_number);

alter table public.qsr_menu_item_recipe enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_menu_item_recipe;
create trigger set_tenant_id_trg before insert on public.qsr_menu_item_recipe
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_menu_item_recipe: tenant select" on public.qsr_menu_item_recipe;
drop policy if exists "qsr_menu_item_recipe: tenant insert" on public.qsr_menu_item_recipe;
drop policy if exists "qsr_menu_item_recipe: tenant update" on public.qsr_menu_item_recipe;
drop policy if exists "qsr_menu_item_recipe: tenant delete" on public.qsr_menu_item_recipe;
create policy "qsr_menu_item_recipe: tenant select" on public.qsr_menu_item_recipe
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_menu_item_recipe: tenant insert" on public.qsr_menu_item_recipe
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_item_recipe: tenant update" on public.qsr_menu_item_recipe
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_item_recipe: tenant delete" on public.qsr_menu_item_recipe
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream — but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
