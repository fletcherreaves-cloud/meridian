-- ── qsr_store_controls (GET /api/controls/{nsn}/storewide_controls) — per-store config ─────────
-- Discovered 2026-07-26 (memory/project-qsrsoft-controls-endpoint.md), never built until now.
-- Real per-store loss-prevention thresholds, discount %s, tax tables, and user-defined metric
-- targets straight from what the owner actually configured in QSRSoft -- today several of these
-- (T-Red/HALO/skim thresholds, discount %s) are ASSUMED constants in the Signal registry /
-- DEFAULT_TARGETS. This table is the real per-store source of truth to eventually replace them.
--
-- Current-state, NOT time-series: this is a CONFIG object (RFMControls, VarianceControls,
-- CashControls, UserDefinedMetrics, SafeCountControls, DrawerBanks, tax tables, daypart windows),
-- not a daily metric -- config changes rarely, so one row per store, overwritten on each pull, no
-- date dimension. Pulled weekly, not daily (see the pull script's own header).
--
-- Stored as a single JSONB blob (the full raw response), not decomposed into named columns.
-- Deliberate: the memory finding above captured a curated list of the valuable fields from one
-- live response, not the endpoint's full/complete shape -- hand-picking columns now risks silently
-- dropping fields nobody has looked at yet (SafeCountControls/DrawerBanks/SpareDrawers/
-- DepositSettings are named but never inventoried in the finding). A JSONB blob preserves
-- everything the endpoint returns; a consumer reads config->'RFMControls'->>'tred_before_total_amount'
-- etc. Same discipline qsr_cash_sheet/qsr_labor_summary already use for their own flexible
-- reporting-API payloads (a `metrics` jsonb column, not one column per selectCols field).
create table if not exists public.qsr_store_controls (
  loc         text        not null,
  config      jsonb       not null,
  tenant_id   uuid,
  updated_at  timestamptz default now(),
  primary key (loc)
);

alter table public.qsr_store_controls enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_store_controls;
create trigger set_tenant_id_trg before insert on public.qsr_store_controls
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_store_controls: tenant select" on public.qsr_store_controls;
drop policy if exists "qsr_store_controls: tenant insert" on public.qsr_store_controls;
drop policy if exists "qsr_store_controls: tenant update" on public.qsr_store_controls;
drop policy if exists "qsr_store_controls: tenant delete" on public.qsr_store_controls;
create policy "qsr_store_controls: tenant select" on public.qsr_store_controls
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_store_controls: tenant insert" on public.qsr_store_controls
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_store_controls: tenant update" on public.qsr_store_controls
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_store_controls: tenant delete" on public.qsr_store_controls
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream — but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
