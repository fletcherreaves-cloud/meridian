---
name: finding-pace-to-target-window-gap-2026-10-06
description: Pace to Target showed every store uniformly ~20-25% below target for August 2026 -- not real underperformance. Two independent bugs in CurrentMonthPaceSection (analytics.js) -- a dead salesLedgerRows.prodSales field reference, and both sales sources being loaded with a fixed 60-day trailing window that silently clips an out-of-window viewed month. Both fixed same day.
metadata:
  node_type: memory
  type: finding
---

# Pace to Target: a uniform district-wide shortfall was a loading-window bug, not real data (2026-10-06)

## What the owner reported

Screenshot of Pace to Target, August 2026: every single one of 27 stores showed a shortfall in
the -17% to -36% range, District pace -24.91% ("as of Aug 31 · day 31 of 31"). Attached the real
August Operations Report to compare against.

## Measured against the real data

Real August Product Sales total (Operations Report, "Sales" sheet, "Total" row): **$8,761,530**.
Panel's own District MTD Actual: **$6,978,621**. A genuine **~20% ($1.78M) gap** — far too large
and far too uniform across every store to be real performance; a district-wide ~25% miss would be
a newsworthy event, not something that just quietly happens identically everywhere.

Checked the underlying Supabase data directly (not assumed): `qsr_daily_activity_rollup` for
August 2026 has complete coverage — 27 stores × 31 days = 837 rows, every day present, district
total **$8,762,156** (within $626 of the real Operations Report — i.e. correct). `sales_ledger_daily`
also has full 31-day coverage (837 rows). **The underlying data was never missing or wrong** —
the bug was entirely in how `CurrentMonthPaceSection` (`analytics.js`, backs both `pace-to-
target.js` and the Planning → Monthly page) loads and reads it.

## Two independent, compounding bugs

1. **Dead field reference.** The code read `r.prodSales` off `ds.salesLedgerRows`, but
   `loadSalesLedger()` (`lib/supabase.js`) never sets that field — it only sets `.sales`/
   `.allNetSales` from `sales_ledger_daily`'s `all_net_sales` column (that table has no separate
   "product sales" column at all). So this entire priority-3 leg (meant to be the freshest/
   preferred source per the code's own "emailed sales_ledger > DAR product sales" comment) was
   silently a no-op for every row, every month, always — not just for August. Fixed: read
   `r.sales` instead. `all_net_sales` runs ~1% above true product sales (confirmed on the same
   August data: $318,831 vs $315,035 for one store) — close enough to serve as the fresher-but-
   slightly-less-precise leg the priority ordering always intended, rather than a leg that never
   contributed at all.

2. **Fixed 60-day trailing window, not relative to the viewed month.** `ds.salesLedgerRows`/
   `ds.qsrActSummaryRows` are both loaded once at app bootstrap with a 60-day trailing window from
   **today** (`App.js`: `loadSalesLedger(60)`, `_stQsrsoftActSummary(60)`). `CurrentMonthPaceSection`
   lets the owner step `‹ ›` to any past month, but never re-fetches a wider window — so stepping
   back further than ~2 months silently clips the viewed month's early days out of the merged
   aggregate. The header's "day 31 of 31" is the max date seen **anywhere in the merged set**, not
   per-store/per-day coverage, so a partially-clipped month still claimed to be fully covered.
   With "today" around Oct 5-6 and August starting ~65 days back, the first several days of August
   fell outside the 60-day window for every store uniformly — exactly matching the reported
   symptom shape. Fixed: added an on-demand fetch (same pattern the component already used for
   `loadedMt`/targets) — when the already-loaded `ds` rows don't reach back to the viewed month's
   first day, fetch that month directly via `loadSalesLedger`/`loadQsrActSummary` with a computed
   `daysBack`, used instead of the global `ds` rows for that specific period. A small "loading
   August actuals…" indicator shows while the on-demand fetch is in flight.

## Why this read as uniform across every store

Both bugs apply identically to every store (bug 1 always zero; bug 2 clips the same calendar days
for every store since the window is date-based, not per-store), so the resulting shortfall was a
near-constant fraction of each store's real sales rather than concentrated in a few stores —
exactly the pattern that should have been a tell that this was a measurement artifact, not real
underperformance (CLAUDE.md's own "measure it, don't reason about it" rule: a uniform, implausibly
large swing across an entire district is itself evidence worth checking before trusting the
number).

## Fix verified

3 new tests (`dispatch-pace-to-target-window-gap-2026-10-06.test.js`): the `.sales` field fix in
isolation (a `salesLedgerRows`-only fixture that would read $0 under the old `.prodSales` bug now
sums correctly); the on-demand fetch actually firing and rendering the fetched totals when `ds`
doesn't cover the viewed month; and the fast path confirming no fetch fires when `ds` already
covers it (no added network cost for in-window months, which is the common case).

Both bugs were latent for every past month this panel has ever shown whenever viewed more than
~2 months back — not August-specific. Nothing else needs backfilling; the fix is live-forward
(next time the panel renders an out-of-window month, it now fetches the real data instead of
silently showing a clipped partial sum).
