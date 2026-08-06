---
name: weighted-rollup-audit
description: Full sweep for average-of-averages violations across Meridian (2026-08-06) — what was fixed, what was already correct, and what was deliberately left alone because no weighting basis exists in the source. Read before "fixing" any remaining plain mean listed here.
metadata:
  type: project
---

# Average-of-averages audit (2026-08-06)

Triggered by v4.842, which found six of these in `views/scheduling.js` while auditing a
different thing. This is the follow-up sweep across the rest of the app.

Standing rule (CLAUDE.md): *correct math, never average averages, dollar-weight
aggregates.*

The shape of the bug: a ratio metric (labor %, TPPH, average check, OEPE) is computed
per day or per store, then rolled up as a plain mean of those ratios.

```
a $2,000 day at 30% labor + a $20,000 day at 19% labor
  mean of percentages ......... 24.5%
  Σ(labor$) / Σ(sales) ........ 20.0%
```

## Shared primitives — `src/engine/weighted.js`

Added so this stops being re-implemented per panel. All fall back to the plain mean when
the weighting basis is absent, so a forward-looking window shows its own figure rather
than 0.

| Function | Use for |
|---|---|
| `weightedMean(rows, valueFn, weightFn)` | ratio + its denominator on the row — labor % weighted by sales |
| `ratioOfSums(rows, numFn, denFn, fallbackFn)` | both components present — avg check = Σsales/Σguests |
| `ratioOfSumsDerived(rows, numFn, ratioFn)` | denominator not stored; recover it as `num/ratio` |
| `plainMean(rows, fn)` | when a plain mean is genuinely correct |

**Why `ratioOfSumsDerived` exists:** LifeLenz's TPMH and TPPH divide by a specific hours
basis that we don't own. Recovering hours from each row's own ratio reproduces exactly
that basis, so a rollup stays consistent with the per-row values displayed beside it.
Summing whichever hours column looks right can make a total silently disagree with its
own table.

---

## ✅ Fixed

| Where | Metric | Now |
|---|---|---|
| `views/scheduling.js` ×6 (v4.842, PR #84) | Avg Labor %, Avg TPMH | sales-weighted / Σtcs÷Σhours |
| `views/analytics.js` store rankings | Avg Labor % | `weightedMean(rows, laborPct, sales)` |
| `views/analytics.js` store rankings | Avg Check | `ratioOfSums(rows, sales, gc)` |
| `views/analytics.js` store rankings | Avg TPPH | `ratioOfSumsDerived(rows, gc, tpph)` |
| `features/projections.js` ops snapshot | Avg TPPH | `weightedMean(recentCtrl, tpph, actHrs)` |

Store rankings matter disproportionately — the owner flagged that table in Notes 54
("Rankings > Need to rework and make more impactful > Also fix any broken data links").

---

## ✅ Already correct — do not "fix"

- **`engine/schedule-summary.js`** — sales-weights labor % (`laborPctW/laborSalesW`) and
  computes TPMH as ΣGC/Σhours. This is what `views/scheduling.js` was disagreeing with;
  the engine was right and the view was wrong.
- **`views/analytics.js` district channel mix (~line 9381)** — uses `s/tot` (sales-weighted)
  as the primary path and only falls back to a per-store mean when sales are unavailable.
  Same pattern the new helpers use.
- **`engine/why.js:247,255`** — MAPE *is* defined as the mean of absolute percentage
  errors. Averaging it is the metric, not a bug. Weighting it would produce something
  else entirely.

---

## ⚠️ Left as plain means — no weighting basis exists in the source

Not oversights. Fixing these requires new data, not new math.

**OEPE has no car/GC count anywhere it's currently sourced.** `opsRows` parse to exactly
`{loc, date, oepe, park, kvst, kvsu, r2p}` — no denominator. Affects:
- `views/analytics.js` store rankings `avgOepe`
- `features/projections.js` `avgOEPE`
- `views/store-analytics.js:435`
- `views/labor-tools.js:129`

> **How to close it:** DAR (`qsr_daily_activity`) is hourly and does carry DT transaction
> counts. Re-sourcing OEPE from DAR via `metric-source.js` would make car-weighting
> possible and fix all four sites at once. That's an auto-first sourcing change, not a
> math change — worth doing, but it's its own piece of work.

**`features/projections.js` `avgLaborPct`** — `ctrlRows` carry `actHrs` but no sales, and
labor % needs sales to weight. Could be closed by joining `laborRows` sales on
(loc, date), or by sourcing through `metric-source.js`.

---

## 🤔 Left alone — judgment call, needs owner intent

These are per-store means where the unweighted figure may be the intended statistic.
Weighting would change *what the number means*, not just its accuracy.

| Where | Metric | Question |
|---|---|---|
| `views/store-analytics.js:2000` | avg MAPE across stores | "average store's accuracy" is a legitimate stat — probably correct as-is |
| `engine/eom-district-summary.js:86` | `avgCountPct` | weight by item count, or keep as per-store average? |
| `views/eom-dashboard.js:2008` | avg `pctCounted` | same |
| `views/analytics.js:4591,4599` | avg `varPct` | inventory variance % — dollar-weighting is arguably right, but changes the meaning |

Ask before changing any of these.

---

## Follow-up

- Once **PR #84** merges, replace `views/scheduling.js`'s local `wAvgLaborPct` /
  `wAvgTPMH` with the shared `engine/weighted.js` primitives. They were written first and
  are behaviourally identical; the duplication is temporary, only because the two changes
  were on separate branches.
- Consider re-sourcing OEPE from DAR (above) — closes four sites at once.
