---
name: finding-qsrsoft-service-statistics-endpoint-2026-08-21
description: Owner-captured QSRSoft service/statistics endpoint - the richest of the four service captures and the one that largely SUPERSEDES dt-timer. Every metric ships its own Total/Trans denominator pair plus a Masked count, covers DT/front-counter/kitchen/beverage/kiosk/RTP, and carries ly. twins. Milliseconds, unlike dt-timer. Read before scoping any service-times pull.
metadata:
  node_type: memory
  type: finding
---

# `service/statistics` — the one that supersedes `dt-timer` (owner capture, 2026-08-21)

**Logged for later.** Fourth and richest of the four service captures. **Read this before scoping a
service-times pull** — it changes which endpoint to build on.

```
GET https://api.reports.myqsrsoft.com/data_layer/v1/service/statistics
    ?catalogType=serviceStats&enterprise=mcd&nsn=<all 27>&orgId=a546d4ef-…
    &compType=trading&timeSegment=custom&segmentBy=summary&segmentNames=open-close
    &startDate=2026-08-20&endDate=2026-08-20&selectCols=…
Referer: https://v3.myqsrsoft.com/reports/mcd/service/serviceTimesStatistics
```

DAR host → Playwright constraint. `compType=trading` → 4am business day. All 27 stores, one call.

## It largely replaces `dt-timer`

| | `dt-timer` | `statistics` |
|---|---|---|
| DT line / window segments | ✅ | ✅ (with denominators) |
| OEPE | ✅ | ✅ **and** `oepeNoParked` split out |
| **explicit `*Trans` denominator per metric** | ❌ (one car count) | ✅ |
| **`*Masked` data-quality count** | ❌ | ✅ |
| **`ly.` last-year twins** | ❌ | ✅ |
| kitchen (MFY 1/2), beverage, front counter, kiosk, RTP | ❌ | ✅ |
| `dtCarsHeld` / `dtHeldTime` | ❌ | ✅ |
| **OEPE distribution (`oepe90…210`)** | ✅ | ❌ |
| stores returned | 24 of 27 | **27 of 27** |

**Build on `statistics`. Reach for `dt-timer` only for the distribution buckets**, which are the one
thing it uniquely has — and they remain genuinely valuable, since a distribution is what lets you
say "42% of cars over 210s" instead of an average.

Third independent confirmation that the three stores `dt-timer` dropped (18213, 35242, 37566) are
**dead DT timers, not closed stores**: `statistics` returns all 27 with real DT volume for those
three (`dtTrans` 498, 287, 466).

## 🔴 Unit: MILLISECONDS — `dt-timer` is the odd one out

Same store, same day: `statistics` `oepeNoParked_total` = 154,712,250 over 873 → **177.2 s/car as
ms** (49 hours as seconds — absurd). `dt-timer` `oepeWithoutPark` = 153,729 over 832 → **184.8
s/car as seconds**. Raw ratio **1006×**. The small residual is the different denominators (873 DT
transactions vs 832 lane cars), not a unit ambiguity.

So across the family: **`dt-timer` = seconds; `mobile` and `statistics` = milliseconds.** One shared
parser across all three is wrong twice.

## ⚠️ Four caveats, each measured

**1. Every metric has its OWN denominator. Do not reuse one transaction count.** Store 33109, same
row: `dtTrans` **620**, `dtServeTrans` **582**, `ctpTrans` **605**, `oepeTrans` **605**, `rtpTrans`
**280**, `dtLineTimeTrans` **620**. Pair each `…Total` with *its own* `…Trans` — that pairing is why
this endpoint is the right one to build on.

**2. `*Masked` is a built-in data-quality count — use it, don't ignore it.** It counts measurements
excluded as invalid. 33109 carries `dtServeMasked` 5, `ctpMasked` 3, `oepeMasked` 3, `rtpMasked` 1;
18213 has `bevRunTimeMasked` **15** against only 90 counted (`bevTrans` 118). **A high masked share
means that store's number is thin, and the panel should say so rather than presenting it flat** —
this is the honest-null discipline with the source doing the work for us. Surface it; a metric
computed from 90 of 118 measurements is not the same claim as one from 118.

**3. A negative cumulative time exists in real data.** Store 10915 `bevRunTimeTotal` =
**−7,363,835** over 387 transactions = **−19.0 s/transaction**, which is physically impossible.
Guard every derived average against negative and implausible totals; do not assume a cumulative
field is non-negative just because it is a duration.

**4. `ly.* = 0` everywhere for store 43701** — same as in `mobile`. Zero LY is **absence, not a
collapse.** Corroborates that 43701 has no last-year history.

## Unknowns — do not guess

- **`healthyCnt` / `unhealthyCnt`** — semantics unknown. Values range 0–50 and move with LY. Do not
  build on them until someone confirms what they count.
- **`storeNumDate: 1`** — likely the number of days in the range (1 here). Verify on a multi-day pull.
- **`ctp`, `rtp`** — abbreviations unconfirmed. `rtp` splits into `kioskRTP` + `fcRTP`, so it is a
  front-of-house measure; `ctp` pairs with `dtTrans`, so DT-side. Confirm before labelling in UI.
- **`mfy2_untilserve`** breaks the naming convention every other field follows (`mfyOneServeTotal`,
  etc.). Probably the same thing for MFY 2; **do not assume** — it is exactly the kind of
  inconsistency that hides a different measurement.

## The family, for whoever scopes this

Four captures, one host, one day, one request shape — and they are **not** interchangeable:

| endpoint | unit | unique value |
|---|---|---|
| `dt-timer` | **seconds** | OEPE distribution buckets |
| `mobile` | ms | mobile orders by channel × ROA |
| `statistics` | ms | **everything else, with denominators, masked counts and LY** |
| `event_details` (security host, token-only) | — | per-event controls rows: time, register, crew, manager |

Overlap with `qsr_daily_activity` is still **unexamined** across all of them. Check before adding
any stream.
