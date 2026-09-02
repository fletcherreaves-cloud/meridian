-- ── qsr_menu_price_comparison (GET /reports/mcd/product/menuPriceComparison) — the LIST price book ──
-- Backlog item L (memory/data-acquisition-shopping-list.md), UI name "RFM Price Comparison".
-- Grain: one row per (nsn, menuItemNumber) per pull date -- measured 0 duplicates in 1,966 rows
-- for a single day/3-store capture (memory/qsrsoft-report-catalog.md).
--
-- ⚠️ A LIST price book, NOT a sales feed -- carries no soldQty/dollarsSold/cost. Complementary to
-- qsr_product_mix (which carries the REALIZED price -- what actually rang), not a replacement.
-- Together they measure discount depth (realized - list); neither does alone.
--
-- Dated (loc, dt, item), not current-state-only: startDate/endDate are native on this endpoint, so
-- price history is backfillable -- a dated price book is the only way to establish WHEN a price
-- action took effect. A price book changes rarely, so a daily pull is cheap and mostly no-ops, but
-- storing it dated (like qsr_product_mix, not like the current-state qsr_menu_item_recipe) is what
-- lets a future step-change/price-history view work at all.
--
-- price_eatin/price_takeout: STANDING INSTRUCTION (owner, 2026-08-15) -- persist all three price
-- columns even though price/price_eatin/price_takeout are identical on every row measured so far
-- (FL/OK don't split eat-in/take-out POS pricing). This is a fact about Florida and Oklahoma, not
-- about the API -- some states tax prepared food differently for eat-in vs. take-out, and the POS
-- capability exists for exactly that. Collapsing the schema to price+price_delivery would look like
-- a tidy simplification today and would silently break invisibly on the first multi-tenant
-- deployment into such a state -- the columns would keep agreeing right up until they didn't.
--
-- delivery_premium is NOT stored -- it's a derived column (priceDelivery/price - 1) with two
-- measured divide-by-zero behaviours the API itself is inconsistent about (returns 0 when both
-- price and priceDelivery are 0, null when price=0 but priceDelivery>0). Recompute at read time
-- from price/price_delivery rather than trusting/storing a value that could silently drift from
-- its own inputs.
--
-- Sanitation (NOT applied at pull time -- store raw truth, filter at the consumer/aggregate layer,
-- same discipline computeItemMargins() already applies to qsr_product_mix): exclude
-- family_group='Non-product' (placeholder fee items whose $0.01 price yields premiums in the
-- hundreds of multiples) and guard price<=0 (condiments/legacy SKUs) before any aggregate stat.
create table if not exists public.qsr_menu_price_comparison (
  loc              text        not null,    -- NSN, zero-padded to 7 chars (matches project convention; raw API nsn is unpadded)
  dt               date        not null,    -- the pull's requested date (not returned by the API itself)
  item             integer     not null,    -- menuItemNumber
  descr            text,
  family_group     text,
  price            numeric,                 -- in-store list price
  price_eatin      numeric,
  price_takeout    numeric,
  price_delivery   numeric,
  tenant_id        uuid,
  updated_at       timestamptz default now(),
  primary key (loc, dt, item)
);
create index if not exists qsr_menu_price_comparison_loc_item_idx on public.qsr_menu_price_comparison (loc, item);

alter table public.qsr_menu_price_comparison enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_menu_price_comparison;
create trigger set_tenant_id_trg before insert on public.qsr_menu_price_comparison
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_menu_price_comparison: tenant select" on public.qsr_menu_price_comparison;
drop policy if exists "qsr_menu_price_comparison: tenant insert" on public.qsr_menu_price_comparison;
drop policy if exists "qsr_menu_price_comparison: tenant update" on public.qsr_menu_price_comparison;
drop policy if exists "qsr_menu_price_comparison: tenant delete" on public.qsr_menu_price_comparison;
create policy "qsr_menu_price_comparison: tenant select" on public.qsr_menu_price_comparison
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_menu_price_comparison: tenant insert" on public.qsr_menu_price_comparison
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_price_comparison: tenant update" on public.qsr_menu_price_comparison
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_menu_price_comparison: tenant delete" on public.qsr_menu_price_comparison
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream — but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
