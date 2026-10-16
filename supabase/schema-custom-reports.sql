-- ── Custom Report Builder definitions (Reports redesign Phase 4, 2026-10-16) ─────────────────
-- Owner's ask, verbatim (memory/project-reports-redesign.md): "select the various metrics we
-- have available... side-by-side to be able to build a custom report and save it out within the
-- reporting system... under its own subtitled section of customized reporting." A definition is
-- just WHICH metrics + a name + whether it's shared -- not a cache of computed values. Running a
-- saved definition still resolves every metric live, through the same metricValueForRange() path
-- every other report uses, scoped to whatever `ds` the viewer's own session already loaded.
--
-- Owner decision (2026-10-15, decision 2 in the Phase 1-4 proposal): Custom Reports are
-- SHAREABLE ACROSS ROLES, not personal-only -- a DO/Owner can build one and a GM can run it. The
-- report DEFINITION (which metrics) is shareable; the DATA each viewer sees stays scoped to
-- their own accessible_locs regardless of who authored the definition -- this table grants NO
-- data access by itself, which is why it carries no `loc` column and no my_locs() restrictive
-- policy (contrast schema-pay-events.sql, which does, since pay_events rows ARE per-store data).
create table if not exists public.custom_reports (
  id               uuid             not null default gen_random_uuid() primary key,
  name             text             not null,
  -- Ordered array of signal-registry.js METRIC_CATEGORIES keys -- array order is COLUMN order
  -- in the rendered report, so this is not just a set.
  metric_keys      jsonb            not null default '[]'::jsonb,
  shared           boolean          not null default false,
  created_by       uuid             not null references auth.users(id) on delete cascade,
  -- Free-text snapshot of the author's display name/email at save time, same "no join needed to
  -- show a human label" convention pay_events.sql's employee_label uses -- a shared report must
  -- still show who built it even if the author's own profile later changes or is removed.
  created_by_label text             not null default '',
  tenant_id        uuid             not null default '00000000-0000-0000-0000-000000000001',
  created_at       timestamptz      not null default now(),
  updated_at       timestamptz      not null default now()
);

create index if not exists custom_reports_owner_idx on public.custom_reports (created_by, updated_at desc);
create index if not exists custom_reports_shared_idx on public.custom_reports (tenant_id, shared) where shared = true;

alter table public.custom_reports enable row level security;

-- Baseline tenant isolation -- same literal pattern as every other tenant-scoped table
-- (schema-pay-events.sql et al.), single-tenant hardcoded default per CLAUDE.md's current state.
drop policy if exists custom_reports_tenant on public.custom_reports;
create policy custom_reports_tenant on public.custom_reports
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Visibility, ANDed with the tenant policy above (RESTRICTIVE, select only): a definition is
-- visible to its own author, OR to anyone when marked shared. Sharing the DEFINITION never
-- widens what DATA a viewer can pull -- that boundary is enforced entirely client-side, by the
-- same accessible_locs scoping every other panel's own `ds` already respects; this table has no
-- row-level data to leak.
drop policy if exists custom_reports_select on public.custom_reports;
create policy custom_reports_select on public.custom_reports
  as restrictive for select to authenticated
  using (created_by = auth.uid() or shared = true);

-- Writes are OWNER-ONLY regardless of sharing -- a GM who can RUN a shared report built by a DO
-- must not be able to edit or delete it. `with check` on insert additionally stops a caller from
-- inserting a row claiming someone else's created_by.
drop policy if exists custom_reports_insert on public.custom_reports;
create policy custom_reports_insert on public.custom_reports
  as restrictive for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists custom_reports_update on public.custom_reports;
create policy custom_reports_update on public.custom_reports
  as restrictive for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists custom_reports_delete on public.custom_reports;
create policy custom_reports_delete on public.custom_reports
  as restrictive for delete to authenticated
  using (created_by = auth.uid());

comment on table public.custom_reports is
  'Saved Custom Report Builder definitions (Reports redesign Phase 4, owner request 2026-10-15) -- which metric_keys, in column order, under a name. Shareable across roles (shared=true): any authenticated user in the tenant can SELECT and run it, but only created_by can write. Grants no data access by itself -- a viewer running a shared definition still only sees their own accessible_locs-scoped data.';
