-- ── qsr_ebos_line_items (prod.ebos.qsrsoft.com store_ledger, per-line granularity) ──────────────
-- Owner request 2026-10-18: "do we have data available for raw item pricing through
-- invoices/purchases" — qsr_ebos_daily (schema.sql) already pulls every line item from the same
-- store_ledger endpoint scripts/qsrsoft-ebos-pull.mjs reads, but aggregateByDate() collapses them
-- to 5 category dollar totals per (loc, date) and discards the line-item detail (wrin,
-- description, invoice_identifier, per-line category split) before it's ever saved. This table
-- is the fix: the SAME pull, persisting what it already has in hand instead of throwing it away.
--
-- One row per purchase-ledger LINE (not per day) — Purchase/Credit/Adjustment records only, same
-- filter qsr_ebos_daily's own "Total Purchases" aggregate uses (Transfers In/Out excluded: they
-- move existing stock between stores, not a new invoiced price). `raw` keeps the complete
-- original API item as a jsonb fallback — the known fields below are a documented subset
-- (confirmed via aggregateByDate's own consumption in qsrsoft-ebos-pull.mjs), not necessarily
-- everything the endpoint actually returns (e.g. a per-line quantity/unit-cost field, if one
-- exists, hasn't been directly observed yet — `raw` means a second migration isn't needed to
-- recover it once it is).
--
-- No natural key is relied on for dedup: like qsr_ebos_daily, the pull script clears each store's
-- pulled date range before re-inserting (QSRSoft reassigns an invoice's posted_date between pulls
-- as a normal correction on their end — see qsrsoft-ebos-pull.mjs's own Mossy Head/#171 comment on
-- the daily table for the exact failure this prevents), so a plain surrogate identity PK is enough.
create table if not exists public.qsr_ebos_line_items (
  id                   bigint generated always as identity primary key,
  loc                  text    not null,               -- 7-digit padded NSN, e.g. '0003708'
  posted_date          date    not null,
  record_type          text,                            -- Purchase | Credit | Adjustment
  wrin                 text,
  description          text,
  invoice_identifier   text,
  ebos_item_id         text,                            -- the API's own line_item_id (falls back to id)
  food_sub             numeric,
  paper_sub            numeric,
  ops_sub              numeric,
  happy_meal_sub       numeric,
  other_sub            numeric,
  total_amount         numeric,
  raw                  jsonb,
  tenant_id            uuid,
  created_at           timestamptz not null default now()
);
create index if not exists qsr_ebos_line_items_loc_date_idx
  on public.qsr_ebos_line_items (loc, posted_date desc);
create index if not exists qsr_ebos_line_items_wrin_idx
  on public.qsr_ebos_line_items (wrin);

alter table public.qsr_ebos_line_items enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_ebos_line_items;
create trigger set_tenant_id_trg before insert on public.qsr_ebos_line_items
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_ebos_line_items: tenant select" on public.qsr_ebos_line_items;
drop policy if exists "qsr_ebos_line_items: tenant insert" on public.qsr_ebos_line_items;
drop policy if exists "qsr_ebos_line_items: tenant update" on public.qsr_ebos_line_items;
drop policy if exists "qsr_ebos_line_items: tenant delete" on public.qsr_ebos_line_items;
create policy "qsr_ebos_line_items: tenant select" on public.qsr_ebos_line_items
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_ebos_line_items: tenant insert" on public.qsr_ebos_line_items
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_ebos_line_items: tenant update" on public.qsr_ebos_line_items
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_ebos_line_items: tenant delete" on public.qsr_ebos_line_items
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream -- but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes (coalesce(current_tenant_id(),
-- owner-tenant-constant) inside set_tenant_id(), per schema-multitenant-phase2-rls.sql).
