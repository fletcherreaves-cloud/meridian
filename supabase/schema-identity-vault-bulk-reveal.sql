-- ── Bulk identity reveal for the privileged tier — dispatch #50 Part B ─────────────────────────
-- Owner: "how hard would it be to allow my role to see the names without the reveal." Reasoning
-- (do not re-derive, stated once here to match the dispatch): the reveal gate never restrained the
-- owner -- he holds service-role access and can `select employee_name from
-- employee_identity_vault` directly. Requiring a click plus a typed reason is friction on the one
-- person it cannot constrain. But the gate and the log are SEPARABLE, and only the gate is
-- theatre -- the log stays, for real reasons (a second operator is a stated deployment plan and
-- this is the pattern that ships to them; these findings can lead to employee discipline, where a
-- record of who looked at what and when is evidence of a fair process; it costs nothing once it
-- is not a click). So: auto-resolve for the privileged tier (admin -- the only real DB role value
-- "Developer/Admin/Owner" collapses to, per CLAUDE.md's own documented finding that
-- profiles.role's check constraint allows exactly admin/supervisor/manager, nothing else), still
-- logged, with a synthetic reason. GM/Supervisor/DO/manager keep the click-through path
-- unchanged -- this is additive only.
--
-- ── Log granularity, decided deliberately, not defaulted ───────────────────────────────────────
-- Auto-resolving on every panel load would write one row per token per view -- a hundred findings
-- means a hundred rows every time the panel opens, and the log is unreadable within a week.
-- ONE row per session-view, recording the token COUNT, is far more usable and still answers "who
-- saw names, when." identity_reveal_log.person_token is `not null` and FK-constrained to
-- employee_identity_vault(id) -- a count-style row (no single token to point at) needs person_token
-- to be nullable, so this is a real schema change, made here explicitly rather than smuggled in by
-- forcing the first token into the column. A check constraint keeps the table from ever holding a
-- genuinely empty row (no token AND no count).
alter table public.identity_reveal_log alter column person_token drop not null;
alter table public.identity_reveal_log add column if not exists token_count integer;
alter table public.identity_reveal_log
  drop constraint if exists identity_reveal_log_person_or_count;
alter table public.identity_reveal_log
  add constraint identity_reveal_log_person_or_count
  check (person_token is not null or token_count is not null);

comment on column public.identity_reveal_log.token_count is
  'Set ONLY on a bulk reveal row (person_token is null in that case) -- the number of tokens resolved in one reveal_employee_identities_bulk() call. A single-token reveal_employee_identity() row still sets person_token and leaves this null, unchanged from before this migration.';

-- ── reveal_employee_identities_bulk() ──────────────────────────────────────────────────────────
-- Mirrors reveal_employee_identity()'s role gate EXACTLY -- same three branches, same trailing
-- unconditional ELSE that raises. This is deliberate, not copy-paste laziness: the incident this
-- file's sibling function shipped (incident-reveal-rpc-null-role-bypass-2026-08-20.md) was a
-- restructured ELSIF that let a NULL role (get_my_role() returning NULL for an unauthenticated
-- caller) fall through untouched. The fix there was "the reject path must always be the
-- unconditional final ELSE so a NULL role can never skip it" -- that lesson is encoded directly
-- into this function's shape, not just remembered.
--
-- Returns a token -> name TABLE (not a map/jsonb) -- callers filter it themselves; empty p_tokens
-- returns an empty result set with no log row (nothing was actually revealed, nothing to audit).
-- Never returns a name for a token outside p_tokens, and never returns more rows than requested
-- tokens exist in the vault -- an unknown/garbage token is silently absent from the result, same
-- as the single-token RPC's own "token not found" -> exception behavior would be too strict here
-- (one bad token in a batch of 50 should not fail the other 49).
create or replace function public.reveal_employee_identities_bulk(p_tokens uuid[], p_reason text)
returns table(token uuid, employee_name text)
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid    := '00000000-0000-0000-0000-000000000001'::uuid;
  v_role   text    := get_my_role();
  v_reason text     := btrim(coalesce(p_reason, ''));
  v_gm_ok  boolean;
  v_count  integer;
begin
  if v_reason = '' then
    raise exception 'reveal_employee_identities_bulk: reason is required';
  end if;

  if v_role in ('admin', 'supervisor') then
    -- allowed, fall through to the lookup below
  elsif v_role = 'manager' then
    select coalesce((data->>'enabled')::boolean, false) into v_gm_ok
    from public.org_config where key = 'gm_identity_reveal_enabled';
    if not coalesce(v_gm_ok, false) then
      raise exception 'reveal_employee_identities_bulk: manager reveal is not enabled for this org';
    end if;
  else
    raise exception 'reveal_employee_identities_bulk: role % is not permitted to reveal identities', coalesce(v_role, 'none');
  end if;

  if p_tokens is null or array_length(p_tokens, 1) is null then
    return; -- nothing requested, nothing to log, nothing to return
  end if;

  select count(*) into v_count from unnest(p_tokens);

  insert into public.identity_reveal_log (tenant_id, person_token, token_count, viewer_id, viewer_role, reason)
  values (v_tenant, null, v_count, auth.uid(), v_role, v_reason);

  return query
  select v.id, v.employee_name
  from public.employee_identity_vault v
  where v.id = any(p_tokens) and v.tenant_id = v_tenant;
end;
$$;

-- Same explicit grant/revoke pattern as reveal_employee_identity() -- `revoke ... from public`
-- alone was NOT sufficient in production for that function (the incident's own root-cause probe
-- found the anon key could invoke it at all, reaching the internal P0001 exception rather than a
-- permission-denied error, consistent with Supabase's project-level default privileges granting
-- EXECUTE directly to the `anon` role on newly created functions in this schema). The explicit
-- `revoke ... from anon` below closes that same gap here regardless of the precise mechanism, and
-- the restructured role-gate above is the real backstop either way.
revoke all on function public.reveal_employee_identities_bulk(uuid[], text) from public;
revoke execute on function public.reveal_employee_identities_bulk(uuid[], text) from anon;
grant execute on function public.reveal_employee_identities_bulk(uuid[], text) to authenticated;

comment on function public.reveal_employee_identities_bulk(uuid[], text) is
  'Bulk token -> name resolution for the privileged reveal tier (dispatch #50 Part B). Same role gate as reveal_employee_identity(); logs ONE row per call with a token_count, not one row per token. Never returns or logs a plaintext name outside its own return table -- no name in an error message, ever.';
