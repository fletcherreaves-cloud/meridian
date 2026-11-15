---
name: finding-security-events-reQuery-deny-2026-11-14
description: "GH #1532 -- QSRSoft Security Events Pull's real root cause, measured not guessed, revised three times same day. The exact mechanism (per-date lifetime lock vs. a daily request budget) is still not fully confirmed, but either way 'today' is always a wasted request at the 11:00 UTC cron's run time. Fixed by never requesting 'today' at all -- the default window now always ends at yesterday, letting the next day's run capture it in full once it's genuinely elapsed. QSRSoft support declined to change the IAM mapping."
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

## Correction #2, same day: "today" gets no exemption either

The first version of this fix exempted the LAST date in the request list (today) from the
covered-check, on the theory that today is always incomplete mid-day and re-querying it is the
live "new data" case, not the doomed re-query one. **Disproven by a second live dispatch**: a
run requesting ONLY 2026-11-14 (which already had 127 rows from that morning's normal 11:00 UTC
cron) got `AccessDeniedException` on all 252/252 units -- the identical signature, on the exact
date the original fix guaranteed would always be requested.

The real gate is **per-date**, not "past day vs today": once ANY query for a given date has
succeeded once, re-querying that SAME date again is denied, regardless of whether it's today or
a day from weeks ago, and regardless of how many hours separate the two attempts. The practical
ceiling this reveals: this account gets exactly one successful read per date, ever -- there is no
way to check back later in the day to catch events that landed after the morning cron, under this
entitlement. That's not something a client-side change can fix; it's just the shape of the limit.

## What shipped

`scripts/qsrsoft-security-events-pull.mjs`:
- `datesToRequest(allDates, alreadyCoveredSet)` -- pure, exported. Drops EVERY date already known
  to have at least one saved row, no exceptions -- including the last one (today), if today has
  already been queried once this run-cycle.
- `fetchCoveredDates(candidateDates)` -- one `head:true, count:'exact'` existence check per
  candidate date (never fetches the thousands of real rows, just "zero or not-zero"), bounded by
  `DAYS_BACK` (14 by default, so at most ~14 cheap requests), now run against the FULL date list
  (today included) rather than all-but-the-last.
- Wired into `main()`: the normal rolling-window date list is filtered through these before being
  requested at all. Skipped days are logged by name so a future run's log is self-explanatory. An
  empty `requestDates` list (every candidate date already covered) exits cleanly at 0 -- verified
  against `makeOutcomeTracker`'s own `finalize()`, which treats `requestedUnits.length === 0` as a
  genuine no-op success, not a zero-rows failure.

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

## Verification (rounds 1-2, same afternoon)

**Live-verified end to end, in two rounds, on the real self-hosted runner -- not just unit
tests:**
1. First dispatch (the original, since-corrected fix): skip logic correctly cut the request list
   from 756 units (3 days) to 252 (today only, since 11-12/11-13 were already covered) -- but
   today's own query, requested unconditionally, was denied 252/252: the finding that triggered
   the correction above.
2. After the correction, a third dispatch (today already covered from round 1's partial write)
   correctly returned an EMPTY request list and exited 0 -- zero wasted calls, proving the
   "skip every already-covered date" logic end to end.

7 unit tests (`datesToRequest`, pure, no Supabase dependency, updated to assert no exemption for
the last date). Full suite and build pass clean.

## Round 3, same day: the "per-date lock" theory itself doesn't fully hold up

Before calling this closed, checked the actual write TIMESTAMPS (`updated_at`), not just which
dates have rows -- and the picture is messier than "exactly one successful read per date, ever":

- Every historical date (Oct 6 - Nov 13) has a FULL 24-hour spread of event times (`event_tm`
  hours 00-23 all represented), not an early-morning sliver -- impossible if a date's only-ever
  successful read happens at the 11:00 UTC cron, 1-2 hours into that date's own business day.
- The normal cron run THIS MORNING (~12:09-12:10 UTC) wrote full, complete data for 2026-11-11,
  11-12, AND 11-13 in one run -- dates that, under the pre-this-morning code, had already been
  "touched" as "today" on their own respective days.
- But 2026-11-11 ALSO has 2 rows written on 2026-11-13 (`write_minute` 12:10 UTC that day) before
  getting ~7,470 MORE rows written on 2026-11-14 (`write_minute` 12:09 UTC) -- i.e. that exact
  date WAS successfully (if mostly-emptily) queried once, then queried AGAIN successfully two
  days later and got the real data that time, which a strict "once per date, ever" rule would
  not predict.

This doesn't cleanly fit "per-date lock, once ever" OR "per-run request volume quota" alone --
the most consistent read of this specific evidence is something closer to a **daily (or
otherwise time-windowed) request budget per identity**: the morning's big successful batch used
up whatever budget existed for that day, and every later request that same day -- regardless of
which date it names -- gets denied simply because the budget's gone, not because that specific
date is individually blacklisted. Not fully confirmed (would need a clean test ~24h apart with
nothing else running in between), and not re-tested further this pass -- CLAUDE.md's "no second
guesses" rule says the next step from here is a measurement, not a fourth hypothesis in one day.

## What ships regardless of which theory is right

Whichever mechanism this turns out to be, asking for "today" at the 11:00 UTC cron's run time is
ALWAYS wasted effort: today's business day is only 1-2 hours old at that point, so the read is
either locked forever at a tiny fraction of the real day (per-date-lock theory) or burns part of
a scarce daily budget on an incomplete read for no benefit (daily-budget theory) -- in BOTH
readings, tomorrow's run captures today in full once today has actually elapsed (as that
tomorrow's "yesterday", confirmed accurate by the very data pattern above -- every real date was
captured complete the day after it ended, never via its own sliver).

**Fixed**: `getDateRange()`'s default rolling window now ends at **yesterday**, never today --
`QSRSOFT_SECEVENTS_START_DATE`/`END_DATE` (explicit backfill) is unaffected, since that's a
deliberate, named request. `checkFreshness()`'s thresholds shifted +24h (54h warn / 78h error,
was 30h/54h) since `latest` is now intentionally ~2 days old right before a healthy run, not ~1 --
the old thresholds would warn or error on every single healthy run otherwise.

**Not done this pass, flagged for later**: this stream has no entry in
`src/engine/stream-freshness.js`'s `STREAMS` array at all -- CLAUDE.md's own "adding a new
automated pull" checklist requires one (per-stream staleness visibility, not pooled). Pre-existing
gap, unrelated to today's fix, not touched here to keep this change scoped.

✅ **CLOSED 2026-11-15 (v5.791) — the STREAMS gap above is fixed, do not re-raise.** Added a
`securityEvents` STREAMS entry off a new lightweight single-{date}-row probe
(`loadQsrSecurityEventsFreshness()`, reads `event_dt`, same pattern as the On-Hand/Variance
probes task #137 shipped), wired into App.js's startup background stages, plus the matching
`scheduled-pull-registry.mjs` entry the standing invariant test requires. GH #1532 (this finding's
own sync-failure issue) auto-closed 2026-11-14T19:48:13Z after the re-query fix above shipped and
the next scheduled run succeeded -- confirmed via the GitHub API, not assumed.

## Verification (round 3)

Full suite re-run clean on the combined change (existing 21 tests unaffected -- `getDateRange()`
isn't unit-tested directly, same as before, matching this file's own stated convention that its
live network path is verified by an actual dispatched/scheduled run, not a mock). Live
verification: the next scheduled cron run (or a dispatch after today has genuinely elapsed) should
show the window ending at yesterday's date with no "today" unit in the log at all.
