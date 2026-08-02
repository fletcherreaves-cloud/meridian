-- ── org_events status (Notes 46 calendar editability) ───────────────────────────────────────────
-- Lets the in-app calendar mark an event Postponed / Canceled / Rescheduled without deleting it
-- (weather postponements, cancellations, time changes). null = Scheduled/active. Safe to re-run.
-- updateOrgEvent self-heals if this hasn't run yet.

alter table public.org_events add column if not exists status text;
