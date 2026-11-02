---
name: finding-lifelenz-loc-padding-store-duplication-2026-11-02
description: "Root cause + fix for stores being listed twice (padded + unpadded loc) in the Monthly Projections lock confirmation modal and anywhere else ds.storeIds is derived — six supabase.js loaders returned LifeLenz's zero-padded NSN loc straight through instead of stripping it."
metadata:
  type: finding
---

# Finding: stores listed 2x (by number, by name) — LifeLenz loaders not stripping zero-padding

**Reported by the owner 2026-11-02**, via a screenshot of Projections' "Confirm All Stores Lock"
modal showing **55 stores for a ~27-store district** — each real store appearing twice, once as
`0003708 — 0003708` (unresolved) and once as `3708 — Ardmore-Broadway` (resolved). Owner's own
words: *"stores being listed 2x each — by number and by name."*

## Root cause

Every LifeLenz pull script (`scripts/lifelenz-*.mjs`) writes `loc` to Supabase **zero-padded to 7
chars** (`locFromName()`'s `.padStart(7, '0')` — matches the QSRSoft NSN convention). The
established, already-documented convention (`src/engine/pipeline.js`'s own comment on
`dsAutoStoreIds`/`_dsLocKey`) is that **every loader strips this padding back off at load time**
(`loc: String(parseInt(r.loc, 10))`) so `ds.*Rows` arrays agree with `STORE_NAMES`/`allLocs`,
which are keyed unpadded (`'3708'`, not `'0003708'`). `loadLifeLenzSchedule` and
`loadLifeLenzAttendance` do this correctly, with an explicit comment explaining why.

Six loaders in `src/lib/supabase.js`, all built across recent sessions (Schedule Variance,
Compliance Audit, Employee Performance, and the pay-rate-history trio), were missing this strip —
they returned `loc: r.loc` raw:

- `loadLifeLenzScheduleVariance` (`scheduleVarianceRows`)
- `loadLifeLenzComplianceAudit` (`complianceAuditRows`)
- `loadLifeLenzEmployeePerformance` (`employeePerformanceRows`)
- `loadLifeLenzShiftAssignments` (feeds Pay Rate History's crew-pay view)
- `loadLifeLenzShiftPay` (feeds Pay Rate History)
- `loadEmployeePayRateChanges` (feeds Pay Rate History's management-pay view)

The first three are all in `stream-freshness.js`'s `STREAMS` array, which
`dsAutoStoreIds()` (`pipeline.js`) unions into `ds.storeIds` to build the app-wide store list
(`src/app/App.js`'s `rawStores`/`stores`). With a padded AND an unpadded loc both present in
`ds.storeIds` for the same physical store, every `stores`-derived list — including Projections'
`ALL_LOCS`/`buildStoreSummaries` — carried two rows per store. `sName()`/`sNameC()`
(`constants.js`) can't resolve `'0003708'` against `STORE_NAMES['3708']`, so that row displays as
`0003708 — 0003708` (the key echoed back as its own fallback label) right next to the correctly
resolved `3708 — Ardmore-Broadway` row — exactly the screenshot. The other three loaders don't
feed `ds.storeIds` (loaded directly by `pay-rate-history.js`, not through `ds`), so they didn't
cause the 2x list, but shared the identical bug and would show the same `0003708 — 0003708`
pattern inside that panel's own tables.

**Not a bug:** `qsrFobRows` (`loadQsrFob`) is the one documented, deliberate exception — it's
special-cased via `pipeline.js`'s own `_dsLocKey`, not silently broken.
`glimpseRows`/`cashRows`/`salesLedgerRows` (the three emailed streams) are correctly unstripped —
their source (`scripts/qsrsoft-email-parse.mjs`'s `normLoc()`) writes them **unpadded** to begin
with, so there's nothing to strip. `_loadOpsTable` (covers `opsCashRows`/`opsLaborRows`/
`opsServiceRows`/`opsSalesMixRows`/`opsPeaksRows`) and `loadQsrActSummary`/`loadEbosDaily`/
`loadRosterStatistics`/`loadTurnoverMonthly`/etc. were all independently confirmed already
correct. `loadQsrInventorySummary` (Inventory Control panel, not in `STREAMS`) stays raw at the
loader but is normalized by its one caller (`inventory.js`'s `unpad()`), so left as-is.

## Fix (2026-11-02)

Added the identical `loc: String(parseInt(r.loc, 10))` strip to all six loaders, with a comment
pointing back to `loadLifeLenzScheduleVariance`'s explanation so the next person who adds a new
LifeLenz Data Explorer loader has one obvious precedent to copy instead of re-discovering this.
Full suite (694 files / 6458 tests) and `npm run build` both green after the change — this is a
pure loader-mapping fix, no schema/shape change downstream (every consumer already expected an
unpadded string).

**Takeaway for the next new LifeLenz stream:** every `lifelenz-*-pull.mjs` script pads `loc` to 7
chars on write (`locFromName()`'s `.padStart(7, '0')`) — any new `loadLifeLenz*` function in
`src/lib/supabase.js` needs the same strip in its row mapping, or it silently re-introduces this
exact duplication the next time its `dsField` is added to `STREAMS`.
