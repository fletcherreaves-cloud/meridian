---
name: finding-cfv-2026-drivethru-decline-2026-08-22
description: The 2026 CFV deterioration (below-80 rate 23% -> 44.7%) decomposes to 81% real performance decline and 19% channel-mix shift. It is almost entirely drive-thru - DT below-80 went 25% -> 54% (p=0.029) while DT also rose from 43% to 60% of visits. Curbside barely moved.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# The 2026 CFV decline is drive-thru, and it is mostly real

Computed from `memory/data/cfv-history-2023-2026.json` (217 visits, all 27 stores), the dataset
imported in dispatch #74. The headline was recorded there; **this is the decomposition.**

## Headline

| year | n | below 80% |
|---|---|---|
| 2023 | 59 | 27.1% |
| 2024 | 46 | 26.1% |
| 2025 | 65 | 23.1% |
| **2026** | **47** | **44.7%** |

## 🔴 It splits cleanly: 81% performance, 19% mix

Standard decomposition — hold 2025's channel mix, apply 2026's per-channel rates:

| | below-80 |
|---|---|
| 2025 actual | 23.1% |
| **counterfactual: 2025 mix + 2026 rates** | **40.6%** |
| 2026 actual | 44.7% |

| component | pts | share |
|---|---|---|
| **performance decline** | **+17.5** | **81%** |
| channel-mix shift | +4.1 | 19% |
| total | +21.6 | |

**So this is not an artifact of who got shopped.** Four-fifths of it is stores scoring worse on
the same channels.

## Where: drive-thru, both ways at once

| channel | share of visits 2025 → 2026 | below-80 2025 → 2026 |
|---|---|---|
| **drive-thru** | **43% → 60%** | **25% → 54%** |
| curbside | 46% → 30% | 20% → 29% |
| in-restaurant | 11% → 11% | 29% → 40% |

Drive-thru got both **harder to pass** and **more frequently shopped** — the two effects compound,
which is why the aggregate moved so much more than any single channel.

Drive-thru below-80 by year, with Wilson 95% CIs:

| year | rate | 95% CI |
|---|---|---|
| 2023 | 11/29 = 37.9% | [22.7%, 56.0%] |
| 2024 | 6/20 = 30.0% | [14.5%, 51.9%] |
| 2025 | 7/28 = 25.0% | [12.7%, 43.4%] |
| **2026** | **15/28 = 53.6%** | **[35.8%, 70.5%]** |

**2025 vs 2026: two-proportion z = 2.19, p = 0.029 — significant at 0.05.**

## ⚠️ Three caveats, and the third is the one that matters

1. **2026 is a partial year** (through 2026-08-18, n=47 vs 65). The rate is a rate, so this does
   not bias it, but it does mean fewer observations and a wider interval.
2. **n=28 drive-thru visits per year.** The CIs are wide and they overlap
   ([12.7, 43.4] vs [35.8, 70.5]). Overlapping CIs do not imply non-significance — the
   two-proportion test is the correct one and it rejects — but the *effect size* is poorly pinned.
3. 🔴 **I examined three channels and am reporting the one that moved.** Under a Bonferroni
   correction for three comparisons the bar is 0.05/3 = 0.017, and **p=0.029 does not clear it.**
   Treat this as a **strong lead, not a settled result.** The honest reading: drive-thru is where
   the deterioration lives, the direction is consistent with the mix shift and with 2023-24 both
   being worse than 2025, but one more quarter of data should confirm it before anyone rebuilds a
   process around it.

📌 That third caveat is the difference between a finding and a fishing expedition, and it is
recorded here because nothing downstream will re-derive it.

## Breadth — not one or two bad stores

| year | stores visited | stores with >50% of their visits below 80 |
|---|---|---|
| 2025 | 26 | 3 |
| 2026 | 27 | **8** |

Matched on the 26 stores visited in both years: **16 worse, 10 better, mean −3.3 pts.** Largest
falls `10034` −30, `06838` −19, `06972` −17, `03708` −14.

⚠️ Given the ceiling finding (a store's own prior visit predicts its next at ρ≈0.02), **do not read
the per-store list as a ranking.** Single-store year-over-year moves at n≈2 visits are dominated by
noise. The estate-level channel signal is the trustworthy part; the store names are not.

## What this does and does not imply for Visit Readiness

- ✅ Visit Readiness's Speed component is **drive-thru-centric** (OEPE, R2P). With CFV now shopping
  drive-thru 60% of the time, the model is **better** aligned to what gets graded than it was —
  the channel-mismatch concern in `memory/finding-cfv-2026-visit-rules.md` has narrowed, not
  widened.
- ❌ It does **not** raise the predictability ceiling. ρ≈0.02 / ICC 0.087 were measured on this same
  dataset and are unchanged by knowing *where* the variance sits.
- 📌 The actionable item is operational, not modelling: **drive-thru CFV execution.**
