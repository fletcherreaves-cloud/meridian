-- ── org_events sports detail (Notes 46 / calendar day panel) ─────────────────────────────────────
-- Optional per-event opponent + kickoff time so game rows can carry richer detail. The importer reads
-- them from optional "Opponent" / "Kickoff" columns on the Sports Schedules sheet (blank = omitted),
-- and saveOrgEvents self-heals if this migration hasn't run yet. Safe to re-run.

alter table public.org_events add column if not exists opponent text;
alter table public.org_events add column if not exists kickoff  text;
