---
name: finding-cfv-predictability-ceiling-2026-08-22
description: 217 CFV visits (2023-2026) from Propel's getCfvHistory, validated against Propel's own published card. A store's CFV score has essentially NO relationship to its own next CFV score (rho=+0.023, n=190, CI [-0.12,+0.17]) and store identity explains only ~9% of the variance. That caps ANY store-level predictor at rho~0.30 -- so Visit Readiness's 0.23, captioned "weak agreement", is running at roughly 78% of the achievable maximum.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# The CFV predictability ceiling — measured on 217 visits

Owner-captured 2026-08-22 via `propel.mcd.com/api/visits?action=getCfvHistory` across all 27
stores. **217 visits, 2023-01-18 → 2026-08-18, every one `visitTypeId 104`
(`visits.customerFirstVisit`) — a single instrument, no mixing.**

## ✅ Validated against Propel's own published figure before any analysis

The Propel UI's Customer First card for 2026 reads **55.3% meeting 80% / 44.7% below**. Computed
from the extracted rows for 2026 (n=47): **55.3% / 44.7%.** Exact match.

📌 That check came first deliberately. Every conclusion below rests on the extraction being
faithful, and this is the one place it could be verified against a number neither I nor the script
produced.

## 🔴 Finding 1 — a store's CFV score does not predict its own next CFV score

Consecutive-visit pairs within each store, pooled:

| | value |
|---|---|
| n | **190 pairs** (217 visits − 27 stores) |
| Spearman ρ | **+0.023** |
| 95% CI | **[−0.120, +0.165]** |

**Essentially zero, and — unlike every prior estimate in this project — precisely estimated.** The
interval excludes anything above 0.17.

Prior estimates of the same quantity, for contrast:

| instrument | n | ρ | 95% CI |
|---|---|---|---|
| RGR 2025→2026 | 15 | +0.113 | [−0.42, +0.59] |
| RGR 2024→2025 | 25 | +0.342 | [−0.06, +0.65] |
| **CFV consecutive** | **190** | **+0.023** | **[−0.12, +0.17]** |

⚠️ **These measure different instruments and are not interchangeable.** RGR is a whole-restaurant
review; CFV is a single mystery-shopped transaction. RGR's ρ may genuinely be higher — but its
estimate spans almost the entire plausible range, whereas CFV's is tight. **Where the two conflict,
prefer the precise one for CFV questions and do not extend it to RGR.**

## 🔴 Finding 2 — store identity explains only ~9% of CFV variance, and even that is marginal

One-way ANOVA across 27 stores, 217 visits:

| | |
|---|---|
| F(26, 190) | 1.76 |
| **ICC** (between-store share of variance) | **0.087** |
| observed sd of store means | 4.74 |
| sd expected from noise alone | 3.66 |
| permutation test, 5,000 shuffles | **p = 0.092** |

Store means run 74.0 (10034 BONIFAY) to 91.6 (43380 TISHOMINGO) — a spread that *looks* like a
league table. **It is only marginally more than chance produces at ~8 visits per store, and it does
not reach significance.** A between-store effect probably exists; it is small and not established.

## 🎯 What this means for Visit Readiness — the caption is backwards

Visit Readiness predicts a **store-level** readiness score. The maximum correlation any store-level
predictor can achieve against an *individual* visit outcome is **√ICC**:

**√0.087 ≈ 0.30.**

That is the hard ceiling — not 1.0, and not something a better model reaches past. Against it:

| | ρ |
|---|---|
| theoretical maximum for any store-level predictor | **≈ 0.30** |
| Visit Readiness Model Check, as measured | **0.23** |
| → share of achievable signal captured | **≈ 78%** |

**The panel captions 0.23 as *"Weak agreement so far — treat as directional only."* On this
evidence it is running near its ceiling.** `memory/dispatch-69.md` Part B was right that the caption
is the defect, but understated it: the caption is not merely over-confident about weakness, it is
**describing a well-performing model as a poor one.**

⚠️ **Do not overstate this in the other direction either.** Three real limits:
1. The 0.23 was measured at **n=27** with CI [−0.16, +0.56] — it is not precisely known.
2. Its pairs are drawn from `ds.gradedVisits`, which mixes **CFV and RGR** (dispatch #69 Part D0).
   The ceiling computed here is CFV's alone.
3. **ICC = 0.087 is itself marginal (p = 0.092)**, so √ICC ≈ 0.30 is an approximate ceiling, not a
   constant.

**The honest statement is: the achievable ceiling on this outcome is roughly 0.3, and the model is
somewhere near it.** That is a completely different message from "weak agreement", and it is the
one the panel should carry.

### 🔴 And it retires the roadmap item, not just the caption

`memory/notes-visit-readiness-backlog-2026-08-22.md`'s time-to-power table plans for accumulating
pairs until ρ ≥ 0.4 is detectable. **ρ ≥ 0.4 is not attainable** — it is above the ceiling. No
quantity of additional visits reaches it, and neither does refitting the 35/30/20/15 weights.
**Stop planning around it.**

## Finding 3 — CHANNEL moves the score materially, and the store does not choose it

| channel | n | mean overall | sd |
|---|---|---|---|
| curbside | 96 | **85.7** | 8.3 |
| driveThru | 105 | **80.5** | 11.8 |
| inRestaurant | 16 | **77.2** | 12.4 |

Own-channel scores diverge further: drive-thru **77.2** against its behind-the-counter companion
**86.8**.

**A ~5–8 point swing by channel alone, on a variable the shopper picks and the store cannot
control.** Since channel is not balanced within a store, part of the between-store spread in
Finding 2 is channel mix rather than performance. **Any store league table on raw CFV score is
partly ranking which channel happened to get shopped.**

📌 `behindTheCounter` is non-null on **all 217 rows** — confirming it is the always-present
companion module, exactly as `src/parsers/graded-visits.js:67`'s `channelOf()` already assumes.
`delivery` is non-null on **zero** rows.

## Finding 4 — 2026 is genuinely worse, but quarter-to-quarter is noise

| year | n | mean | meeting 80% | below |
|---|---|---|---|---|
| 2023 | 59 | 82.0 | 72.9% | 27.1% |
| 2024 | 46 | 82.9 | 73.9% | 26.1% |
| 2025 | 65 | 84.3 | 76.9% | 23.1% |
| **2026** | **47** | **80.5** | **55.3%** | **44.7%** |

2026's below-80 rate is nearly double the prior three years. ⚠️ **But the quarterly series is
violent** — 2024Q2 hit 66.7% below and 2024Q4 40%, so single quarters mean little. The *annual*
step is large enough to be worth attention; do not read the quarters.

⚠️ The 11:00–17:00 visit-window change began **August 2026** and only 6 visits fall in 2026Q3, so
it does **not** explain the 2026 drop, which is already present in Q1.

## Practical notes for a pull

- **Per-store endpoint** — `locationId` + `hierarchy-level: 12`; 27 calls for the estate.
- **No `year` parameter** — returns full history (back to 2023-01) in one response.
- **Envelope key is `cfv_history`**, not `results` and not a bare array. A loader assuming either
  gets zero rows silently. (This cost one round trip; a `find the first array value` fallback is
  the robust form.)
- Percentages arrive as **strings**; `visitId` is a real id and is the join key to PEAK's
  `RoipSurvey/<VisitId>` for per-question detail.
- **No daypart field.** Daypart still requires PEAK.
