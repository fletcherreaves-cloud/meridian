# Supabase PITR — dry-run runbook

> Walked through conversationally with the owner 2026-10-08. Not yet executed — this is the
> checklist for the FIRST dry run, so the first real restore isn't also the first time anyone's
> used the tool. See `supabase.com/docs/guides/platform/backups` before relying on any number
> below; retention/pricing specifics drift and should be re-verified against the live pricing
> page at execution time, not assumed from this file.

## What PITR actually is (so the checklist below makes sense)

Supabase pairs periodic physical snapshots with continuous Postgres WAL (write-ahead log)
archiving via WAL-G. A restore takes the most recent snapshot before your target time and
replays WAL forward to the exact second requested — fine-grained, not just "last night's
midnight." Covers Postgres only: Storage buckets, Edge Function code, and secrets are NOT in the
WAL and are not restored by this mechanism.

## Before the dry run — confirm these first (not yet checked this session)

1. **Plan eligibility.** PITR requires Pro/Team/Enterprise *and* the PITR add-on *and* at least a
   "Small" compute add-on — three separate things. Check Dashboard → Settings → Billing, and
   Settings → Database → Backups → Point-in-Time tab, for current state.
2. **Current retention window**, if already enabled — shown on that same Point-in-Time tab.

## The dry run itself — use "Restore to a New Project," never production

This is the whole point of a dry run: it rehearses the mechanism without touching the live
Meridian database or causing owner-facing downtime.

1. Dashboard → Database → Backups → Point-in-Time tab → **Restore to a New Project**.
2. Pick a target timestamp from the last few days (something with known-good data, so the result
   is easy to eyeball-verify).
3. Confirm the new project provisions and reaches the target state. Expect normal new-project
   compute/disk billing for as long as it's kept around — tear it down once the check below
   passes, to not carry a surprise second bill.
4. **Verify against something concrete**, not just "it looks fine": pick 2-3 known rows/values
   from the target timestamp (e.g. a specific `qsr_fob` row for a known store/date, or a
   `lifelenz_schedule` row) and confirm they match what the live project showed at that same
   moment. This is the "measure it, don't reason about it" check — a restore that silently landed
   a few minutes off target would otherwise look identical.
5. Note how long steps 2-4 actually took, start to finish. That's the real number for "how long
   would a live incident recovery take," which is what actually matters operationally — a
   restore-to-new-project rehearsal and a live in-place restore aren't identical operations, but
   the WAL-replay time for the same data volume is the dominant cost in both.
6. Delete the dry-run project once verified, so it doesn't sit there racking up compute/disk cost
   for no reason.

## If/when a REAL restore is ever needed (not a dry run)

- It takes the live project offline during the restore; downtime scales with database size.
  Plan for that before starting, not mid-incident.
- Any logical replication slots/subscriptions must be manually dropped beforehand and
  re-created after. Realtime's own slot is exempted automatically.
- Can be done via API (`POST .../database/backups/restore-pitr`, `recovery_time_target_unix`) if
  dashboard access is somehow unavailable.

## Open items

- Dry run has not been executed yet — this file is the plan, not a completed check.
- Current plan/add-on eligibility not yet confirmed from this session (no billing-dashboard
  access here).
