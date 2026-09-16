-- ═══════════════════════════════════════════════════════════════════════════════
-- sage_prompts_guard role-check correction (RBAC audit, 2026-09-16)
--
-- schema-sage-prompts-sharing.sql's guard trigger + RLS policies checked
-- `my_role not in ('admin','developer')` / `get_my_role() in ('admin','developer')`.
-- 'developer' has never been a real profiles.role value (the live check constraint
-- allows admin/owner/vp/do/om/area_supervisor/gm/sm_am_dm/manager, dispatch #148) --
-- so in practice this guard has only ever admitted 'admin', silently excluding
-- 'owner' from the "Admin/Developer" tier the feature's own comment and
-- src/views/sage.js's canShare say it should include (same class of bug as
-- schema-security-findings-role-fix.sql, same session).
--
-- Currently low-impact: the one live profile is role='admin', so sharing already
-- works for it; this closes the gap for when a real owner-role profile exists.
-- `create or replace function`/`create policy` (after `drop policy if exists`) are
-- both safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.sage_prompts_guard()
returns trigger language plpgsql security definer as $$
declare
  my_role text := coalesce(public.get_my_role(), '');
begin
  if tg_op = 'INSERT' then
    new.created_by_id := auth.uid();
    if new.shared and my_role not in ('admin','owner') then
      new.shared := false; new.shared_by := null; new.shared_at := null;
    end if;
    return new;
  end if;
  new.created_by_id := old.created_by_id;
  if new.shared is distinct from old.shared and my_role not in ('admin','owner') then
    raise exception 'Only Admin/Owner can share or unshare a prompt';
  end if;
  return new;
end;
$$;

drop policy if exists "sage_prompts: update own or admin/developer" on public.sage_prompts;
create policy "sage_prompts: update own or admin/developer" on public.sage_prompts
  for update to authenticated
  using (created_by_id = auth.uid() or public.get_my_role() in ('admin','owner'))
  with check (created_by_id = auth.uid() or public.get_my_role() in ('admin','owner'));

drop policy if exists "sage_prompts: delete own or admin/developer" on public.sage_prompts;
create policy "sage_prompts: delete own or admin/developer" on public.sage_prompts
  for delete to authenticated
  using (created_by_id = auth.uid() or public.get_my_role() in ('admin','owner'));
