# Record Hour in Sales — the real rolling-60-minute fix (2026-10-12)

## The ask

Owner: a "Record Hour in Sales" feature — the single best 60-CONSECUTIVE-MINUTE rolling
window of sales a store has ever had, built from 15-minute increments. *"I don't care how
the hour is formed, just that it is :60 minutes consecutively."* Any 15-minute-aligned start
counts the same (7:15am–8:15am == 7:00am–8:00am).

## What was confirmed before touching any code

A whole-repo grep found **no "Record Hour" feature anywhere** — not under that name, not
under any synonym ("hourly record", "best hour", "clock-hour bucket", "peak hour", etc.),
not in `src/`, not in `memory/`, not in any changelog entry. The only related feature is
**"Record Days"** (`RecordDayTab`, `record-day.js`, dispatch #103/#130/#136/#203) — day/
week/month/day-of-week sales, GC, avg check, breakfast, and speed (OEPE/KVS/R2P) records.
No hour-granularity record of any kind existed before this dispatch. A task brief handed to
this session assumed a clock-hour-only V1 had already shipped; it had not, by any evidence
this repo or its memory files carry. Flagged to the owner before building anything — they
confirmed: build the real fix now.

Also confirmed (also by grep, matching the task brief's own claim): **no 15-minute-
granularity sales data was pulled anywhere** before this dispatch. `qsr_daily_activity`
(the DAR table) is genuinely hourly — 24 fixed clock-hour buckets, despite the misleading
QSRSoft API field name `endQtrHourTime` (see `labor-standard.js`'s DAYPARTS header comment).

## The architecture decision

Two candidate data sources existed:

1. **Product Mix's item-level quarter-hour segmentation** (`memory/qsrsoft-report-
   catalog.md`'s "By Quarter Hour" capability, `timeInterval` param on the PMIX endpoint).
   Rejected: that catalog file itself flags item-level PMIX as "enormous volume" even at
   DAILY grain (441 rows/store-day → ~4.3M rows/year for `qsr_product_mix`). Item-level data
   at quarter-hour grain would multiply that further, and Record Hour has no use for a
   per-item breakdown — it needs one sales $ total per 15-minute bucket.

2. **The SAME `daily-activity-raw` endpoint `qsrsoft-dar-pull.mjs` already drives**, with
   `segmentBy`/`timeInterval` swapped from `'hour'` to `'quarterHour'`. Chosen. DAR already
   proves this exact mechanism works for the hourly case (one 'open-close' segment name,
   backend slices it into N rows per the `timeInterval`), already returns the sales fields
   needed (`productSales`, `allNetSales`, `transactions`), and the response field name
   `endQtrHourTime` was already a strong hint the API's native grain is quarter-hour and DAR
   was simply asking it to pre-aggregate up. `memory/qsrsoft-report-catalog.md`'s own filter-
   surface table for the Product Mix report ("View Segment | By Total · By Hour · By Quarter
   Hour | timeInterval") confirms `'quarterHour'` is a real, documented value this API family
   accepts — just captured for a sibling report, not this exact endpoint.

Projected volume (analytical, not yet live-measured): 96 slots/store-day × 27 stores =
**2,592 rows/day, ~945K rows/year** — two orders of magnitude below `qsr_product_mix`'s
~4.3M rows/year, because this is sales totals, not per-item facts. Confirms the item-level
route was correctly rejected without needing to test it directly.

## What is NOT verified

**This sandbox has no QSRSoft credentials** (`env | grep QSRSOFT` returns nothing) — the
`segmentBy='quarterHour'` parameter value has not been tested against the live API. It is a
reasoned extrapolation from `'hour'`'s proven behavior and the endpoint's own field naming,
not a confirmed measurement. Per this repo's "measure it, don't reason about it" standing
rule, the pull script (`scripts/qsrsoft-sales-quarter-hour-pull.mjs`) logs a loud diagnostic
on the first real day it pulls — row count, distinct `qtr_slot` count, a sample of the slot
values — and an explicit warning if 24 or fewer distinct slots come back (meaning the API
silently fell back to hourly granularity). **Check the GitHub Action's run log after this
first deploys before trusting any Record Hour number.** If the warning fires, the fix is
almost certainly a different `segmentBy`/`timeInterval` string value — re-capture the
Product Mix report's own network request with that control set to "By Quarter Hour" to get
the exact literal QSRSoft sends, the same way `memory/qsrsoft-report-catalog.md`'s existing
captures were built.

## Design choices in the new table (`qsr_sales_quarter_hour`)

- **loc is UNPADDED** on read (`src/lib/supabase.js`'s `loadQsrSalesQuarterHour`), unlike
  `qsr_product_mix`/`qsr_fob`/`qsr_service_stats`'s padded convention. Deliberate: this table
  has exactly one consumer (`record-hour.js`, keyed against `ds.storeIds`/`STORE_NAMES`,
  both unpadded) and no cross-table join needing the padded form. CLAUDE.md records four
  separate loc-padding incidents from a new stream silently picking the "wrong" convention —
  this sidesteps that by picking the side its only consumer actually needs. The pull script
  still WRITES padded NSNs (matching every other QSRSoft table); only the client loader
  unpads, exactly like `_loadOpsTable` already does for the ops-pull family.
- **No rollup table.** DAR's `qsr_daily_activity_rollup` exists because the hourly table
  got too expensive to page through on every login (~675 rows/day). This table is ~2,592
  rows/day — same order of magnitude DAR's hourly table was navigating *before* that became
  a problem — so a rollup is premature; revisit if `qsr_sales_quarter_hour` itself becomes
  the slow read.
- **Not added to `stream-freshness.js`'s `STREAMS` array.** `ds.qsrSalesQtrHourRows` is a
  `metric-source.js` `LAZY_FILL_SOURCES` entry (consumer-triggered, same shape as
  `pmixRows`/`auditRows`/`wasteRows`) — `ds[field]` reading empty means "nobody opened the
  Record Hour tab yet," not "the pull failed." None of the other three `LAZY_FILL_SOURCES`
  entries are in `STREAMS` either, for the identical reason; adding this one would misread
  every user who hasn't opened the tab as a stale/broken stream. CLAUDE.md's "Adding a new
  automated pull" checklist item 2 is a correct default for an eagerly-loaded stream, not for
  this shape — same precedent already established, not a new deviation.

## Files

- `supabase/schema-qsr-sales-quarter-hour.sql` — new table, tenant_id + RLS.
- `scripts/qsrsoft-sales-quarter-hour-pull.mjs` — new pull, two-path auth (same pattern every
  other QSRSoft pull uses).
- `.github/workflows/qsrsoft-sales-quarter-hour-pull.yml` — daily schedule (2x/day, mirrors
  `qsrsoft-ops-pull.yml`'s cadence) + watched in `sync-failure-watch.yml`.
- `src/engine/record-hour.js` — pure sliding-window computation (`computeHourRecords`,
  `scopeHourRecords`, `windowLabel`), independently testable, no React.
- `src/views/record-day.js` — new "🕐 Record Hour" tab inside the existing Record Days hub.
- `src/lib/supabase.js` — `loadQsrSalesQuarterHour`.
- `src/engine/metric-source.js` / `src/app/App.js` — lazy-fill wiring (bounded + wide tiers).
- Tests: `src/__tests__/record-hour.test.js` (13 engine unit tests), `src/__tests__/
  record-hour-tab-render.test.js` (render-level, through the real `RecordDayTab`).
