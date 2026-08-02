-- Report subscriptions (Notes 49) — per-user saved report configs.
-- One row per user; `subs` is a JSON array of { id, report, scope, period, panels, label }.
-- Fails soft in the app: without this table, subscriptions stay device-local (localStorage).

create table if not exists public.report_subscriptions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  subs       jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.report_subscriptions enable row level security;

-- A user can only see and modify their OWN subscription row.
drop policy if exists rs_select_own on public.report_subscriptions;
create policy rs_select_own on public.report_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists rs_upsert_own on public.report_subscriptions;
create policy rs_upsert_own on public.report_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists rs_update_own on public.report_subscriptions;
create policy rs_update_own on public.report_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists rs_delete_own on public.report_subscriptions;
create policy rs_delete_own on public.report_subscriptions
  for delete using (auth.uid() = user_id);
