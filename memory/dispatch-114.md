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
