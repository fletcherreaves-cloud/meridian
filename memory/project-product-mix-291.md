# Product Mix (PMIX) — #291

**Status as of 2026-08-14: schema + Supabase loader + pull skeleton shipped. Live pull
NOT built — blocked on an owner DevTools capture.** Per the owner's own sequencing on
#291 ("the endpoint capture has to come from the owner first, so start with schema and
the pull skeleton") and the standing "measure it, don't reason about it" rule.

## Why this issue exists

PMIX carries units AND dollars per item per period. `dollars ÷ units` is realized price —
measured, not recalled — and turns "average check rose 10.4¢" (the McValue FBP document's
headline number, deadline 2026-08-25) into a decomposition: price × mix × units. The
single most damaging challenge to that document is "that's just your price increases";
today the answer rests on the owner's recollection. PMIX converts recollection into
evidence. Full framing in the issue itself — this file only records the build state.

## What's shipped

- **`supabase/schema-product-mix.sql`** — `qsr_product_mix` table, grain `(loc, date,
  item)`, padded `loc` (matches every other QSRSoft table), `tenant_id`+RLS from day
  one. Stores `units` and `dollars` SEPARATELY (issue's explicit instruction — never a
  computed unit price, same principle as VOICE's count pairs in #288). `dollars` is
  nullable — see the manual-parser gap below.
- **`savePmixRows`/`loadPmixRows`** in `src/lib/supabase.js` — exact same shape as
  `saveAuditRows`/`loadAuditRows` (chunked upsert, windowed paginated load). Real,
  callable today. Nothing calls them yet — see "not done" below.
- **`scripts/qsrsoft-pmix-pull.mjs`** — real, working auth ladder (direct token →
  Playwright fallback that navigates to the actual Product Mix report page at
  `v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown` to passively capture a
  token, same technique the DAR pull already proved) and CLI date-range scaffolding
  (`PMIX_START_DATE`/`PMIX_END_DATE`, defaults to yesterday-only per the "never count an
  in-progress day" rule already applied in `qsrsoft-ops-pull.mjs`). The one thing it does
  NOT do: `fetchPmixWindow()` is a deliberate stub that throws with an explicit message
  rather than guessing the request's query params or the response JSON's field names —
  matching #273's "do not guess the back-pull shape" and #277's refusal to fabricate an
  endpoint. `memory/qsrsoft-report-catalog.md` still marks Product Mix ⬜ (unexplored) —
  same status Shift Manager had before #266's real capture.

## A previously-undocumented finding: the manual-upload path has no loc/date grain either

Discovered while designing the schema — worth recording since it changes what "wire the
manual fallback" actually means here. `parsePMixData` (`src/parsers/index.js:1209`) does
NOT attach a location or date to its output at all. `pipeline.js`'s call site
(`type==='pmix'`) stores the raw parse result on `ds.pmixData[filename]` — a per-FILE
object (`{rows, byFamily}`), never a flat per-row array with loc/date, unlike `ds.darRows`
(which DOES get a `dateHint` extracted from the filename at the same call site).
`ds.pmixRows` — the array-shaped entry present in the Dexie schema (`src/db/index.js`) —
is never populated anywhere; it's vestigial.

The one consumer, `ProductMixPanel` (`src/views/labor-tools.js:280`), reflects this: it
aggregates `byFamily` totals across EVERY loaded PMIX file into one lifetime-cumulative
view, with no time dimension and no per-store split. Its own placeholder text names the
expected filename convention — `Product_Mix_YYYYMMDD_to_YYYYMMDD_[store].xlsx` — but
neither the parser nor the pipeline call site extracts date-range or store from it today.

`parsePMixData` also does not read a dollars/net-sales column at all — only `item, units,
disc, discAmt, desc, family`. Whether a dollars column exists in real PMIX exports (and
under what header name) is unconfirmed; guessing a candidate header list without a real
sample file risks silently mis-mapping a column, so it was deliberately NOT attempted.

**Net effect:** even the "keep the manual upload fallback wired" build requirement can't
be fully satisfied yet — there's currently no reliable path to real per-store per-day
per-item rows from EITHER the API (unconfirmed) or the manual upload (no loc/date/dollars
extraction). Wiring `savePmixRows`/`loadPmixRows` into App.js's lazy-fill now, before
either path produces real rows, would add integration surface with nothing to test it
against — deferred, see below.

## Deliberately not done in this pass, and why

- **`fetchPmixWindow()`'s real implementation** — needs the owner's DevTools capture.
  Steps are in the script's own header (same steps as every prior capture: open the
  report, run one store/one day, Network tab, filter `api.reports.myqsrsoft.com`, copy
  URL + params + response shape).
- **`parsePMixData` loc/date/dollars extraction** — needs either a real sample PMIX
  export (to confirm the filename convention and check for a dollars column) or the API
  capture (which would settle the field names for both paths at once, if the manual
  export and API share a schema — unconfirmed).
- **App.js lazy-fill wiring for `pmixRows`** — no real data source to wire it against yet
  (see above). Small diff once either path lands — same one-line pattern as `auditRows`/
  `wasteRows` in `App.js:575`'s `configureLazyFill` call.
- **GitHub Actions workflow / `sync-failure-watch.yml` entry** — nothing to schedule that
  can succeed yet. Same precedent as #257's probe (`workflow_dispatch`-only, no cron, no
  watch-list entry needed — that test only enforces scheduled workflows).
- **`productMixDiscount` (the separate discount-isolation report)** — documented in the
  issue as the real fix for realized-vs-list price, not attempted here. A second pull,
  once this one's shape is proven.
- **Backfill to 2024-01** — can't backfill against a stub. Once the real pull works,
  `PMIX_START_DATE`/`PMIX_END_DATE` already support an arbitrary range for it.
- **`node scripts/gen-loader-emits.mjs --write`** — run, but produced no PMIX entry: the
  regen script only tracks loaders wired into `metric-source.js`'s `METRIC_SOURCES`
  chains, and `loadPmixRows` isn't wired into any metric chain yet (nothing to source —
  see lazy-fill note above). Running it also surfaced one line of PRE-EXISTING, unrelated
  drift (`qsrActSummaryRows` missing a `darSchedHrs` field) — deliberately reverted out of
  this diff rather than folded in, since it's unrelated to #291 and belongs in its own fix.

## Next session, in order

1. Owner captures the real endpoint (or a sample PMIX export file surfaces).
2. Implement `fetchPmixWindow()` + `runAll()`'s row mapping against the real response.
3. Extend `parsePMixData`/`pipeline.js`'s `pmix` branch to extract loc+date (from the
   captured API response, or from the filename convention if going the manual-export
   route) and a real dollars field — resolves the schema's `dollars` nullability.
4. Wire `savePmixRows`/`loadPmixRows` into App.js's `configureLazyFill` + the upload
   save-after-diff pattern (mirrors `auditRows`, `App.js` ~line 2166-2239).
5. Scheduled workflow + `sync-failure-watch.yml` entry + manual fallback confirmation +
   backfill to 2024-01 — the standard 5-part new-pull checklist, all now unblocked.
