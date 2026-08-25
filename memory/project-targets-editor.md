# Targets Editor — company/state/patch/store override cascade (dispatch #132 item 3)

## What this is

A new, small Supabase-backed feature that lets the owner set Performance Review target values
by scope (Company-wide / State / Patch / Store) without a workbook re-upload. Lives at:

- `src/engine/target-overrides.js` — pure precedence/resolution logic + the
  `TARGET_OVERRIDE_FIELDS` registry (which fields the editor exposes)
- `supabase/schema-target-overrides.sql` — the new `target_overrides` table (**not yet applied
  to production Supabase — run it in the SQL editor, same as every other `schema-*.sql` file in
  this repo**)
- `src/lib/supabase.js` — `loadTargetOverrides` / `saveTargetOverride` / `deleteTargetOverride`
- `src/views/targets-editor.js` — the panel UI (`TargetsEditorPanel`)
- `src/engine/review-engine.js` — `mergedTargetsForLoc`/`mergedTargetsForLocMonth` now layer
  overrides on top via `applyTargetOverrides`
- Nav: `panel-registry.js` id `targets-editor`, perm `reviews.customize` (admin-only by default)

## Architecture decision: a NEW overlay table, not `yearly_targets` rows

`yearly_targets`/`monthly_targets` are each one-row-per-`(loc, year[, month])` snapshots of an
uploaded workbook. A company/state/patch-scoped value has no `(loc, year)` to attach to there
without either inventing a fake loc per tier (corrupts "this is what the sheet said" provenance)
or writing the same value onto every store's row (loses "this was a district default" the moment
it's read back). `target_overrides` is scope-typed instead (`scope_type` + `scope_id`), and
resolved at read time by `applyTargetOverrides` — see that file's header for the full reasoning.

**Precedence** (highest wins): Store override > Patch override > State override > Company
override > `monthly_targets` > `yearly_targets` > `DEFAULT_TARGETS`. An override is a human
correcting a number right now, so it wins over whatever the last workbook upload said — same
reasoning that already makes monthly win over yearly.

Deliberately **not year-scoped** in this first pass (unlike yearly/monthly targets) — an
override applies until changed or removed. See the schema file's comment for how to extend it if
per-year overrides are ever needed.

## Relationship to the EXISTING "🎯 Targets" panel (`MonthlyTargetManager`, `src/views/store-dash.js`)

That panel is a **different, older, separate system** — a per-store, per-month, `localStorage`-
only editor (`mf_targets_v2`), covering the monthly operational field taxonomy (OEPE/TPPH/KVS/
T-Reds/promos/FOB/etc). Two things worth recording, found while scoping this dispatch:

1. It has **no scope hierarchy at all** (store-only), which is exactly what dispatch #132 asked
   for and this new system adds.
2. **It is NOT read by `review-engine.js`'s `mergedTargetsForLoc`/`mergedTargetsForLocMonth`** —
   those only read `DEFAULT_TARGETS`/`ds.targets`/`ds.monthlyTargets` (Supabase-backed). App.js's
   OWN `mergedTargets` memo (a different, App.js-local computation) layers `userTargets`/`mf_targets_v2`
   on top for OTHER panels, but Performance Review does not go through that memo — it calls
   `mergedTargetsForLoc` directly. So a value set in the existing "🎯 Targets" panel today has
   **no effect on Performance Review scoring**. This is a pre-existing gap, not something this
   dispatch introduced, and is **out of scope for #132** (fixing it would mean reconciling two
   already-large, independently-evolved target systems — a separate piece of work). Flagging it
   here so a future session doesn't assume the two panels are already consistent.

This new Targets Editor is deliberately **separate** from `MonthlyTargetManager` — it writes to
`target_overrides` (Supabase, scope-aware) and is read directly by `mergedTargetsForLoc`/
`mergedTargetsForLocMonth`, so a value set here reliably reaches Performance Review scoring,
which was the actual ask.

## Fields covered (v1 — see `TARGET_OVERRIDE_FIELDS` to extend)

`tMcdWait` (Delivery Wait), `tDigAppGCRD` (Digital App GC/R/D), `tMcdGCRD` (Delivery GC/R/D),
`tHeadcount` (Total Headcount), `tShiftLeaders` (Shift Leader / Shift-Cert Mgr — see caveat
below), `tFOBTarget` (FOB %), `tTotalProfitTarget` (new, override-only), `tComplaintsTarget`
(new, override-only).

## Dispatch #132's two explicitly-uncertain items — investigated, not guessed

- **Complaint Contacts/100K**: the yearly workbook's "1-800 Contacts" column
  (`t1800Contacts`, `parseYearlyTargets` in `src/parsers/index.js`) is a **raw per-store count**
  target (plain `parseFloat`, no guest-count normalization anywhere near it) — confirmed by
  reading the parser, not assumed. It is NOT the same thing as a "/100K" rate, and the app
  captures no guest-count-normalized ACTUAL for complaints anywhere either. **Not wired** to
  `t1800Contacts`. The `complaints` review metric's target now resolves only from a
  Targets-editor override (`tComplaintsTarget`, override-only field, no workbook source); its
  `src` stays `'manual'` for the actual, unchanged.
- **Shift Certified Manager(s)**: `tShiftLeaders` ("Shift Leader Target") was already wired to
  the review's `shiftCert` metric back in dispatch #109, with an explicit caveat comment
  acknowledging it's the closest existing match, not a confirmed identical concept. Left that
  mapping as-is (it predates this dispatch and reflects a deliberate choice, not an oversight) —
  but it is now ALSO overridable via the Targets editor (same `tShiftLeaders` field), so the
  owner can correct it per-scope without a code change if the mapping is ever wrong for a store.

## What changed in `review-engine.js` beyond target-sourcing

`rateMetric` gained one new opt-in branch (`metricCfg.positiveOnly`), used only by `totalProfit`:
until a real (non-zero) target resolves for that metric, it scores on sign alone (positive
actual = passing/4, else 1) — the owner's explicit interim rule ("should be set to anything
positive (for now)"). Every other metric is completely unaffected — this branch only fires when
`positiveOnly` is set, which only `totalProfit` sets. Once an override sets a real
`tTotalProfitTarget`, normal deviation-based scoring takes over automatically.

`foodOB` (Food Over Base $ vs Target) never had an auto target-fill at all before this dispatch —
it was explicitly excluded from `REVIEW_METRIC_TARGET_FIELD` because its actual is in DOLLARS
while the workbook's `tFOBTarget` is a PERCENTAGE. `autoPopulateKPIs` now converts
`tFOBTarget × month's sales` into a dollar target, using `officialTgts` (already resolved
DEFAULT < yearly < monthly < override per month) — so "prefer monthly over yearly" (the owner's
explicit ask) falls out of the existing precedence chain for free.
