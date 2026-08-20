-- ── Identity vault (dispatch #37, Direction B pseudonymization architecture) ──────────────────
-- memory/dispatch-37.md, memory/plan-security-pii-architecture-2026-08-19.md §4 (DECIDED
-- 2026-08-20), memory/plan-security-loss-prevention.md §5 (access-tier + evidence-grade
-- decisions, also 2026-08-20). Two additive tables + two SECURITY DEFINER RPCs -- does NOT
-- touch audit_rows' existing (loc,date,emp) PK or the emp column itself (dispatch #35's own
-- decision to key on name for manual/auto continuity stands; migrating the PK to be token-keyed
-- is a separate, later decision, not this one).
--
-- REAL FINDING THAT SHAPES THIS FILE: CLAUDE.md's documented 8-tier RBAC
-- (Developer/Admin/Owner-OO/VP/DO/Supervisor/GM/Office Staff) is NOT implemented at the DB
-- level -- profiles.role's check constraint (supabase/schema.sql:13) allows exactly
-- 'admin' | 'supervisor' | 'manager', and get_my_role() reads that same column. Every role
-- check below uses those three real values only -- never 'do'/'vp'/'gm'/'owner'/'developer',
-- which would silently never match and fail closed or open depending on how the check reads.

-- ── employee_identity_vault — the token <-> real-name mapping ──────────────────────────────
-- The row's own `id` IS the token (no second derived value) -- per the NIST-sourced guidance
-- that a token must carry no embedded information (no store number, no identity hint).
create table if not exists public.employee_identity_vault (
  id            uuid          not null default gen_random_uuid() primary key,
  tenant_id     uuid          not null default '00000000-0000-0000-0000-000000000001',
  employee_name text          not null,
  created_at    timestamptz   not null default now(),
  unique (tenant_id, employee_name)
);

alter table public.employee_identity_vault enable row level security;
-- Deliberately ZERO policies -- no select, no insert, no update, no delete for any role via
-- the normal API/PostgREST. The only way to read employee_name is reveal_employee_identity()
-- below; the only way to create a mapping is get_or_create_employee_token() below. Both are
-- SECURITY DEFINER, owned by the role that runs this file (matching get_my_role()'s own
-- established bypass-RLS-on-profiles pattern, schema.sql:87), so they see this table
-- regardless of these absent policies. If a future consumer needs direct table access, that
-- is a design regression to flag, not to grant quietly here.

-- ── identity_reveal_log — append-only, evidence-grade per the owner's 2026-08-20 decision ────
create table if not exists public.identity_reveal_log (
  id            uuid          not null default gen_random_uuid() primary key,
  tenant_id     uuid          not null default '00000000-0000-0000-0000-000000000001',
  person_token  uuid          not null references public.employee_identity_vault(id),
  viewer_id     uuid          not null references public.profiles(id),
  viewer_role   text          not null,
  reason        text          not null,
  case_ref      text,
  revealed_at   timestamptz   not null default now()
);

create index if not exists identity_reveal_log_token_idx on public.identity_reveal_log (person_token, revealed_at desc);

alter table public.identity_reveal_log enable row level security;

-- Admin-only read -- this is oversight of who looked up whom, INCLUDING supervisors'/managers'
-- own reveals, so it defaults to the tier above the ones being audited. Not asked for by the
-- dispatch either way; broaden later (e.g. a supervisor seeing their own trail) only on an
-- explicit decision, not silently here.
drop policy if exists "identity_reveal_log: admin read" on public.identity_reveal_log;
create policy "identity_reveal_log: admin read" on public.identity_reveal_log
  for select using (get_my_role() = 'admin' and tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);
-- No insert/update/delete policy at all -- every write goes through
-- reveal_employee_identity()'s SECURITY DEFINER context below. Nobody, including an admin
-- through the normal API, can edit or remove a reveal-log entry -- that is what
-- "tamper-evident" means here. Retention is INDEFINITE (owner's own 2026-08-20 decision,
-- plan-security-loss-prevention.md §5 point 1 -- the value is explicitly in cross-case
-- recurrence over time) -- do NOT add a cleanup job or TTL, here or later, without a new,
-- explicit owner decision.

comment on table public.employee_identity_vault is
  'Token <-> real-name mapping (Direction B, dispatch #37). id IS the token. No direct select/insert/update/delete policy for any role -- read only via reveal_employee_identity(), written only via get_or_create_employee_token().';
comment on table public.identity_reveal_log is
  'Append-only, evidence-grade log of every real-name reveal (dispatch #37). Indefinite retention by owner decision (2026-08-20) -- do not add a TTL/cleanup job. Admin-read only; no update/delete policy exists at all, by design.';

-- ── audit_rows.emp_token — additive column, does NOT touch the existing PK/emp column ────────
alter table public.audit_rows add column if not exists emp_token uuid references public.employee_identity_vault(id);
create index if not exists audit_rows_emp_token_idx on public.audit_rows (emp_token);

-- ── get_or_create_employee_token() — the shared write-path RPC ─────────────────────────────────
-- Both the server-side auto-pull (service-role key -- could write employee_identity_vault
-- directly since service role bypasses RLS) and the browser manual-upload path (anon key,
-- blocked by the table's own zero-policy RLS above) call this SAME function, so the
-- upsert-or-lookup logic exists in exactly one place -- not a permissive insert policy reasoned
-- about twice for two different callers. Atomic: ON CONFLICT ... RETURNING handles the
-- lookup-or-create race in one statement instead of a separate select-then-insert.
-- Safe to expose broadly: it never returns employee_name, only ever a token, and it only
-- accepts a name the caller already has (their own upload/pull row) -- it discloses nothing a
-- caller didn't already know.
create or replace function public.get_or_create_employee_token(p_employee_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_name   text := btrim(coalesce(p_employee_name, ''));
  v_id     uuid;
begin
  if v_name = '' then
    raise exception 'get_or_create_employee_token: employee_name is required';
  end if;
  insert into public.employee_identity_vault (tenant_id, employee_name)
  values (v_tenant, v_name)
  on conflict (tenant_id, employee_name) do update set employee_name = excluded.employee_name
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.get_or_create_employee_token(text) is
  'Look up or create a token for an employee name the caller already has. Never returns employee_name -- only an opaque token. Safe to expose broadly; this is NOT the reveal path.';

-- ── reveal_employee_identity() — the ONE path to a real name ───────────────────────────────────
-- 1. Reject an empty reason outright -- an unlogged-reason reveal must not be possible.
-- 2. Role gate: admin/supervisor always allowed (owner's 2026-08-20 decision -- this is a real,
--    intentional divergence from the DO-and-above disclosure policy elsewhere in Meridian,
--    scoped specifically to this identity-reveal mechanism, per plan-security-loss-prevention.md
--    §5 point 2); manager allowed only if org_config.gm_identity_reveal_enabled is true (an
--    org-wide placeholder -- "GM's should optionally be able to" was not specified per-what;
--    flag this precisely when a real per-case/per-store mechanism is scoped later); anyone else
--    rejected.
-- 3. Look up employee_name by token, scoped to this tenant.
-- 4. Log the reveal BEFORE returning the name, so a reveal is recorded even if the caller's
--    client crashes immediately after this function returns.
-- 5. Return the name, or raise with no data on any failure above.
--
-- SECURITY INCIDENT, fixed same-day (2026-08-20) -- see memory/incident-reveal-rpc-null-role-
-- bypass-2026-08-20.md. The role gate below is deliberately structured as an IF/ELSIF/ELSE with
-- the reject case in the trailing ELSE, NOT as an ELSIF whose own condition does the rejecting.
-- The original shipped version used `elsif v_role not in ('admin','supervisor') then raise...`
-- with no ELSE -- and `NULL not in (...)` evaluates to NULL, which PL/pgSQL treats as FALSE for
-- an ELSIF condition, so an anonymous caller (get_my_role() = NULL) fell through the whole
-- IF/ELSIF untouched and reached the token lookup below, fully unauthenticated. Verified live
-- against production via the anon key alone, both before and after this fix. Do NOT restructure
-- this back to a rejecting ELSIF condition -- the reject path must always be the unconditional
-- final ELSE so a NULL role can never skip it.
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

  if v_role in ('admin', 'supervisor') then
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

-- Explicit grant/revoke (unlike every other function in this repo, which relies on default
-- PUBLIC execute + an internal role check) -- this is the single most sensitive function in
-- this build, per the dispatch's own framing. `revoke ... from public` alone was NOT sufficient
-- in production: the same incident probe found the anon key could invoke this function at all
-- (reaching the internal P0001 exception, not a permission-denied error), which only makes sense
-- if Supabase's project-level default privileges grant EXECUTE directly to the `anon` role on
-- newly created functions in this schema -- a grant made straight to a named role, which
-- `revoke ... from public` (the implicit everyone-pseudo-role) does not touch. Unconfirmed as the
-- exact mechanism (not independently re-tested against a different function), but the explicit
-- `revoke ... from anon` below closes the observed gap regardless of the precise cause, and the
-- restructured role-gate above is now the real backstop either way -- an anon caller reaching the
-- function body now always hits the trailing ELSE and is rejected.
revoke all on function public.reveal_employee_identity(uuid, text) from public;
revoke execute on function public.reveal_employee_identity(uuid, text) from anon;
grant execute on function public.reveal_employee_identity(uuid, text) to authenticated;

comment on function public.reveal_employee_identity(uuid, text) is
  'The ONE path to a real employee name from a token. admin/supervisor always allowed; manager allowed only if org_config.gm_identity_reveal_enabled is true. Logs every reveal to identity_reveal_log BEFORE returning the name. Reason is required, never optional.';
