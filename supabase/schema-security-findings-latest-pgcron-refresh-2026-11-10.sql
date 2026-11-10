-- ── Fix: security_findings_latest refresh silently timing out every run (2026-11-10) ───────────
-- memory/finding-security-findings-latest-refresh-timeout-2026-11-10.md has the full measurement.
--
-- Root cause: the `authenticator` role (the login role PostgREST uses for every REST/RPC call,
-- including scripts/security-rules-run.mjs's own supabase.rpc('refresh_security_findings_latest'))
-- has a role-level `statement_timeout = 8s` (`select rolconfig from pg_roles where rolname =
-- 'authenticator'`). REFRESH MATERIALIZED VIEW CONCURRENTLY security_findings_latest_mv now takes
-- well over 8s against the table's real size (242,074+ rows and growing) and gets cancelled on
-- every single call through that path -- confirmed this has been failing (non-fatally logged,
-- so silently) on every run since the materialized view itself shipped the same day (#1804).
--
-- Tried and measured NOT to fix it: adding `set local statement_timeout = '5min'` as the first
-- line of refresh_security_findings_latest()'s own body. Verified the function body updated
-- correctly, then called it again through the same PostgREST RPC path -- still cancelled at ~8.3s.
-- Whatever Supabase's pooler does with the authenticator role's session-level timeout isn't simple
-- "last SET LOCAL wins within one session."
--
-- Fix chosen (of three measured options, see the memory file): run the refresh via pg_cron
-- instead of through PostgREST. pg_cron executes as a plain Postgres background worker under the
-- scheduling role (here, the Management-API `postgres` role), with no authenticator/pooler
-- involvement at all -- the function's own `set local statement_timeout = '5min'` (already in the
-- function body, unchanged) applies normally in this context. Verified live: a one-minute test
-- schedule ran and succeeded in 19.6s (`select * from cron.job_run_details`), well under both the
-- function's 5min budget and nowhere near the 8s wall it used to hit.
--
-- Rejected: raising authenticator's global statement_timeout (would raise the ceiling for every
-- live PostgREST request across the whole app, not just this one job -- a real availability
-- trade-off for all real users, not worth it for one background refresh); shipping a Management-
-- API token into GitHub Actions secrets to call this from scripts/security-rules-run.mjs directly
-- (that token is project-admin-level, a real increase in what a CI secret can do, for a problem
-- pg_cron solves with no new secret at all).
--
-- Schedule: 11:20 UTC daily, 20 minutes after security-rules-run.yml's own 11:00 UTC cron (that
-- job's own runs take ~2 minutes end-to-end per its job log) -- leaves a safe buffer so the
-- refresh always runs against that day's freshly-written findings, never ahead of them.
--
-- Idempotent: safe to re-run. cron.schedule() upserts by job name (same name = same job updated
-- in place, not duplicated).

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'refresh-security-findings-latest-daily',
  '20 11 * * *',
  $$select public.refresh_security_findings_latest();$$
);
