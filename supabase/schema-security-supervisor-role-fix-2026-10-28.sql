-- ═══════════════════════════════════════════════════════════════════════════════
-- Supervisor role-string fix, qsr_security_events + both identity-reveal RPCs (2026-10-28)
--
-- Live-measured against pg_policies/pg_proc before writing this file, not assumed from the
-- source files alone: `security_rules: admin/supervisor write` and `security_findings: gated
-- read` were ALREADY corrected to ('admin','owner','area_supervisor') by a later migration
-- (schema-security-findings-rls-perf-fix.sql, 2026-10-14) -- that file's own source comment
-- says it couldn't confirm it had been run; it had been. Untouched here, verified not to need
-- it. Still broken, confirmed live: `qsr_security_events: gated read`,
-- `reveal_employee_identity()`, `reveal_employee_identities_bulk()` -- all three still check
-- the literal string 'supervisor', which has never been a valid profiles.role value (the real
-- id is 'area_supervisor'; 'owner' is also missing from all three, a separate same-class gap).
--
-- Owner's own instruction (2026-10-28): "just make it to where it works under either" -- so
-- this does not simply replace 'supervisor' with 'area_supervisor', it accepts BOTH, plus
-- 'owner' for consistency with the two tables already fixed this way. 'supervisor' can never
-- actually be stored (profiles_role_check only allows area_supervisor), so accepting it too is
-- a no-op safety net, not a widening of real access.
--
-- Currently low-impact in practice: only 3 profiles exist in the whole system today (1 admin,
-- 2 manager), so nothing was being wrongly admitted or wrongly denied by this bug yet -- same
-- "dormant, not urgent, still worth fixing" framing as the identical class of bug schema-
-- security-findings-role-fix.sql fixed on 2026-09-16.
--
-- `drop policy if exists` / `create policy` and `create or replace function` are both safe to
-- re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── qsr_security_events: gated read ────────────────────────────────────────────────────────
-- Also applies the same (select get_my_role()) InitPlan wrapping the Oct 14 perf-fix applied
-- to security_findings/security_rules, for the same reason (a bare function call in a USING
-- clause can be re-evaluated per candidate row) -- this table wasn't the one that was timing
-- out, but there's no reason to leave it on the slower, already-known-bad shape.
drop policy if exists "qsr_security_events: gated read" on public.qsr_security_events;
create policy "qsr_security_events: gated read" on public.qsr_security_events
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      (select get_my_role()) in ('admin', 'owner', 'supervisor', 'area_supervisor')
      or (
        (select get_my_role()) = 'manager'
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- ── reveal_employee_identity() ─────────────────────────────────────────────────────────────
-- Unchanged except the role-check line -- same NULL-role-safe IF/ELSIF/ELSE shape the 2026-08-20
-- incident fix established (the reject path stays the unconditional trailing ELSE; do not
-- restructure this into a rejecting ELSIF condition, see schema-identity-vault.sql's own header
-- for why). Same explicit grant/revoke re-applied below -- CREATE OR REPLACE preserves existing
-- grants when the signature is unchanged, but re-stating them matches this file's own established
-- belt-and-suspenders convention for its single most sensitive function.
create or replace function public.reveal_employee_identity(p_token uuid, p_reason text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid    := '00000000-0000-0000-0000-000000000001'::uuid;
  v_role   text    := get_my_role();
  v_reason text     := btrim(coalesce(p_reason, ''));
  v_gm_ok  boolean;
  v_name   text;
begin
  if v_reason = '' then
    raise exception 'reveal_employee_identity: reason is required';
  end if;

  if v_role in ('admin', 'owner', 'supervisor', 'area_supervisor') then
    -- allowed, fall through to the lookup below
  elsif v_role = 'manager' then
    select coalesce((data->>'enabled')::boolean, false) into v_gm_ok
    from public.org_config where key = 'gm_identity_reveal_enabled';
    if not coalesce(v_gm_ok, false) then
      raise exception 'reveal_employee_identity: manager reveal is not enabled for this org';
    end if;
  else
    raise exception 'reveal_employee_identity: role % is not permitted to reveal identities', coalesce(v_role, 'none');
  end if;

  select employee_name into v_name
  from public.employee_identity_vault
  where id = p_token and tenant_id = v_tenant;

  if v_name is null then
    raise exception 'reveal_employee_identity: token not found';
  end if;

  insert into public.identity_reveal_log (tenant_id, person_token, viewer_id, viewer_role, reason)
  values (v_tenant, p_token, auth.uid(), v_role, v_reason);

  return v_name;
end;
$$;

revoke all on function public.reveal_employee_identity(uuid, text) from public;
revoke execute on function public.reveal_employee_identity(uuid, text) from anon;
grant execute on function public.reveal_employee_identity(uuid, text) to authenticated;

comment on function public.reveal_employee_identity(uuid, text) is
  'The ONE path to a real employee name from a token. admin/owner/area_supervisor always allowed (supervisor accepted too, defensively -- never actually stored); manager allowed only if org_config.gm_identity_reveal_enabled is true. Logs every reveal to identity_reveal_log BEFORE returning the name. Reason is required, never optional.';

-- ── reveal_employee_identities_bulk() ──────────────────────────────────────────────────────
-- Mirrors reveal_employee_identity()'s role gate exactly, same reasoning, same NULL-role-safe
-- shape -- unchanged except the role-check line.
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

  if v_role in ('admin', 'owner', 'supervisor', 'area_supervisor') then
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

revoke all on function public.reveal_employee_identities_bulk(uuid[], text) from public;
revoke execute on function public.reveal_employee_identities_bulk(uuid[], text) from anon;
grant execute on function public.reveal_employee_identities_bulk(uuid[], text) to authenticated;
