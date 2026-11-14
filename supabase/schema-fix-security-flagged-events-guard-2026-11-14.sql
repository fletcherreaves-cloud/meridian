-- GH #1907 fix -- the evidentiary-field guard trigger on security_flagged_events blocks the
-- batch job's OWN writes, not just a user's. Found live, not guessed: Sync Failure Watch opened
-- #1907 ("Security Rules Run" failed) after this repo's own scheduled run, and the job log showed
-- 6 "flagged-events upsert error" lines, every one:
--
--   code: 'P0001', message: 'security_flagged_events: evidentiary fields are read-only outside
--   the batch job'
--
-- Root cause: scripts/security-rules-run.mjs upserts security_flagged_events with onConflict
-- (tenant_id, rule_id, loc, event_date, subject_key) -- NOT including value/threshold_used/
-- window_start/window_end. Every scheduled run re-evaluates a rolling window of recent dates, so
-- a day whose underlying metric value shifted since the last run (late-arriving rows, a backfill
-- correction) produces a genuine UPDATE on an existing row with a changed evidentiary field --
-- exactly the path schema-security-flagged-events.sql's own comment says IS allowed ("Evidentiary
-- fields written only by scripts/security-rules-run.mjs (service role)").
--
-- The bug: `before update` triggers fire for EVERY writer regardless of role -- unlike RLS
-- policies, a trigger is not something service-role bypasses automatically. The original trigger
-- (_security_flagged_events_guard_evidence) has no role check at all, so it blocks the batch
-- job's own legitimate evidentiary update exactly as hard as it blocks a real end-user's. The
-- schema comment's claim that evidentiary fields are "read-only outside the batch job" was never
-- actually implemented -- there was no way for the trigger to tell "outside" from "inside".
--
-- Fix: exempt service-role writes using auth.role() = 'service_role' -- NOT a new idiom invented
-- for this fix, already the established pattern this exact codebase uses elsewhere for the same
-- distinction (schema-event-impact.sql, schema-forecast-week-cache.sql,
-- schema-hourly-projection-accuracy.sql, schema-org-events.sql, schema-qsr-employee-tenure.sql --
-- all use `auth.role() = 'service_role'` in a policy; this is the same check inside a trigger
-- instead). Confirmed via live job log + Management API measurement before writing this, not
-- assumed from a general Supabase-architecture recollection.
--
-- Does NOT weaken the protection this trigger exists for: a real authenticated end-user's UPDATE
-- (via the "security_flagged_events: status update" RLS policy, scoped to status fields by that
-- policy's own USING clause) still runs as role `authenticated`, not `service_role` -- the guard
-- still fires for them exactly as before. Only the batch job's own service-role writes are
-- exempted, which is the ONLY path this table's design ever intended to allow evidentiary writes.

create or replace function public._security_flagged_events_guard_evidence()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
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
