# DAR rollup's `ly_product_sales` is 364-day matched-weekday, not calendar-year-back — distorts December calendar-month sums (2026-09-11)

Found while building `scripts/refresh-projections-workbook.py` (the owner's personal monthly
projections workbook refresh). Not a bug in Meridian — `ly_product_sales` in
`qsr_daily_activity_rollup` behaves exactly as `src/engine/vs-ly.js` already documents
("DAR's own LY is same-date → authoritative", `_addD(d, -364)` used elsewhere in that same
file for the identical convention) — this note records a real, measured consequence of that
convention that isn't written down anywhere else, in case a future panel trips over it.

## The mechanism

`ly_product_sales` on a given `(loc, dt)` row is the prior year's sales for the date **364
days back** (52 weeks, weekday-preserving), not `dt` minus one calendar year. Verified by
tracing individual days for store 3708: `2025-12-24` (Wed) → `ly_product_sales` matches
`2024-12-25`'s own recorded `product_sales` exactly (also a Wednesday — Christmas Day).

This is the right choice for an ordinary week (keeps Fri-vs-Fri, weekend-vs-weekend). It goes
wrong specifically around a **fixed-calendar-date holiday**: Christmas doesn't fall on the same
weekday every year, so the 364-day-back version of "the day near Christmas this year" can land
exactly ON last year's Christmas Day instead of the equivalent pre-Christmas trading day —
pairing a normal day against a near-zero holiday day (or vice versa).

## Measured impact

Summing `product_sales`/`ly_product_sales` over a plain **calendar month** (Dec 1–31) inherits
this distortion because December's calendar boundary sits in the middle of the Dec 24–Jan 1
holiday cluster. Checked against the owner's own confirmed-correct September-2026 workbook
(`data/restaurant-targets/` sibling context — see PR #1232 commit history for the workbook
this compares against):

| Month | mean signed diff (rollup vs. confirmed-correct) | n stores |
|---|---|---|
| Sep-25 – Nov-25 | +0.4 to +1.0pp | 25 |
| **Dec-25** | **+5.23pp, positive for 26/27 stores** | 26 |
| Jan-26 | +1.6pp | 26 |
| Feb-26 – Jul-26 | -0.2 to +0.7pp | 26 each |

Every other month is within ordinary noise (~0.2–1.8pp, expected from a different underlying
methodology than whatever the workbook was originally checked against). December alone is a
5+pp outlier, consistently positive, across nearly every store.

## What this means going forward

- **`scripts/refresh-projections-workbook.py` prints a loud warning** whenever December falls
  inside its 12-month window or is the forecast-month's LY lookup, and says to hand-check that
  one column. It does not attempt to auto-correct it — no clean general fix was derived (would
  need to special-case the holiday week's day-pairing, not just re-window the sum).
- **Nothing else in the live app was found broken by this** — `vs-ly.js`'s own matched-day
  helpers (`autoFirstDaily`/`matchedVsLY`) don't sum by calendar month at all; they compare
  day-by-day over whatever range is requested, so a caller only inherits this distortion if it
  independently sums a calendar month's worth of `ly_product_sales` outside those helpers.
  Grepped for other calendar-month `ly_product_sales` summations at time of writing — none
  found — but if a December anomaly ever shows up in a monthly rollup panel, this is the first
  thing to check.
- **Do not "fix" the 364-day convention itself.** It's deliberate and correct for 11 months of
  the year; the fix (if one is ever wanted) belongs in whatever specific calendar-month
  aggregation hits the holiday week, not in the underlying `ly_` field.
