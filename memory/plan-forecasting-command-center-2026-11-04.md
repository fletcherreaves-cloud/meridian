---
name: plan-forecasting-command-center-2026-11-04
description: Design options for a unified "Forecasting Command Center" overlay page (owner's "Good morning" ask, 2026-11-04) that brings daily/monthly/yearly forecasting together in one surface, demoting today's scattered forecasting panels to "the engine that drives it." Grounded in a real inventory of 14 existing forecasting-adjacent panels and the owner's own reverse-engineered sales-forecast model (memory/finding-owner-sales-forecast-model-2026-11-04.md). Recommends: port his model as a first-class engine method + build a "Performance-to-Plan" exception-first landing page, not a rewrite.
metadata:
  node_type: memory
  type: plan
scope: tenant
sensitivity: open
---

# Forecasting Command Center — design options (2026-11-04)

**Task #70-adjacent, not yet numbered on its own.** Owner's ask, verbatim: *"an overlay page of
sorts that brings all the forecasting together in one simple dashboard... feel free to utilize
shared components... we could essentially hide some of the other panels and make this the primary
focal point with the hidden items being the engine that drives it... research what that can be and
offer some options."*

## 1. What already exists (measured, not assumed)

14 forecasting-adjacent entries in `panel-registry.js` today, almost all `kind:'test-kitchen'` or
`'hub-tab'` (i.e., already built, already real, just not unified or discoverable):

| Panel id | What it does |
|---|---|
| `proj` (Projections) | Monthly/yearly projection workspace |
| `pvsa` (Proj vs Actuals) | Variance tracking |
| `model-assign` (Forecast Models) | Per-store backtest + model winner (Simple/dow/ae/ewma/di), Period-Total Scoreboard |
| `fcst-accuracy` (Forecast Accuracy) | MAPE by model, per store |
| `dialedin`/`dicompare` (DI Calibration/Compare) | Manual-override calibration |
| `lfz-gap`/`lifelenz-bridge` | LifeLenz vs. Meridian labor-forecast reconciliation |
| `pace-target` | Current-month pace-to-target (the panel fixed this session, v5.611) |
| `smart-targets`/`smart-targets-v2` | The T3M/T6W/T3W median "Simple" model UI |
| `targets`/`targets-editor`/`unified-targets` | Target editors |
| `forecast-audit`, `forecast-reports`, `fcst-ref` | Diagnostics/reference |

**Nobody who isn't already deep in this app's internals could find "the forecast" from this
list.** That's the real problem the owner is naming — not that the forecasting is weak (§2 below
says the opposite), but that it's spread across 14 unlabeled test-kitchen tabs with no front door.

## 2. The grounding finding — his own model is already good, and already compute-ready

Full detail: `memory/finding-owner-sales-forecast-model-2026-11-04.md`. Summary: his manual
workbook runs a **backtested, fitted statistical model** (6-week level + damped/capped momentum +
15% shrinkage-to-fleet, measured 1.9pp MAE vs. a 2.21pp naive benchmark and his own superseded
3.27pp prior model), flags stores for review by swing size, and only then applies a bounded manual
override (nonzero on 18/27 stores in a settled month, 0 elsewhere — a real decision, not a stub).
**Its entire raw input is already redundant with data Meridian auto-pulls daily** — nothing new to
collect, this is a pure compute/UI port.

This directly answers "how difficult would it be to transition this entirely to the app": **not
difficult, because the hard part (the model, the validation) is already done and already proven
— the work left is porting fitted formulas into `metric-source.js`/the engine, not inventing a
forecasting method from scratch.**

## 3. Industry pattern that fits (researched, not assumed)

S&OP/demand-planning tooling converges on one shape repeatedly: a **performance-to-plan landing
screen is the first thing anyone sees**, built around an **exception list** (items whose accuracy,
bias, or trend crossed a threshold), not a flat table of everything. The cadence that pattern
assumes — a short daily triage of only the flagged items, a periodic full review of the rest — is
*already exactly the owner's own workflow*, measured directly from his workbook's `REVIEW` flag
column (§2). This is the strongest possible argument for a specific design direction: **build
toward the structure he already uses by hand**, not toward a generic BI-dashboard aesthetic.
(Sourcing is practitioner blogs/vendor docs, not peer-reviewed — treat the specific MAPE/bias
numbers as rules of thumb, not targets to adopt verbatim; the exception-first *structure* is the
load-bearing finding, repeated across every source found.)

## 4. Recommended shape (opinionated, per the owner's explicit invitation to just propose)

**A new top-level "Forecasting" landing page**, not a rewrite of anything underneath it. Three
zones, in order:

1. **Exception rail (top, always visible).** Every store whose current-period swing crosses the
   owner's own review threshold (lifted directly from his workbook's dial, not invented) — comp%,
   labor%, and TPPH trend breaks in one unified list, each row showing the metric, the model's
   number, the swing size, and a one-click path to override. This is the "REVIEW" column from his
   workbook, computed automatically instead of eyeballed, and it is the single highest-value piece
   to ship first because it's the one step of his process that currently requires him personally.
2. **District/store rollup (middle).** Reuses `ReportShell` + `LocationSelector` (the established
   chassis) — current/28-day/LM/L3M/YTD windows, same convention as every other panel per this
   session's own standing rule on window consistency. One row per store: Sales/Labor%/TPPH
   forecast, this month's actual-to-date, MAPE trend. This is largely `Forecast Accuracy` +
   `Model Assignment` + `Pace Target`'s existing data, re-surfaced, not recomputed.
3. **Model transparency drawer (collapsed by default, real depth preserved).** Per-store drill-down
   showing the Level/Momentum/Shrinkage math live — this is the "depth stays reachable and exact"
   standing UI rule, and it's also literally free: his `Sales Fcst Calc` tab IS this drawer's spec.

**Existing panels (`proj`, `pvsa`, `model-assign`, `fcst-accuracy`, `smart-targets`, etc.) stay
exactly where they are, `kind` unchanged** — they become the "engine" the owner described, reached
from the new landing page's drill-downs rather than from the sidebar directly. No redundant
rebuild: this is a new front door, not new furniture.

**Why not a full rewrite:** nothing found in this research suggests the underlying architecture
(React 19 + the panel-registry pattern + `metric-source.js`'s auto-first sourcing) is wrong for
this — the gap is discoverability and unification, not the engine. A rewrite would cost real time
rebuilding things that already work (the backtest, the model registry, the window logic) to
produce the same numbers through a new pipe. Recommend against it.

## 5. What's genuinely the owner's call (not presuming)

1. **Does the exception threshold come from his workbook's exact dial (5pt swing), or does he want
   to retune it once it's live and he can see real alert volume?** Recommend shipping with his own
   number first — it's already validated — and letting him adjust from inside the app once visible.
2. **Print/export format for the new landing page** — the owner explicitly invited a different
   format, not required to mirror the existing `targetsPrintHtml` style. No action needed from him
   now; this is a Phase-2+ question once the live page exists to decide against.
3. **Naming** — "Forecasting Command Center" is the owner's own working title; worth keeping unless
   he wants something shorter for the nav ("Forecasting" alone might read cleaner next to the
   existing one-word nav sections).

## 6. Staged build

- **Phase 1 (highest value, lowest risk): port the model, not the page.** Add his exact sales
  formula (Level/damped-momentum/shrinkage) as a new named method in the forecast engine
  (alongside `'simple'`), computed from already-auto-pulled sales data — zero new uploads. Add the
  Labor%/TPPH recency blend the same way. Add the REVIEW-flag computation. This alone makes the
  existing Monthly Targets editor pre-fill with his own validated number instead of a blank cell,
  which is most of "transition this entirely to the app" on its own.
- **Phase 2: the exception rail**, as its own small panel, reading Phase 1's flags — ships value
  before the full landing page exists.
- **Phase 3: the unified landing page** (§4's three zones), reusing Phase 1/2 wholesale plus
  `ReportShell`/existing rollup panels.
- **Phase 4: print/export options**, once the live shape is settled and there's something real to
  design a print layout against.

Not starting Phase 3 before Phase 1 exists — the model IS the content; a landing page over nothing
new would just be rearranging existing panels without the "transition fully to the app" payoff the
owner actually asked for.
