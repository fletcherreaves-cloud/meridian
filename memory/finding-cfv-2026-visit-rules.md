---
name: finding-cfv-2026-visit-rules
description: Customer First Visit (CFV) 2026 rules from the August Update execution guide — cadence, the Aug 3 2026 window change, single-daypart selection, the four channel types and their scored metrics. Establishes THREE structural mismatches between how Visit Readiness scores a store and how a CFV actually grades it.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# CFV 2026 rules — and why Visit Readiness's Model Check is structurally handicapped

Source: *Operations PACE — Customer First Visit Execution Guide: August Update* (owner-supplied,
2026-08-22). Operational facts recorded for modelling; the document itself is not reproduced.

---

## The facts that matter to the model

| fact | value |
|---|---|
| Visits per restaurant, 2026 | **3** (settles the open 2-vs-3 question → **81 pairs/yr** across 27 stores) |
| Window, **effective 2026-08-03** | **11 AM start, must begin before 5 PM, Monday–Saturday** |
| Window, **before 2026-08-03** | **all dayparts** — breakfast, lunch, dinner and snack (owner-confirmed) |
| Daypart selection | **ONE daypart, chosen for "greatest potential growth or opportunities to address performance gaps"** |
| Announced? | No — unannounced |
| Channel | **ONE of four per visit** + Behind the Counter (common to all) |

### The four visit types

**Drive Thru** · **In-restaurant** (dine-in/table service) · **Curbside** · **Delivery**
Plus **Behind the Counter Operations**, identical across all four.

### Scored speed metrics, by channel

| channel | measured | target |
|---|---|---|
| Drive Thru | OEPE (**tiered** scoring), Line Time | Line Time **70s** |
| Drive Thru | Total Experience Time (TET) | **unscored, diagnostic** |
| In-restaurant | Wait Time, R2P, Table Service Fulfillment | **135s total = R2P 90s + Fulfillment 45s** |
| Curbside | R2P + Fulfillment (**tiered**) | **135s total = R2P 90s + Fulfillment 45s** |
| Delivery | two speed elements | **unscored, diagnostic** |

**Cleanliness is scored in every channel** — exterior litter, trash bins, restrooms stocked and
working, employee uniform/appearance. Meridian has **no data source for any of it**. This confirms
`memory/project-graded-visits-pace.md`'s "cleanliness = acknowledged data gap" as a real scored
component of the thing we are trying to predict, not a nice-to-have.

---

## 🔴 Three structural mismatches — not one

Visit Readiness's Model Check (rank corr 0.23, direction match 52%) has been read as a weak model
or a small sample. The guide shows the comparison is **mis-specified in three independent ways**,
each of which would depress correlation on its own.

### 1. Daypart — model averages the day, the visit samples one part of it

Readiness blends **all-day** OEPE, R2P, KVS, labor %, TPPH. A CFV observes **a single daypart**.
Strong-at-lunch / weak-at-breakfast scores mid on the model and well on the visit.

**Fixable now:** `qsr_daily_activity` is hourly (PK `(loc, dt, hour_slot)`, slots `05:00 → 28:00`,
`hour_slot` = END of block, so 11am–5pm ≈ slots **`12:00`–`17:00`**), and `loadQsrActSummary`
already selects `hour_slot`.

### 2. Channel — the model blends channels the visit grades one at a time

A **Drive Thru** CFV grades OEPE and Line Time. An **In-restaurant** CFV grades Wait Time and R2P.
Readiness mixes DT and front-counter metrics into one Speed score and compares it to whichever
channel happened to be visited. **Pairs should be matched to the visited channel** — a DT visit
compared against DT metrics only.

### 3. 🔴 Selection — the rule says target weakness; practice is inconsistent. Both hurt.

**The rule, as written.** The daypart is chosen for *"greatest potential growth or opportunities to
address performance gaps."* Taken at face value, visits are **not a random sample of operating
hours** — they deliberately target the store's worst window. A model predicting *average*
performance would therefore **over-predict consistently**: a systematic bias, not noise.

**Observed practice (owner, 2026-08-22):** *"True or rules, but unfortunately corporate does not
always follow this."* The rule is applied inconsistently.

**Keep these two facts separate — they have different consequences, and you need both:**

| | consequence for the model |
|---|---|
| **The rule** (target the weak daypart) | **Predictable bias.** Correctable *if* it were followed reliably — you could calibrate against a known worst-case sampling rule. |
| **Inconsistent compliance** | **Unpredictable variance** layered on top. Not correctable, and not even estimable without knowing which daypart each visit actually used. |

So the situation is the worse of both: a sampling process biased *in intent* toward weakness, applied
*in practice* unpredictably. Fitting weights against this ground truth without accounting for it
would bake in a bias whose magnitude nobody can measure.

**Which makes one thing robust to all of it: capture the actual daypart and channel of each visit.**
If every pair records what was really visited, we compare like-for-like and the selection rule —
followed or not — stops mattering. That is the move regardless of how corporate behaves.

---

## What this means for the plan

- **Do not touch the scoring weights yet.** Fix the *comparison* first (daypart, channel), then
  re-measure. The model may be substantially better than 0.23 once compared like-for-like.
- **Backfilling last year is still worth it, but it is a DIFFERENT REGIME.** Pre-2026-08-03 visits
  covered all dayparts including breakfast and dinner; from 2026-08-03 they cannot. Tag every pair
  with its regime and report separately before pooling.
- **Sundays are never sampled** under the new rules (Mon–Sat). Worth knowing before anyone treats
  visit scores as representative of a full week.
- **Cleanliness stays unmodellable** with current data, and it is scored on every visit. That puts
  a ceiling on achievable correlation that no amount of metric tuning removes — worth stating
  honestly in the panel rather than chasing.
