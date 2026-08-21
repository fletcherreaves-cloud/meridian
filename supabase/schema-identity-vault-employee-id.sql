-- ── Identity vault Phase 1 (dispatch #49/#53, memory/finding-phase0-gate-result-2026-08-21.md) ──
-- Phase 0's gate cleared with room to spare (G=0 genuinely-ID-less names, against a 25-name
-- ceiling) -- this is dispatch #49's Phase 1 ONLY, and nothing beyond it:
--   - employee_identity_vault gains employee_id. Additive.
--   - get_or_create_employee_token() gains an eID-aware path, via overload -- the existing
--     single-argument signature is UNCHANGED, so every live caller (the server-side auto-pull,
--     the client-side manual-upload path) keeps working exactly as today, name-keyed.
-- Do NOT start Phase 2 (reconciliation -- merging/linking existing vault rows to their eID) or
-- Phase 3 (switching audit_rows' write key). Phase 2 in particular can attribute one real
-- person's findings to another if rushed; it needs its own pass against real Phase 0 data, not a
-- side effect of this one. Nothing here reconciles or backfills employee_id onto any existing
-- vault row -- audit_rows.emp_id (dispatch #51) is a SEPARATE column on a SEPARATE table and this
-- migration does not read from it or link the two.

alter table public.employee_identity_vault add column if not exists employee_id text;

comment on column public.employee_identity_vault.employee_id is
  'Register Audit API''s own employee ID (dispatch #49/#51''s empID), additive alongside the '
  'name-keyed employee_name. Nullable -- no existing vault row has one yet; only new writes '
  'through get_or_create_employee_token()''s new eID-aware overload ever populate it, and only '
  'opportunistically (see that function''s own on-conflict clause: never overwrites an eID a row '
  'already has). Phase 2 (reconciling existing name-keyed rows against their eID) is a separate, '
  'later, explicitly-gated piece of work -- this column existing does not mean Phase 2 has run.';

-- A real eID should not silently end up on two different name-keyed vault rows -- that would be
-- exactly the kind of un-adversarially-considered write dispatch #49 warns Phase 2 against, so
-- this constraint exists from the start even though nothing populates the column yet (today,
-- every row's employee_id is null, so this rejects nothing on creation).
create unique index if not exists employee_identity_vault_employee_id_idx
  on public.employee_identity_vault (tenant_id, employee_id)
  where employee_id is not null;

-- ── get_or_create_employee_token() — new eID-aware OVERLOAD, existing 1-arg signature untouched ──
-- Postgres resolves by argument list, so get_or_create_employee_token(text) (every live caller
-- today) and this 2-arg version coexist without any call site changing. Nothing calls this new
-- overload yet -- it is Phase 1's API surface, not a wired-up feature; Phase 2/3 (not this
-- dispatch) would be what actually starts passing a real eID through it. It is written to
-- DEGRADE, never to fail: on a split identity (one eID, two names) it silently skips the
-- enrichment and returns the same name-keyed token the 1-arg version would -- see the
-- exception handler's own comment for why that case is measured-real, not theoretical.
create or replace function public.get_or_create_employee_token(p_employee_name text, p_employee_id text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_name   text := btrim(coalesce(p_employee_name, ''));
  v_eid    text := nullif(btrim(coalesce(p_employee_id, '')), '');
  v_id     uuid;
begin
  if v_name = '' then
    raise exception 'get_or_create_employee_token: employee_name is required';
  end if;
  -- Opportunistic enrichment only: a row that already has an employee_id keeps it, even if this
  -- call carries a different (or no) one -- never silently overwrite an existing mapping. A row
  -- with no employee_id yet gains the one this call supplies (may still be null, which is a no-op).
  begin
    insert into public.employee_identity_vault (tenant_id, employee_name, employee_id)
    values (v_tenant, v_name, v_eid)
    on conflict (tenant_id, employee_name) do update
      set employee_name = excluded.employee_name,
          employee_id   = coalesce(public.employee_identity_vault.employee_id, excluded.employee_id)
    returning id into v_id;
  exception when unique_violation then
    -- The eID is already held by a DIFFERENT name -- a split identity. This is not a corner
    -- case: Phase 0 measured 16 of 1,173 real eIDs (1.4%) carrying more than one name
    -- (memory/finding-phase0-gate-result-2026-08-21.md, row 4). Without this handler the
    -- partial unique index aborts the whole call and the caller gets NO TOKEN AT ALL for a
    -- person the 1-arg path would have tokenized fine -- strictly worse than the path this
    -- overload is meant to supersede. Enrichment is optional; a token is not. So fall back to
    -- the exact name-keyed insert the 1-arg signature performs, leaving employee_id null on
    -- this row and the existing mapping untouched. The index still does its job (one eID never
    -- lands on two rows); resolving which name is the real one is Phase 2's job, deliberately
    -- not attempted here -- guessing is how one person's findings get attributed to another.
    insert into public.employee_identity_vault (tenant_id, employee_name)
    values (v_tenant, v_name)
    on conflict (tenant_id, employee_name) do update set employee_name = excluded.employee_name
    returning id into v_id;
  end;
  return v_id;
end;
$$;

comment on function public.get_or_create_employee_token(text, text) is
  'eID-aware overload of get_or_create_employee_token(text) (dispatch #49 Phase 1). The 1-arg '
  'signature is UNCHANGED and remains every live caller''s path. This overload never overwrites '
  'an employee_id a vault row already has -- first write wins, opportunistic only. Not yet called '
  'by any pull script; Phase 2/3 (not this dispatch) would wire a real caller to it.';

-- Same broad-expose posture as the 1-arg version (schema-identity-vault.sql's own comment):
-- this never returns employee_name, only an opaque token, and only accepts identifiers the
-- caller already has -- it discloses nothing a caller didn't already know. No separate
-- revoke/grant needed beyond what schema.sql's project-level defaults already apply to a new
-- SECURITY DEFINER function in this schema.
