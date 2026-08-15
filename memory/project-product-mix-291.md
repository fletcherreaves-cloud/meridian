# Product Mix (PMIX) — #291

**Status as of 2026-08-15: real pull implemented and building/testing clean.** The
endpoint capture that gated a non-stub implementation landed via PR #293
(`memory/qsrsoft-report-catalog.md`, "Product Mix — the SALES view" section — read that
before touching `selectCols` or the row mapping, it has the full capture + reconciliation
math this build is drawn from). This file previously described a schema+loader+skeleton
pass with a deliberately-throwing stub pull; that design has been superseded end-to-end
now that real facts exist, per the same dispatch that originally scoped the stub ("start
with schema and the pull skeleton" — the "endpoint capture has to come from the owner
first" condition is now satisfied).

## Why this issue exists

PMIX carries units AND dollars per item per price point. Realized price is measured, not
recalled — it turns "average check rose 10.4¢" (the McValue FBP document's headline
number, deadline 2026-08-25) into a decomposition: price × mix × units. The single most
damaging challenge to that document is "that's just your price increases"; PMIX converts
recollection into evidence. Full framing in the issue itself — this file records build
state.

## What actually shipped (this pass — supersedes the earlier stub design)

- **`supabase/schema-product-mix.sql`** — grain corrected from the original
  `(loc, date, item)` design to **`(loc, date, item, price)`**. Measured on the real
  capture: 441 rows over 314 distinct `menuItemNumber`s for one store-day, 116 items at
  more than one price the same day (e.g. McChicken $1.50×140 and $3.69×5 same day). The
  API has already separated price from mix; averaging dollars÷units across price tiers —
  the original plan — would blend those into a meaningless $1.57 and misread a mix shift
  as a price change. `price` is exact per row already, so it's part of the key, not a
  derived aggregate.
  Stores PRIMITIVES only (`sold_qty`, `disc_qty`, `promo_qty`, `offer_amt`,
  `unit_food_cost`, `unit_paper_cost`), not `dollarsSold`/extensions — measured
  `dollarsSold == price*soldQty` exactly (0/441 exceptions), so it's computed at read
  time, never stored, to avoid the two disagreeing after a partial update.
  **No `dollars` column at all** — `dollarsSold` is GROSS: Σ overstates `allNetSales` by
  2.9% on the captured store-day, and the overstatement is promotional intensity. Never
  surface Σ(price×sold_qty) as sales.
  `promo_qty` and `offer_amt` are kept as two DIFFERENT measures (15 rows carry
  `promo_qty` with `offer_amt=0`, 12 the reverse) — `promo_qty` = units given away,
  `offer_amt` = $ of discount offer applied. `disc_amt` is nullable, not yet selected
  upstream (needed to close `Σdollars_sold − Σoffer_amt − Σdisc_amt == allNetSales`).
  `bundle_qty`/`bundle_disc_amt` deliberately excluded — measured zero on every row
  despite the endpoint's name. `loc` padded (matches every other QSRSoft table).
  `tenant_id` + RLS from day one, indexes on `(date, loc)` and `(loc, item, date)`.
- **`savePmixRows`/`loadPmixRows`** (`src/lib/supabase.js`) — rewritten to match: chunked
  upsert on `onConflict: 'loc,date,item,price'`, maps the primitive fields only (no
  `dollars`). Load returns the same camelCase shape the pull script produces.
- **`scripts/qsrsoft-pmix-pull.mjs`** — fully rewritten from the throwing stub into a
  real, working pull. Same `/reporting/v2/` family and auth ladder
  `qsrsoft-ops-pull.mjs` already proved: direct `QSRSOFT_TOKEN`/`QSRSOFT_COGNITO_TOKEN`
  first, Playwright fallback (navigates to
  `v3.myqsrsoft.com/reports/mcd/product/productMixDrillDown`, passively captures
  `X-Auth-Token` from any `api.reports.myqsrsoft.com` request, in-browser
  `fetch(..., {credentials:'include'})` trigger as a last resort) on `401`/`403`.
  Requests `dollarsSold`/`totalUnitFoodCost`/`totalUnitPaperCost` (the API always returns
  them) but does not store them — computed at read time instead, per the schema's
  reasoning above. Filters `soldQty=0` rows (catalog placeholders, measured 21/441 on the
  captured payload) before upsert. `PMIX_START_DATE`/`PMIX_END_DATE` window (defaults to
  yesterday-only, matching the "never count an in-progress day" rule already applied in
  `qsrsoft-ops-pull.mjs`'s cash-anomaly check), fail-fast date validation matching #269's
  pattern, `PMIX_STORE` override, `QSRSOFT_DEBUG=1`.

**Verified this pass:** `node --check` clean on both JS files; `npm test -- --run` —
1370/1370 passing (unchanged, no test coverage added — this is a pull script + storage
layer, matching the precedent set by the other QSRSoft pull scripts, none of which carry
unit tests); `npm run build` — clean, eager total 509.64 KB gzip (budget 850 KB, headroom
340.36 KB), no meaningful shift from before this change (these files aren't in App.js's
eager import graph).

## One open, explicitly-flagged uncertainty — do not treat as resolved

`mapRow()`'s `loc: nsn7(r.storeNum ?? r.nsn ?? '')` — the capture that established the
endpoint's response shape (#293) was a **single-store** request. The field name QSRSoft
uses to identify which store a row belongs to in a genuine **multi-store** response
(this script always requests all 27 NSNs at once, matching the other pull scripts) is
**unconfirmed**. `storeNum`/`nsn` is the first guess (the convention other
`/reporting/v2/` endpoints use), not a verified fact. If neither field is present, or a
different name is used, `mapRow` would produce `loc: '0000000'` for every row, and
`runAll`'s filter (`r.loc !== '0000000'`) would silently drop the entire response rather
than misattribute it — a fail-closed default, not a fail-silent one, but the pull would
then upsert **zero rows** with no error surfaced beyond a debug-only "all filtered" log.
**Before trusting a live run**, either capture one real multi-store response and confirm
the actual field name, or watch the first scheduled run's row counts.

## Deliberately still not done, and why

- **`productMixDiscount`** (the separate discount-isolation report, needed to settle
  `disc_amt` and fully close the reconciliation identity) — documented in the issue as
  the real fix for realized-vs-list price. A second pull, once this one's shape is
  proven against a live run.
- **App.js lazy-fill wiring for `pmixRows` / a `pmix` metric-source chain** — no live
  data yet to source from; same one-line pattern as `auditRows`/`wasteRows` once rows
  exist in the table.
- **GitHub Actions workflow + `sync-failure-watch.yml` entry** — deferred until the
  multi-store `loc` uncertainty above is confirmed; watching a pull that might be
  silently dropping all rows would produce a green check that means nothing.
- **Backfill to 2024-01** — `PMIX_START_DATE`/`PMIX_END_DATE` already support an
  arbitrary range; retention depth needs probing first (per the standing rule — same as
  #257/#259), not assumed.
- **`node scripts/gen-loader-emits.mjs --write`** — not yet re-run this pass; no metric
  chain references `loadPmixRows` yet (see lazy-fill note above), so nothing for it to
  pick up.

## Manual-upload path gap (carried over from the original pass, unrelated to this update, still true)

`parsePMixData` (`src/parsers/index.js:1209`) does not attach a location or date to its
output — `pipeline.js` stores the raw parse result on `ds.pmixData[filename]` (a per-FILE
object), never a flat per-row array, unlike `ds.darRows`. `ds.pmixRows` (the array-shaped
Dexie schema entry) is never populated — vestigial. `ProductMixPanel`
(`src/views/labor-tools.js:280`) reflects this: lifetime-cumulative across every loaded
file, no time dimension, no per-store split. Whether a dollars/net-sales column exists in
real manual PMIX exports (and under what header) is still unconfirmed — not attempted
without a real sample file. This means the manual-upload fallback still cannot be fully
wired even now that the API path is real; it needs its own pass against a real export.

## Next session, in order

1. Confirm the multi-store `loc` field name — either a real multi-store DevTools capture,
   or watch the first live run's per-date row counts for a silent zero.
2. Wire `savePmixRows`/`loadPmixRows` into App.js's `configureLazyFill` + upload
   save-after-diff pattern (mirrors `auditRows`, `App.js` ~line 2166-2239).
3. Scheduled workflow + `sync-failure-watch.yml` entry + backfill to 2024-01 — the
   standard 5-part new-pull checklist, once step 1 is confirmed.
4. `productMixDiscount` pull for `disc_amt` / full reconciliation.
5. `parsePMixData`/`pipeline.js` loc+date+dollars extraction for the manual fallback.
