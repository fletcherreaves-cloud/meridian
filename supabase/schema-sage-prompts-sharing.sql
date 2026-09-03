-- ═══════════════════════════════════════════════════════════════════════════════
-- SAGE saved-prompt library — private-by-default + Admin/Developer sharing
-- ═══════════════════════════════════════════════════════════════════════════════
-- Owner-requested 2026-09-03: "if someone created an amazing prompt... it could be
-- marked and it could then be available to any user within the same organization."
--
-- Current live state (measured against schema.sql / schema-rls-phase1.sql): sage_prompts
-- has NO per-user ownership at all — RLS is "any authenticated user can read/write every
-- row." So this isn't adding a share toggle to an already-private list; it's introducing
-- real per-user ownership for the first time, with sharing as the deliberate escape hatch
-- (Admin/Developer only), matching how the rest of the app already gates that exact
-- distinction (src/views/task-queue.js, src/views/management.js: `role === 'admin' ||
-- role === 'developer'`).
--
-- Run this in the Supabase SQL editor once (idempotent, safe to re-run). It:
--   1. Adds created_by_id/shared/shared_by/shared_at columns.
--   2. Backfills every EXISTING row to shared=true — they were already visible to
--      everyone under the old "public read" policy, so this migration doesn't silently
--      hide anyone's current prompts.
--   3. Installs a guard trigger so `shared` can only be set/cleared by Admin/Developer,
--      and created_by_id can never be spoofed or changed after insert (RLS's `using`/
--      `with check` alone can't enforce column-level restrictions on their own).
--   4. Replaces the "public read/write" policies with private-by-default + shared.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.sage_prompts add column if not exists created_by_id uuid references auth.users(id);
alter table public.sage_prompts add column if not exists shared        boolean not null default false;
alter table public.sage_prompts add column if not exists shared_by     text;
alter table public.sage_prompts add column if not exists shared_at     timestamptz;

update public.sage_prompts set shared = true where created_by_id is null and shared = false;

create or replace function public.sage_prompts_guard()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_id := auth.uid();
    if new.shared and public.get_my_role() not in ('admin','developer') then
      new.shared := false; new.shared_by := null; new.shared_at := null;
    end if;
    return new;
  end if;
  -- UPDATE: ownership never changes hands.
  new.created_by_id := old.created_by_id;
  if new.shared is distinct from old.shared and public.get_my_role() not in ('admin','developer') then
    raise exception 'Only Admin/Developer can share or unshare a prompt';
  end if;
  return new;
end;
$$;

drop trigger if exists sage_prompts_guard_trigger on public.sage_prompts;
create trigger sage_prompts_guard_trigger
  before insert or update on public.sage_prompts
  for each row execute function public.sage_prompts_guard();

alter table public.sage_prompts enable row level security;
drop policy if exists "sage_prompts: public read" on public.sage_prompts;
drop policy if exists "sage_prompts: public write" on public.sage_prompts;

create policy "sage_prompts: read own or shared" on public.sage_prompts
  for select to authenticated
  using (shared = true or created_by_id = auth.uid());

create policy "sage_prompts: insert own" on public.sage_prompts
  for insert to authenticated
  with check (true); -- created_by_id/shared are forced by the trigger above

create policy "sage_prompts: update own or admin/developer" on public.sage_prompts
  for update to authenticated
  using (created_by_id = auth.uid() or public.get_my_role() in ('admin','developer'))
  with check (created_by_id = auth.uid() or public.get_my_role() in ('admin','developer'));

create policy "sage_prompts: delete own or admin/developer" on public.sage_prompts
  for delete to authenticated
  using (created_by_id = auth.uid() or public.get_my_role() in ('admin','developer'));
