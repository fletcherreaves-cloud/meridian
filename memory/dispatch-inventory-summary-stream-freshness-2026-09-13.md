# Inventory Summary/Usage wired into stream-freshness.js's STREAMS (2026-09-13)

Closes a gap `memory/backlog-open-2026-09-06.md` flagged and deliberately left open: *"Not wired
into `stream-freshness.js`'s `STREAMS` (deliberate, documented scope cut in #1105 — it's fetched
panel-locally by `InventoryIntelligence`, not loaded into the global `ds` at startup like every
other `STREAMS` entry); that remains a real, small follow-on if per-stream freshness coverage is
wanted here, not a reason to reopen this."*

## What was already true (checked before building, per "check whether a helper exists" rule)

- `QSRSoft Inventory Summary Pull` (`.github/workflows/qsrsoft-inventory-summary-pull.yml`) was
  **already** in `sync-failure-watch.yml`'s watched list — that half of the standing "adding a
  new automated pull" checklist was done. Only the `STREAMS`/per-stream-freshness half was open.
- `scripts/qsrsoft-inventory-summary-pull.mjs` runs daily, writing `qsr_inventory_summary`
  (RLS'd, `loc,period,wrin` PK) — confirmed live 2026-08-27 at 10,560 real rows
  (`memory/backlog-open-2026-09-06.md`'s own re-measurement), not just "running green with no
  effect."
- `loadQsrInventorySummary()` (`src/lib/supabase.js`) already existed and is what
  `InventoryIntelligence` (`src/views/inventory.js`) calls on-demand when that panel opens — a
  full, unwindowed `select('*')` over the whole table. That call site is **unchanged** by this
  dispatch.

## Why not just add a STREAMS entry pointing at the existing loader

`qsr_inventory_summary` rows are **period (month) keyed**, not daily-dated — there's no `date`
column, and `loadQsrInventorySummary()` has no rolling-window param the way every other
`STREAMS`-backing loader does (`loadOpsCashSheet(60)` etc.). Two problems with reusing it
directly:

1. **No per-row date to check.** `stream-freshness.js`'s `_latestDateOf` reads `r.date`; nothing
   on this table's rows means "the business day this covers."
2. **Cost.** The full loader returns the WHOLE table (10.5k rows and growing every month) with
   every column, unwindowed. Loading that eagerly at every startup just to answer "is this
   stream stale" is exactly the class of waste CLAUDE.md's "Speed check" rule and App.js's own
   dropped-`loadOpsPeaksSales`-load precedent (measured "~4,938 unused rows... real cost, not a
   formality") already flag.

## What was measured before picking a signal (not assumed)

Queried live via `SUPABASE_SERVICE_ROLE_KEY` (`content-range`/row data both returned, a named
credential + a named observation, per CLAUDE.md's live-data-claim rule):

- Top 5 rows by `updated_at` descending all shared the **exact same timestamp**
  (`2026-09-12T15:42:35.227+00:00`) — one whole-batch upsert per daily run, not independent
  per-row noise that could mislead a "most recent" read.
- Only one `period` (`'2026-09'`) exists in the table today — consistent with the pull having
  been running only since dispatch #178 (2026-08-27) and the month not yet having rolled twice.
- The newest `updated_at` was 1 day old relative to the query (run on 2026-09-13) — exactly
  what a healthy daily pull should look like, and squarely inside `cadenceDays:1`'s `ok` band
  (`warnAt = 1+WARN_GRACE_DAYS(1) = 2`).

This settled a real risk before writing any code: `updated_at` only gets its `default now()` on
INSERT, not UPDATE, in Postgres — if the daily pull only ever updated existing `(loc,period,
wrin)` rows within the current month (an UPSERT hitting the `ON CONFLICT` branch with
`updated_at` omitted from the payload), that column would freeze at first-insert time and never
reflect subsequent days' syncs. The live batch-timestamp evidence above rules that out for the
real data; a synthetic guess would not have.

## What changed

- **`src/lib/supabase.js`** — new `loadQsrInventorySummaryFreshness()`: `select('updated_at')
  .order('updated_at', {ascending:false}).limit(1)`, returning at most one `{date}` row (mapped
  to the generic `date` field every other `STREAMS` source uses). `loadQsrInventorySummary()`
  itself and its one call site (`inventory.js`) are untouched.
- **`src/app/App.js`** — new T2 (background-tier) startup stage,
  `_stInventorySummaryFreshness`, mirroring the existing `_stEbosOpSupplies`/`_stQsrFieldDefs`
  pattern exactly: fetch, guard on non-empty, `setDs` merge, console log. Populates
  `ds.qsrInventorySummaryRows` with the single probe row (or nothing, on failure/empty — same
  fail-soft contract as every sibling stage).
- **`src/engine/stream-freshness.js`** — new `STREAMS` entry: `{ key: 'inventorySummary', label:
  'Inventory Summary/Usage', dsField: 'qsrInventorySummaryRows', cadenceDays: 1 }`.
- **`scripts/lib/scheduled-pull-registry.mjs`** — matching `PULL_REGISTRY` entry (required by
  `scheduled-pull-registry.test.js`'s two-way key-set ratchet): `{ table:
  'qsr_inventory_summary', dateCol: 'updated_at', workflowFile:
  'qsrsoft-inventory-summary-pull.yml' }`.

## What did NOT change

- `InventoryIntelligence`'s own data path (`src/views/inventory.js`) — it keeps doing its own
  full on-demand fetch via the untouched `loadQsrInventorySummary()`. This dispatch adds a
  second, much smaller, startup-eager read purely for freshness; it does not consolidate the two
  paths (that would be a larger, separate change to the panel's data source, out of scope here).
- `sync-failure-watch.yml` — already covered this workflow; nothing to add.

## Tests

`src/__tests__/stream-freshness.test.js` — 3 new cases: the entry exists in `STREAMS` with the
right shape, `worstStream` names it specifically when stale among fresh siblings, and an
empty-but-loaded probe reads as critically stale (not silently skipped — the same contract every
other `STREAMS` entry gets). All 3 confirmed to fail against pre-fix code (`git stash` round-trip
on the 4 changed source files, tests left in place). `scheduled-pull-registry.test.js`'s existing
two-way ratchet passes unchanged once the matching `PULL_REGISTRY` entry was added.

Full suite 506/506 files, 4824/4824 tests. Build clean, 542.09 KB / 850 KB eager-payload budget
(541.91 → 542.09 KB, +0.18 KB gzipped — the new App.js stage's own code).
