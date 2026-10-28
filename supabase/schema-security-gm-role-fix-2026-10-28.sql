-- ═══════════════════════════════════════════════════════════════════════════════
-- Recognize 'gm' as its own role for identity-reveal gating (owner decision, 2026-10-28)
--
-- Companion to schema-security-supervisor-role-fix-2026-10-28.sql, same day. Every place that
-- gates "manager allowed only if org_config.gm_identity_reveal_enabled is true" literally checked
-- role = 'manager' and never role = 'gm' -- the real General Manager role id (src/engine/
-- permissions.js's DEFAULT_ROLES). A real gm-role account would have been silently denied even
-- with the toggle on.
--
-- Owner's own words: "we need to differentiate GM from other manager levels, but let me still
-- override access in settings." Both halves matter: 'gm' is now named explicitly (not lumped
-- into a catch-all with sm_am_dm/om/do/vp, which still correctly fall through to denied) -- that
-- is the "differentiate" half. 'manager' stays in the SAME toggle-gated branch, not replaced by
-- 'gm' -- the owner's own two live accounts are role='manager', and narrowing this to 'gm' alone
-- would have silently revoked the access just granted. The existing org_config.
-- gm_identity_reveal_enabled toggle remains the "override in settings" he asked to keep.
--
-- `drop policy if exists` / `create policy` and `create or replace function` are both safe to
-- re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── qsr_security_events: gated read ────────────────────────────────────────────────────────
drop policy if exists "qsr_security_events: gated read" on public.qsr_security_events;
create policy "qsr_security_events: gated read" on public.qsr_security_events
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      (select get_my_role()) in ('admin', 'owner', 'supervisor', 'area_supervisor')
      or (
        (select get_my_role()) in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- ── security_findings: gated read ──────────────────────────────────────────────────────────
drop policy if exists "security_findings: gated read" on public.security_findings;
create policy "security_findings: gated read" on public.security_findings
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      (select get_my_role()) in ('admin', 'owner', 'area_supervisor')
      or (
        (select get_my_role()) in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- ── reveal_employee_identity() ─────────────────────────────────────────────────────────────
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
  elsif v_role in ('manager', 'gm') then
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
  'The ONE path to a real employee name from a token. admin/owner/area_supervisor always allowed (supervisor accepted too, defensively -- never actually stored); manager or gm allowed only if org_config.gm_identity_reveal_enabled is true. Logs every reveal to identity_reveal_log BEFORE returning the name. Reason is required, never optional.';

-- ── reveal_employee_identities_bulk() ──────────────────────────────────────────────────────
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
  elsif v_role in ('manager', 'gm') then
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
