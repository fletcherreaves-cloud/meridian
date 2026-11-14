---
name: finding-security-flagged-events-guard-bug-2026-11-14
description: "GH #1907 -- the 'Security Rules Run' sync-failure issue. Root cause is a trigger that blocks the batch job's own legitimate evidentiary-field updates on security_flagged_events, not a real security hole. Proposed fix written, NOT run -- owner's SQL-editor call, Tier C/DDL."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# security_flagged_events guard trigger blocks its own batch job (2026-11-14, GH #1907)

## Found while digging into #1314, not sought out

Sync Failure Watch opened #1907 ("🔴 Sync failure: Security Rules Run") at commit `4088e46`
(this session's PR #1900 merge) -- checked whether that commit caused it (it didn't touch
`security-rules-run.mjs` or this schema at all; the commit is just whatever HEAD happened to be
checked out when the failure first fired).

## Root cause, measured from the real job log

`security-rules-run.mjs`'s run on 2026-11-14 16:46 UTC: 10 rules evaluated, 20,918 findings
upserted successfully, but 6 separate `security_flagged_events` upserts each failed:

```
[security-rules-run] flagged-events upsert error: {
  code: 'P0001', message: 'security_flagged_events: evidentiary fields are read-only outside
  the batch job'
}
```

The script's own upsert (`onConflict: 'tenant_id,rule_id,loc,event_date,subject_key'`) does NOT
include `value`/`threshold_used`/`window_start`/`window_end` in its conflict key. Every scheduled
run re-evaluates a rolling recent-date window, so a day whose underlying metric shifted since the
last run (late-arriving rows, a backfill correction) produces a real `UPDATE` on an existing row
with a changed evidentiary field -- exactly the path `schema-security-flagged-events.sql`'s own
comment says is allowed: *"Evidentiary fields written only by scripts/security-rules-run.mjs
(service role)."*

The bug: `_security_flagged_events_guard_evidence()` (a `before update` trigger) has **no role
check at all** -- it fires for every writer regardless of role. Unlike an RLS policy, a trigger
is not something service-role bypasses automatically. So the trigger blocks the batch job's own
legitimate evidentiary update exactly as hard as it would block a real end-user's -- the schema
comment's claim was never actually implemented.

## Not a security hole, not caused by this session's code

This is a correctness bug in a protective trigger, not a vulnerability -- if anything it's
*over*-restrictive right now (blocking a write it's supposed to allow), not under-restrictive.
Confirmed the main findings table (`security_findings`, 20,918 rows) wrote successfully the same
run -- only the smaller `security_flagged_events` escalation table hit this.

## Proposed fix, NOT applied

`supabase/schema-fix-security-flagged-events-guard-2026-11-14.sql` -- exempts service-role writes
with `auth.role() = 'service_role'` inside the trigger function, the SAME idiom this exact
codebase already uses in 5+ other schema files for this identical distinction
(`schema-event-impact.sql`, `schema-forecast-week-cache.sql`,
`schema-hourly-projection-accuracy.sql`, `schema-org-events.sql`,
`schema-qsr-employee-tenure.sql` -- all `auth.role() = 'service_role'` in a policy; this is the
same check inside a trigger instead). A real end-user's status-only UPDATE still runs as role
`authenticated` through the "security_flagged_events: status update" RLS policy -- the guard
still fires for them exactly as before. Only the batch job's own service-role writes are exempted.

**Not run this session** -- schema/DDL changes are Tier C per this repo's standing rule (never
applied unattended). Owner runs it in the Supabase SQL editor when ready; until then, every
scheduled Security Rules Run will keep failing on this same 6-upsert pattern (findings still
write fine, only the flagged-events escalation table misses those 6 rows per run).
