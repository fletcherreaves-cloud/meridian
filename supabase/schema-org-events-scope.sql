-- Dispatch24 Workstream B — event scope + recurrence (#388).
-- Run AFTER schema-org-events.sql, schema-multitenant-phase1.sql, schema-multitenant-phase2-rls.sql,
-- and schema-rls-phase2-loc.sql (all already applied in production — org_events is on every one
-- of those tables' lists).
--
-- Problem (confirmed by reading org_events' schema + both write paths, not just the plan doc):
--   org_events' PK is unique(loc, date_start, label), loc not null -- a district-wide event
--   (Thanksgiving, a tax-free weekend) structurally requires one row per store. Both write paths
--   materialize that way today: applyEventToStores (src/features/calendar.js, manual multi-store
--   tagging) and expandRetailEvents->saveOrgEvents (src/engine/retail-events.js, rule-based). This
--   is "27 copies of Thanksgiving," and the scale problem Workstream B exists to fix: the rule
--   engine alone is about to grow the real event count from ~733 to ~11,000+ rows.
--
-- Design (memory/dispatch24-event-scope-design.md has the full writeup + both open questions'
-- answers): one event row + scope, expanded to per-store entries only on READ
-- (orgEventsToDayMap), never materialized to N rows again -- the RFC 5545 (iCalendar) model: one
-- scoped instance + per-store EXCEPTION rows for overrides, not N copies of the whole event.
--
-- ── RLS -- verified against the LIVE policies, not the original (superseded) schema-org-events.sql
-- ones. schema-multitenant-phase2-rls.sql's do-block DROPPED every pre-existing policy on
-- org_events (including schema-org-events.sql's own "org_events: read/write scoped") and replaced
-- them with tenant-only PERMISSIVE policies (tenant_select/insert/update/delete, gated on
-- tenant_id = current_tenant_id()). schema-rls-phase2-loc.sql then layered a per-store
-- RESTRICTIVE policy ("org_events_loc_scope") on top: `(select my_locs()) is null or
-- ltrim(loc,'0') in (select unnest((select my_locs())))`. RESTRICTIVE policies AND with every
-- permissive one -- that's what actually enforces accessible_locs today, not the original
-- schema-org-events.sql text (dead code in production since Phase 2 ran).
--
-- That restrictive/permissive split is load-bearing (schema-rls-phase2-loc.sql's own comment:
-- "a permissive per-loc policy beside the tenant ones would GRANT more access, not less"). So the
-- fix here does NOT add a new permissive policy (that would OR against tenant_select and could
-- leak cross-tenant rows past a scope-only check). It REPLACES the one existing restrictive
-- policy on org_events with a version that also handles scope<>'store' rows, keeping it
-- restrictive and keeping every other table's identical policy (created by the same do-block)
-- completely untouched.
--
-- scope!='store' rows get a synthetic loc sentinel ('*ALL*', '*STATE:OK*', '*LIST:<sorted
-- locs>*') that can never collide with a real (numeric) store loc, so org_events' existing
-- unique(loc, date_start, label) constraint and every existing upsert/onConflict call keep
-- working completely unchanged for scope='store' rows (the ~2,708 existing ones). A new
-- scope_locs text[] column carries the REAL resolved store list for scope<>'store' rows, and the
-- restrictive policy checks scope_locs overlap against my_locs() for those instead of loc.

alter table public.org_events
  add column if not exists scope       text not null default 'store' check (scope in ('store','state','all','list')),
  add column if not exists scope_state text,                 -- 'OK' / 'FL', only meaningful when scope='state'
  add column if not exists scope_locs  text[];                -- resolved store list, only meaningful when scope<>'store'

comment on column public.org_events.scope is
  'store (default, unchanged behavior, one row per store) | state | all | list -- see schema-org-events-scope.sql header';
comment on column public.org_events.scope_locs is
  'Resolved store list for scope<>''store'' rows (unpadded locs, matching org_events.loc''s existing convention). Snapshotted at write time by collapseScopedEvents() -- re-run the generator (retail events / a bulk re-tag) to pick up a roster change (new store opened, etc). Null for scope=''store'' rows.';

-- Replace the ONE existing restrictive policy on org_events (created by schema-rls-phase2-loc.sql's
-- generic do-block) with a scope-aware version. Every other table that do-block touched is
-- untouched -- this targets org_events by name only.
drop policy if exists org_events_loc_scope on public.org_events;
create policy org_events_loc_scope on public.org_events as restrictive for all to authenticated
  using (
    (select public.my_locs()) is null
    or case when scope = 'store'
         then ltrim(loc, '0') in (select unnest((select public.my_locs())))
         else exists (
           select 1 from unnest(scope_locs) as sl
           where ltrim(sl, '0') in (select unnest((select public.my_locs())))
         )
       end
  )
  with check (
    (select public.my_locs()) is null
    or case when scope = 'store'
         then ltrim(loc, '0') in (select unnest((select public.my_locs())))
         else exists (
           select 1 from unnest(scope_locs) as sl
           where ltrim(sl, '0') in (select unnest((select public.my_locs())))
         )
       end
  );

-- ── Per-store overrides for a scoped event (open design question #1) ───────────────────────────
-- "If a district-wide event is edited for one store (a GM marks it canceled locally, or adjusts
-- expected impact), where does that live?" -- an exception row keyed by (event_id, loc), the RFC
-- 5545 answer. Its OWN table rather than a column on org_events: it is inherently per-store, so it
-- can reuse the SAME two-layer pattern (tenant-scoped permissive CRUD + per-loc restrictive) every
-- other loc-keyed table already uses, unmodified -- no scope-branching needed here at all, unlike
-- org_events itself. orgEventsToDayMap() (src/engine/events-import.js) is the only reader that
-- needs to know about this table; forecastDay/computeEventFactors stay untouched, per the
-- dispatch's explicit constraint -- they only ever see the already-expanded, already-exception-
-- applied day map.
create table if not exists public.org_event_exceptions (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  event_id    bigint not null references public.org_events(id) on delete cascade,
  loc         text not null,
  status      text not null default 'canceled' check (status in ('canceled','modified')),
  overrides   jsonb,                 -- only used when status='modified', e.g. {"expectedSalesDelta": 250}
  note        text,
  entered_by  text,
  entered_at  timestamptz default now(),
  unique (event_id, loc)
);
create index if not exists org_event_exceptions_event_idx on public.org_event_exceptions (event_id);

drop trigger if exists set_tenant_id_trg on public.org_event_exceptions;
create trigger set_tenant_id_trg before insert on public.org_event_exceptions
  for each row execute function public.set_tenant_id();

alter table public.org_event_exceptions enable row level security;

drop policy if exists tenant_select on public.org_event_exceptions;
drop policy if exists tenant_insert on public.org_event_exceptions;
drop policy if exists tenant_update on public.org_event_exceptions;
drop policy if exists tenant_delete on public.org_event_exceptions;
create policy tenant_select on public.org_event_exceptions for select using (tenant_id = public.current_tenant_id());
create policy tenant_insert on public.org_event_exceptions for insert with check (tenant_id = public.current_tenant_id());
create policy tenant_update on public.org_event_exceptions for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tenant_delete on public.org_event_exceptions for delete using (tenant_id = public.current_tenant_id());

drop policy if exists org_event_exceptions_loc_scope on public.org_event_exceptions;
create policy org_event_exceptions_loc_scope on public.org_event_exceptions as restrictive for all to authenticated
  using ( (select public.my_locs()) is null or ltrim(loc, '0') in (select unnest((select public.my_locs()))) )
  with check ( (select public.my_locs()) is null or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select policyname, permissive from pg_policies where tablename='org_events';
--     -- expect: tenant_select/insert/update/delete (PERMISSIVE), org_events_loc_scope (RESTRICTIVE)
--   select policyname, permissive from pg_policies where tablename='org_event_exceptions';
--     -- expect the same 5-policy shape
