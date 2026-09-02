-- ── qsr_product_outage (GET /reporting/v2/product/outages) — the cheapest pull in the catalog ──
-- Backlog item K (memory/data-acquisition-shopping-list.md): "27 stores x 14 days in a single
-- HTTP request." Nothing else in Meridian can express an out-of-stock/unavailable-item event
-- today; joined to qsr_product_mix on (loc, dt, item) this turns "Fried Apple Pie was flagged
-- unavailable at five stores" into lost-sales dollars at each store's own sell rate.
--
-- ⚠️ An outage row is a manager's POS action, NOT a measured out-of-stock (owner, 2026-08-15;
-- vendor KB confirms — "often because a machine is not working or needs to be cleaned"). There is
-- no reason code on the record. Never label this "out of stock" downstream; cause must be
-- inferred from clustering, permanently. Lost sales is valid regardless of cause, which is why
-- it's the right first thing to build on top of this table (not built in this pull — see the
-- pull script's own header for what's deliberately out of scope here).
--
-- reportType=allOutages, NOT currentOutages — allOutages WHERE restored_ts IS NULL reconciles
-- exactly to currentOutages (verified live, memory/qsrsoft-report-catalog.md), and currentOutages
-- alone undercounts real volume by ~12x (it's only the still-open tail).
--
-- PK is (loc, dt, item, outage_ts), NOT (loc, dt, item) — an item can go out, get restored, and go
-- out again in the same day (same trap #292's (loc,date,item) key hit before measurement showed
-- it silently dropped 29% of rows).
--
-- outage_ts/restored_ts are stored WITHOUT a timezone deliberately: the raw QSRSoft timestamp is a
-- per-store hourly POLL time (every 3708 row ends ':48', every 5183 row ends ':23' — outage AND
-- restore alike, every duration a whole number of hours), not the actual moment a manager acted,
-- and it carries no timezone marker from the API. Attaching a UTC/local timezone would fabricate
-- precision this feed doesn't have; a plain naive timestamp keeps the ±1h honesty explicit.
create table if not exists public.qsr_product_outage (
  loc            text        not null,             -- NSN, zero-padded to 7 chars (matches project convention)
  dt             date        not null,
  item           integer     not null,              -- menuItemNumber -- NEVER join/dedupe on description (parallel item-number sets share one product name)
  outage_ts      timestamp   not null,              -- naive, per-store hourly poll time -- see header
  restored_ts    timestamp,                          -- null = still open as of the pull that wrote this row
  descr          text,
  family_group   text,
  tenant_id      uuid,
  updated_at     timestamptz default now(),
  primary key (loc, dt, item, outage_ts)
);
create index if not exists qsr_product_outage_loc_item_idx on public.qsr_product_outage (loc, item);
create index if not exists qsr_product_outage_open_idx on public.qsr_product_outage (loc, dt) where restored_ts is null;

alter table public.qsr_product_outage enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_product_outage;
create trigger set_tenant_id_trg before insert on public.qsr_product_outage
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_product_outage: tenant select" on public.qsr_product_outage;
drop policy if exists "qsr_product_outage: tenant insert" on public.qsr_product_outage;
drop policy if exists "qsr_product_outage: tenant update" on public.qsr_product_outage;
drop policy if exists "qsr_product_outage: tenant delete" on public.qsr_product_outage;
create policy "qsr_product_outage: tenant select" on public.qsr_product_outage
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_product_outage: tenant insert" on public.qsr_product_outage
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_product_outage: tenant update" on public.qsr_product_outage
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_product_outage: tenant delete" on public.qsr_product_outage
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream — but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
