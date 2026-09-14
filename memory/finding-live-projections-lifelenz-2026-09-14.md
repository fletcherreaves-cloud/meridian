# "Live projections" — resolved: this is the LifeLenz lead-time capture project (2026-09-14)

Owner asked (from a conversation earlier in this session that was lost to context compaction —
no memory file or commit had recorded it, so this file exists to make sure it doesn't happen
again): "Where did we land on 'live projections' from my comment a few days ago (LifeLenz
updating forecast up to the actual date)?"

## Resolution

Confirmed via the owner pasting their own LifeLenz AI Bot conversation: this is the **LifeLenz
lead-time forecast capture** project, already fully designed and shipped —
`memory/project-lifelenz-leadtime-capture-2026-09-11.md`, v5.429, PR #1237, merged 2026-09-11
(3 days before this question was asked).

**The owner's own framing to the LifeLenz bot** (pasted verbatim): *"we are very good at our
current method, but LifeLenz is edging us out and I presume it is due to the live nature of
their forecast model... capture the LifeLenz forecasts and log them and not overwrite so we can
backtest against it... implemented that strategy and agreed to wait several weeks to see what
the results of that approach were."*

**LifeLenz's own bot confirms the mechanism**: *"Daily forecasts are updated continuously as the
date gets closer... refining them using recent sales, weather, and other trends... Forecasts
become more accurate the closer you get to the actual date."* — this is exactly what
`project-lifelenz-leadtime-capture-2026-09-11.md` documents as the reason the OLD "MBI vs
LifeLenz Accuracy" comparison was unfair: `lifelenz_schedule` upserts on `(loc, date)`, so every
pull overwrites `fcst_sales` — the number shown for a past date is LifeLenz's freshest,
most-informed version, not what a human actually saw when scheduling. Meridian's own `simple`
model, by contrast, is a leak-free retrospective calculation. Not apples to apples.

## What already shipped (2026-09-11, do not re-build)

- New table `lifelenz_forecast_captures` (`supabase/schema-lifelenz-forecast-captures.sql`):
  `(loc, target_date, captured_date)` PK + `lead_days`, `fcst_sales`, `adj_fcst_sales`. One row
  per store per future date, written on EVERY daily pull — never overwritten — so a full
  lead-time curve accumulates per `(loc, target_date)` over time.
- `scripts/lifelenz-pull.mjs`: `buildLeadTimeCaptures(rows, todayStr)` (pure) +
  `captureForecastLeadTime(rows)` (async writer, non-fatal on failure). 5 tests in
  `src/__tests__/lifelenz-forecast-lead-time-capture.test.js`.
- The owner's specific ask ("LifeLenz's forecast as captured the Thursday before the work week
  it describes") is just a `where captured_date is Thursday AND lead_days=6` query against this
  table once it has history — no special-case code needed.

## What's still open

1. **No UI panel reads this table yet.** The capture mechanism shipped; the actual "MBI vs
   LifeLenz (matched lead time)" comparison view is unbuilt follow-on work — deliberately, since
   the table needs real weeks of history first (a Thursday/6-day slice needs several actual
   Thursdays to pass).
2. **Schema may not be applied to the live database.** `supabase/schema-lifelenz-forecast-captures.sql`
   needs to be run in the Supabase SQL Editor before `captureForecastLeadTime()`'s writes
   succeed — until then it fails non-fatally (a warning, not a blocker to the primary
   `lifelenz_schedule` sync) and the table silently accumulates zero rows. Worth a live check
   before assuming several weeks of data is actually there when the wait period ends.
3. **The comparison view build** — whenever the owner decides enough history has accumulated,
   this is the next real piece of work: query `lifelenz_forecast_captures` at the fixed lead time,
   join to `forecast_snapshots`/whatever Meridian's own leak-free number was for that date, grade
   both against actuals. `memory/project-lifelenz-leadtime-capture-2026-09-11.md` already
   documents exactly how to do this — no new design needed, just execution once the data exists.
