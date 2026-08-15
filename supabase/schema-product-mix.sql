-- ============================================================================
-- QSRSoft Product Mix (PMIX) — per-item, per-price-point sales facts.
-- Issue #291: "the biggest analytical unlock" — PMIX turns "check rose" into
-- "realized prices flat, mix shifted toward X, units of Y fell." Feeds the
-- McValue FBP critical-path check-decomposition (deadline 2026-08-25) and the
-- Pricing Engine / Filet-O-Fish-Fridays correlation work (Notes 25 #1 / 28 #5).
--
-- Endpoint confirmed 2026-08-14 (memory/qsrsoft-report-catalog.md, "Product Mix
-- — the SALES view" section — read that before touching this table further,
-- it has the full capture + reconciliation math this schema is built from):
--   GET https://api.reports.myqsrsoft.com/reporting/v2/product/product-mix-bundles
--       ?catalogType=productMix&reportType=summary&nsn=...&startDate=...&endDate=...
--   → { result: [ {menuItemNumber, price, soldQty, discQty, description,
--        familyGroup, promoQty, offerAmt, unitFoodCost, unitPaperCost, ...} ] }
-- Same /reporting/v2/ family qsrsoft-ops-pull.mjs already drives — auth, query
-- builder and Playwright fallback all carry over unchanged. See
-- scripts/qsrsoft-pmix-pull.mjs for the real, working pull built against this.
--
-- Grain: (loc, date, item, price) — NOT (loc, date, item). Measured on the real
-- payload: 441 rows over 314 distinct menuItemNumbers for one store-day, 116
-- items at more than one price (McChicken $1.50 x140 AND $3.69 x5 the same
-- day). The API has already separated price from mix — a menu price CHANGE is
-- a new price value appearing in an item's tier set; a mix SHIFT is quantity
-- moving between existing tiers. Averaging `dollars ÷ units` across tiers (the
-- issue's original plan) would blend $1.50 and $3.69 McChickens into a
-- meaningless $1.57 and misread a mix shift as a price change — do not do
-- that. `price` is exact, per row, already.
--
-- Stores PRIMITIVES, not derived extensions. Measured: dollarsSold ==
-- price*soldQty exactly (0/441 exceptions on the captured payload); same for
-- totalUnitFoodCost == unitFoodCost*soldQty. Storing both the primitive and
-- its extension invites them to disagree after a partial update — compute
-- dollars_sold as price*sold_qty in a query/view, never store it.
--
-- dollarsSold-as-derived is also why there's no `dollars` column here at all:
-- it would be GROSS, not net. Measured: Σ dollarsSold overstates allNetSales
-- by 2.9% on the captured store-day, and the overstatement is exactly
-- promotional intensity (largest when a promo analysis cares most). NEVER
-- surface Σ(price*sold_qty) as sales.
--
-- promo_qty and offer_amt are DIFFERENT measures, not two views of one —
-- measured: 15 rows carry promo_qty with offer_amt=0, 12 the reverse, and
-- neither derives the other where both appear. promo_qty = units given away
-- (free-item detection — e.g. M French Fries soldQty 65 / promoQty 28 same
-- day, 43% given away); offer_amt = dollars of a discount offer applied.
-- Carry both; do not collapse them.
--
-- disc_amt is NOT YET SELECTED — memory/qsrsoft-report-catalog.md flags it as
-- the last unknown, needed to close the reconciliation identity
-- (Σdollars_sold − Σoffer_amt − Σdisc_amt == allNetSales). One more capture
-- with discAmt added to selectCols settles it; column added here as nullable
-- ahead of that so the schema doesn't need a second migration once it lands.
--
-- bundle_qty/bundle_disc_amt deliberately NOT included — measured zero on
-- every row of the captured payload despite the endpoint's name. Unverified;
-- do not design around them until a capture shows one non-zero.
--
-- Never GROUP BY item name/description for a price or mix series — measured:
-- display names are many-to-one over item numbers ("Hamburger" -> item#s 1,
-- 1001, 1403, 5041, 5728; likely à-la-carte vs bundle-component vs meal-deal
-- variants). Group by menuItemNumber; the inline `desc_`/`family` columns are
-- for display only.
--
-- Volume is the one real design problem this table has that no other
-- Meridian table does: ~441 rows/store-day measured -> ~11,900/day across 27
-- stores -> ~4.3M rows/year, an order of magnitude past anything else in this
-- schema. Two measured mitigations, both applied at ingest (not here): rows
-- with sold_qty=0 are catalog placeholders (21/441 on the captured payload)
-- and are filtered before upsert; a long-tail soldQty<=2 cutoff is available
-- (238/441 rows, 11.1% of dollars) but NOT applied — it would break price-tier
-- history for slow-moving items, so only cut it later if volume actually hurts.
--
-- loc is PADDED (matches qsr_fob/qsr_service_stats/every other QSRSoft-sourced
-- table, not the unpadded STORE_NAMES key) — PR #269 review, 2026-08-14: this
-- repo has four documented loc-padding incidents (v4.809/823/827/831) from
-- exactly this ambiguity going unstated. A STORE_NAMES join needs ltrim(loc,'0').
--
-- tenant_id + tenant-scoped RLS from day one (CLAUDE.md standing rule; pattern
-- matches schema-shift-manager-range.sql / schema-coaching-cycles.sql). Zero
-- rows at creation time — the cheapest a tenant_id column ever gets.
-- Safe to run top-to-bottom; idempotent. Expected: "Success. No rows returned."
-- ============================================================================
create table if not exists public.qsr_product_mix (
  loc              text    not null,              -- padded, e.g. '0035064'
  date             date    not null,
  item             bigint  not null,               -- menuItemNumber -- key on this, never on desc_
  price            numeric not null,               -- price point -- part of the grain, see header
  desc_            text,                            -- display name only ('desc' is a reserved word)
  family_group     text,
  sold_qty         numeric,
  disc_qty         numeric,
  promo_qty        numeric,                         -- units given away (free-item detection)
  offer_amt        numeric,                         -- $ of discount offer applied -- distinct from promo_qty
  disc_amt         numeric,                         -- NOT YET SELECTED upstream -- see header
  unit_food_cost   numeric,
  unit_paper_cost  numeric,
  tenant_id        uuid not null default '00000000-0000-0000-0000-000000000001',
  updated_at       timestamptz default now(),
  primary key (loc, date, item, price)
);

alter table public.qsr_product_mix enable row level security;
drop policy if exists qsr_product_mix_tenant on public.qsr_product_mix;
create policy qsr_product_mix_tenant on public.qsr_product_mix
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

create index if not exists qsr_product_mix_date_idx on public.qsr_product_mix (date, loc);
create index if not exists qsr_product_mix_item_idx on public.qsr_product_mix (loc, item, date);
