-- ============================================================================
-- Leadership One-Pager (weekly cascade) — tables + RLS
-- Owner→DO→Supervisor→GM weekly one-pagers with persistent, follow-up-tracked
-- action items. RLS = require-auth (matches Phase 1); Phase 2 per-loc scoping can
-- later tighten via a scope/loc check. Safe to run top-to-bottom; idempotent.
-- Expected result: "Success. No rows returned."
-- ============================================================================

create table if not exists public.one_pagers (
  id          uuid primary key default gen_random_uuid(),
  level       text not null,                    -- owner | do | supervisor | gm
  scope_key   text not null,                    -- stable id for the scope (e.g. 'sup:jane' or a loc-set hash)
  scope_label text,
  locs        jsonb default '[]'::jsonb,
  period      text not null,                    -- e.g. '2026-W30' (ISO week)
  author_id   uuid,
  narrative   text,
  snapshot    jsonb,                            -- computed page model at save time (history)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (level, scope_key, period)
);

create table if not exists public.one_pager_action_items (
  id             uuid primary key default gen_random_uuid(),
  scope_key      text not null,
  thread_key     text,                          -- stable across weeks so an item carries forward
  title          text not null,
  detail         text,
  loc            text,
  metric_key     text,                          -- the metric this item targets (for "did it move?")
  baseline_value numeric,                       -- metric value when the item was created
  target_value   numeric,
  dollar         numeric,                       -- $ opportunity at creation (optional)
  status         text default 'open',           -- open | in_progress | done | dropped
  owner          text,
  created_period text,
  resolved_period text,
  author_id      uuid,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists one_pagers_scope_period_idx on public.one_pagers (scope_key, period);
create index if not exists action_items_scope_idx on public.one_pager_action_items (scope_key, status);

alter table public.one_pagers enable row level security;
alter table public.one_pager_action_items enable row level security;

drop policy if exists "one_pagers: auth all" on public.one_pagers;
create policy "one_pagers: auth all" on public.one_pagers
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "action_items: auth all" on public.one_pager_action_items;
create policy "action_items: auth all" on public.one_pager_action_items
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
