# Finding: the QSRSoft compliance pause was being silently un-paused — watchdog + pg_cron

**Date:** 2026-11-17. **Reported by:** owner, from a Data Manager screenshot ("looks like
autosync still pulling data as well. Am i wrong here"). **Status: fully resolved — see the
2026-11-17 correction at the bottom. Do not re-raise the pg_cron item below as still open.**

## Context

CLAUDE.md documents the 2026-11-16 QSRSoft Operator Security Notice compliance pause: ~32
QSRSoft credential-login pull workflows had their `schedule:` cron blocks commented out
(`.github/workflows/*.yml`), leaving `workflow_dispatch` intact for manual/emergency runs only.
The owner then looked at the Data Manager panel and correctly observed that several of those
streams still looked like they were auto-syncing.

## What was actually happening

Pausing a workflow's YAML `schedule:` block does **not** stop every mechanism that can fire
`workflow_dispatch` on it. Two independent mechanisms were still doing exactly that, for every
stream that is (a) paused and (b) still listed in `scripts/lib/scheduled-pull-registry.mjs`'s
`PULL_REGISTRY` / `src/engine/stream-freshness.js`'s `STREAMS`:

1. **`scripts/scheduled-pull-watchdog.mjs`** (dispatch #210's "should have run by now, silently
   didn't" safety net). Its `checkStream()` reads each registered stream's latest row date,
   decides it's stale (because the pull has been deliberately silenced, so of course it's
   stale), and calls `dispatchWorkflow()` — a direct `workflow_dispatch` REST call — to
   re-trigger it. This ran on its own GitHub Actions schedule, independent of the paused
   workflows' own schedules, so it kept re-firing every paused stream it manages.

2. **Two still-live Supabase pg_cron "external heartbeat" jobs**
   (`supabase/schema-external-heartbeat-pgcron-2026-11-11.sql`): `external-heartbeat-onhand-pull`
   and `external-heartbeat-live-pulse`. These call `net.http_post` against the GitHub Actions
   `workflow_dispatch` REST endpoint directly from Supabase, entirely independent of GitHub's own
   schedule queue (that's the whole point of the heartbeat — GitHub's own `schedule:` trigger is
   documented as best-effort and can silently drop under load). Pausing the workflow's own YAML
   schedule does nothing to a cron job that lives in Supabase and calls the dispatch API itself.

Every other plausible auto-trigger path was checked and ruled out directly (not inferred): the
backfill driver, the `trigger-dar-sync` edge function, and the *other* pg_cron schema file. Only
the watchdog and these two heartbeat jobs were still live.

## The fix (code side — this PR)

- **`src/engine/stream-freshness.js`**: `STREAMS` entries for all 18 affected streams (`dar`,
  `fob`, `onHand`, `variance`, `opsCash`, `opsLabor`, `opsService`, `opsSalesMix`,
  `inventorySummary`, `ebos`, `rosterStats`, `rosterRoleCounts`, `turnover`, `digitalApp`,
  `mcdelivery`, `shiftManager`, `qsrSalesQtrHour`, `securityEvents`) now carry `paused: true,
  pausedReason: QSR_COMPLIANCE_PAUSE`. `streamFreshness()` reports `severity: 'paused'` for
  these regardless of staleness (staleDays is still computed correctly underneath — only the
  severity verdict changes). `severityColor('paused')` is gray (`#64748b`). `worstStream()`
  explicitly skips `'paused'` entries (same as it already skipped `'ok'`), and
  `groupFreshness()`'s per-group worst-severity scan ranks `'paused'` below `'ok'` in
  `_SEV_RANK` so a paused sibling can never mask a real crit/warn verdict from an unpaused one in
  the same group.
- **`scripts/lib/scheduled-pull-registry.mjs`**: mirrors the same `paused`/`pausedReason` flags
  onto the matching `PULL_REGISTRY` entries, for discoverability from this file too.
  `src/__tests__/scheduled-pull-registry.test.js` now asserts the two files' `paused` flags
  never disagree per key, the same lockstep guarantee it already enforces for the key sets.
- **`scripts/scheduled-pull-watchdog.mjs`**: `checkStream()` now short-circuits — returns
  `{ key, label, action: 'paused', pausedReason }` with no call to `fetchLatest`,
  `dispatchWorkflow`, or issue creation — whenever the stream's `STREAMS` entry (or its
  `PULL_REGISTRY` mirror) has `paused: true`. `main()`'s loop handles the new `'paused'` action
  by logging (debug only) and moving on, never counting it toward `staleCount` and never calling
  `closeIfRecovered`. **This is the mechanism that actually needed to stop firing** — the watchdog
  will never again re-dispatch a workflow the owner deliberately silenced.
- **`src/views/analytics.js`** (Data Manager panel): the four `autoSyncedRows` entries for
  FOB/eBOS/DAR/Security Events, and every `extAutoRows` entry keyed by a paused `dsField`, now
  show a gray "⏸ PAUSED" badge in place of the green "AUTO" badge, with a sub-label noting the
  schedule is paused for compliance and manual sync only. The header summary line and the old
  green info box's wording ("...pull automatically via GitHub Actions — no action needed") no
  longer claims this for the 18 paused streams; a new gray info box explains the pause and that
  every retrigger failsafe has been checked and disarmed. LifeLenz (not a QSRSoft stream) is
  unaffected and still shows the real "AUTO" badge.

## What the owner still needs to do

This session has no SQL execution path to Supabase. **To fully close the pg_cron bypass, run
this directly in the Supabase SQL editor:**

```sql
select cron.unschedule('external-heartbeat-onhand-pull');
select cron.unschedule('external-heartbeat-live-pulse');
```

Until that runs, those two specific streams (on-hand progress snapshot, live-pulse) can still be
re-triggered by Supabase's own cron, bypassing GitHub entirely — the code-side fix in this PR
cannot reach into Supabase's pg_cron scheduler. Every other paused stream is now fully inert
(no GitHub-side mechanism left that can re-fire it).

## Why this matters beyond the immediate fix

The owner's follow-up instruction — "make sure there are no other failsafes that will override
it again" — is why this went beyond the first mechanism found (the watchdog) to the pg_cron
jobs, which otherwise would have kept silently undoing the pause even after the watchdog was
fixed. A single found-and-fixed mechanism is not the same as "the pause now holds" when a repo
has more than one way to re-trigger a workflow; the whole set has to be checked.

## ✅ CORRECTED 2026-11-17 (same day) — "two still-live pg_cron jobs" was WRONG; do not re-raise it

The "What the owner still needs to do" `cron.unschedule(...)` SQL above was written from reading
`supabase/schema-external-heartbeat-pgcron-2026-11-11.sql` — the **seed SQL**, not the live
scheduler state. That is exactly the "state the observation, not the file" mistake CLAUDE.md's
"measure it, don't reason about it" rule exists to catch, and it happened here despite the rule.

The owner ran the unschedule call and got `ERROR: XX000: could not find valid entry for job
'external-heartbeat-onhand-pull'` — the job doesn't exist. Querying live:

```sql
select jobid, jobname, schedule, active from cron.job where jobname like 'external-heartbeat%';
```

returned **exactly one row**: `external-heartbeat-pull-watchdog` (id 5, `*/30 * * * *`, active).
None of `external-heartbeat-onhand-pull`, `external-heartbeat-live-pulse`,
`external-heartbeat-dar-pull`, or `external-heartbeat-ops-pull` exist in `cron.job` at all —
whether they were never actually deployed from the seed file, or removed before this session
checked, is unknown and no longer matters.

**The one job that IS live is not a bypass.** `external-heartbeat-pull-watchdog` only fires
`scheduled-pull-watchdog.yml` every 30 minutes — it does not call any QSRSoft pull workflow's
`workflow_dispatch` directly. And `scheduled-pull-watchdog.mjs`'s `checkStream()` already got the
paused-stream short-circuit in this same dispatch (see "The fix (code side)" above), so this job
now just triggers logic that correctly no-ops on every paused stream.

**Net: no SQL action is or was needed.** The compliance pause already holds end-to-end through
the code fix alone. Do not ask the owner to run `cron.unschedule` on either of those two names
again — rerun the `cron.job` query above if this needs re-verifying, never the seed-SQL file.
