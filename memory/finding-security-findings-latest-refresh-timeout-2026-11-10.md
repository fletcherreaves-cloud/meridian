---
name: finding-security-findings-latest-refresh-timeout-2026-11-10
description: The daily security-rules-run.mjs batch's materialized-view refresh (security_findings_latest_mv, introduced #1804) has been silently failing every run with a Postgres statement_timeout — root-caused to the authenticator role's hard-coded 8s statement_timeout, which a SECURITY DEFINER function's own SET LOCAL cannot override through the PostgREST/pooler path. Manually refreshed via the Supabase Management API (different connection path, no 8s cap) to unblock EVENT-004 review; the underlying automation is still broken until one of the options below is chosen. Read before re-diagnosing "why doesn't the Security panel show new findings."
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# `security_findings_latest` materialized-view refresh silently timing out (2026-11-10)

## What was observed

EVENT-004 (task #131) was flipped `active: true` and the daily batch (`security-rules-run.mjs`)
was manually triggered via `workflow_dispatch`. The batch itself ran correctly — `[security-rules-run]
EVENT-004: 4489 row(s) in 2026-10-13..2026-11-10 -> 671 finding(s), 31 flagged` — and wrote all
18,500 findings across 10 active rules with **0 errors**. But the app's Security panel still showed
"No findings match the current filters" for EVENT-004, and the job log's last line was:

```
[security-rules-run] security_findings_latest refresh failed (non-fatal): canceling statement due to statement timeout
```

## Root cause — measured, not assumed

Queried `pg_roles` directly (Supabase Management API, `database/query` endpoint, running as
`postgres`):

```
authenticator | rolconfig: {session_preload_libraries=supautils,safeupdate, statement_timeout=8s, lock_timeout=8s}
```

**The `authenticator` role — the login role PostgREST uses for every REST/RPC call, including this
script's `supabase.rpc('refresh_security_findings_latest')` — has an 8-second `statement_timeout`
baked in at the role level.** `REFRESH MATERIALIZED VIEW CONCURRENTLY security_findings_latest_mv`
now takes well over 8s against the table's current size (242,074+ rows and growing, per
`memory/finding-security-findings-latest-materialization-2026-11-10.md`), so Postgres cancels it
on every single invocation — this has almost certainly been failing on **every run since the
materialized view shipped this morning** (#1804), not just today's.

**Tried and confirmed does NOT fix it:** adding `set local statement_timeout = '5min';` as the
first line of the `refresh_security_findings_latest()` SECURITY DEFINER function body. Verified the
function body updated correctly (`pg_get_functiondef`), then called it again via the exact same
PostgREST RPC path — still cancelled at ~8.3s. `SET LOCAL` inside the function does not survive
through whatever Supabase's pooler/PostgREST layer does with the `authenticator` role's session-level
timeout config; the mechanism isn't a simple "last SET LOCAL wins" within one Postgres session, or
the pooler is resetting/reasserting it around each statement.

**Confirmed DOES work:** calling `select public.refresh_security_findings_latest();` through the
Supabase **Management API's** `/v1/projects/{ref}/database/query` endpoint instead of through
PostgREST — this connects as `postgres` (2min session timeout, per the same `pg_roles` query), not
`authenticator`. Took 18.8s and succeeded. Used this path to manually refresh the view right now so
EVENT-004's real 31 findings are visible in the app immediately (owner asked to review them live).

## What this does NOT fix

The daily GitHub Actions cron (`security-rules-run.yml`, 11:00 UTC) still calls the refresh via the
Supabase JS client's `.rpc()` — the same PostgREST/`authenticator` path that fails. **Every future
scheduled run will hit this same wall** until one of these lands:

1. **`create extension pg_cron`** and schedule the refresh as a Postgres-internal cron job —
   decoupled from PostgREST entirely, no `authenticator` timeout involved, no new GitHub secret,
   no change to the global API timeout that protects every live user request. This is schema-level
   DDL (`CREATE EXTENSION`), which is why it wasn't done unilaterally this session even under the
   owner's standing "you can run SQL" authorization for this workstream — that authorization has
   so far covered data rows and narrowly-scoped function bodies, not adding a new always-on
   database extension. **Recommended**, pending a quick owner go-ahead.
2. **Raise `authenticator`'s global `statement_timeout`** (e.g. 8s -> 60s via `ALTER ROLE
   authenticator SET statement_timeout = '60s'`). Simplest one-line fix, but raises the timeout
   ceiling for **every** PostgREST-routed request across the whole app, including the live
   anon-key traffic every real user's browser makes — a genuine availability/safety trade-off
   (a slow or buggy query that should fail fast at 8s could now hang a user's request for up to a
   minute instead). Not done without flagging the trade-off.
3. **Route the refresh call through a direct Postgres connection string or the Management API
   from inside `security-rules-run.mjs`** instead of the JS client's PostgREST RPC. Would need
   `SUPABASE_ACCESS_TOKEN` (Management API) or a direct `DATABASE_URL` added as a new GitHub
   Actions secret. The Management API token in particular is **project-admin-level**, far more
   powerful than the `SUPABASE_SERVICE_ROLE_KEY` already in CI — a real security-posture increase
   for a CI secret, worth the owner's explicit sign-off before adding it.

**Until one of these ships, `security_findings_latest` will go stale again after every future daily
batch run** (the underlying `security_findings` table itself keeps writing correctly — only the
app-facing view falls behind). A workaround in the meantime: manually re-run the Management-API
refresh (option used today) whenever fresh findings need to be visible.
