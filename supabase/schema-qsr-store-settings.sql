-- ── qsr_store_settings (GET /store_settings/{nsn}/settings?store_busn_dt=...) — per-store config ──
-- Owner-captured live 2026-09-04 while exploring cash-control automation
-- (memory/project-qsrsoft-store-settings-endpoint.md). Distinct endpoint from qsr_store_controls
-- (storewide_controls) -- different host (prod-green.ebos.qsrsoft.com, no /api/ prefix), different
-- payload: drawer/safe/instore cash-handling config (starting drawer bank, safe backup/petty cash,
-- storewide/drawer max cash, deposit validation requirements), plus inventory settings (yield
-- groups, waste limits), homepage-metric thresholds, and full per-channel/per-day-of-week store
-- hours + dayparts.
--
-- Current-state, NOT time-series: this is a CONFIG object, not a daily metric -- one row per
-- store, overwritten on each pull, no date dimension. Pulled weekly (see the pull script's own
-- header), same cadence as qsr_store_controls.
--
-- `settings` stores the FULL raw response as JSONB (same discipline qsr_store_controls already
-- uses -- one live capture is not an inventoried complete shape, so hand-picking columns risks
-- silently dropping fields nobody has looked at yet: fdc_state/misc/storeConfig are captured but
-- not yet used by anything). `cash` is a flattened, stable JSONB slice of just the drawer/safe/
-- instore cash-handling fields (extractCashSettings(), src/engine/store-settings.js) for the
-- current stated interest (owner: "cash-control automation") -- a convenience projection, not a
-- replacement for `settings`. `store_busn_dt` records which date param the pull actually used
-- (see the pull script's header for why that param's real behavior is still unverified).
create table if not exists public.qsr_store_settings (
  loc            text        not null,
  settings       jsonb       not null,
  cash           jsonb,
  store_busn_dt  text,
  tenant_id      uuid,
  updated_at     timestamptz default now(),
  primary key (loc)
);

alter table public.qsr_store_settings enable row level security;

drop trigger if exists set_tenant_id_trg on public.qsr_store_settings;
create trigger set_tenant_id_trg before insert on public.qsr_store_settings
  for each row execute function public.set_tenant_id();

drop policy if exists "qsr_store_settings: tenant select" on public.qsr_store_settings;
drop policy if exists "qsr_store_settings: tenant insert" on public.qsr_store_settings;
drop policy if exists "qsr_store_settings: tenant update" on public.qsr_store_settings;
drop policy if exists "qsr_store_settings: tenant delete" on public.qsr_store_settings;
create policy "qsr_store_settings: tenant select" on public.qsr_store_settings
  for select using (tenant_id = public.current_tenant_id());
create policy "qsr_store_settings: tenant insert" on public.qsr_store_settings
  for insert with check (tenant_id = public.current_tenant_id());
create policy "qsr_store_settings: tenant update" on public.qsr_store_settings
  for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy "qsr_store_settings: tenant delete" on public.qsr_store_settings
  for delete using (tenant_id = public.current_tenant_id());

-- service_role (the pull script) bypasses RLS entirely for reads/writes, same as every other
-- automated stream — but triggers still fire for service-role inserts, so set_tenant_id_trg
-- still stamps tenant_id on every row the pull script writes.
