---
name: dispatch-114
description: Product Mix data is fully auto-pulled (scripts/qsrsoft-pmix-pull.mjs, scheduled GitHub Action, loadPmixRows into ds.pmixRows via App.js's lazy-fill) but the only consuming UI, ProductMixPanel (src/views/labor-tools.js), only ever reads ds.pmixData -- a manual-upload, per-file, lifetime-cumulative blob with no per-store or per-date view. This violates the standing auto-first/freshest-wins rule and blocks the CLAUDE.md-listed "Next candidate area" (Product Mix pull -> Pricing Engine).
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #114 — Wire Product Mix's already-auto-pulled cloud data into its panel

## What's wrong, verified directly against current code

`scripts/qsrsoft-pmix-pull.mjs` runs on a schedule (`.github/workflows/qsrsoft-pmix-pull.yml`) and
`App.js` already lazy-fills `ds.pmixRows` from it (`configureLazyFill({..., pmixRows:
loadPmixRows})`, `loadPmixRows(daysBack=400)` in `src/lib/supabase.js`). This is real, live,
per-store, per-date cloud data — confirmed by reading the loader and the workflow directly, not
assumed from a memory file.

But `ProductMixPanel` (`src/views/labor-tools.js`) **never reads `ds.pmixRows` at all** — confirmed
by grep, every reference in that panel is to `ds.pmixData` (`hasPMix`, `pmixErrors`, the "Files
Loaded" count, etc.) — the manual-upload path: a per-uploaded-file blob keyed by filename, holding
a lifetime-cumulative rollup with no per-store or per-date breakdown. The panel's entire experience
today is "did I upload a file," not "what's this store's product mix over time," even though the
richer data already exists in the cloud.

## Scope

Wire `ds.pmixRows` into `ProductMixPanel` (or a new view alongside the existing manual-upload
experience — implementation choice, follow whatever this panel's current internal layout makes
easiest to extend cleanly, matching this repo's own "additive, don't replace working behavior"
pattern used throughout this session's dispatches). At minimum:
- A per-store, per-date-range view of product mix from the auto-pulled `pmixRows`, not just the
  manual file's lifetime-cumulative rollup.
- Follow the "auto/emailed-first, freshest-wins" standing rule (CLAUDE.md) if both a manual upload
  and cloud rows exist for overlapping data — auto/cloud should be primary, manual last-resort fill
  only, matching how every other panel in this repo has been migrated this session (Yearly
  Targets, Digital App/Delivery actuals, etc.).
- Check `loadPmixRows`'s actual row shape (fields, granularity — family/category breakdown per
  CLAUDE.md's `qsr_product_mix` references) before designing the UI around an assumed shape.

This dispatch is intentionally scoped to the DATA-WIRING gap — connecting a real, working panel to
real, already-flowing data — not to building the "Pricing Engine" CLAUDE.md names as a future
vision item on top of it. That's future work once this foundational wiring exists.

## Verification bar

- Render the actual `ProductMixPanel`, confirm real per-store/per-date cloud data renders once
  `ds.pmixRows` has data for a store/period, and confirm the existing manual-upload experience
  (`ds.pmixData`) still works unchanged for whatever it currently covers — additive, not a
  replacement.
- Confirm the auto-first precedence: a store/date with both cloud and manual data uses cloud;
  manual only fills a genuine gap (per the standing rule), if both paths end up feeding the same
  view rather than staying as two separate tabs/sections.
- Full suite green, `npm run build` clean, before/after entry-chunk gzip numbers if this panel
  isn't already lazy-loaded.

## Do NOT

- **Do not build the Pricing Engine or Filet-O-Fish-Fridays correlation work** CLAUDE.md names as
  the eventual destination — this dispatch is the data-wiring foundation only.
- **Do not remove or break the existing manual-upload path** — additive only.

## Resolution

**Row shape confirmed against `loadPmixRows` (`src/lib/supabase.js`) before designing the UI:**
`{loc, date:Date, item, price, desc, familyGroup, soldQty, discQty, promoQty, offerAmt, discAmt,
unitFoodCost, unitPaperCost}` — per-store, per-date, per-item. Genuinely richer than
`ds.pmixData`'s per-file `byFamily` rollup (no store/date/item grain at all).

**`ProductMixPanel` (`src/views/labor-tools.js`) now reads both, additively.** A `dataSrc` toggle
('cloud' | 'manual') is added to the panel header:
- **Cloud tab** (`ds.pmixRows`) is the default whenever it has rows — auto/emailed-first,
  freshest-wins, satisfied at the panel level by making cloud the pre-selected tab rather than
  merging the two into one computation (the dispatch's own scope note allowed "two separate
  tabs/sections" as an implementation choice). Adds a per-store `<select>` (pattern matched from
  `DARDaypartPanel`'s existing `selLoc`/`sNameC` idiom in the same file) and date-range quick-picks
  (7/30/90/180/All), anchored to the newest date actually present in `ds.pmixRows` rather than
  wall-clock "today" — so the panel isn't empty just because the pull lags a day. Family-group
  aggregation (units/disc/mix% bar chart, discount-exposure banner) reuses the exact same shape and
  thresholds as the pre-existing manual view. A new **Top Items** table surfaces the item-level
  grain (`item`/`desc`/`price`) the manual rollup collapses away — genuinely new information, not
  just a re-skin of the family chart.
- **Manual tab** (`ds.pmixData`) is byte-for-byte the pre-existing experience: same aggregation,
  same summary tiles, same `#302` column-validation error banner. Falls back to being the default
  tab only when `ds.pmixRows` is empty, matching pre-dispatch behavior exactly in that case.

**Verification bar met, all three items:**
1. **Real per-store/per-date cloud data renders** — proved by rendering the actual
   `ProductMixPanel` (not an isolated aggregation helper) with a synthetic `ds.pmixRows` fixture
   shaped exactly like `loadPmixRows`'s real output, across two real store locs (3708
   Ardmore-Broadway, 5183 Chickasha-So 4th). Switching the store selector re-aggregates to the
   other store's rows and the previous store's family names disappear — confirms per-store
   filtering, not a district-wide sum.
2. **Manual path unchanged** — same fixture also carries `ds.pmixData`; the Manual tab renders its
   `Combos` family/tiles exactly as before, and cloud-only elements (store selector, Top Items) are
   absent from it.
3. **Auto-first precedence** — with both sources populated, the panel defaults to the Cloud tab;
   with only `ds.pmixData` populated, it defaults to Manual (pre-dispatch behavior, unchanged).
   `src/__tests__/dispatch-114-product-mix-cloud.test.js` (7 tests, `createRoot`/`act` under
   happy-dom, same idiom as `dispatch-110-sos-panel.test.js`) covers all of the above plus the
   both-empty and cloud-empty-for-this-store/range fallback states.

**Speed check:** `ProductMixPanel` was already lazy-loaded via `lazyPanel()` (App.js's
`_laborTools()` dynamic import) before this dispatch, so the entry chunk is untouched — eager total
528.02 KB gzip both before and after (budget 850 KB). Only the lazy `labor-tools` chunk grew, which
is demand-loaded, not shipped to every user on load.

**Out of scope, not done here (as directed):** Pricing Engine, Filet-O-Fish-Fridays correlation.
2383/2383 tests pass (2376 baseline + 7 new), `npm run build` clean.
