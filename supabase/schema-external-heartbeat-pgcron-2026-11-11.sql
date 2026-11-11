-- ── External heartbeat: dispatch critical pulls from pg_cron, not GitHub's own cron (2026-11-11) ──
-- memory/finding-github-schedule-unreliable-external-heartbeat-2026-11-11.md has the full incident
-- and measurement.
--
-- Incident: on 2026-11-11, qsrsoft-dar-pull.yml and qsrsoft-ops-pull.yml (both scheduled every 15
-- min, ~6am-10pm CT) silently stopped firing after ~11:30pm CT the night before -- no run of either
-- existed between then and ~9:17am CT, confirmed via the GitHub Actions API (zero runs, zero
-- queued, zero in_progress -- not a failure, the schedule event was never delivered). The
-- scheduled-pull-watchdog.yml built in August specifically to catch exactly this ALSO went silent
-- in the same window (last run 09:41 UTC, ~5.5h gap against its own 30-min cadence) -- this is
-- GitHub's documented "scheduled triggers are best-effort and can be dropped under platform load"
-- behavior, and this time it took down the safety net built for it too.
--
-- Fix: move the TRIGGER for these three workflows onto pg_cron -- a Postgres-internal scheduler
-- already proven reliable in this project (schema-security-findings-latest-pgcron-refresh-
-- 2026-11-10.sql's one-minute test job ran clean) and entirely independent of GitHub's own cron
-- queue -- firing `workflow_dispatch` via the GitHub REST API (pg_net, async, fire-and-forget).
-- GitHub's own `schedule:` triggers in the three workflow files are left UNCHANGED and still run
-- when GitHub's queue cooperates -- this is additive redundancy, not a replacement. Both pull
-- workflows got a `concurrency` group (same PR) so a GitHub-cron run and a pg_cron-dispatched run
-- landing close together queue instead of executing concurrently; the pulls are upsert-based
-- (loc,dt[,hour_slot]) either way, so a harmless duplicate run is not a correctness risk.
--
-- Credential: a GitHub fine-grained PAT scoped to ONLY this repo, Actions: Read and write
-- permission (nothing else) -- deliberately narrower than the project-admin-level Management API
-- token that was rejected for the security_findings_latest fix one day earlier for the same
-- blast-radius reason. Stored in Supabase Vault (`vault.create_secret`, name
-- 'github_actions_pat') by the owner directly in the SQL editor -- it never passed through Claude
-- or chat. These cron jobs read it only via `vault.decrypted_secrets` at call time; no plaintext
-- token appears in this file, in `cron.job`, or in any log this job writes.
--
-- Idempotent: safe to re-run. cron.schedule() upserts by job name.

create extension if not exists pg_net;

-- Every 15 min, 6am-10pm CT (0-3,12-23 UTC -- same window as each workflow's own GitHub
-- `schedule:` block) -- the two pulls the owner is actively watching for intraday freshness.
select cron.schedule(
  'external-heartbeat-dar-pull',
  '*/15 0-3,12-23 * * *',
  $$
  select net.http_post(
    url := 'https://api.github.com/repos/fletcherreaves-cloud/meridian/actions/workflows/qsrsoft-dar-pull.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_actions_pat'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'meridian-pgcron-heartbeat'
    ),
    timeout_milliseconds := 10000
  );
  $$
);

select cron.schedule(
  'external-heartbeat-ops-pull',
  '*/15 0-3,12-23 * * *',
  $$
  select net.http_post(
    url := 'https://api.github.com/repos/fletcherreaves-cloud/meridian/actions/workflows/qsrsoft-ops-pull.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_actions_pat'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'meridian-pgcron-heartbeat'
    ),
    timeout_milliseconds := 10000
  );
  $$
);

-- Every 30 min, all day -- same cadence as scheduled-pull-watchdog.yml's own `schedule:` block.
-- This one watches EVERY stream in src/engine/stream-freshness.js's STREAMS registry, not just
-- the two above, so its own uptime matters just as much as theirs.
select cron.schedule(
  'external-heartbeat-pull-watchdog',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://api.github.com/repos/fletcherreaves-cloud/meridian/actions/workflows/scheduled-pull-watchdog.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_actions_pat'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'meridian-pgcron-heartbeat'
    ),
    timeout_milliseconds := 10000
  );
  $$
);

-- Added same day, same incident -- the gap was wider than first scoped. qsrsoft-onhand-pull.yml
-- (own schedule: '0 * * * *' + '30 * * * *') and qsrsoft-live-pulse.yml (own schedule:
-- '0 11-23 * * *') were ALSO found silently dead on GitHub's schedule queue during the SAME
-- investigation window (qsrsoft-onhand-pull: no run between 10:00 UTC and discovery ~16:00 UTC;
-- qsrsoft-live-pulse: no run between 2026-11-10T23:56Z and discovery, a 16+ hour gap against its
-- hourly cron) -- confirmed via the GitHub Actions API, not assumed from the first two. This is a
-- broader, ongoing GitHub Actions scheduling degradation, not isolated to the two pulls originally
-- scoped, and not a QSRSoft-side issue (ruled out: these two failures are GitHub's schedule queue
-- never firing at all, not a request that reached QSRSoft and failed).
select cron.schedule(
  'external-heartbeat-onhand-pull',
  '0,30 * * * *',
  $$
  select net.http_post(
    url := 'https://api.github.com/repos/fletcherreaves-cloud/meridian/actions/workflows/qsrsoft-onhand-pull.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_actions_pat'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'meridian-pgcron-heartbeat'
    ),
    timeout_milliseconds := 10000
  );
  $$
);

select cron.schedule(
  'external-heartbeat-live-pulse',
  '0 11-23 * * *',
  $$
  select net.http_post(
    url := 'https://api.github.com/repos/fletcherreaves-cloud/meridian/actions/workflows/qsrsoft-live-pulse.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'github_actions_pat'),
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'meridian-pgcron-heartbeat'
    ),
    timeout_milliseconds := 10000
  );
  $$
);
