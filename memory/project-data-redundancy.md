---
name: project-data-redundancy
description: Data source redundancy concern — sales and other metrics appear in multiple ds.* sources; no master key exists; pre-beta audit needed
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

No master key / single source of truth exists across overlapping data sources. Each panel pulls from its designated `ds.*` field independently.

**Why:** Not a problem at current scale (one user, known uploads), but could cause subtle inconsistencies if panels showing the "same" number draw from different sources. Becomes a real risk before multi-user beta.

**How to apply:** Before going beta with a second operator, audit which source each key metric draws from in each major panel. Flag any panel that could silently fall back to a different source.

## Sales source — AUDITED (v4.339)

**Implicit master key: `laborRows[].sales` = Product Net Sales (Labor Analysis Excel, "Product Sales" column, fallback "All Net Sales")**

Parser: `sales: parseNum(r[C.sales]) || parseNum(r[C.allNetSales])` — parsers/index.js:297

| Panel / Engine | Field | Source |
|---|---|---|
| Forecast, Backtest, Analytics (pSales/pLY) | `r.sales` | `laborRows` → Product Sales |
| Coaching, Why, Signals, Smart Targets, Location Intel | `r.sales` | `laborRows` → Product Sales |
| EOM Supervisor actSales | daily sum of `r.sales` | `laborRows` primary, fobRows fallback |
| EOM Supervisor tProdSales (projections) | `fobRows[].tProdSales` | FOB Report Excel monthly total — same definition, different upload |
| QSRSoft FOB / Food Cost panel | `qsrFobRows.prod_sales_amt` | QSRSoft API MTD — used for food cost context only, NOT compared to laborRows.sales |

**Conclusion:** Engine is consistent. `qsrFobRows.prod_sales_amt` does not compete with `laborRows.sales` anywhere. The only dual-source case is EOM Supervisor actSales vs tProdSales — already fixed to use laborRows as primary (see changelog v4.149/v4.152).

## Remaining overlaps (not yet audited)

- Labor hours: `laborRows` (actuals) vs `schedRows` (LifeLenz scheduled)
- Food cost: `fobRows` (manual EOM) vs `qsrFobRows` (auto-synced daily MTD)
- Guest count / OEPE: `peaksSvcRows`, `peaksSalesRows`, possibly `opsRows`

## Automation ceiling (as of v4.339)

No additional automation is possible — remaining manual sources (Ops Report, Controls, DAR, Register Audit, 3 Peaks, SMG VOICE) all come from McDonald's internal systems (mBOS/BOS) or SMG with no public API. Everything automatable is automated.
