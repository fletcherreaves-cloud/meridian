---
name: finding-qsrsoft-mobile-endpoint-2026-08-21
description: Owner-captured QSRSoft mobile (MOP Service Times) endpoint - mobile-order service times split by channel (drive-thru / front counter / curbside / table service) and by ROA vs not-ROA, with last-year comparisons built in, all 27 stores in one request. Logged for a future pull. Its time fields are MILLISECONDS while the sibling dt-timer endpoint's are SECONDS - the single most dangerous thing recorded here.
metadata:
  node_type: memory
  type: finding
---

# `mobile` — MOP service times by channel and ROA (owner capture, 2026-08-21)

**Logged for later, not scoped as work yet.** Captured alongside
`finding-qsrsoft-dt-timer-endpoint-2026-08-21.md`; same host, same request shape, **different unit**.

```
GET https://api.reports.myqsrsoft.com/data_layer/v1/service/mobile
    ?nsn=<all 27>&orgId=a546d4ef-…&compType=trading
    &timeSegment=custom&segmentBy=summary&segmentNames=open-close
    &startDate=2026-08-20&endDate=2026-08-20&selectCols=…
Referer: https://v3.myqsrsoft.com/reports/mcd/service/MOPServiceTimes
```

DAR host, so the Playwright constraint applies. `compType=trading` = the 4am business day.

## The shape: 4 channels × ROA/not-ROA × 3 measures

Channels **driveThru / frontCounter / curbside / tableService**, each split by **ROA** (Ready On
Arrival) vs **NotROA**, each with `…Trans` (orders), `…ItemCnt` (items) and `…UntilServe`
(cumulative time). Curbside adds `curbsideROAUntilCLC`, `…UntilCLCServe` and `…UntilPay`.

**Last-year comes free.** Every field has an `ly.`-prefixed twin — the same dot-notation
`qsr_daily_activity` already maps to `ly_` columns. Reuse that convention.

## 🔴 THE UNIT TRAP — the most important thing in this file

**`mobile` reports MILLISECONDS. `dt-timer` reports SECONDS. Same host, same day, same request
shape.** Mixing them, or reusing one parser for both, produces numbers wrong by 1000×.

Measured, not assumed:

| | |
|---|---|
| `mobile` 3708 `driveThruNotROAUntilServe` = 39,041,693 over 179 orders | as seconds → **60.6 hours/order** (absurd) · as ms → **218 s/order** ✓ |
| `mobile` 3708 `curbsideROAUntilServe` = 1,816,746 over 6 orders | as ms → **303 s/order** ✓ |

And `dt-timer` is seconds — established with a real discriminator rather than plausibility.
Service-time distributions are **right-skewed**, so mean > median. Reading `dt-timer` as cumulative
seconds gives mean > the median implied by its own `oepe90…210` buckets at every store; reading it
as average-milliseconds puts the mean *below* the median, which is backwards:

| store | mean if TOTAL SECONDS | mean if AVG MS | median from buckets | consistent reading |
|---|---:|---:|---:|---|
| 3708 | 184.8 s | 153.7 s | ~164 s | **total seconds** |
| 33109 | 122.9 s | 73.9 s | ~105 s | **total seconds** |
| 43701 | 163.2 s | 38.7 s | ~114 s | **total seconds** |

## ⚠️ Three more caveats

**1. `driveThruROA*` and `frontCounterROA*` are structurally ZERO at every store.** Not "zero
today" — ROA is a curbside/table-service concept, so those columns carry no information. Six of the
27 requested columns are dead weight; don't select them, and never build a metric that divides by
`driveThruROATrans`.

**2. A store with no last-year history returns `ly.* = 0`, not null.** Store 43701 has every single
`ly.` field at zero — almost certainly a newer store, not one that served nobody. **Zero LY is
absence, not a 100% decline.** Any vs-LY built on this must distinguish them, which is exactly what
`src/engine/vs-ly.js`'s matched-day discipline exists for.

**3. Cumulative again — divide by the matching `…Trans`, and mind which one.** `…UntilServe` pairs
with `…Trans` for that same channel *and* ROA state. Pairing a ROA numerator with a NotROA
denominator is an easy and invisible error.

## ✅ It also resolves an open question in the `dt-timer` finding

`dt-timer` returned **24 of 27** stores; 18213, 35242 and 37566 were absent, and that file could
only say "absence is not zero — closed, no-DT and timer-down are indistinguishable."

**`mobile` returns all 27, and shows those three had drive-thru mobile orders that day** (71, 45 and
76 `driveThruNotROATrans`). So they were open and do have a drive-thru — the `dt-timer` gap is a
**dead or unreported DT timer**, not a closed store and not a missing lane.

**That makes `mobile` a usable cross-check for `dt-timer` coverage**, and it is the kind of
answer #171's per-stream staleness problem wants: a second source that distinguishes "no data"
from "no activity."

## Why it is worth a dispatch later

- **Channel attribution for mobile orders.** Meridian has no view of MOP service time by channel
  today, and curbside vs drive-thru mobile are different operational problems.
- **ROA vs not-ROA is the operational question** — did the order get made before the customer
  arrived, or did they wait? That is a coachable, controllable behaviour.
- Vs-LY is built in, at no extra call.
- Same caveats as its sibling: unpadded `storeNum`, and the overlap with `qsr_daily_activity`
  remains **unexamined** — check before adding a stream.
