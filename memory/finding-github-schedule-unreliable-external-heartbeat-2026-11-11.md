---
name: finding-github-schedule-unreliable-external-heartbeat-2026-11-11
description: On 2026-11-11, qsrsoft-dar-pull.yml and qsrsoft-ops-pull.yml (both scheduled every 15 min, ~6am-10pm CT) silently stopped firing from ~11:30pm CT the prior night through ~9:17am CT -- zero runs, zero queued, confirmed via the GitHub Actions API. scheduled-pull-watchdog.yml (built in August for exactly this failure mode) also went silent in the same window. Fix: an external heartbeat -- three pg_cron jobs (Postgres-internal scheduler, already proven reliable, independent of GitHub's own cron queue) that fire `workflow_dispatch` via the GitHub REST API (pg_net) for qsrsoft-dar-pull.yml, qsrsoft-ops-pull.yml, and scheduled-pull-watchdog.yml -- see supabase/schema-external-heartbeat-pgcron-2026-11-11.sql. GitHub's own `schedule:` triggers are left unchanged (additive redundancy). Owner-approved 2026-11-11 ("Accuracy, Consistency and up-time are paramount"). Read before re-diagnosing "why is today's data stale" or re-proposing a fix for GitHub cron unreliability.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# GitHub's scheduled-cron queue silently dropped two critical pulls (and their own watchdog) — external heartbeat built (2026-11-11)

## What was observed

Owner noticed every store's Signals/LiveOps "Live Ops" tab reading `-100%` vs. mean for hours that
had already passed (9:17am CT, breakfast rush long underway) while the freshness banner read "All
27 stores nominal." Separately, the curated-home Ledger was surfacing large Cash O/S flags for
multiple stores that morning — raising the same suspicion: stale data, not a real finding.

## Measured, not assumed

- `qsr_daily_activity` for 2026-11-11: **648/648 rows present** (27 stores × 24 hour_slots — the
  full zero-filled shape an in-progress day always carries, per CLAUDE.md's own "incomplete DAR
  days" note) but **0 rows with `net_sales > 0`**. 2026-11-10 (yesterday) had 496 non-zero rows for
  comparison — the pull mechanism itself works; it just didn't run today. This is exactly why the
  freshness banner read "nominal" while the real numbers were all placeholders: that check only
  verifies the row *shape* exists, not that real values landed in it.
- `qsrsoft-dar-pull.yml` run history (GitHub Actions API): last run **2026-11-11T05:31:33Z**
  (~11:31pm CT the prior night). Zero runs — success, failure, queued, or in_progress — between
  then and the time of investigation (~15:17 UTC / 9:17am CT), despite the `*/15 12-23 * * *` cron
  calling for a run roughly every 15 minutes across that entire gap.
- `qsrsoft-ops-pull.yml`: same pattern, last run **2026-11-11T04:32:10Z**.
- `scheduled-pull-watchdog.yml` — built in August specifically to catch "a scheduled workflow
  simply never started" — **also** went silent in the same window: last run **09:41 UTC**, a
  ~5.5h gap against its own `*/30 * * * *` cron, confirmed via the same API query (zero
  queued/in_progress runs).
- Other scheduled workflows (`sync-failure-watch.yml`, triggered by `workflow_run` from
  hourly-cadence siblings like SAGE/On-Hand) **did** continue firing through the same window —
  this was not a blanket Actions outage for the whole repo/account, just these three.

This matches GitHub's own documented behavior (already quoted in `scheduled-pull-watchdog.yml`'s
own header comment, from the 2026-08-29 incident it was built for): scheduled triggers are
best-effort and can be silently dropped under platform load. This is the second time it has hit
this repo, and the second time it took the built-for-this-exact-purpose watchdog down with it —
a watchdog whose own trigger is the same unreliable mechanism cannot fully insure against it.

## Immediate recovery (same session)

Manually triggered all three workflows via `workflow_dispatch` (GitHub MCP tools). Confirmed the
DAR pull run went `in_progress` within seconds of the call.

## Durable fix — external heartbeat, owner-approved

**Moving the trigger off GitHub's own schedule queue entirely, onto pg_cron** (a Postgres-internal
background worker, independent of PostgREST/GitHub, already proven reliable in this project —
`schema-security-findings-latest-pgcron-refresh-2026-11-10.sql`'s one-minute test job ran clean).
Three pg_cron jobs (`supabase/schema-external-heartbeat-pgcron-2026-11-11.sql`) fire
`workflow_dispatch` via the GitHub REST API using `pg_net` (async, fire-and-forget HTTP from
Postgres):

- `external-heartbeat-dar-pull` and `external-heartbeat-ops-pull`: `*/15 0-3,12-23 * * *` (same
  ~6am-10pm CT window as each workflow's own `schedule:` block).
- `external-heartbeat-pull-watchdog`: `*/30 * * * *`, matching the watchdog's own cadence — it
  covers every stream in `src/engine/stream-freshness.js`'s `STREAMS` registry, not just these two,
  so its own uptime matters as much as theirs.

**GitHub's own `schedule:` triggers in all three workflow files are left unchanged** — this is
additive redundancy (if pg_cron ever has an outage, the original best-effort GitHub cron is still
there as a fallback), not a replacement. Both pull workflows gained a `concurrency` group
(`cancel-in-progress: false`) so a GitHub-cron-triggered run and a pg_cron-dispatched run landing
close together queue instead of racing — harmless either way since both pulls upsert on their
natural key (`loc,dt[,hour_slot]`), but queueing avoids wasted duplicate Playwright/API work.

**Credential:** a GitHub fine-grained PAT scoped to **only** this repo, **Actions: Read and write**
permission and nothing else — deliberately narrower than the project-admin-level Supabase
Management API token that was rejected for the `security_findings_latest` fix one day earlier, for
the same blast-radius reasoning. The owner created it and stored it directly in Supabase Vault
(`vault.create_secret(...)`, name `github_actions_pat`) via the SQL editor — **the token value
never passed through Claude or this conversation.** The cron jobs read it only via
`vault.decrypted_secrets` at call time inside the `net.http_post` headers; no plaintext token
appears in the schema file, in `cron.job`, or in any log.

## What this does NOT fix

Doesn't change anything about *why* GitHub's schedule queue drops events — that's a platform
behavior outside this app's control, not a bug to root-cause further. It also doesn't widen
`scheduled-pull-watchdog.mjs`'s own staleness detection, which is calibrated at daily granularity
(16h grace / 40h threshold per `GRACE_HOURS`) — it would **not** have caught today's intraday gap
quickly even running on schedule, since yesterday's daily row was still well within that window.
Tightening that for the two intraday streams specifically is a separate, smaller follow-on, not
done here — today's fix is about trigger reliability, not detection granularity.

## Verification

Checked live, not assumed, before writing this file: `pg_net` and `supabase_vault` extensions
confirmed installed/available via the Supabase Management API (`pg_available_extensions`);
`net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)`
signature confirmed directly from `pg_proc`; `vault.secrets` confirmed empty before the owner added
the real PAT (no stale secret to collide with the new name). The three `cron.schedule(...)` calls
were only run (second pass, after the owner confirmed the vault secret existed) once `select name
from vault.secrets where name = 'github_actions_pat'` returned exactly one row — never scheduled
blind against a missing credential.
