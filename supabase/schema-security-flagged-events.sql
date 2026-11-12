-- ── security_flagged_events — Phase 1 of the camera-hint fix (owner dispatch, 2026-11-12) ──────
-- security_findings (schema-security-findings.sql) stores ONE verdict per (rule, subject, rolling
-- window) -- real for pattern-over-time, but it is the reason the camera-review hint could only
-- ever say "pull footage for this whole month": nothing remembers WHICH DAY inside the window
-- actually crossed the line. This table is the day-level sibling: one row per individual breach,
-- derived from the exact same evaluateRule() call the window verdict already trusts, just run one
-- calendar day at a time (src/engine/security-daily-events.js's deriveDailyBreaches()). It does
-- NOT replace security_findings -- the rolling-window verdict stays the "is this subject trending
-- abnormal" view; this is the "which specific day(s) actually did it" ledger underneath it, and
-- the honest fix for a pattern question too: counting DISTINCT FLAGGED DAYS here is a real measure
-- of how often someone actually crossed the line, where counting flagged WINDOWS can overcount one
-- bad day twelve times (exactly what happened to Ryan A / CASH-004 / Holdenville, the case that
-- prompted this table).
--
-- Same PII-safety contract as security_findings, copied deliberately, not reinvented: subject is
-- emp_token OR wrin, NEVER a plaintext name (Direction B, dispatch #37) -- a new table that stored
-- `emp` directly would reopen the exact hole that dispatch closed.

create table if not exists public.security_flagged_events (
  id               uuid             not null default gen_random_uuid() primary key,
  tenant_id        uuid             not null default '00000000-0000-0000-0000-000000000001',
  emp_token        uuid             references public.employee_identity_vault(id),
  wrin             text,
  loc              text             not null,
  rule_id          text             not null,
  event_date       date             not null,          -- the SPECIFIC day this breach happened on,
                                                         -- not the rolling window it was found inside
  value            double precision not null,           -- that one day's own rate/value
  threshold_used   double precision,
  window_start     date             not null,           -- the parent window this breach surfaced in,
  window_end       date             not null,           -- kept for traceability back to security_findings
  status           text             not null default 'open',  -- open|investigated|escalated|cleared,
                                                         -- same vocabulary as security_finding_actions
  status_note      text,
  status_set_by    uuid,
  status_set_at    timestamptz,
  computed_at      timestamptz      not null default now(),
  foreign key (tenant_id, rule_id) references public.security_rules(tenant_id, rule_id),
  constraint security_flagged_events_one_subject check (
    (emp_token is not null and wrin is null) or (emp_token is null and wrin is not null)
  )
);

-- Same NULL-safe upsert-key pattern as security_findings_upsert_key -- a plain (emp_token, wrin)
-- composite index would never actually enforce idempotency, since Postgres treats NULL as
-- distinct-from-everything (including another NULL). subject_key collapses whichever one is set
-- into a single NOT NULL value the batch job's onConflict target can rely on.
alter table public.security_flagged_events
  add column if not exists subject_key text generated always as (coalesce(emp_token::text, '') || '::' || coalesce(wrin, '')) stored;

-- One row per (rule, loc, specific day, subject) -- a re-run that re-derives the same day's own
-- breach upserts in place rather than duplicating it; a day that stops breaching on a later run
-- (recalibrated threshold, corrected upstream data) is left in place as history, not deleted --
-- same "never silently discard a finding" discipline security_findings already follows.
create unique index if not exists security_flagged_events_upsert_key
  on public.security_flagged_events (tenant_id, rule_id, loc, event_date, subject_key);

create index if not exists security_flagged_events_emp_token_idx on public.security_flagged_events (emp_token, event_date desc) where emp_token is not null;
create index if not exists security_flagged_events_loc_idx on public.security_flagged_events (loc, event_date desc);
create index if not exists security_flagged_events_open_idx on public.security_flagged_events (loc, status) where status = 'open';

alter table public.security_flagged_events enable row level security;

-- Same gated-read tier as security_findings (schema-security-findings-role-fix.sql): admin/owner/
-- area_supervisor always; manager/gm only when org_config.gm_identity_reveal_enabled. Deliberately
-- NOT the general "any authenticated user" pattern -- same reasoning as security_findings' own
-- policy comment (a token alone isn't PII, but a small-store finding can still be practically
-- de-anonymizing).
drop policy if exists "security_flagged_events: gated read" on public.security_flagged_events;
create policy "security_flagged_events: gated read" on public.security_flagged_events
  for select using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      get_my_role() in ('admin', 'owner', 'area_supervisor')
      or (
        get_my_role() in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

-- Status (open/investigated/escalated/cleared) is the one field a real investigator needs to set
-- from the panel -- same "interact" tier security_finding_actions already uses for its own action
-- log, not a second new role tier. Writers may only ever change status/status_note/status_set_by/
-- status_set_at -- never the evidentiary fields (value/threshold/dates/rule), enforced by the
-- trigger below rather than trusted to client-side discipline.
drop policy if exists "security_flagged_events: status update" on public.security_flagged_events;
create policy "security_flagged_events: status update" on public.security_flagged_events
  for update using (
    tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
    and (
      get_my_role() in ('admin', 'owner', 'area_supervisor')
      or (
        get_my_role() in ('manager', 'gm')
        and coalesce((select (data->>'enabled')::boolean from public.org_config where key = 'gm_identity_reveal_enabled'), false)
      )
    )
  );

create or replace function public._security_flagged_events_guard_evidence()
returns trigger language plpgsql as $$
begin
  if new.emp_token is distinct from old.emp_token or new.wrin is distinct from old.wrin
     or new.loc is distinct from old.loc or new.rule_id is distinct from old.rule_id
     or new.event_date is distinct from old.event_date or new.value is distinct from old.value
     or new.threshold_used is distinct from old.threshold_used
     or new.window_start is distinct from old.window_start or new.window_end is distinct from old.window_end
  then
    raise exception 'security_flagged_events: evidentiary fields are read-only outside the batch job';
  end if;
  return new;
end;
$$;

drop trigger if exists security_flagged_events_guard_evidence on public.security_flagged_events;
create trigger security_flagged_events_guard_evidence
  before update on public.security_flagged_events
  for each row execute function public._security_flagged_events_guard_evidence();

-- No insert/delete policy for any role -- every INSERT comes from scripts/security-rules-run.mjs's
-- service-role key (bypasses RLS entirely), matching security_findings' own "writes are batch-job-
-- only" pattern. UPDATE is the one exception, scoped to status fields only by the trigger above.

comment on table public.security_flagged_events is
  'Day-level breach ledger, one row per (rule, loc, subject, specific day) -- the sibling security_findings needed so a camera-review hint can name a day instead of a rolling window. Subject is emp_token OR wrin, exactly one, never a plaintext name. Evidentiary fields written only by scripts/security-rules-run.mjs (service role); status fields (open/investigated/escalated/cleared) are interact-writable by the same role tier that reads it.';
