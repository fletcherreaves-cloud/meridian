---
name: project-data-redundancy
description: Data source redundancy concern — sales and other metrics appear in multiple ds.* sources; no master key exists; pre-beta audit needed
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

## ⭐ SOURCING PRINCIPLE (2026-07-20) — auto/emailed-first, freshest-wins

**Every metric a panel displays must be tied to an AUTO-PULLED or EMAILED data
stream, and the most current data must always win.** This is a standing rule for
all future work, not a one-off.

- **Primary sources = the cloud streams** that refresh on their own on every device:
  - Auto API pulls → `qsr_daily_activity` (DAR: sales, DT, **actual/needed punched hours**), `qsr_ebos_daily`, `qsr_fob`, `lifelenz_schedules`.
  - Emailed → server-parsed → Supabase → `daily_glimpse_daily` (**labor %**, OEPE/KVS, controls), `sales_ledger_daily` (channel mix/3PO), `cash_sheet_daily`.
- **Manual uploads** (Labor Analysis Excel → `laborRows`, Operations Report → `ctrlRows`/`opsRows`, FOB Excel, etc.) are **LAST-RESORT FILL ONLY**. They may fill a loc/date the cloud streams don't cover yet; they must **never override** auto/emailed data, and must never be the primary source for a tile or column.
- **Freshest-wins merge order** everywhere: cloud-auto/emailed → (only if absent) manual. When two cloud sources overlap, prefer the more recent / more granular one.
- **Why the manual trap is easy to fall into:** manual sources are device-local IDB — they look "present" on the dev's own machine but are empty on every other device and stop at whatever date the last upload happened to cover. That's exactly the failure the Scheduling QSR columns hit (v4.430–v4.432): they were keyed off manual `laborRows`/`ctrlRows`, so they went blank on other devices and had no data before the last manual upload (~7/10). Fixed by sourcing QSR Labor % ← Glimpse, QSR Hours ← DAR summed punched hours (60-day cloud window), manual only as fill.

**Checklist for any new tile/column:** (1) Which auto/emailed stream feeds this? (2) Does it load cloud-first on a fresh device? (3) Is manual strictly a fallback that can't override? (4) Does the freshest available date win?

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

## Automation ceiling (as of v4.339) — SUPERSEDED by v4.426 (2026-07-20)

~~No additional automation is possible — remaining manual sources all come from mBOS/BOS or SMG with no public API.~~

**Obsolete.** The Data-Refresh sprint (v4.406–v4.426) broke this ceiling. The QSRSoft **emailed** reports — Sales Ledger, Daily Glimpse, Cash Sheet — DO carry the channel mix / 3PO / OEPE / KVS / controls (promo, cash O/S, T-reds, overrings, refunds) data. They arrive automatically via the Gmail→Edge-Function ingest pipeline, and are now **parsed server-side** (`scripts/qsrsoft-email-parse.mjs` GitHub Action) into Supabase tables `sales_ledger_daily` / `daily_glimpse_daily` / `cash_sheet_daily`, then loaded cloud-first. So these metrics are auto-fresh on every device without a manual Operations Report.

**Still genuinely manual-only** (no email/API source): R2P, drawer opens, and the per-daypart granularity of the 3 Peaks / Register Audit workbooks.

**FOB roll-up note (v4.426):** district/OK/FL FOB figures are **dollar-weighted** — Σ(component $)/Σ(Prod Net Sales $) from `qsr_fob` raw amounts — NOT a straight average of store percentages. Both current MTD and last-completed-month come from `qsr_fob` (each month's final row = that month's actual).
