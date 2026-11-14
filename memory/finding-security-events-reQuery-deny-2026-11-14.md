---
name: finding-security-events-reQuery-deny-2026-11-14
description: "GH #1532 -- QSRSoft Security Events Pull's real root cause, measured not guessed: a day already saved gets a guaranteed AWS IAM explicit deny when re-queried; a brand-new day succeeds every time. QSRSoft support declined to change the IAM mapping. Fixed by never requesting an already-covered day -- no QSRSoft cooperation needed."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Security Events Pull: the real shape of the AccessDeniedException (2026-11-14, GH #1532)

## Starting point -- a real contradiction between two measurements

`memory/finding-failed-pull-email-audit-2026-10-06.md` measured `qsr_security_events` at
**zero rows, full history** on 2026-10-06, and concluded the AWS IAM explicit deny
(`AccessDeniedException`, "explicit deny in an identity-based policy") blocked the endpoint
outright for this account's non-interactive Cognito auth -- recommending a QSRSoft support
ticket, since no header/endpoint change could route around a true IAM deny.

Earlier the same day as this finding, a GitHub issue comment (#1532) reported the opposite:
**719,981 total rows, `max(event_dt)` = today, growing** -- while ALSO reporting a dispatched
re-query of 2026-11-12..11-14 failing 100% of 756 units with the identical AccessDeniedException
signature. Both can't be true about "the same gate" -- so before building anything, this was
measured directly rather than trusted from either prior comment.

## Measured, not guessed

```sql
select event_dt, count(*) from qsr_security_events group by event_dt order by event_dt desc;
```

Every calendar day from **2026-10-06 through 2026-11-13** has a full **~7,000-9,000 rows**, zero
gaps. 2026-11-14 (today, partial) had 127 at the time of this check. The 2026-10-06 "zero rows"
finding was simply stale by the time it was written up, or captured before that day's own
scheduled run completed -- not re-litigated further, since the live row-by-day data settles it.

## The real shape of the gate

The daily scheduled run (`0 11 * * *`, `qsrsoft-security-events-pull.yml`) has been pulling a
real, full day's data successfully **every single day** for 5+ weeks. But GH #1532 keeps firing
"still failing" because that SAME run also re-checks a trailing `DAYS_RECENT=2` window of days
it already has -- and *that* re-query, not the fresh-day query, is what the AWS IAM explicit deny
actually gates. A fresh calendar day has never been denied once in the measured history; a
re-query of an already-saved day has been denied 100% of the time, every time it's been tried.

This reconciles the whole picture: the daily run looks "always failing" (triggering sync-failure-
watch) while the table keeps filling up with real data, because the run's "new day" portion
succeeds (filling the table) and its "re-check the last 2 days" portion fails (making the run
exit non-zero) -- in the SAME run, every day.

## Why this isn't a QSRSoft ticket

Asked (2026-11-14): QSRSoft declined to change the IAM role mapping for this non-interactive
auth path -- they're also wary of the overall API pull volume from this account as-is, so asking
for MORE access was the wrong direction entirely. The fix that needs no cooperation from them:
**never make a call that's guaranteed to fail.** This also directly reduces the thing they're
already uneasy about -- hundreds of pointless, guaranteed-403 calls hitting their API every
single day is exactly the kind of traffic that looks hostile/broken from their side, independent
of whether it's "fixed" from ours.

## What shipped

`scripts/qsrsoft-security-events-pull.mjs`:
- `datesToRequest(allDates, alreadyCoveredSet)` -- pure, exported. Drops any date already known
  to have at least one saved row, except the LAST date in the list (today/`endDate`), which is
  always requested regardless -- it's always incomplete mid-day, so re-querying it is the live,
  successful "new data" case, not the doomed re-query one.
- `fetchCoveredDates(candidateDates)` -- one `head:true, count:'exact'` existence check per
  candidate date (never fetches the thousands of real rows, just "zero or not-zero"), bounded by
  `DAYS_BACK` (14 by default, so at most ~14 cheap requests).
- Wired into `main()`: the normal rolling-window date list is filtered through these before being
  requested at all. Skipped days are logged by name so a future run's log is self-explanatory.

## What this does NOT do

- Does not touch QSRSoft's side, does not need their IAM mapping to change, does not need a
  support ticket at all.
- Does not fix a day that was genuinely, fully missed (e.g. a real runner outage) -- that still
  needs an explicit `QSRSOFT_SECEVENTS_START_DATE`/`END_DATE` manual backfill, since the
  always-skip-if-covered logic has no way to tell "covered because it succeeded" from "covered
  because someone already tried and it's hopeless to re-try" -- both look the same (≥1 row
  present). This repo's own standing rule is that a missing-data gap is a backfill, not a finding,
  so that path still exists; this fix just stops the DEFAULT daily run from wasting calls
  re-checking days it has no reason to doubt.
- Known residual edge case: a day with genuinely zero real security events across all 28 stores
  would look "not yet covered" (zero rows saved) and get re-attempted (and likely denied) once
  more the next run -- a one-time false negative, not a crash, and a vast improvement over
  today's "756/756 every single run" shape either way.

## Verification

6 new unit tests (`datesToRequest`, pure, no Supabase dependency). Full suite and build pass
clean. Live verification: re-dispatch the real workflow (self-hosted runner) after this ships and
confirm the run's own log shows the already-covered trailing days being skipped rather than
denied, and exits clean for the first time in this issue's history.
