---
name: finding-emp-mgr-meal-reconciliation-2026-08-28
description: Dispatch #181 -- investigated whether qsr_cash_sheet's emp/mgr meal fields agree with the emailed daily_glimpse_daily fields before wiring an opsCashRows auto-first source. Finding is two-layered -- the ORIGINAL comparison is unanswerable (daily_glimpse_daily's emp/mgr meal columns have been 0 for 100% of the table's history because the live emailed report never carries a Meal/Discount column at all, confirmed across 4 real downloaded CSVs), so the reconciliation was re-run against the best available independent ground truth (audit_rows, register audit, itself auto-pulled) instead. That measured 67-75% match, day-boundary hypothesis tested and refuted, mismatch store-clustered rather than random. Below the dispatch's own 90% bar -- no chain wired, no code change shipped.
metadata:
  type: finding
---

# empMealAmt/mgrMealAmt(+counts) reconciliation, investigated (#181, following up #165's audit)

## Credential and method

**Credential used throughout:** `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_...`) against
`VITE_SUPABASE_URL`, via the PostgREST `/rest/v1/` API (`apikey`+`Authorization: Bearer`) and the
`qsr-reports` Storage bucket. Calibrated first per CLAUDE.md's "measure it" rule:
`lifelenz_schedule` returned `content-range: 0-0/15226` with real row content before any of the
numbers below were pulled, so this session's credential reads live tenant data.

Every number below is a real `content-range`, a real row payload, or a real downloaded CSV byte
-- not inferred.

## The dispatch's original question, and why it can't be answered as posed

Dispatch #181 asked to reconcile `daily_glimpse_daily.emp_meal_amt`/`mgr_meal_amt`/`emp_meal_cnt`/
`mgr_meal_cnt` (the emailed Daily Glimpse report) against `qsr_cash_sheet.metrics.emp_meal_discount_amt`/
`_qty`/`mgr_meal_discount_amt`/`_qty` (the API-pulled Cash Sheet), the same shape as #172's method.

Pulled `daily_glimpse_daily` and `qsr_cash_sheet` for 2026-08-01..08-24 (all stores, 648 rows each,
`content-range: 0-647/648` both sides) and joined on `(loc, date)`. First-pass match rate:
**16.9% (empMealAmt), 5.1% (mgrMealAmt)**, and **0 non-null-both pairs at all for the two count
fields** -- `qsr_cash_sheet`'s qty fields were being read, `daily_glimpse_daily`'s were real, but
every joined pair disagreed.

**Root cause: `daily_glimpse_daily`'s side has never carried real data.** Widened to the full
table history: `emp_meal_amt=neq.0`, `mgr_meal_amt=neq.0`, `emp_meal_cnt=neq.0`, `mgr_meal_cnt=neq.0`
each returned `content-range: */0` against **1,431 total rows** -- zero nonzero rows in the
column's entire history, on all four fields.

Confirmed from the actual source files (`qsr-reports` Storage bucket, the exact files the
production pipeline parses) -- downloaded and grepped for `Meal` and `Discount` in the header row
of **four** real CSVs spanning the pipeline's full operating history:

| file | date range | Meal/Discount columns found |
|---|---|---|
| `daily_glimpse_daily_2026-07-31.csv` | earliest available | none |
| `daily_glimpse_monthly_2026-07-01_-_2026-07-31.csv` | July rollup | none |
| `daily_glimpse_daily_2026-08-18.csv` | mid-window | none |
| `daily_glimpse_weekly_2026-08-12_-_2026-08-18.csv` | mid-window | none |
| `daily_glimpse_daily_2026-08-26.csv` | most recent | none |

Every one of these is the *same* 46-column shape (`Loc` through `Digital App GC/R/D MTD`) with no
`Meal`/`Discount` header anywhere. **The live emailed Daily Glimpse report, as currently configured
and delivered end to end, does not carry employee or manager meal data at all** -- not under any of
the header candidates `parseDailyGlimpse` (`src/parsers/index.js:1456-1463`) searches for, and not
under any other name either (a plain substring grep across the whole file, not just the candidate
list, found nothing).

This directly contradicts `supabase/schema-glimpse-meals.sql`'s comment: *"The owner confirmed both
are in the Daily Glimpse report -- manager meals under the label 'Manager Discount Amt'"* (Notes 60,
2026-08-08). Whatever was true of the report on 2026-08-08, it is not true of any file this pipeline
has ingested from 2026-07-31 through 2026-08-26 -- either the QSRSoft report subscription's column
selection changed, or the report being described then was a different one. Either way, this is a
report-configuration question on the QSRSoft side, not a Meridian parsing bug: there is no wrong
header name to fix here (the header simply is not present), so this is not the same class of bug as
#172's `cashOS`/refund-field fixes.

**Nothing in Meridian is currently broken by this.** The `empMealAmt`/`mgrMealAmt`/`empMealCnt`/
`mgrMealCnt` chains (`metric-source.js:538-550`) all use `mode: 'pos'`, which requires `v > 0`
(`_ok()`, `metric-source.js:694`) -- so glimpse's structural 0 is correctly rejected and the
resolver falls through to `ctrlRows`/`auditRows`, exactly as the shipping comment already documents
("wiring it early is safe... resolves from Controls/Audit exactly as before"). This was verified
directly, not assumed from the comment.

## Substituted a real ground truth: `audit_rows` (register audit, auto-pulled)

Since the glimpse side has no real values to compare, the dispatch's actual goal -- "is
`qsr_cash_sheet`'s meal data trustworthy enough to wire as an auto-first source" -- needs a
different reference. `audit_rows` (fed by `scripts/qsrsoft-register-audit-pull.mjs`, itself an
auto-pull, confirmed via its own live data: newest row `2026-08-24`) carries `emp_meal_disc` and
`mgr_meal_amt` per employee per day, independently of both the Daily Glimpse and Cash Sheet Extract
reports. (`ctrl_rows`, the manual Controls upload, was checked too and returned `content-range:
*/0` for the whole 2026-08-01..08-24 window -- stale, no usable data to compare.)

Aggregated `audit_rows.emp_meal_disc`/`mgr_meal_amt` by `(loc, date)` (summed across all
`register_type` values -- `cashier`/`preparer`/`manager` all present) and joined against
`qsr_cash_sheet.metrics.emp_meal_discount_amt`/`mgr_meal_discount_amt`, same window, all 27 stores,
647 joined store-days (`audit_rows`: 5,709 raw rows -> 647 aggregated keys; `qsr_cash_sheet`: 648
keys):

| field | match ($1 tolerance) | rate |
|---|---|---|
| empMealAmt (audit sum vs cash-sheet) | 461/647 | **71.3%** |
| mgrMealAmt (audit sum vs cash-sheet) | 437/647 | **67.5%** |
| empMealCh (audit sum) vs empMealQty (cash-sheet) | 461/647 | 71.3% |
| mgrMealCnt (audit sum) vs mgrMealQty (cash-sheet) | 437/647 | 67.5% |

**Day-boundary hypothesis tested directly and refuted.** Per the dispatch's own instruction to
check "an obvious mechanical cause first... a day-boundary issue," re-joined at a ±1-day shift
(`audit_rows(date)` vs `qsr_cash_sheet(date-1)` and `(date+1)`) across a wider 7/28-8/27 window:

| shift | empMeal match | mgrMeal match |
|---|---|---|
| -1 day | 152/728 (20.9%) | 63/728 (8.7%) |
| **0 (same day)** | **567/755 (75.1%)** | **540/755 (71.5%)** |
| +1 day | 155/755 (20.5%) | 65/755 (8.6%) |

Same-day is decisively the best alignment (75%/72% vs ~20%/~9% shifted either direction) -- this
rules out a systemic full-day boundary mismatch the way #164's method did for `compType:'calendar'`
labor data. It does not rule out a partial, employee-specific boundary effect (e.g., a late-shift
employee logged to a different day by one system than the other on some days), which would show up
as a small number of adjacent-day-pairs with opposite-signed errors -- a few such pairs were seen in
the initial narrower sample (store 10422, three consecutive day-pairs each with an exact +/-
opposite diff) but the aggregate shift test above shows this is not the dominant pattern.

**The mismatch is not random noise -- it's store-clustered.** Median absolute diff across all 647
empMeal pairs is **$0.00** (most days actually match exactly or near-exactly), but the per-store
means split sharply:

| stores that match almost perfectly (mean \|diff\| per store) | stores with a large, persistent gap |
|---|---|
| loc 6178: $0.00 / 24 days | loc 6972: $158.14 / 24 days |
| loc 6838: $0.00 / 24 days | loc 5183: $129.35 / 24 days |
| loc 37566: $0.20 / 24 days | loc 5985: $115.54 / 23 days |
| loc 10034: $2.01 / 24 days | loc 33704: $89.87 / 24 days |
| loc 43701: $3.09 / 24 days | loc 10915: $84.98 / 24 days |

The same handful of stores are off by a large, roughly consistent amount on *every* sampled day,
while others match to the penny on *every* sampled day. This pattern (concentrated, store-specific,
not scattered) rules out generic timing noise or rounding -- something structurally differs between
the two sources at specific stores (a plausible candidate: a channel like kiosk/mobile-order meal
comps captured at the register-employee level by one report but not the other, or a
register-type/role coverage gap in one side) -- but isolating exactly which side is wrong, and why
only at those stores, would need more investigation than this dispatch's scope. This is the same
shape of outcome #172 reached for `cashRows.cash_os` (75%) and `cashRows.posOverAmt` (79%) after its
own header-bug fixes were exhausted: a real, measured, non-random gap left open rather than forced.

## Verdict: no chain wired

Per the dispatch's own bar ("roughly 90%+, matching #165's bar for promo/posOver"): 67-75% does not
clear it, and unlike #172's cashOS/refund fixes there is no header-name or units bug to correct --
the mismatch is a genuine, store-clustered disagreement between two independently-collected
sources, and the ONE side originally specified for comparison (`daily_glimpse_daily`) never had
real data to begin with. **No `METRIC_SOURCES` chain change shipped.** `empMealAmt`/`mgrMealAmt`/
`empMealCnt`/`mgrMealCnt` keep their existing `glimpseRows` (inert but harmless) -> `ctrlRows` ->
`auditRows` order; no `opsCashRows` leg added.

## What would need to happen for this to reopen

- **Owner action, outside code:** check QSRSoft's Daily Glimpse report-builder subscription for
  whether "Emp Meal Amt" / "Manager Discount Amt" columns are actually selected. The Meridian side
  (schema column, parser candidates, chain wiring with a safe no-op glimpse leg) has been ready to
  receive them since the schema migration shipped -- the report itself is what's not producing them,
  on every file sampled from 2026-07-31 through 2026-08-26.
- **A closer look at the store-clustered gap** (loc 6972/5183/5985 vs loc 6178/6838/37566) -- start
  by checking whether the high-gap stores share something (higher kiosk/mobile-order mix, a
  register-type not present in `audit_rows` for those stores, a POS config difference) the way
  #172's per-date concentration pointed straight at the weekly-rollup-file bug once broken down.

## Not done in this dispatch, and why

- **No fix to `daily_glimpse_daily`'s parser candidates.** Unlike #172's `cashOS`/refund fields,
  there is no real header name anywhere in the live report to redirect the candidates to -- the
  columns are absent, not misnamed. Adding a fake fallback would not change anything (still 0).
- **Did not chase the store-clustered gap to a specific root cause.** Same scope decision #172 made
  for `cashRows.cash_os`/`posOverAmt`/`cashRefAmt` after their own header-mismatch fixes were
  exhausted -- a well-measured, non-random gap is a legitimate stopping point for an investigation
  dispatch, not a mandate to keep digging until the exact mechanism is found.
- **`promoAmt`/`promoPct`** -- separate dispatch (#180), untouched here.
