---
name: finding-lifelenz-gap-detection-dead-code-2026-10-06
description: lifelenz-pull.mjs's "smart gap detection" (getLatestDate -> daysBack) was dead code -- it always collapsed to exactly SAFETY_DAYS (3) because getLatestDate() read the whole table's MAX(date), which is always polluted by the script's own 14-day forward schedule horizon. Any outage longer than 3 days permanently strands the gap once the sync resumes further out than SAFETY_DAYS, with nothing to ever auto-heal it. Fixed + backfilled the live 2026-09-25/09-26 gap this caused.
metadata:
  node_type: memory
  type: finding
---

# LifeLenz gap detection was dead code — any outage > 3 days permanently strands data (2026-10-06)

## What the owner reported

MBI vs LifeLenz Accuracy panel, store 6972 (Ada-Country Club): Fri Sep 25 showed LFZ Actual
$4,048 against an LFZ Forecast of $20,652 (+410.22% var) and Sat Sep 26 showed LFZ Actual $0 (var
`—`, fully missing) — while Meridian's own actual (MBI, sourced from the auto QSRSoft streams)
showed real, plausible numbers for both days ($19,432 and $19,172). Asked to check the gap.

## Measured against the real data

Queried `lifelenz_schedule` directly (service-role key) for store 6972 and found the exact same
pattern **district-wide, all 27 stores**, on 2026-09-25: every single store's `sales` value was
~18-31% of its own `fcst_sales` — a uniform, implausible ratio across the whole district, the same
"uniform shortfall across every store" tell CLAUDE.md's own standing rule flags as a measurement
artifact, not real performance (see the same-day Pace to Target finding). 2026-09-26 was `sales:
null` for all 27 stores — a full day with zero actual data captured.

`updated_at` on these rows told the real story: the 09-22 through 09-26 rows (and Fri 09-25 itself)
were ALL written in the SAME sync run, at `2026-09-25T14:58:01Z` (~9:58am CDT) — i.e. 09-25's
"actual" is a snapshot of that single morning's sales-to-date, not the finished day's total (hence
the ~20-30% ratio — roughly a morning's worth of a full day's sales), and 09-26's `null` is simply
"the day hadn't started yet" at pull time. **No later sync ever went back and re-pulled either day
once they'd actually closed.** The very next successful row (09-27) wasn't written until
`2026-09-30T22:42:33Z` — a 5-day gap, almost certainly the known LifeLenz-token-expiry failure
mode (CLAUDE.md: "Expires roughly monthly... sync fails with 401/403"). Confirmed via GitHub
Actions history: a manual `workflow_dispatch` run on 09-30 at 19:57 UTC **failed**, then another at
22:36 UTC **succeeded** — someone refreshed the token and re-ran it that day.

## Root cause: gap detection was permanently dead code

`getLatestDate()` (`scripts/lifelenz-pull.mjs`) used to be a bare
`ORDER BY date DESC LIMIT 1` over the **whole** `lifelenz_schedule` table. That table also holds
the `DAYS_FWD` (14-day) forward *schedule* horizon this same script writes on every successful
run — rows that exist regardless of whether any PAST day's actual ever landed. So the table's
`MAX(date)` is always ~14 days ahead of "today", confirmed live: table MAX(date) was
`2026-10-20` while "today" was `2026-10-06`.

`main()`'s window math:
```
daysSince = today - latestDate          // always deeply negative (the +14-day skew)
daysBack  = max(SAFETY_DAYS, daysSince + SAFETY_DAYS)   // always collapses to SAFETY_DAYS (3)
```
So the "smart gap detection" **always** evaluated to exactly `SAFETY_DAYS=3`, regardless of how
long the sync had actually been down. The *only* thing ever re-validating past days was that fixed
3-day rolling safety window. This specific outage ran 5 days (09-26 → 09-29); by the time sync
resumed on 09-30, `today - 3 = 09-27` — no longer reaching back far enough to re-touch 09-25/09-26.
**Any outage longer than 3 days permanently strands the days that fall outside that window the
moment the sync resumes further out than 3 days back** — there is no other mechanism that ever
goes back for them. This is not a rare edge case; it is the standing behavior for every outage of
this shape, and it already happened at least once before by the same mechanism (the Aug 6-11
six-day outage CLAUDE.md's own "Adding a new automated pull" rule cites).

## Fix

`getLatestDate()` now finds the latest date **strictly before today** with a **non-null `sales`**
— the real frontier of confirmed actuals, immune to both the forward-schedule pollution (excluded
by the date filter) and a day whose sync never completed (excluded by the null filter). Today's own
row is deliberately excluded too, since it is always a partial in-progress snapshot while synced
during the business day — treating it as "confirmed" would stop the gap scan one day too early.

With this fix, on resume after any outage, `daysSince` correctly reflects the real gap size, so
`daysBack` scales up to cover it (capped at `DAYS_BACK`, default 30) — the next successful run
naturally re-pulls and overwrites (upsert `onConflict: 'loc,date'`) every date in the real gap,
including a stale partial-day row like 09-25's. No code change was needed in `main()` itself; the
bug was entirely in what "latest" meant.

4 new tests (`dispatch-lifelenz-gap-detection-2026-10-06.test.js`), mocking the Supabase query
builder to assert the actual filters sent (`date < today`, `sales IS NOT NULL`) — the only way to
prove which query shape ran, since a live call either errors or returns data and neither one
distinguishes the old dead-code query from the fix. Same mocking pattern as #365's
`ebos-monthly-date-bounds.test.js`.

## Backfill

Triggered `lifelenz-pull.yml` via `workflow_dispatch` with `start_date=2026-09-25` (bypasses gap
detection entirely, per the workflow's own existing input for exactly this situation) — re-pulls
and upserts real data for 09-25 onward across all 27 stores, overwriting the bad partial-day
09-25 row and filling the null 09-26 row with LifeLenz's now-final actuals.

## Scope note

This fix only prevents a PAST gap from being permanently stranded once the sync resumes — it does
not prevent the mid-sync partial-day capture itself (a day pulled while still in progress will
always read as partial at the moment of that pull; that's an inherent property of asking an
in-flight business day "what's your total so far"). That part is expected and self-corrects
automatically the next day once `getLatestDate()` no longer treats "today" as confirmed. The
09-25/09-26 pattern was two compounding things: a normal partial-day capture (09-25) PLUS an
outage that prevented the normal next-day correction from ever happening (09-26 onward) — this fix
closes the second, which is what made the first permanent.

## Audited every other pull script for the same bug — only LifeLenz had it

Asked whether any other automated stream shares this failure mode. Grepped every script in
`scripts/` for the `getLatestDate`/`daysSince`/`daysBack` gap-detection shape and checked each hit
for the one thing that actually causes the bug: **does this script also write rows dated AFTER
today into the same table/column its own gap detection reads?** That combination — not the
gap-detection pattern alone — is what makes "latest date" lie about how current the real data is.

8 scripts use this pattern: `lifelenz-pull.mjs` (fixed above) and 7 QSRSoft pull scripts —
`qsrsoft-dar-pull.mjs`, `qsrsoft-ebos-pull.mjs`, `qsrsoft-pull.mjs` (FOB), `qsrsoft-punch-times-
pull.mjs`, `qsrsoft-register-audit-pull.mjs`, `qsrsoft-security-events-pull.mjs`, plus
`scheduled-pull-watchdog.mjs` (a false-positive grep hit — it's the freshness-SLA watcher, not a
puller, and has no `getLatestDate` at all).

Checked every `addDay(today, N)` call with a positive `N` in all 7 QSRSoft scripts: every one is
either a bounded backfill-chunk loop increment (`addDay(cur, 1)` stepping through an already-
bounded range) or explicitly capped at `fmtDate(today)`/an explicit `END_DATE`. **None of them
ever write a future-dated row.** So for all 7, `getLatestDate()`'s bare `MAX(date)` genuinely does
mean "the real pull frontier" — an outage correctly grows `daysSince`, correctly grows
`daysBack`/`daysToFetch` up to that script's own `DAYS_BACK` cap, and the next successful run
correctly re-pulls the whole real gap. Their gap detection is NOT dead code; it works as designed.

Also checked the other 3 LifeLenz-family scripts (`lifelenz-attendance-pull.mjs`,
`lifelenz-people-pull.mjs`, `lifelenz-vlh-sync.mjs`) — none of them implement any gap-detection
logic at all (no `getLatestDate`/`daysSince` anywhere), so they aren't exposed to this failure mode
either, by a different route (nothing to pollute).

**Conclusion: this was unique to `lifelenz-pull.mjs`, because it's the only pull script that also
writes a forward SCHEDULE horizon (`DAYS_FWD`, 14 days of future staffing data) into the exact same
table and date column its own gap detection reads.** No other stream needs this fix. Re-verify this
conclusion (not just assume it still holds) before relying on it if a NEW automated pull is added
that writes any future-dated row into a table it also smart-gap-detects against.
