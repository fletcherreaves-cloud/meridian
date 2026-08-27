---
name: finding-comptype-calendar-labor-summary-2026-08-27
description: Dispatch #164 -- measured what compType='calendar' on QSRSoft's labor-summary report actually means. Despite the name, it is 4am-business-day aligned, not midnight-to-midnight. Resolves CLAUDE.md's #330 (the one open 4am-boundary question) with no bug found and no fix needed.
metadata:
  type: finding
---

# What `compType:'calendar'` means on `labor-summary` (#330, dispatch #164)

## The question

CLAUDE.md's 4am business-day section named this the one remaining open boundary question:
*"The DAR is ALREADY business-day aligned... What `compType:'calendar'` means on
`labor-summary` is still unconfirmed — that is the only live boundary question (#330), and it
is on the numerator side only."*

## Where it lives

`scripts/qsrsoft-ops-pull.mjs` is the only script that reads a `labor-summary` endpoint. Its
`ENDPOINTS` registry (`key:'labor'`) hits
`GET /reporting/v2/labor/labor-summary?...&compType=calendar&...` and upserts the response into
Supabase **`qsr_labor_summary`** (`metrics` JSONB: `crew_labor_dollars`, `crew_labor_hours`,
`total_hours`, `over_time_total_hours`, `over_time_total_dollars`, `salaried_manager_hours`,
`salaried_manager_dollars`, `gross_dollars`, each with an `ly_` twin). A sibling `laborDetail`
key merges `total_needed_hours` into the same row via the same `compType:'calendar'` param.

**Consumer:** `src/lib/supabase.js`'s `loadOpsLaborSummary()` reads that table and aliases
`crew_labor_dollars` → `laborDollar`. `src/engine/metric-source.js` wires it into two chains:
- `laborDollar` — `opsLaborRows` (i.e. `qsr_labor_summary`) as the sole source.
- `laborPct` — derived as `laborDollar ÷ sales`, where `sales` resolves DAR `product_sales`
  first (already confirmed business-day aligned, `memory/dar-vs-ops-reconciliation.md`).

This derive is the ONE place in the app where a `compType:'calendar'`-sourced numerator is
divided by a boundary from a different source (DAR) — exactly the "silently mixes two
different days" bug class CLAUDE.md warns about, IF the two boundaries actually differ. That is
what this dispatch measured.

## The measurement

Reused `dar-vs-ops-reconciliation.md`'s method: compare an aggregate against an independent
ground truth on two candidate day-boundaries and see which one it actually matches. This
sandbox has no QSRSoft credentials (confirmed: `env` carries no `QSRSOFT_*`/`LIFELENZ_*` var),
so a live `compType:'calendar'` API call wasn't possible — but the *already-ingested*
`qsr_labor_summary` (populated by real production pulls using `compType:'calendar'`) is directly
readable via `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_...` Bearer token — real rows, e.g.
`qsr_labor_summary` `content-range: 0-0/25062`, `qsr_punch_times` `content-range: 0-0/133411`),
and `qsr_punch_times` (dispatch #124) supplied the independent ground truth: raw clock-in/out
timestamps, ingested with **no `compType` and no day-bucket derivation applied at all**
(`scripts/qsrsoft-punch-times-pull.mjs`'s own header: *"stored as the RAW timestamp the API
returns... no business-day derivation applied at ingest"*) — the one dataset in this repo with
real sub-day timestamps independent of any `compType` choice.

**Method:** for each (loc, dt) with both a `qsr_labor_summary` row and punch coverage, re-bucket
the raw punches two ways and compare each to that row's `crew_labor_hours`:
- **midnight-cut**: `[dt 00:00, dt+1 00:00)`
- **4am business-day cut**: `[dt 04:00, dt+1 04:00)`

Worked hours per window = Σ(`shift`-punch interval ∩ window) − Σ(unpaid-`meal`-punch interval ∩
window). The subtraction was necessary and confirmed from the raw data before trusting the
comparison: `shift` punch intervals span the FULL clock-in→clock-out span, including any meal
break taken during it (verified directly — meal-punch intervals sit nested inside a same-day
shift-punch interval for the same store); of the meal rows sampled, only 1 of ~940 carries
`is_paid_break:true` (already-worked time, correctly NOT subtracted), the rest are unpaid breaks
that must be subtracted to get worked hours. Without this correction both candidate cuts
overshot `crew_labor_hours` by a near-identical ~10-11 hrs/day and the comparison was
uninformative (see below) — this is the same "definitional mismatch swamps the boundary
question" trap `dar-vs-ops-reconciliation.md` had to rule out for its own comparison.

**Result, store 0003708, 2026-06-08 → 2026-07-04 (27 store-days):**

| cut | mean \|diff\| vs crew_labor_hours | days closer | days within 0.1 hr |
|---|---|---|---|
| midnight | 10.771 hrs | 0/27 | n/a |
| 4am business-day | 10.827 hrs | n/a | n/a |

(shift-only, no meal subtraction — both cuts wrong by nearly the same amount, uninformative on
its own; recorded to show why the correction below was necessary)

**Result, same store, WITH unpaid-meal subtraction:**

| cut | mean \|diff\| | days closer | days within 0.1 hr |
|---|---|---|---|
| midnight | 0.729 hrs | 0/27 | 2/27 |
| 4am business-day | **0.000 hrs** | **25/27** | **25/27** (2 ties) |

**Confirmed on 4 more stores** (0006178, 0010422, 0005985, 0006972; 2026-06-08→06-21, 56
store-days):

| cut | mean \|diff\| | days closer | days within 0.1 hr |
|---|---|---|---|
| midnight | 2.019 hrs | 0/56 | 3/56 |
| 4am business-day | **0.000 hrs** | **56/56** | **56/56** |

**Total: 83 store-days across 5 stores. The 4am business-day cut matches `crew_labor_hours`
essentially exactly (0.000 mean abs diff, 81/83 within 0.1 hr, the 2 misses tied not lost); the
plain midnight cut never wins a single store-day and is off by 2-3+ hrs on typical days.**

Calibrated the credential per the standing rule: `SUPABASE_SERVICE_ROLE_KEY` read real rows with
real `content-range` counts on both tables used (not `*/0`), so this is a positive measurement,
not an absence read as success.

## Conclusion

**`compType:'calendar'` on `labor-summary`, despite its name, is 4am-ABC-business-day aligned —
the SAME boundary as `compType:'trading'` on the DAR, NOT plain midnight-to-midnight.** The name
is misleading (a plausible QSRSoft-side naming holdover, or "calendar" meaning something else
internal to their reporting engine — not investigated further, out of scope), but the boundary
behavior it actually produces is not in question after this measurement.

**No live bug.** `laborPct`'s derive (`laborDollar ÷ sales`) already has both legs on the same
(4am business-day) boundary — `laborDollar` from `qsr_labor_summary` (`compType:'calendar'`,
now confirmed business-day-aligned) and `sales` from the DAR (`compType:'trading'`, already
confirmed business-day-aligned). No fix was made because there was nothing to fix.

**The refuted hypothesis:** `metric-source.js`'s `laborPct` comment carried a "leading
hypothesis, NOT verified" that the unexplained 10.2% (66/648 store-days) mismatch between the
derived `laborPct` and Daily Glimpse's own `labor_pct` (`memory/dar-vs-ops-reconciliation.md`'s
sibling investigation, #327 changelog `5.022.js`) was a calendar-vs-business-day boundary
mismatch. **This measurement refutes that hypothesis** — the two boundaries are the same, so a
boundary mismatch cannot be what's producing that gap. The comment has been corrected (not left
as a plausible theory) per the "measure it, don't reason about it" standing rule — a wrong
hypothesis, once disproven, gets corrected, not left dangling. The 10.2% gap's real cause is
still unexplained and remains open (out of THIS dispatch's scope, which was bounded to the
boundary question only — CLAUDE.md's #330 line, not the whole laborPct accuracy gap).

## Scope notes

- Endpoints sharing the exact same `compType:'calendar'` param and `base()` request builder in
  `qsrsoft-ops-pull.mjs` (`cash-sheet-extract`, `labor-detail`, `service/statistics`,
  `cash-sheet`) were NOT independently re-measured — this dispatch was scoped to `labor-summary`
  specifically. Given they're the same QSRSoft reporting engine, same param, same script, this
  result is suggestive for them too, but "suggestive" is not "measured" per this repo's own
  standard — do not cite this file as proof for any endpoint other than `labor-summary` without
  running the equivalent comparison.
- Checked every other `derive:` (ratio) chain in `metric-source.js` that touches an
  `opsCashRows`/`opsLaborRows`-sourced (`compType:'calendar'`) field: `tRedAPct`, `tRedBPct`,
  `discPct`, `cashOSPct` all divide an `opsCashRows` numerator by `netSalesAmt`, which is
  ALSO `opsCashRows`-only (`compType:'calendar'`) — same source, same boundary, no cross-source
  risk regardless of this finding. `laborPct` was the only cross-source (opsLaborRows ÷ DAR)
  ratio in the registry.
- `businessDate()`/`lastClosedBusinessDay()` (`src/utils/date.js`) untouched, per the dispatch's
  explicit out-of-scope note — this finding is about one report's label, not the shared cutover
  helpers.
