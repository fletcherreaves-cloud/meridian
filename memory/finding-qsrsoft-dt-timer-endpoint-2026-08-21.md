---
name: finding-qsrsoft-dt-timer-endpoint-2026-08-21
description: Owner-captured QSRSoft dt-timer endpoint - whole-estate drive-thru timer segments (greet/order/line/window) plus an OEPE DISTRIBUTION (counts under 90/120/150/180/210s), all 27 stores in ONE request, business-day aligned via compType=trading. Logged for a future pull. Includes four measured caveats that would each produce a wrong number if read naively.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# `dt-timer` — whole-estate drive-thru segments + OEPE distribution (owner capture, 2026-08-21)

**Logged for later, not scoped as work yet.** Owner: *"another great data source."*

**What makes it worth having:** Meridian's DT metrics today are averages. This returns an **OEPE
distribution** — how many cars cleared under 90 / 120 / 150 / 180 / 210 seconds — plus the journey
broken into **segments** (greet, order, line, windows). "Average OEPE 185s" and "42% of cars over
210s" are different conversations with a GM, and only the second one names a target.

## The request

```
GET https://api.reports.myqsrsoft.com/data_layer/v1/service/dt-timer
    ?catalogType=dtTimer&nsd=d&dsd=s
    &nsn=3708,5183,5985,...            <- ALL 27 stores in ONE call
    &orgId=a546d4ef-684a-4f25-8bc0-6580af068875&enterpriseName=McDonalds
    &timeSegment=custom&segmentBy=summary&timeInterval=summary
    &segmentNames=open-close&segmentsSelected=open-close
    &startDate=2026-08-20&endDate=2026-08-20
    &compType=trading                  <- the 4am business day
    &daysOfWeek=1,2,3,4,5,6,7&weekStart=3
    &selectCols=lane1Cars,lane2Cars,oepeWithoutPark,greet,orderTime,
                line1Time,line2Time,win1Time,win2Time,
                oepe90,oepe120,oepe150,oepe180,oepe210
Header: x-auth-token: <token>
Referer: https://v3.myqsrsoft.com/reports/mcd/service/dtTimer
```

Three things about the shape:

- **One request covers the whole estate.** 27 stores, one call — unlike the DAR's per-store loop.
- **`selectCols` is caller-chosen**, so the response shape is ours to define. Ask for what a rule
  needs, not everything.
- **`compType=trading`** — per `CLAUDE.md`, that is the 4:00am business day. So this is already on
  the right boundary, and matches the DAR. Do not mix it with a `calendar` source.

⚠️ **This is the DAR host (`api.reports.myqsrsoft.com`), NOT the security host.** So the
`project-qsrsoft-daily-activity.md` constraint applies: a server-side fetch with a token alone gets
401, and it needs Playwright `page.evaluate()`. **The token-only finding for
`api.security.myqsrsoft.com` does not transfer** — different host, different auth.
(The capture also sends `if-none-match`, so the endpoint supports ETags — useful for re-pulls.)

## ⚠️ Four measured caveats. Each one produces a wrong number if read naively.

**1. The time fields are CUMULATIVE SECONDS, not averages.** Divide by car count yourself.

⚠️ **And the sibling `mobile` endpoint on this same host reports MILLISECONDS** — see
`finding-qsrsoft-mobile-endpoint-2026-08-21.md`. Same host, same day, same request shape, unit
differs by 1000×. Do not share a parser between them.

Established with a discriminator, not just plausibility: service-time distributions are
**right-skewed**, so mean > median. Reading these as cumulative seconds puts the mean above the
median implied by the endpoint's own `oepe90…210` buckets at every store; reading them as
average-milliseconds puts the mean *below* the median, which is backwards.

| store | mean if TOTAL SECONDS | mean if AVG MS | median from its own buckets | consistent |
|---|---:|---:|---:|---|
| 3708 | 184.8 s | 153.7 s | ~164 s | **total seconds** |
| 33109 | 122.9 s | 73.9 s | ~105 s | **total seconds** |
| 43701 | 163.2 s | 38.7 s | ~114 s | **total seconds** |

| store | cars | `oepeWithoutPark` | ÷ cars |
|---|---:|---:|---:|
| 3708 | 832 | 153,729 | 184.8 s |
| 5183 | 1,080 | 204,754 | 189.6 s |
| 33109 | 601 | 73,854 | 122.9 s |
| 43701 | 237 | 38,669 | 163.2 s |

This is actually the *good* shape — sum-and-divide is exactly what `CLAUDE.md`'s "never average
averages, dollar-weight aggregates" rule wants, and this hands us the numerator and denominator
separately. But treat a raw field as a duration and every number is garbage.

**2. `lane2Cars = 0` does NOT mean `line2Time = 0`.** Stores 20475 and 33109 report zero lane-2
cars while still posting `line2Time` of 46,692 and 9,179. So **`line1Time`/`line2Time` are almost
certainly journey SEGMENTS, not per-lane totals** — time at the first vs second position in the
queue — while `lane1Cars`/`lane2Cars` genuinely are order points. **Hypothesis, not a finding.**
Settle it before deriving anything per-lane; a per-lane average built on this reading would divide
by zero or attribute one lane's time to the other.

**3. `greet == orderTime` exactly, at 2 of 24 stores.** 6838 (both 41,289) and 10915 (both 56,048).
Everywhere else they differ substantially (3708: 16,182 vs 53,949). Two stores producing an exact
match on two independent measurements is instrumentation, not operations — most likely the greet
timer isn't wired and the value falls back to order time. **Exclude those stores from any
greet-based metric until it's explained**, and check whether the set moves day to day.

**4. Stores with no data are OMITTED, not returned as zero.** The request named **27** stores; the
response held **24**. Missing: **18213, 35242, 37566**. A pull must not assume a row per requested
store, and must not read absence as zero.

✅ **RESOLVED by the `mobile` capture** (`finding-qsrsoft-mobile-endpoint-2026-08-21.md`): `mobile`
returns **all 27** and shows those three had drive-thru mobile orders that day (71, 45, 76
`driveThruNotROATrans`). So they were open and do have a drive-thru — this is a **dead or
unreported DT timer**, not a closed store. **`mobile` is therefore a usable coverage cross-check
for `dt-timer`**, distinguishing "no data" from "no activity" the way #171's per-stream staleness
problem needs.

## Field notes

- `storeNum` is **unpadded** (`3708`). Meridian's `loc` is zero-padded to 7 (`0003708`). Same trap
  the DAR pull already handles — reuse that conversion, don't write a second one.
- `oepe90/120/150/180/210` are **cumulative counts** of cars at or under each threshold, confirmed
  monotonic and `oepe210 ≤ total cars` at every store checked. So "% of cars over 210s" is
  `1 - oepe210/cars`, and the buckets between are differences.
- `segmentNames=open-close` suggests **daypart segmentation is available** — worth probing what
  other segment names exist, the same way `event_token` is the open question on `event_details`.

## Why this is worth a dispatch later

- **Distribution beats average** for a coaching conversation, and it is the one thing today's DT
  metrics cannot express.
- **Segment attribution** — greet vs order vs line vs window — says *where* the time goes, which is
  the difference between "your DT is slow" and a specific instruction.
- **One call, 27 stores, business-day aligned** makes the pull cheap.
- Relationship to existing DT data in `qsr_daily_activity` is **unexamined** — check for overlap
  before adding a stream, per the auto-first / no-redundant-source rules.
