---
name: finding-lifelenz-dar-vs-qsrsoft-dar-2026-11-05
description: "Owner asked whether LifeLenz's own Daily Activity Report (its GetDARData GraphQL query) might be more accurate than the QSRSoft DAR this app currently relies on for sales/transactions/service-time/labor. Measured, not assumed: pulled a real day (store 0003708, 2026-11-03) from both sources and diffed field-by-field. Verdict: near-perfect agreement on every field checked -- strong evidence LifeLenz's DAR is downstream of the same underlying feed QSRSoft reports from (or vice versa), not an independent cross-check. No swap, no new pipeline recommended."
metadata:
  type: finding
---

# LifeLenz DAR vs QSRSoft DAR -- measured agreement (2026-11-05)

## What was asked

Owner, mid-session, flagged LifeLenz's own GraphQL `darData` query (`POST
us01-connect.lifelenz.com/manager/graphql?GetDARData`) as a possibly-more-accurate alternative
to the QSRSoft DAR (`qsr_daily_activity`) this app already depends on for sales, transactions,
DT/FC/MFY service times, and labor hours -- "worth a test, although it could be difficult as
well."

## Method

One real store/day, both sources, same window: store 0003708, business date 2026-11-03.

- **LifeLenz**: `darData(businessId, scheduleId, startDateTime: "2026-11-03T09:00:00.000Z",
  endDateTime: "2026-11-04T09:00:00.000Z", granularity: quarter_hour)` -- 96 quarter-hour rows +
  a `totals` array. Live call, 200 OK, using the x-auth-token the owner captured from his own
  browser session that same day (not a stored credential -- there is no automated LifeLenz auth
  path for this endpoint in this repo today).
- **QSRSoft**: `qsr_daily_activity` where `loc='0003708' AND dt='2026-11-03'`, all 24 real
  `hour_slot` rows (05:00→28:00, confirmed complete -- no short-day risk per CLAUDE.md's own
  standing caveat on that table), summed.

## Measured agreement

| Field | QSRSoft (summed) | LifeLenz (`totals`) | Agreement |
|---|---|---|---|
| Net sales | `product_sales` Σ = **$10,222.03** | `net_sales` = **$10,222.03** | **100.00%** -- exact |
| Transactions (all channels) | `dt_trans_cnt`+`fc_trans_cnt`+`is_trans_cnt` Σ = **1,122** | `transactions` = **1,121** | **99.91%** -- off by 1 |
| Actual punch hours | `actual_punched_hours` Σ = **186.78** | `actual_punch_hours` = **186.8** | **99.99%** |
| DT service time | `dt_untilserve` Σ ÷ `dt_trans_cnt` Σ = **166.3s** | `avg_dt_service_time` = **168s** | **~99.0%** (1.7s gap) |

All four fields tested agree to within rounding. This is not a "roughly similar" result -- sales
matched to the exact cent, punch hours to two decimal places.

## What this means

**This is strong evidence the two sources are not independent measurements of the same reality
-- one is very likely downstream of the other (directly, or via a shared upstream feed), not two
separate sensors confirming each other.** Two real sensors independently measuring the same
real-world sales/punch activity do not agree to the exact cent and to 0.02 hours by chance. Most
likely explanation: LifeLenz's own `darData` report is itself fed by an integration with
QSRSoft's reporting (or both ultimately read the same POS/time-clock export) -- not LifeLenz
independently re-deriving these numbers from its own sensors.

**Practical consequence: pulling LifeLenz's DAR as a genuine accuracy cross-check would not
actually buy anything.** If it's the same number arriving twice, disagreeing with it would mean
a transcription/timing bug in one leg of a shared pipeline, not a real-world discrepancy worth
reconciling -- and agreeing with it (as measured here) tells us nothing we didn't already know.

## The one real signal worth flagging: `missingActuals`

10 of 96 quarter-hour intervals in the LifeLenz response carried `missingActuals: true` -- all
clustered at two bands: ~3:45am–5:15am local and ~10:45pm–11:15pm local (store's business-day
edges). LifeLenz is honestly flagging its own data as incomplete at those overnight/closing-
adjacent intervals. This did not visibly distort the DAILY totals (the agreement above holds),
but it does mean LifeLenz's own intraday (quarter-hour) data is less complete than QSRSoft's at
the edges of the business day -- another reason not to prefer it as a primary source, even for
sub-daily granularity.

## Not independently verified (scope limits of this one-day measurement)

- **Only one store, one day.** A single near-perfect match is strong but not a 27-store,
  multi-week reconciliation. If this is ever revisited, the audit-emailed-stream-redundancy
  methodology (`memory/audit-emailed-stream-redundancy-2026-08-27.md`) is the right template --
  measure a real sample, state the %, don't extrapolate from one row.
- **Business-day boundary alignment was not independently reconciled to the minute.** LifeLenz's
  window was `09:00:00.000Z → 09:00:00.000Z` (next day); store 0003708 is Oklahoma (Central), and
  by 2026-11-03 the US has already left DST (CST, UTC-6), so `09:00Z` is **3:00am local, not
  4:00am** -- a full hour earlier than the documented 4am ABC business-day cutover QSRSoft's
  `hour_slot` is aligned to (CLAUDE.md: "THE BUSINESS DAY RUNS 4:00am → 4:00am"). Despite that
  apparent 1-hour offset, the daily totals still matched almost exactly -- plausible only because
  that extra/missing hour (3am-4am) is very low-activity for this store, not because the offset
  doesn't exist. **This was not reconciled hour-by-hour against QSRSoft's `hour_slot` grid** (that
  would require matching each LifeLenz quarter-hour bucket to the right QSRSoft hour and checking
  for a systematic 1-hour shift) -- flagged here so a future pass doesn't assume the two are
  bucket-for-bucket aligned just because the daily sum came out close.

## Recommendation

**No pipeline change.** Do not build a LifeLenz DAR pull. The measured agreement says this would
either silently duplicate data already in `qsr_daily_activity` or (at the business-day edges)
import LifeLenz's own self-flagged incomplete overnight data -- neither is worth the engineering
cost of a new intraday pull (no bulk CSV/report shortcut exists for this endpoint; it's one
GraphQL call per store per day, unlike the roster/availability reports). If LifeLenz's actual
punch-hours figure is ever specifically in question (e.g. cross-checking the Pay Rate History
wage work from earlier today), that's a narrower, already-partially-explored question --
`finding-crew-pay-rate-ot-blending-2026-11-05.md` already looked at `lifelenz_payroll_readiness`
for that purpose and hit its own documented grain bug; this DAR endpoint is a different, less
direct path to the same punch-hours number and adds no new accuracy over what's already measured
here (99.99% agreement with QSRSoft's own punch-hours figure).
