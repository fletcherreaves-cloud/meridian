---
name: notes-31-queue
description: Owner "Notes 31" (2026-07-28) — Leadership One-Pager refinements after first live look at the shipped panel (#64/#79). Date-range compare + yearly-totals tracking, FOB yearly-total looks wrong (14.88% FL), Labor/OEPE/R2P/TPPH not populating, suggested-actions timeframe clarity, spell out L/F/G + Guest-Count $ basis, and a level dropdown (Owner→DO / DO→Supervisor / Supervisor→GM) with abbreviated tag on the form.
metadata:
  node_type: memory
  type: project
---

# Notes 31 (2026-07-28) — Leadership One-Pager v2 refinements

Owner reviewed the shipped One-Pager (#64, merged in PR #79) live and gave 6 items.

## 1. Date selection semantics + date-range compare
- **Clarify what selecting a date does** (surface the active window on the panel).
- **Allow selecting a date RANGE to compare.**
- The **bottom-section numbers appear to be YEARLY totals** — owner believes so. If yes:
  make them **range-specific**, but **also list the yearly totals** alongside so movement
  is trackable (range value + YTD/annual context).

## 2. FOB yearly total looks WAY off (data/definition bug)
- Main-section yearly FOB: **FL 14.88% vs 3.99%**, **OK 5.77% vs 4.13%** — both high, FL wildly.
- Hypothesis: **not apples-to-apples** — maybe showing **FOB $ ÷ (wrong denominator)**, or
  **FOB vs Base Food** confusion, or a data issue. Canonical FOB% = Σ(comp+raw waste + condiments
  + emp/mgr meals + stat var + unexplained) ÷ Σ prodSales (dollar-weighted). Verify the One-Pager
  FOB math matches At-A-Glance canonical; check FL data completeness. Report if actually correct.

## 3. Labor, OEPE, R2P, TPPH not populating
- These metrics are blank in the current view. Likely metric-source wiring gaps in
  one-pager-data.js (buildMetricNow / buildCurrentState). Route through metric-source.js
  (metricDaily/metricSeries/metricAvg) like the rest of the app. TPPH may need adding.

## 4. Suggested actions — timeframe clarity
- Each action lists "$xx,xxx recoverable" — **state the timeframe it's extrapolated to**
  (e.g. "annualized", or "over the selected range"). The opportunity engine annualizes;
  make the label explicit.

## 5. "Opportunity on the Table" table — spell out L / F / G + Guest-Count basis
- Columns L, F, G → **Labor, FOB, Guest Count** (spell out or tooltip).
- Guest Count column appears to expect **$** but is unpopulated — confirm it's a **$ opportunity**
  (GC gap × avgCheck × days). If it's expressed as $, fine; else fix. It's currently blank →
  likely the GC pillar isn't computing (tie to #3 data wiring).

## 6. Level dropdown + abbreviated tag on form
- Add a **dropdown in the main panel** to pick the cascade level:
  **Owner→DO, DO→Supervisor, Supervisor→GM.**
- **Denote the abbreviated level on the form:** O>D, D>S, S>G (or similar).
- Complements the existing scope presets (Org/OK/FL/Owner/Supervisor/store).

## Status
SHIPPED (v4.536, PR #80 branch). Root cause of the blank metrics FOUND + fixed:

**#3/#5-GC ROOT CAUSE — metric-source range type mismatch.** `metricSeries` (metric-source.js)
compared raw `r.date` (cloud rows carry Date objects via `_mkDate`) against the One-Pager's
`"YYYY-MM-DD"` STRING range → `Date >= string` coerces to NaN → **every** metric-source value
silently dropped (Labor/OEPE/GC/TPPH). Only FOB survived (fobByRange normalizes to strings).
Fix: `metricSeries` now normalizes BOTH sides via `_dk` (accepts Date OR string ranges).
Regression test added. This also fixed GC → the Guest-Count $ opportunity pillar now computes.

**#3 R2P** genuinely has NO cloud source (glimpse/DAR don't carry front-counter R2P) → stays
manual-only (opsRows). Shows "—" until an Ops Report is uploaded. Documented, not faked.
**#3 TPPH** now derived cloud-side: `qsr_daily_activity` → `tpph = gc / actual_punched_hours`
(loadQsrActSummary) + new `['qsrActSummaryRows','tpph']` metric-source (manual still wins first).

**#2 FOB 14.88%** — added a guard in `fobByRange`: skip rows with `prodSalesAmt<=0` so a
component-only row can't inflate the numerator without a denominator. PLUS the range work (#1)
lets FOB be computed over a full month/YTD (stable denominator) instead of a fragile single week.
⚠️ STILL TO CONFIRM with owner: over a full-month/YTD range, does FL normalize? If FL still reads
~15%, it's a genuine data issue (FL fob rows' prodSalesAmt understated, or different report
mapping) — needs Supabase network access or a `qsr_fob` sample export to pin down (egress blocked).

**#1 range compare** — Range pills Week / MTD / YTD / Custom + anchor/custom date inputs. Header
KPIs (StateGrid) now show the selected-range value WITH the YTD value alongside for movement.
Annualization fixed to `365/days-in-range` (was hard-coded ×52 = weekly-only).
**#4 timeframe** — Opportunity + Suggested actions now state "$ are for the {range}" + annualized note.
**#5 L/F/G** — spelled out (legend "L=Labor · F=Food (FOB) · G=Guest count"); GC chip labeled
"$ = GC gap × avg check".
**#6 cascade** — header dropdown Owner→DO / DO→Supervisor / Supervisor→GM; tag (O›D / D›S / S›G)
on the panel header AND both print outputs.
