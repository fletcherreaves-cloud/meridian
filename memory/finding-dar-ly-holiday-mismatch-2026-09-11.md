# DAR rollup's `ly_product_sales` is 364-day matched-weekday, not calendar-year-back — distorted December calendar-month sums, FIXED same day (2026-09-11)

✅ **RESOLVED same day.** Owner's own suggestion: "as long as we are pulling genuine calendar
dates, December should not be an issue... same # of open days each year." Right call —
`scripts/refresh-projections-workbook.py`'s monthly comps (Block 2 + Block 3's forecast-month
LY comp) now sum each store's own `product_sales` independently over the current calendar month
AND the same calendar month one year earlier (`month_own_sum`/`month_comp`), with **no `ly_`
field involved at all** for monthly figures. Re-validated end-to-end after the fix: December's
worst-case diff against the confirmed-correct workbook dropped from **+7pp / +5.23pp average
bias** to **1.08pp max, no longer a systematic outlier** — same noise band as every other
month (0–2.1pp across all 283 re-checked store-months). Weekly comps (Block 1, Block 3's
guest-count L6W/L2W) correctly keep using the 364-day `ly_` field — see "Why weekly stays
364-day-based" below. The mechanism/measurement sections below are kept as the record of what
was found and why the fix works; do not re-diagnose this.

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

## The fix

For any MONTHLY comparison, sum both sides independently from genuine calendar dates — this
store's own `product_sales` for the current calendar month, and this store's own
`product_sales` for the same calendar month one year earlier — then divide. Never touch the
`ly_` shadow field for a monthly sum. This works because a calendar month always has the
correct number of real days on both sides regardless of which weekday it starts on or whether
either year is a leap year; there is no matching/pairing step left to go wrong.

Re-validated 2026-09-11 against all 283 overlapping store-months in the confirmed-correct
workbook: max abs diff 2.145pp (one non-December outlier, ordinary noise), December's own max
abs diff 1.081pp — fully inside the same noise band as the other 11 months.

## Why weekly stays 364-day-based (not the same fix)

Block 1 (13 weekly comps) and Block 3's guest-count L6W/L2W deliberately keep using the `ly_`
field's 364-day matched-weekday convention — this is NOT the same bug, and switching it to
calendar-date matching would make weekly comps *worse*, not better: a real calendar-year offset
(365 or 366 days back) lands on a **different weekday** most of the time (e.g. comparing a
Tuesday against a Thursday), which matters far more for a single week's volume than the rare
holiday-week mispair does. 364 = 52×7 exactly, so it preserves weekday **by construction,
regardless of leap years** — verified directly against the real 2024 leap day: `2025-02-26`
(Wed) minus 364 days lands on `2024-02-28` (Wed), still correctly weekday-aligned. Python's own
`date`/`timedelta` arithmetic (used throughout the script) is leap-year-correct natively; there
is no custom day-counting logic anywhere in this script that could drift.

The one remaining residual risk for weekly is the same KIND of issue as the December one, just
far smaller: the single week that happens to contain Feb 29 in a leap year could see a one-day
matched-pair shift, the same way the week containing Dec 25 does. Not fixed, because Feb 29 has
no volume-cliff behavior like a holiday closure — noted here so it isn't mistaken for a new bug
if it's ever noticed.

## Nothing else in the live app was found broken by this

`vs-ly.js`'s own matched-day helpers (`autoFirstDaily`/`matchedVsLY`) don't sum by calendar
month at all; they compare day-by-day over whatever range is requested, so a caller only
inherits this distortion if it independently sums a calendar month's worth of
`ly_product_sales` outside those helpers. Grepped for other calendar-month `ly_product_sales`
summations at time of writing — none found — but if a December anomaly ever shows up in a
monthly rollup panel, this is the first thing to check, and the fix is the same
`month_own_sum`/`month_comp` pattern above, not a change to the `ly_` field's own convention.
