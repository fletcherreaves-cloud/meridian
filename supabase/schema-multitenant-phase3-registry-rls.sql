-- ============================================================================
-- Meridian — Multi-tenant registry RLS (Phase 3): tenants + tenant_stores
-- ============================================================================
-- Found by the issue #119 table-by-table RLS audit (scripts/rls-table-audit.mjs),
-- which was itself triggered by a report that qsr_fob was returning nothing to
-- the authenticated role. qsr_fob measured HEALTHY (24,156 rows, authenticated
-- read matches service-role exactly, correct tenant_id, unrestricted accessible_
-- locs) — that specific symptom does not currently reproduce. But the audit swept
-- every one of the 82 live tables the same way and found two others with the same
-- SHAPE of bug for real:
--
--   `tenants` and `tenant_stores` (created in schema-multitenant-phase1.sql) were
--   never given an RLS policy of any kind. RLS ended up enabled on both anyway —
--   default-deny, so the authenticated role reads 0 rows on both while service-
--   role sees all 1 / 27. Measured, not assumed:
--     tenants        auth=0  service=1   (2026-08-10, scripts/rls-table-audit.mjs)
--     tenant_stores  auth=0  service=27
--
-- CURRENTLY HARMLESS: `loadTenants()` / `loadTenantStores()` (src/lib/supabase.js)
-- are documented dead scaffolding — "NOT yet wired into the app" per their own
-- comment, and `grep -rn "loadTenants\|loadTenantStores" src/` outside that one
-- file returns nothing. Nothing renders empty today because of this. Fixing it
-- forward now, before either function gets wired into a real panel and produces
-- the exact same "silently empty, nobody notices" report qsr_fob got blamed for.
--
-- Tenant-scoped, matching the Phase 2 pattern exactly (fail closed, not open): a
-- caller sees only their OWN tenant's registry row(s), not every tenant's. In the
-- current single-tenant deployment that's still "see everything" (there's exactly
-- one tenant), so this is a no-op for the owner today and only starts doing real
-- work once a second tenant exists — which is the entire point of a tenant table.
--
-- Idempotent. Safe to run any time. Rollback at the bottom.
-- ============================================================================

alter table public.tenants enable row level security;
drop policy if exists "tenants: own tenant" on public.tenants;
create policy "tenants: own tenant" on public.tenants
  for select using (id = public.current_tenant_id());

alter table public.tenant_stores enable row level security;
drop policy if exists "tenant_stores: own tenant" on public.tenant_stores;
create policy "tenant_stores: own tenant" on public.tenant_stores
  for select using (tenant_id = public.current_tenant_id());

-- ── VERIFY (logged in as the owner; both were 0 before this file) ────────────
--   select count(*) from public.tenants;         -- expect 1
--   select count(*) from public.tenant_stores;    -- expect 27
--
--   Or re-run the live audit: node scripts/rls-table-audit.mjs
--   (expect both to flip from RLS-FILTERED to OK)

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop policy if exists "tenants: own tenant" on public.tenants;
-- drop policy if exists "tenant_stores: own tenant" on public.tenant_stores;
