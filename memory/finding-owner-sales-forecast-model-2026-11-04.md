---
name: finding-owner-sales-forecast-model-2026-11-04
description: Reverse-engineered the owner's actual manual monthly-targets workbook (3 real files pulled directly from Supabase storage — Aug/Oct/Nov 2026) at owner request (task #70/#79 adjacent, "Good morning" message, 2026-11-04). His sales-comp forecast is a real, backtested, formula-driven statistical model (6-week level + damped/capped momentum + shrinkage-to-fleet) — not ad hoc judgment — and its entire raw input is already redundant with data Meridian auto-pulls daily. Labor%/TPPH use a separate fixed recency-weighted blend. A bounded manual override, used on ~1/3 of stores in a settled month, is the only genuinely human step.
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# The owner's real forecasting logic (measured from his own workbooks, 2026-11-04)

## What was asked

Owner, "Good morning" message: *"I do think you should review my manually uploaded workbooks and
see how we can best mimic and copy my logic as to what actually lands in the official forecast
each month... If I need to upload some monthly workbooks, let me know."*

**Did not need to ask for an upload.** `pending_reports` (service-role query, this session) already
holds every monthly projections workbook he's uploaded since April 2026, including one from
2026-11-01 — three days before this message. Pulled three directly from Supabase Storage
(`reports` bucket) for analysis: `August 2026 - Restaurant Projections - Multi Layout - v4.xlsm`,
`October 2026 - ... - Revised for Holdenville and Pauls Valley.xlsm`, `November_2026_-_...-
New3.xlsm`. All three opened with `openpyxl`, formulas AND cached values, both read.

## The real structure (not inferred — read directly from the workbook's own formulas)

The workbook (`Table 1 (2)` = the published target sheet) has **three independent recency/trend
models**, one per metric family, each with its own named-range dials on an `Assumptions` tab:

### 1. Sales — `Sales Fcst Calc` tab (the sophisticated one)

Per store, per month:
- **Level** = average of the last 6 weekly comp% readings (`Data Input`'s 13-week weekly comp
  block, itself computed as `Product Sales / Product Sales LY - 1` from his own weekly QSRSoft
  exports — see §3, this is the one block that's actually redundant with cloud data already).
- **Momentum** = (avg of last 2 weeks) − (avg of the prior 4 weeks), then **damped** (×0.10) and
  **capped** (±2 pts) — `MEDIAN(-MomentumCap, raw*MomentumDamp, MomentumCap)`.
- **Store forecast** = Level + damped/capped Momentum.
- **Shrinkage to fleet** = `(fleet_avg_level − store_forecast) × 0.15` — pulls noisy single-store
  reads 15% toward the 27-store fleet average comp, added back in.
- **Final forecast comp%** = Store forecast + Shrinkage adjustment. This feeds `Table 1 (2)`
  column AT (`='Sales Fcst Calc'!I<n>`), and `AS = LY_sales × (1 + AT) + LY_sales`.
- **REVIEW flag** (column L) fires when `|raw momentum| > 5 pts` — i.e., when the L6W→L2W swing is
  big enough that the model's own damping might be hiding something real. This is the one place
  the model tells him WHERE to spend judgment, rather than making him eyeball all 27 stores.
- Also computed, diagnostic only: **Traffic comp vs. avg-check comp** (`(1+Level)/(1+TrafficComp)
  -1`) — his own built-in sanity check for "is price or traffic carrying this store."

**The dials are not guessed — they're fitted and backtested, on the `Assumptions` tab itself**:
a held-out test (predict Jul-26 comp from weeks ending ≤6/30, 25 comp stores) scores **this
model at 1.9pp MAE**, vs **2.21pp for a naive "repeat prior month's comp"** and **3.27pp for his
own previous model** (an L6W/L2W blend, explicitly superseded — the Assumptions tab literally
says *"(Superseded — replaced by the Sales Forecast Model block below)"* over the old dial). A
second cross-validation (9 held-out months, 200 observations) separately confirms the shrinkage
step is what's carrying the improvement. **This is a real, validated statistical forecasting
method, built and tested by hand in Excel** — Level + damped/capped momentum + shrinkage-to-mean
is a legitimate, textbook-adjacent technique (closest relative: Holt's linear trend with a
James-Stein-style shrinkage correction), not an ad hoc guess.

### 2. Labor % and TPPH — a separate, simpler recency-weighted blend

Both use the SAME fixed weights (`LaborWeights`/`TPPHWeights`, named ranges): **L3M 10% / L6W 20%
/ LM 30% / MTD 40%** — `SUMPRODUCT(L3M:MTD, weights)/SUM(weights)`, i.e. the most recent data
counts most, older data counts least, no shrinkage or momentum step. TPPH additionally rounds UP
to the nearest 0.05 (`CEILING(x, 0.05)`) — a deliberate conservative bias (never round a labor
efficiency target down). A separate trend-arrow threshold (Assumptions tab: 0.1 pt/period for
labor%, 0.05 TPPH/period, 1 pt/period for sales comp) drives an up/flat/down arrow next to each
number, purely a display aid (`SLOPE()` over the 4 periods vs. the threshold).

### 3. The actual human step — a bounded override, not a rebuild

The published `H` column ("Sales Projection" = `tProdSales`, what actually lands as the official
target) is **not** the raw model output. The real chain, read directly off the formulas:

- `AT` = his fitted model's comp% (§1 above).
- `AE`/`AF` ("Meridian 1st Run"/"Meridian 2nd Run") = **pasted-in values from this app's own
  forecast**, re-pulled at two different points in his review process — he already treats
  Meridian's engine output as a second opinion alongside his own model, informally, by hand.
- `AX` = his own final override comp%, typed in directly — the one truly manual cell.
- `AY = LY_sales × (1 + AX)`, and `H` is a pasted-value copy of `AY` — that's what gets published
  as the store's official monthly sales target.

**Measured on a complete, closed month (October 2026, all 27 stores reviewed):** `AX` is nonzero
on **18 of 27 stores** (range −9% to +9%, no outliers near the ±2pt momentum cap — he's not just
rubber-stamping the model's raw momentum swings), and exactly **0 on the other 9** — a deliberate
"nothing here warrants deviating from flat" call, not an unreviewed placeholder (the November
file, still mid-review 3 days into the month, shows the SAME 0-default pattern on untouched rows
alongside real overrides on exactly the stores `Sales Fcst Calc` flagged `REVIEW` — e.g. loc 6178
Chipley, flagged REVIEW with a raw momentum swing of −7.4pts, got a real −6% manual override).

**So "his logic" is precisely this three-step shape**: run the fitted model → flag the stores
whose recent swing is big enough to deserve a second look → apply a bounded personal adjustment
only there (and leave the rest at the model's own number, or in a conservative case, flat). It is
reconstructable, it is not mysterious, and critically — **it does not need him to be in a
spreadsheet to execute.**

## Why this matters for "transition this entirely to the app" (the literal ask)

The ENTIRE raw input to the sales model — 13 weeks of per-store comp% — is computed in the
workbook from `Product Sales / Product Sales LY - 1`, sourced from his own weekly QSRSoft sales
exports (`Data Input` tab's own header: *"populated from uploaded files 'Sales ... .xlsx'
(weekly)..."*). **Meridian already has this exact figure, daily, auto-pulled**, via
`qsr_daily_activity`/`sales_ledger_daily` — `metric-source.js`'s existing auto-first sourcing. The
Labor%/TPPH blend's four windows (L3M/L6W/LM/MTD) are also already-computed metric windows
elsewhere in the app. **There is no new data to collect.** Porting the model is a pure compute
exercise over data already flowing in — it does not wait on, or require, a new upload ever again.

The only genuinely irreducible human step is the bounded override — and that already has a home:
the Monthly Targets editor (`MonthlyProjectionsPanel`, task #62, already live) already lets him
type a value directly into `tProdSales` per store. What's missing is the REVIEW flag itself
(computing and surfacing `|L6W-L2W swing| > threshold` per store, so he knows WHERE to look without
opening a spreadsheet) and the model's own number as the pre-filled default before he overrides it.

## What this is NOT

This is not a referendum on whether his process is "good enough" — the backtest numbers on his
own Assumptions tab already settle that (1.9pp MAE beating both a naive benchmark and his own
prior model). This finding is the blueprint for porting a model he already proved works, not a
case for replacing it with something else. See `memory/plan-forecasting-command-center-2026-11-04.md`
for the build-facing recommendation.
