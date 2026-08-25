---
name: dispatch-111
description: Promo/Discount ROI's discount lever comes back empty because computePromoDiscountRoi's row-builder (src/engine/promo-roi.js) sources discAmt/discPct ONLY from ds.ctrlRows (manual upload) -- never from an auto-pulled stream. This is the exact CLAUDE.md standing-rule violation ("never filter raw rows for a metric directly -- use metric-source.js") the promo leg already avoids two lines above it (glimpseRows preferred, ctrlRows fallback). metric-source.js already has the correct auto-first discAmt/discPct chains (opsCashRows -> ctrlRows) sitting unused. Flagged as still-open in memory/finding-promo-roi-denominator-bias-2026-08-23.md's own "Explicitly not done this pass" list after that finding's separate percentage-vs-dollar bias bug was fixed.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #111 — Promo/Discount ROI: source the discount lever auto-first, not manual-only

## What's wrong, verified directly against current code

`src/engine/promo-roi.js`'s row-builder (the function assembling per-day records before
`matchedLift`/`computePromoDiscountRoi` runs) sources the two levers asymmetrically:

```js
// Promo — glimpse preferred, else controls.
for (const r of ds.glimpseRows || []) { const rec = touch(r.loc, r.date); ...
  if (rec.promoAmt == null ...) rec.promoAmt = ...; if (rec.promoPct == null ...) rec.promoPct = ...; }
for (const r of ds.ctrlRows || []) {
  const rec = touch(r.loc, r.date); ...
  if (rec.promoAmt == null ...) rec.promoAmt = ...;   // ctrlRows fallback for promo — fine
  if (rec.promoPct == null ...) rec.promoPct = ...;
  if (rec.discAmt == null ...) rec.discAmt = ...;      // <-- discAmt/discPct ONLY ever set here
  if (rec.discPct == null ...) rec.discPct = ...;
}
```

`promoAmt`/`promoPct` correctly try `ds.glimpseRows` (auto-pulled) first, falling back to
`ds.ctrlRows` (manual upload) — the standard auto-first pattern. `discAmt`/`discPct` are **only
ever populated from `ds.ctrlRows`**, with no auto-pulled fallback at all. Whenever a store/date has
no manual Controls upload — which, per CLAUDE.md's standing rule, is the expected steady state
since manual uploads are last-resort fill only — the discount lever comes back empty, exactly the
symptom `memory/finding-promo-roi-denominator-bias-2026-08-23.md` flagged and explicitly left open
("the empty discount-lever symptom — unrelated to this bias; a sourcing problem per the standing
auto-first rule, not an algorithm fix. Still open.").

## The fix already exists elsewhere in the codebase — reuse it, don't invent a new source

`src/engine/metric-source.js`'s `METRIC_SOURCES` registry already has the correct chains:
```js
discAmt: { mode: 'any', srcs: [['opsCashRows', 'discAmt'], ['ctrlRows', 'discAmt']] },
discPct: { mode: 'any', direction: 'lower', srcs: [['opsCashRows', 'discPct'], ['ctrlRows', 'discPct']], ... },
```
`opsCashRows` is populated in `App.js` from the auto-pulled Operations Report cash-sheet stream
(`qsr_cash_sheet`, per CLAUDE.md's Operations Report auto-pull documentation) — a real,
already-flowing auto stream, not something new to build. `promo-roi.js`'s row-builder should add an
`ds.opsCashRows` pass for `discAmt`/`discPct`, checked before the existing `ds.ctrlRows` pass,
mirroring the promo leg's own `glimpseRows`-then-`ctrlRows` pattern exactly.

## Scope

In `promo-roi.js`'s row-builder, add a loop over `ds.opsCashRows || []` for `discAmt`/`discPct`,
positioned before the existing `ds.ctrlRows` loop (so it fills first, matching the `rec.field ==
null` guard pattern already used throughout this function — first writer wins). Confirm the field
names on `opsCashRows` rows actually match `discAmt`/`discPct` (check `App.js`'s `oCash` mapping
and/or `qsr_cash_sheet`'s stored shape before assuming the names line up 1:1 with `ctrlRows`'
field names — they may not, since `opsCashRows` is a different pipeline).

**Do not touch the promo leg** — `promoAmt`/`promoPct`'s glimpse-then-controls sourcing is already
correct and unrelated to this bug. **Do not touch `matchedLift`/`computePromoDiscountRoi`'s
matching/scoring logic** — this is purely a row-assembly sourcing fix, the same shape as the
already-fixed `intensityField` bug in the referenced finding, not a second pass at that fix.

**Also check `supabase/functions/sage-chat/index.ts`'s hand-ported `matchedLift`** (Deno can't
import the client engine directly, so it's a separate, parallel implementation) — the referenced
finding's own Resolution notes this had to be fixed there too when the earlier `intensityField` bug
was fixed, for the same reason. If SAGE's discount lever reads from an equivalent of `ctrlRows`
only, apply the same auto-first fix there, or explicitly confirm and document why it doesn't need
it (e.g. if SAGE's tool already gets its `ctrl_rows`-equivalent data differently).

## Verification bar

- Reproduce the empty-lever symptom first: confirm (via the app or a targeted test) that a
  store/date with `opsCashRows` data but no `ctrlRows` upload currently shows a blank/`n/a`
  discount lever, before making any change.
- After the fix, confirm the same store/date now scores using the auto-pulled data.
- Confirm a store/date that DOES have a manual `ctrlRows` upload still works exactly as before
  (this is additive — `opsCashRows` fills first, `ctrlRows` remains the fallback, never removed).
- Render the actual Promo/Discount ROI panel (`src/views/promo-roi.js`), not just the engine
  function in isolation, per this repo's own "exercise the real consumer" verification standard.
- Extend `src/__tests__/promo-roi.test.js` with a case exercising the new `opsCashRows` sourcing
  path specifically — the existing suite's fixtures may only ever populate `ctrlRows`, which would
  make this bug invisible to the current tests exactly the way it was invisible to the shipped code.
- Full suite green, `npm run build` clean, before/after entry-chunk gzip numbers in the commit body
  if this panel isn't already lazy-loaded (check first).

## Do NOT

- **Do not change the promo leg's sourcing** — already correct, unrelated to this bug.
- **Do not re-touch the percentage-vs-dollar `intensityField` fix** from the referenced finding —
  already shipped and verified; this dispatch is strictly the sourcing gap that finding left open.
- **Do not invent a new auto-pulled data source** — `opsCashRows`/`metric-source.js`'s existing
  `discAmt`/`discPct` chains are the answer; reuse them.
