# Finding — what `compType:'calendar'` on QSRSoft's `labor-summary` (and siblings) actually means (dispatch #164, closes #330)

**Date measured:** 2026-08-27. **Credential:** `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`, live in
this session's env) via `apikey`+`Authorization: Bearer` — confirmed read access on tenant tables
before running any comparison (real rows, real counts, e.g. `qsr_sales_mix` count 25042).

## The question (CLAUDE.md, 4am business-day section)

> The DAR is ALREADY business-day aligned... What `compType:'calendar'` means on `labor-summary`
> is still unconfirmed — that is the only live boundary question (#330), and it is on the
> numerator side only.

The concrete worry, spelled out in `src/engine/metric-source.js`'s `laborPct` comment (added by
changelog 5.022): the derived `laborPct` (`crew_labor_dollars ÷ DAR product_sales`) matches Daily
Glimpse's real `labor_pct` on only 582/648 (89.8%) of sampled store-days at 0.001 tolerance, and
the leading *unconfirmed* hypothesis for the other 10.2% was that `qsr_labor_summary` (pulled with
`compType:'calendar'`, `scripts/qsrsoft-ops-pull.mjs`) uses a **midnight-to-midnight calendar day**
while Daily Glimpse (and the DAR, already confirmed) use the **4am business day** — so late-night
volume would land in a different day bucket in each, explaining both the mismatch and its positive
skew.

## Where `labor-summary`'s `compType:'calendar'` actually lands

`scripts/qsrsoft-ops-pull.mjs`'s `ENDPOINTS` registry: the `labor` endpoint
(`reporting/v2/labor/labor-summary`) → table `qsr_labor_summary` (PK `loc,dt`), one row per
store×day, fields in a `metrics` JSONB (`crew_labor_dollars`, `crew_labor_hours`, `total_hours`,
`over_time_total_hours/dollars`, `gross_dollars`, `salaried_manager_hours/dollars`, all with `ly_`
twins). **Every endpoint in that script's registry that isn't the 3-Peaks daypart pull
(`compType:'trading'`) uses the identical `compType:'calendar'`** — cash-sheet-extract, labor-
summary, labor-detail, service/statistics, cash-sheet (sales mix). They all go through the same
`base()` request builder, so whatever `compType:'calendar'` means, it means the same thing across
all of them — which is what makes a same-script sibling endpoint (`qsr_sales_mix`, carrying
`product_sales_amt`) a valid proxy for testing `labor-summary`'s own boundary, since labor-summary
itself has no independent hour-level signal to test a boundary against.

## Method

Two independent measurements, both against the DAR's `qsr_daily_activity_rollup.product_sales`
(already confirmed 4am-business-day aligned, `memory/dar-vs-ops-reconciliation.md`), for the same
`(loc, dt)`, 2026-07-15 → 2026-08-25 (~6 weeks, last full day before the in-progress 2026-08-27):

**1. Sales-to-sales, same script family.** `qsr_sales_mix.metrics.product_sales_amt`
(`compType:'calendar'`) vs `qsr_daily_activity_rollup.product_sales` (`compType:'trading'`,
confirmed). If `'calendar'` were a true midnight boundary, the mismatch should be LARGEST on
Friday/Saturday/Sunday — the days whose 00:00–04:00 block moves to a *different* day under a
midnight cut vs the 4am cut.

  866 matched store-days:

  | bucket | n | mean %diff | mean \|%diff\| | within 1% |
  |---|---|---|---|---|
  | ALL DAYS | 866 | 0.001% | 0.061% | 99.7% |
  | WEEKEND (Sat/Sun) | 217 | -0.015% | **0.015%** | 99.5% |
  | FRIDAY | 109 | -0.001% | **0.003%** | 100.0% |
  | Mon–Thu | 540 | 0.008% | 0.091% | 99.6% |

  **The weekend/Friday buckets are the TIGHTEST reconciliation, not the loosest** — the opposite
  of what a midnight-boundary bug would produce. The two largest single-day outliers (26.7% /
  -22.0%, store 0010034, 2026-08-19/08-20) are a Wed/Thu pair whose values look transposed between
  adjacent days — an isolated pull/data glitch for that one store, not a weekday pattern, and not
  weekend-shaped either.

**2. Re-running the ORIGINAL 5.022 comparison, bucketed by day-of-week.** `crew_labor_dollars ÷
DAR product_sales` vs Daily Glimpse's real `labor_pct`, per weekday, 2026-07-19 → 2026-08-25 (973
matched store-days, all three sources present):

  | day | n | match <0.001 | mean signed diff | mean \|diff\| |
  |---|---|---|---|---|
  | Sun | 135 | 89.6% | 0.0005 | 0.0009 |
  | Mon | 162 | 89.5% | 0.0007 | 0.0008 |
  | Tue | 136 | 94.1% | 0.0003 | 0.0007 |
  | Wed | 135 | 89.6% | 0.0005 | 0.0006 |
  | Thu | 135 | 90.4% | -0.0001 | 0.0010 |
  | Fri | 135 | 88.9% | 0.0005 | 0.0014 |
  | Sat | 135 | 88.9% | 0.0005 | 0.0006 |
  | **overall** | **973** | **90.1%** | | |

  Match rate is flat across the week (88.9%–94.1%, no monotonic weekend trend), and Saturday's
  `mean|diff|` (0.0006) is among the *smallest*, not the largest. No day-of-week signature.

## Conclusion

**`compType:'calendar'` on QSRSoft's Operations Report endpoints (including `labor-summary`) is
NOT a midnight-to-midnight calendar day.** Measured directly, it reconciles with the DAR's
confirmed 4am-business-day-aligned sales just as tightly as any other comparison basis — including,
specifically, on the days (Fri/Sat/Sun) where a true midnight cut would show the largest and most
obviously weekend-shaped divergence. It shows neither.

**What `compType` (`'trading'` vs `'calendar'`) actually governs**, per an already-existing comment
in `src/views/above-store-onepager.js` (`fobly`/FOB vs-LY row) that this investigation surfaced as
corroboration rather than had to derive from scratch: it is the **LY-comparison-window basis**, not
the intraday open/close boundary of the current period's own row —
- `compType:'trading'` → LY compared **364 days back / same day-of-week** ("Trading Day"),
- `compType:'calendar'` → LY compared to the **same calendar date** last year.

Both bases describe how the report's own `ly_*`/`ybl_*` twin columns are matched, not where the
*current* day's own totals start and stop. That axis is orthogonal to the 4am ABC question
entirely, which is exactly why searching for a boundary effect in the current-period values found
none.

**#330 is resolved: no boundary mismatch exists to fix.** `grep`-verified (`compType.*calendar` /
`calendar.*boundary` across `src/`) that nothing in the app branches on the now-refuted midnight-
boundary assumption — it only appeared as commentary (`metric-source.js`'s `laborPct` note,
`supabase.js`'s `loadOpsLaborSummary` note), never as logic. No code fix is needed; both comments
are corrected in this same commit to state the measured finding instead of the open hypothesis.

**Not answered here (explicitly out of scope for #330):** the ~10% residual `laborPct`
derive-vs-Glimpse mismatch is real and still unexplained — day-specific, not day-of-week-specific,
and not a boundary artifact. If it's worth chasing, that's a new, separate dispatch (the original
5.022 deep-dive on store 31357/2026-07-19 already ruled out both candidate sales denominators for
that one mismatch — the numerator itself disagreed with Glimpse's implied crew-dollar figure, which
this dispatch's finding does not explain).
