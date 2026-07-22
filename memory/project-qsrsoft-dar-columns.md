# QSRSoft DAR — Exact Column Formulas (from the report's own column factory)

Source of truth for how every Daily Activity Report metric is derived from the
**raw** `daily-activity-raw` fields. Extracted verbatim from QSRSoft's frontend
bundle (`columnFactory` / `columnHelpers`) on 2026-07-21, so there is **no
guessing** — these are the report's real definitions. Times are raw sums in ms;
`/1e3` → seconds. Our pull already stores every raw field below (see
`scripts/qsrsoft-dar-pull.mjs` `SELECT_COLS` + `mapRow`, and DB table
`qsr_daily_activity`).

## Key gotcha discovered
R2P and "KVS Time Per GC" are **NOT raw fields** — they are computed by the
report UI. They only appear as columns once added to the report's DEFAULT tab.
We must derive them ourselves from raw fields.

## Speed / service formulas
| Display column | Field id | Formula (raw fields) | Notes |
|---|---|---|---|
| **OEPE** | `OEPE` | `(dt_untilserve − dt_untilstore) / 1e3 / dt_trans_cnt` | Order-End→Present-End; **includes** parked-order wait |
| **OEPE W/O Parked** | `OEPENoPark` | `((dt_untilserve − dt_untilstore) − dt_heldtime) / 1e3 / dt_trans_cnt` | excludes parked |
| **R2P** | `R2P` | `(fc_untilserve − fc_untilclosedrawer) / 1e3 / fc_trans_cnt` | **FRONT COUNTER** metric = Receipt-to-Present (paid→presented). NOT drive-thru. |
| **Avg CTP** | `CTP` | `(dt_untilserve − dt_untilrecall) / 1e3 / dt_trans_cnt` | Cash-to-Present (recall at cash booth→present) |
| **Avg DT TTL** | `dtTTL` | `dt_untilserve / dt_trans_cnt / 1e3` | DT Total (first keystroke→served); parks excluded. **= our current "DT" column** |
| **Avg Win TTL** | `windowTTL` | `fc_untilserve / fc_trans_cnt / 1e3` | first POS keystroke→served from FC KVS. **= our current "Front Ctr" column** |
| **Bev Run Time** | `bevRunTime` | `(bev_untilserve − bev_untilclosedrawer) / bev_trans_cnt / 1e3` | paid→served from bev monitor |
| **Bev TTL** | `bevTTL` | `bev_untilserve / bev_trans_cnt / 1e3` | start of order→served |

## KVS / kitchen (Made-For-You) formulas
| Display column | Field id | Formula | Notes |
|---|---|---|---|
| **KVS Time Per GC** | `KVSTimePerTran` | `(mfy1_untilserve + mfy2_untilserve) / 1e3 / (mfy1_trans_cnt + mfy2_trans_cnt)` | **= our current "Kitchen" column** |
| **KVS Time Per Item** | `KVSTimePerItem` | `(mfy1_untilserve + mfy2_untilserve) / 1e3 / (mfy1_itemscount + mfy2_itemscount)` | |
| **KVS Item** | `KVSItems` | `mfy1_itemscount + mfy2_itemscount` | |
| **KVS Items Per GC** | `KVSItemsPerTran` | `(mfy1_itemscount + mfy2_itemscount) / (mfy1_trans_cnt + mfy2_trans_cnt)` | |
| **KVS Healthy Usage** | `healthyUsePct` | `healthy_count / (healthy_count + unhealthy_count)` | % of time both prep-table sides open & ≥20% orders each |
| MFY1 Time Per Order | `MFY1TimePerOrder` | `mfy1_untilserve / 1e3 / mfy1_trans_cnt` | |
| MFY1 Time Per Item | `MFY1TimePerItem` | `mfy1_untilserve / 1e3 / mfy1_itemscount` | (mfy2 analogous) |

## Drive-thru pull-forward
| Display column | Field id | Formula | Notes |
|---|---|---|---|
| **DT Pull Forward %** | `dtPctPullForward` | `dt_carsheld / dt_trans_cnt` (×100 for %) | **= our current "Pull Fwd" column** ✓ |
| **DT Pulled Forward Count** | `dtParkedTrans` | `dt_carsheld` | |

## Sales / GC / labor (already used elsewhere, for reference)
- All Net Avg Check `avgCheck` = `allNetSales / transactions`
- Prod Avg Check `productNetSalesAvgChk` = `productSales / transactions`
- STW GC = `transactions`; DT GC = `dt_transactions`; In-Store GC = `is_transactions`; **MOP GC = `mop_transactions`** (app order+pay — we don't pull this yet)
- Act Hrs = `actualPunchedHours + salariedManagerScheduledHours`
- Act Hrs vs Sch = `actualHours − totalScheduledHours`; Act Hrs vs Need = `actualHours − totalNeededHours`
- TPPH = `transScrubbed / actualPunchedHours`; TPTH = `transactions / actualHours`
- SPPH = `prodSalesScrubbed / actualPunchedHours`
- Punch Labor % = `actualPunchedDollars / prodSalesScrubbed`; Avg Rate = `actualPunchedDollars / actualPunchedHours`

## Endpoint config (from the bundle)
- url `/v1/reports/shift/daily-activity-raw`, `deconstructApiResponse: e => e.result`
- batch: `nsn` chunkSize 50, date chunkSize 31

## Field-name bugs fixed in our pull (2026-07-21, v4.430)
Our `SELECT_COLS` requested the wrong case/spelling vs the real API fields:
- `fc_untilcloseDrawer` → **`fc_untilclosedrawer`** (needed for R2P & FC close)
- `bev_untilcloseDrawer` → **`bev_untilclosedrawer`** (needed for Bev Run Time)
- `projectedInStoreTranScrubbed` → **`projectedInStoreTransScrubbed`** (in-store proj)
If the API is case-sensitive, historical rows have these fields empty → a
**re-pull is needed** to populate R2P / Bev Run Time / in-store-proj history.

## Applying to the Graded-Visits hourly context — DONE (v4.432)
The hourly table in `src/views/graded-visits.js` now shows, with exact formulas
(`hourMetrics()`), relabeled columns: **OEPE · DT TTL · CTP · R2P · Win TTL ·
KVS/GC · Bev · Pull Fwd · Punch/Need/Sched · vs Need**. Print/CSV export mirror it.
- `loadVisitDAR` select now includes `dt_untilrecall` + `fc_untilclosedrawer`.
- **OEPE/CTP/R2P are guarded** on their subtrahend being > 0, so a not-yet-
  backfilled `fc_untilclosedrawer` / `dt_untilrecall` renders "—" instead of a
  bogus value equal to the total time. **Run a DAR backfill** (field-name fix
  v4.430) and R2P/CTP populate historically.
- KVS Healthy Usage hourly (`healthy_count/(healthy+unhealthy)`) intentionally
  left off hourly per owner; shown in the Daily chips.

## v4.433 — full column set + Day/Visit-hour summary
The visit context now runs off a single `METRICS` spec (one source of truth for
the hourly table, the two-row summary, and print/CSV). Columns (logical order):
Prod Sales · Prod Sales +/-% · STW GC · STW GC +/-% · OEPE (w/o parked) · DT TTL ·
Avg CTP · R2P · KVS Time Per GC · KVS Healthy Usage · Bev TTL · DT Pull Forward % ·
Labor % (= punch $ / prod-sales-scrubbed) · Act Punch Hours · Sched Hours ·
Needed Hours · Act vs Needed. Win TTL removed.
- **"Main bar" is now two rows: Day vs Visit Hour.** Day totals are computed by
  summing raw fields across all hours then running the same formulas — so every
  rate is dollar/count-weighted, never an average of hourly averages. Fixed the
  bogus "Guests = 17": STW GC is now Σ transactions (real day guest count).
- `loadVisitDAR` select added: transactions, ly_product_sales, ly_transactions,
  actual_punched_dollars, prod_sales_scrubbed (+ earlier dt_untilrecall,
  fc_untilclosedrawer).
- OEPE now uses the **w/o-parked** formula per owner: `(dt serve − store − held)/GC`.

## Still open
- Consider adding `mop_transactions` to the pull (MOP/app GC) — not yet pulled.
- Relabel the same timing columns anywhere else they surface (Signals SoS panel).
- R2P / Avg CTP still show "—" until a DAR backfill repopulates fc-close-drawer /
  dt-recall history (field-name fix shipped v4.430).
