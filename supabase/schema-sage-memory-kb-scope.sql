-- ─────────────────────────────────────────────────────────────────────────────
-- sage_memory_kb — add the product/tenant knowledge-scope classification
-- memory/plan-knowledge-backbone-2026-11-03.md §3 (task #70).
--
-- Orthogonal to the existing `sensitivity` column: sensitivity gates by the CALLER'S ROLE
-- within one org (open/restricted); `scope` gates by WHICH TENANT the knowledge belongs to,
-- independent of role.
--   'product' — generic, reusable knowledge (how a QSRSoft term works, how a panel computes
--               something, the 4am business-day boundary). Safe to share with every tenant.
--   'tenant'  — this operator's own proprietary operational knowledge (named people, specific
--               vendor relationships, specific district decisions). Visible only to the tenant
--               it belongs to. THIS IS THE DEFAULT — fail toward privacy, same direction the
--               existing `sensitivity` NOT NULL + CHECK already fails toward.
--
-- A no-op for today's single-tenant deployment: every existing row backfills to 'tenant', every
-- existing row's tenant_id already matches the one tenant that exists, so nothing visible to
-- anyone changes. This closes the gap before a second tenant's onboarding, same spirit as the
-- tenant_id query-filter fix (v5.613) this migration's sibling.
--
-- ⚠️  RUN THIS MANUALLY in the Supabase SQL editor. Per this repo's standing rule, DDL is the
-- owner's own action — never run automatically by an agent session.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.sage_memory_kb
  add column if not exists scope text not null default 'tenant' check (scope in ('product','tenant'));

create index if not exists sage_memory_kb_scope_idx on public.sage_memory_kb (scope);
