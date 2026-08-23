-- ─────────────────────────────────────────────────────────────────────────────
-- sage_memory_kb — curated memory/ corpus, chunked, for SAGE's search_project_memory tool
-- Dispatch #80. Mirrors the existing qsrsoft_kb table-plus-tool pattern (id/title/body_text +
-- an ILIKE-OR search tool), with two differences qsrsoft_kb does not need:
--   1. tenant_id + tenant-scoped RLS. qsrsoft_kb is vendor documentation — shared, global,
--      correctly `using (true)`. This table can carry personnel-adjacent narrative
--      (loss-prevention findings, investigation writeups), so it is tenant-scoped like every
--      other data table, even in today's single-tenant deployment (sage-chat itself queries via
--      the service-role key, which bypasses RLS — this is defense in depth for any future
--      non-service-role reader, and keeps the table honest about what it holds).
--   2. `sensitivity` — REQUIRED, checked at the DB level, not just at ingest time. Only 'open'
--      and 'restricted' rows ever exist here: 'excluded' documents (CLAUDE.md, the 63
--      dispatches, anything with no frontmatter classification) are never ingested at all, so
--      there is no 'excluded' value to filter at query time.
--
-- Written by scripts/sage-memory-ingest.mjs, run DELIBERATELY (never an automatic sync on
-- commit — shipping a file into SAGE's reach is itself the review gate). Read by
-- supabase/functions/sage-chat/index.ts's search_project_memory tool, gated server-side in the
-- query (see memory-kb.js's qualifiesForRestricted/rowVisible) — never by a prompt instruction.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sage_memory_kb (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  filename     text not null,              -- e.g. 'finding-padding-and-cash-hunt-2026-08-13.md' -- SAGE cites this
  title        text not null,               -- frontmatter `name:`, or the file's first H1
  sensitivity  text not null check (sensitivity in ('open','restricted')),
  chunk_index  int  not null default 0,
  chunk_text   text not null,
  updated_at   timestamptz not null default now(),  -- source file's last-modified (git), not ingest time
  ingested_at  timestamptz not null default now(),
  unique(tenant_id, filename, chunk_index)
);

create trigger set_tenant_id_trg before insert on public.sage_memory_kb
  for each row execute function public.set_tenant_id();

alter table public.sage_memory_kb enable row level security;
create policy tenant_select on public.sage_memory_kb for select using (tenant_id = public.current_tenant_id());
create policy tenant_insert on public.sage_memory_kb for insert with check (tenant_id = public.current_tenant_id());
create policy tenant_update on public.sage_memory_kb for update using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tenant_delete on public.sage_memory_kb for delete using (tenant_id = public.current_tenant_id());

create index if not exists sage_memory_kb_filename_idx on public.sage_memory_kb (filename);
create index if not exists sage_memory_kb_sensitivity_idx on public.sage_memory_kb (sensitivity);
create index if not exists sage_memory_kb_search_idx on public.sage_memory_kb
  using gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(chunk_text,'')));
