# LifeLenz lead-time forecast capture — design + rationale (2026-09-11)

Owner asked, verbatim: *"devise a way to capture lifelenz forecasts on the Thursday prior to the
next work week (6 days advance) and compare to our forecast data as-is to see how we stack up to
that comparison. More apples to apples. I suspect we will win then!"*

This file documents the mechanism built in response. See
`memory/finding-simple-model-holiday-blindness-2026-09-11.md` for the analysis that motivated it
(LifeLenz wins 57.3% of days on the current, lead-time-UNMATCHED comparison).

## The problem this solves

`lifelenz_schedule` upserts on `(loc, date)` — every daily pull overwrites `fcst_sales` for a
given target date. LifeLenz's own support bot (asked directly by the owner) confirms forecasts
"update continuously as the date gets closer." So the `fcst_sales` a past date shows today is
whatever LifeLenz's system last reported for it — effectively its day-of number, not what a human
saw when they actually had to lock a schedule. That makes the existing "MBI vs LifeLenz Accuracy"
comparison biased toward LifeLenz's freshest, most-informed number, while Meridian's `simple`
model is a leak-free retrospective calculation. Neither side is wrong, but they're not on the same
lead time — so a straight win/loss count doesn't answer the owner's real question.

This can't be fixed retroactively: the lead-time history for every past date is already destroyed
by the upsert. It can only be fixed going forward, by never overwriting.

## Design

New table `lifelenz_forecast_captures` (`supabase/schema-lifelenz-forecast-captures.sql`):
`(loc, target_date, captured_date)` composite PK, plus `lead_days` (denormalized
`target_date - captured_date`), `fcst_sales`, `adj_fcst_sales`. One row per store per future date,
written on every daily pull run — so over time this accumulates a full lead-time curve per
`(loc, target_date)`: what LifeLenz predicted 30 days out, 20 days out, ... 1 day out, for the
same day.

Written by `scripts/lifelenz-pull.mjs`, right after the existing `upsertRows()` call for each
store's schedule, via two new functions:

- `buildLeadTimeCaptures(rows, todayStr)` — pure, no I/O. Filters a store's schedule rows to
  strictly-future dates (`date > today`) with a non-null `fcst_sales`, and maps each to a capture
  row with `lead_days = target_date - captured_date` in whole days. Unpads `loc` to match
  `forecast_snapshots`' own convention (matches existing helper usage elsewhere in the script).
- `captureForecastLeadTime(rows)` — async wrapper: calls `buildLeadTimeCaptures`, upserts the
  result to Supabase. Non-fatal on failure (logs a warning, returns 0) — matches the existing
  script's error-handling posture for secondary writes so a capture failure never blocks the
  primary `lifelenz_schedule` sync.

Unit-tested in `src/__tests__/lifelenz-forecast-lead-time-capture.test.js` (5 tests) against the
real exported `buildLeadTimeCaptures` — future-only filtering, null-forecast exclusion, multi-store
independence, and a concrete worked example confirming a Thursday capture with `lead_days=6` lands
on the following Wednesday (the day Meridian's business week starts).

## The owner's specific ask is just a filter on this shape

"LifeLenz's forecast as captured the Thursday before the work week it describes" = rows where
`captured_date` falls on a Thursday AND `lead_days = 6`. No special-case code needed — once this
table has a few weeks of history, that's a `where` clause against it, joined to `forecast_snapshots`
the same way the existing Accuracy tab already joins to `lifelenz_schedule`.

## What's NOT done yet

- **No UI panel reads this table yet.** This dispatch only builds the capture mechanism. Building
  the actual "MBI vs LifeLenz (matched lead time)" comparison view is follow-on work, and should
  wait until there's enough history to be meaningful (the table has zero rows until this ships and
  the first daily pull runs against a live schema).
- **Schema not yet applied to the live database.** `supabase/schema-lifelenz-forecast-captures.sql`
  needs to be run in the Supabase SQL Editor before `captureForecastLeadTime()`'s writes will
  succeed — until then it fails non-fatally (warning only, matching the design above) and the
  daily pull's primary `lifelenz_schedule` sync is unaffected.
- **Needs real time to accumulate before it's useful.** A single day's capture only has one
  lead-time data point per target date; the Thursday/6-day slice specifically needs several weeks
  of Thursdays to pass before there's a meaningful sample.
