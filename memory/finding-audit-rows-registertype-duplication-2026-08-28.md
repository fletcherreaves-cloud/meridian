---
name: finding-audit-rows-registertype-duplication-2026-08-28
description: Dispatch #183 -- chased the store-clustered emp/mgr-meal gap dispatch #181 left open. Root cause found and FIXED (Meridian-side, not QSRSoft-side): audit_rows' Manager-type and Preparer-type register-audit API calls return duplicate emp_meal_disc/mgr_meal_amt/mgr_meal_cnt values (redistributed across different employee names, not real incremental activity), and metric-source.js's resolver was additionally taking only ONE employee's row as if it were the store-day total. Fixed both: cashier-only + summed-across-employees. Verified 98.0%/97.8% match against qsr_cash_sheet (up from #181's 71.3%/67.5%), clearing the dispatch's ~90% bar. A related, NOT-fixed lead (posOverAmt shows the same Manager==Preparer duplication) is flagged for a future dispatch.
metadata:
  type: finding
---

# audit_rows register_type duplication on meal $ fields — root cause + fix (#183, following up #181)

## Method and credential

Same credential and recipe as #181: `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_...`) against
`VITE_SUPABASE_URL`, PostgREST `/rest/v1/`, `apikey`+`Authorization: Bearer`. Calibrated first
(`lifelenz_schedule` → `content-range: 0-0/15226` with real row content) before any measurement
below, per CLAUDE.md's "measure it" rule.

## Step 1 — reproduced #181's own measurement first

Pulled `audit_rows` (5,709 raw rows) and `qsr_cash_sheet` (648 rows) for 2026-08-01..08-24, all 27
stores, joined on `(loc, date)` exactly as #181 did (sum `emp_meal_disc`/`mgr_meal_amt` across ALL
`register_type` values per (loc,date), compare to `qsr_cash_sheet.metrics.emp_meal_discount_amt`/
`mgr_meal_discount_amt`, $1 tolerance): **460/647 (71.1%) empMealAmt, 436/647 (67.4%) mgrMealAmt**
— matches #181's reported 71.3%/67.5% almost exactly (the ~0.2pp difference is immaterial, likely
one edge-case date). Confirms this is the same real population, not a fresh sample that only looks
similar. Per-store means also reproduced #181's own clustering table (loc 6178/6838/37566/10034/
43701 near $0; loc 6972/5183/5985/33704/10915 at $85-$158/day) to within rounding.

## Lead 1 — register-type coverage: RULED OUT

All 27 stores carry all three `register_type` values (`cashier`/`manager`/`preparer`) in
`audit_rows` for the window — no store is missing a type, high-gap or clean-match alike. Coverage
is not the explanation.

## Lead 2 — channel mix: weak, and superseded by Lead 3's much stronger signal

Pulled `sales_ledger_daily`/`cash_sheet_daily`/`qsr_sales_mix` for the window, all 27 stores.
Correlating each store's mean |empMeal diff| (the gap magnitude) against its channel mix:
Pearson r vs delivery/3PO% = 0.634, vs net sales volume = 0.615, vs kiosk% = -0.428, vs mobile-
order% = 0.423 (n=27). A real but moderate signal — high-gap stores do skew toward higher 3PO/MOP
mix — but normalizing the gap by sales volume weakens it (r drops to 0.31 for deliv%, 0.18 for
relative gap%), and it was never as clean as the volume-scaling pattern found next. Not chased
further once Lead 3 explained the gap directly and completely.

## Lead 3 — POS/config: this is the answer

Computed `audit_rows.emp_meal_disc` totals **per register_type** for the window. Every store showed
the same shape:

- `cashier`-type total ≈ `qsr_cash_sheet.emp_meal_discount_amt` total, almost exactly (25/27
  stores within $1 over the full 24-day window).
- `preparer`-type total == `manager`-type total, **exactly**, at every one of 27 stores (0
  mismatches). Same pattern independently confirmed on `mgr_meal_amt`, `mgr_meal_cnt`, and
  (separately) `pos_over_amt` (see "Related, unfixed" below).

Row-level inspection (loc 6972, 2026-08-17..08-24, all non-cashier rows) shows this isn't
coincidence: on 2026-08-17, the `manager`-type call returns rows `{Bobbie M: 11.37, Faith M: 0,
Kayla O: 264.66}` and the `preparer`-type call returns `{Bobbie M: 11.37, Faith M: 264.66, No
Preparer: 0}` for the SAME day at the SAME store — the same underlying $ figures (`{0, 11.37,
264.66}`), just redistributed across a *different* employee-to-value mapping in each call. Drawer
sales for the same employees genuinely differ between the two calls (Faith M: $3,165.54 under
`manager`, $12,489.11 under `preparer` — real, distinct register activity), so this is not a
blanket "the API ignores the register-type filter" bug — it's specific to the meal $ fields (and,
per the related finding below, `pos_over_amt`).

**Interpretation:** the register-audit report's Manager-type and Preparer-type calls both surface
the SAME underlying meal-discount $ total for the day, attributed to a different employee-role
grouping each time (who approved it vs. who was on the register), rather than each call's dollars
being genuinely additional register activity. Cashier-type carries the true, complete total.
Dispatch #59's own audit (`scripts/qsrsoft-register-audit-pull.mjs`'s header comment) established
that summing all three types is correct for `drawerSales`/`drawerGC` — that conclusion does not
extend to the meal $ fields, and #59's own audit never covered them (`register-audit.js`'s
`analyzeRegisterAudit` accumulator has no meal fields at all — they were never routed through that
code path in the first place).

## Second bug, found while implementing the fix: per-employee grain treated as one row

`audit_rows` is one row per **(loc, date, emp, register_type)** — genuinely multiple rows per
store-day (one per employee working that register type). Every OTHER source in the
`empMealAmt`/`mgrMealAmt`/`mgrMealCnt` chain (`glimpseRows`, `ctrlRows`) is one row per
**(loc, date)**. `src/engine/metric-source.js`'s `metricDaily`/`metricSeriesWithSource` resolve
each chain leg by returning the first row with a real value for a `(loc,date)` key — correct for
every store-day-grain source, but silently wrong for `auditRows`: it was returning ONE employee's
`empMealDisc` as if it were the whole store's daily total, whichever employee's row happened to
sort first (`loadAuditRows` in `src/lib/supabase.js` only orders by `date`, no secondary sort).

Confirmed this mattered independently of the register-type bug: filtering to `cashier`-type only
(without also summing across employees) *regressed* the day-level match rate to 24.0%/10.2% —
worse than the original 71.1%/67.4% — because a single arbitrary cashier's meal $ is a worse proxy
for the store total than the accidental three-type blend was. Summing across cashier-type
employees is what actually reconstructs the true total.

## Fix shipped

`src/engine/metric-source.js`:
- `metricDaily`/`metricSeriesWithSource` now support an optional 4th element on a `srcs` tuple,
  `'sum'`, via a shared `_resolveLeg()` helper — sums `field` across every row at that
  `(loc,date)` key that passes the tuple's row filter (3rd element), instead of returning the
  first row with a value. Every existing 2- and 3-element tuple is unaffected (defaults to the
  prior "first row wins" behavior).
- `empMealAmt`/`mgrMealAmt`/`mgrMealCnt`'s `auditRows` leg now reads
  `['auditRows', <field>, _auditCashierOnly, 'sum']` — cashier-only, summed across employees.
  `_auditCashierOnly = r => (r.registerType || 'cashier') === 'cashier'`.
- `manualRefAmt`'s `auditRows` leg is **unchanged** (still single-row, all register types) — see
  "Not fixed here" below.

## Verification

Re-ran the reconciliation against the FIX's exact logic (cashier-only, summed per (loc,date)) over
the real 2026-08-01..08-24 / 27-store population:

| field | match ($1 tolerance) | rate |
|---|---|---|
| empMealAmt | 634/647 | **98.0%** (was 71.1%/71.3%) |
| mgrMealAmt | 633/647 | **97.8%** (was 67.4%/67.5%) |

Per-store: 23/27 stores at 100%, 26/27 at ≥90%. Only loc 10422 lags (66.7%) — not chased further,
same "well-measured residual is a legitimate stopping point" posture #172/#181 used for their own
leftover gaps. Clears the dispatch's ~90% bar (matching #165's promo/posOver bar) decisively.

Unit tests: `src/__tests__/dispatch-183-audit-meal-cashier-only.test.js` (9 tests) exercise
`metricDaily`/`metricSeriesWithSource` directly against synthetic multi-employee, multi-
register-type rows — summation across cashier employees, manager/preparer exclusion, order-
independence, the real-$0-day-still-yields-null case, the no-cashier-row-at-all case, and
`glimpseRows`/`ctrlRows` still winning when they cover the day. Per CLAUDE.md's revert-check rule:
confirmed 8/9 fail when `metric-source.js`'s change is reverted (the 9th tests unrelated
fallback-order behavior, correctly unaffected).

Full suite + build: see the PR — both run clean.

## Related, unfixed — flagged for a future dispatch, NOT this one

**The same Manager==Preparer duplication was independently measured on `pos_over_amt`** (all 27
stores, identical shape to the meal fields: `manager`-type total == `preparer`-type total exactly
at every store, both smaller than `cashier`-type total). `register-audit.js`'s
`analyzeRegisterAudit` (the live consumer feeding the Register Audit / Security panel) **sums**
`posOverAmt` across all three register types in its accumulator — a design #59 audited and shipped
as correct for `drawerSales`/`drawerGC`-class fields. If `pos_over_amt` behaves like the meal
fields rather than like `drawerSales`, that summation is currently **inflating** displayed POS-
overring totals by roughly the Manager+Preparer duplicate amount (up to ~2x the true figure at
some stores) — a live discrepancy in a security/loss-prevention panel (CASH-003 thresholds read
`posOverAmt`/`posOverCnt`).

This was **not** independently verified beyond the store-level total comparison above (no
row-level or day-level check, no comparison against a third independent source the way `cashier`
was checked against `qsr_cash_sheet` for meal $), and it was **not fixed** in this dispatch:
`register-audit.js`'s summation logic is untouched, `manualRefAmt`'s `auditRows` leg is untouched
(its real-world values in the sampled window were $26 total across all 27 stores/24 days/3 types —
too close to zero to say anything about its duplication behavior one way or the other), and
`t_red_a_dollar`/`t_red_b_dollar`/`refund_cash`/`refund_cashless`/`promo_amt` (the other fields
`analyzeRegisterAudit` sums across register types) were not checked at all. **Chasing this — which
specific summed fields in `register-audit.js`/`security-baselines.js` are Manager==Preparer
duplicates vs. genuinely additive, and fixing whichever are duplicates — is real, separate,
security-relevant follow-up work**, explicitly out of scope for #183 (which asked only about the
emp/mgr meal gap) and not attempted here beyond this flag.

## What was NOT chased further

- The single lagging store (loc 10422, 66.7% post-fix match) — a residual gap, not zero, left
  measured but unexplained, same posture as #172/#181's own leftover residuals.
- *Why* QSRSoft's register-audit report structures Manager/Preparer calls this way (a report-
  definition question on QSRSoft's side, not answerable from this side of the API) — the FIX here
  doesn't depend on knowing why, only on the measured, verified behavior.
- `wireOpsCashRows`-style chain changes beyond what's described above — #181's own verdict (no
  chain wired for `daily_glimpse_daily`, since it structurally carries no meal columns) stands
  unchanged; this dispatch's fix is entirely within the existing `auditRows` leg.
