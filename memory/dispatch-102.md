---
name: dispatch-102
description: FOB Analysis's cloud-sourced dollar totals (Net Sales, and every waste/condiment/meal/variance $ figure) are inflated by roughly the number of days elapsed in the selected month -- measured ~24x for August 2026 (23 days elapsed). Root cause confirmed by direct comparison against the owner's own QSRSoft export and by pulling live qsr_fob rows: each qsr_fob row IS a correct MTD-cumulative-as-of-that-date snapshot (deliberately upserted one row per (loc,date) by the pull script), but computeFOBMetrics (src/views/analytics.js) sums r.sales and every dollar-weighted component ACROSS EVERY DAY'S ROW in the month instead of taking only the latest snapshot per store -- so the same monthly total gets added in N times, once per day the pull has run. fobSnapshotByStore (eom-inventory.js) already does this correctly elsewhere in the same codebase (latest-row-per-loc-per-period) -- reuse that pattern, don't invent a new one.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #102 — FOB Analysis's cloud dollar totals are inflated ~24x (sums daily snapshot rows instead of taking the latest)

**Status:** ready, root cause fully measured and reproduced against live data + the owner's own
QSRSoft export. This is a scoped fix, not an open investigation. **High priority** — this panel
("🎯 Root-Cause Priority Matrix — Top Coaching Opportunities") ranks stores and drives real coaching
dollar-impact decisions off these numbers; every dollar figure on screen right now is wrong by
roughly the same large factor.

---

## What the owner saw, and the measured discrepancy

Owner uploaded their own QSRSoft export (`Food_Over_Base_20260801_to_20260823.xlsx`, one row per
store, the real MTD-to-date totals as of 2026-08-23) and asked whether the FOB Analysis panel's
totals were right — they suspected a yearly/monthly mixup. Comparing the panel's on-screen numbers
(period = August 2026, all 27 locations) against the real total row in the owner's export:

| | panel shows | real total (owner's export) | ratio |
|---|---:|---:|---:|
| Net Sales (period) | $157,872,000 | $6,578,038.11 | **24.0×** |
| Completed Waste $ | $290,384.64 | $12,099.36 | **24.0×** |
| Raw Waste $ | $852,842.64 | $35,535.11 | **24.0×** |
| Condiments $ | $3,081,419.28 | $128,392.47 | **24.0×** |
| Emp/Mgr Meals $ | $500,618.16 | $20,859.09 | **24.0×** |
| Variance Stat $ | $2,417,806.32 | $100,741.93 | **24.0×** |

Every single category is inflated by the **same** ~24× factor — not a yearly/monthly mixup (that
would be ~12×), and not random noise. A uniform multiplier across every independent dollar column is
the signature of a row-counting bug, not a wrong formula per metric.

## Root cause, confirmed by live data — not the pull script, the panel's aggregation

Pulled `qsr_fob` directly for store 3708, `2026-08-01` through `2026-08-23` (`SUPABASE_SERVICE_ROLE_KEY`):
**23 rows, one per calendar day — every single one byte-identical** (`prod_sales_amt: 237550.49`,
`comp_waste_amt: 975.32`, `condiments_amt: 4986.99`, unchanged across all 23 dates). That exact
figure matches the owner's export's per-store row for 3708 precisely. **This confirms `qsr_fob`'s
per-row value is correct** — it's the true MTD-to-date total, re-published under every date the pull
has run so far this month (a real, corroborated pattern: `scripts/qsrsoft-pull.mjs` explicitly
upserts on `onConflict: 'loc,date'`, one row per day by design — QSRSoft's own FOB report is
apparently a period-to-date report, so the pull correctly writes "the current MTD total, as of
today" under today's date key, and the *same* number reappears under every earlier date already
pulled this month; historical spot-check on a 2024 sample shows the identical pattern — flat within
a month, a step change at the month boundary).

**The bug is entirely in `computeFOBMetrics`** (`src/views/analytics.js`, ~line 229-269), which
powers `FOBAnalysisPanel`:

```js
const totalSales=rows.reduce((a,r)=>a+r.sales,0);
...
const wPct=cSales>0?contrib.reduce((a,r)=>a+r[c.key]*r.sales,0)/cSales:null;
```

`rows` here is every `qsr_fob` row in the selected month — 23 rows for August 2026 so far, **each
one carrying the identical full-month MTD total**. Summing `r.sales` across all 23 adds the same
number to itself 23 times; the "27 locations · 648 records" shown on screen is the tell (27 × 24 ≈
648 — 24 pull-days' worth of duplicate snapshot rows per store, not 648 independent daily
observations). Every dollar figure derived from `totalSales` or a `contrib.reduce(...r.sales)`
weighted sum inherits the same inflation.

**This repo already has the correct pattern, unused here.** `fobSnapshotByStore()`
(`src/engine/eom-inventory.js`, ~line 118) reads this exact same "one row per (loc,date), value is
an as-of-that-date snapshot" shape correctly — it groups by `loc`, keeps only the row with the
**latest** `date` key per store (`if (!cur || k > cur.key) latest[loc] = ...`), and computes off that
single snapshot. `eom-dashboard.js` already uses it correctly. `computeFOBMetrics` was almost
certainly written against the OLDER manual `ds.fobRows` shape (one row per store per month, from a
monthly Ops Report upload — genuinely safe to sum across, since there's only ever one row) and never
updated when the cloud `qsr_fob` stream (many rows per store per month) was added as a source.

## The fix

**Do not touch the pull script** — `scripts/qsrsoft-pull.mjs`'s daily upsert is correct and other
consumers (the EOM dashboard's day-by-day cumulative FOB trend chart, `annotateTouchpoints`/
`fobDailyTrace` in `eom-dashboard.js`) rely on having one row per day to plot a real MTD progression
curve. Removing the daily granularity would break that feature.

Fix `computeFOBMetrics` (`src/views/analytics.js`) to take only the **latest** `qsr_fob` row per
`(loc, month)` before aggregating — mirroring `fobSnapshotByStore`'s exact approach (reuse or import
it if practical, rather than re-deriving the same latest-per-key logic a second time; this repo has
a standing "check whether a helper already exists" rule this is a direct instance of). The function
already filters `rows` to the selected month (`selMonth`) before aggregating — the fix is inserting
a "collapse to one row per loc, keep the max-date one" step between that month filter and the
`totalSales`/`contrib.reduce` summation, not a rewrite of the weighting math itself (which is
correct once it's operating on one row per store instead of N duplicates).

**Careful: manual `ds.fobRows` may still legitimately need different handling.** Confirm whether
manual rows are also one-row-per-(loc,month) (in which case latest-per-month collapsing is a no-op
for them, safe) or whether they have their own multi-row-per-month shape that summing was correct
for. `fobRowsEff`'s merge (cloud-first, manual fills gaps) mixes both sources into one array before
`computeFOBMetrics` runs — the collapse-to-latest logic needs to be correct for whichever shape each
source actually has, not assumed uniform. Verify against real data, don't guess.

## Verification bar

- Re-run `computeFOBMetrics` (or the fixed equivalent) against a live `qsr_fob` pull for August 2026,
  all 27 stores, and confirm the district totals match the owner's export **closely** (Net Sales
  ≈$6.58M, not $157.87M; each category $ figure within normal rounding of the export's real totals,
  not 24× off).
- Confirm the per-store `locBreakdown` (used by the Root-Cause Priority Matrix) also corrects —
  Holdenville's Variance Stat dollar-over-target figure, currently ranked #1 coaching opportunity at
  a wildly inflated dollar amount, needs to be re-verified against real numbers post-fix (it may
  still be a real, ranked issue — just at the correct dollar scale, not necessarily off the list).
- Confirm the EOM dashboard's day-by-day FOB trend chart (`fobDailyTrace`/`annotateTouchpoints` in
  `eom-dashboard.js`) is completely unaffected — it's a different consumer of the same raw rows and
  must keep using the full daily series, not the collapsed latest-only view this fix introduces
  specifically for `computeFOBMetrics`.
- Per this repo's "would this verification still pass if reverted" rule: render the actual
  `FOBAnalysisPanel` consumer against a realistic multi-day-duplicate fixture (modeling the real
  `qsr_fob` shape measured above) and assert the displayed totals match a single month's worth, not
  a multiplied one — a test that only unit-tests a helper in isolation could pass even if the panel
  never actually calls it.

## Do NOT

- **Do not change `scripts/qsrsoft-pull.mjs`'s daily-row-per-date upsert behavior** — correct by
  design, other consumers depend on it.
- **Do not touch `fobSnapshotByStore`** (`eom-inventory.js`) — already correct, model the fix on it.
- **Do not assume manual `ds.fobRows` has the same multi-row-per-month shape as cloud `qsr_fob`
  without checking** — verify before applying the same collapse logic to both sources.
- **Do not just divide the totals by the row count as a patch.** The row count varies by how many
  days have elapsed in the selected month (23 today, will be different next week and for prior
  months) — the fix is taking the correct single snapshot, not scaling a wrong sum by a guessed
  constant.
