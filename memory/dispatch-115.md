---
name: dispatch-115
description: tolerance-status.js's baseFd check (Base Food % coaching/tolerance finding) compares totalBaseFood/prodSalesAmt (a broad theoretical-food-cost-shaped ratio, ~23-28% per real store magnitudes) against the official target tFOBBase (~3.8-4.1% per real store values in constants.js -- one of FOB's six small variance components, not a broad food-cost measure). These are not the same quantity, so this check fires a false CRITICAL finding on every single store into the Coaching pipeline dispatch #94 just built. Surfaced but explicitly left unfixed by dispatch #94 ("flagged prominently... not fixed here... outside this dispatch's scope").
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #115 — Fix the Base Food % tolerance check's metric-definition mismatch

## What's wrong, verified directly against current code

`tolerance-status.js`'s `TOL_SPEC` entry:
```js
baseFd: {man:{src:'fobRows',f:'baseFoodPct'}, fob:{num:'totalBaseFood'}},
```
compares an auto-computed `baseFoodPct = totalBaseFood / sales` (`src/views/analytics.js`,
`totalBaseFood` a raw dollar field on `qsr_fob` rows) against the official yearly-workbook target
`tFOBBase`. Checked real per-store target values in `constants.js`: `tFOBBase` sits at ~3.8–4.1%
across every store — one of FOB's six small controllable-variance components (comp waste, raw
waste, condiments, emp meals, stat variance, and base food, each individually a few tenths of a
percent to low single digits), matching the yearly workbook's own "Base Food %" column, a narrow
variance-tolerance figure.

`totalBaseFood` (the auto side) is a QSRSoft-reported dollar figure whose actual %-of-sales
magnitude, per this repo's own investigation, lands far closer to `tFOBTotal` (~26–29% per real
store values in `constants.js` — the broad P&L Total Food Cost figure) than to `tFOBBase`. Compared
against the narrow `tFOBBase` target, this reads as a large, uniform CRITICAL miss for every store,
every period — a "cry wolf" false-positive that undermines the coaching/tolerance system dispatch
#94 just shipped, exactly the kind of miscalibration CLAUDE.md's own tolerance/coaching standing
rules warn against.

**Already flagged, not fixed**: dispatch #94's own resolution surfaced this exact mismatch and
explicitly deferred it ("flagged prominently... not fixed here... outside this dispatch's scope") —
this dispatch is that deferred fix.

## Scope

1. **Trace `totalBaseFood`'s real definition to its source** — the QSRSoft FOB report field it's
   parsed from (check `src/parsers/index.js`'s FOB parser and/or the auto-pull script that
   populates `qsr_fob`), and confirm what it actually represents (a broad theoretical/base food
   cost basis, vs. narrower "Base Food %" variance component the target field names). Do this the
   same way dispatch #102 traced FOB Analysis's inflation bug to its root — by reading the actual
   field mapping, not by pattern-matching the name.
2. **Reconcile which target field `totalBaseFood`/`baseFoodPct` should actually be compared
   against** — the magnitude evidence points toward `tFOBTotal` (or possibly `tPaperCost`/some
   other broader target, if the trace in step 1 reveals a different real match) rather than
   `tFOBBase`, but confirm via the actual field semantics, not just magnitude-matching (magnitude
   is a strong hint, not proof — two fields can coincidentally be similar size and still measure
   different things).
3. **Fix the `TOL_SPEC` comparison pair** in `tolerance-status.js` once the correct target is
   identified — either repoint `baseFd`'s `offKey` to the right target field, or, if
   `totalBaseFood` genuinely has no matching target anywhere in the current target schema, consider
   whether this tolerance check should be removed/disabled rather than compared against a
   definitionally wrong number (do not leave a comparison that's known-wrong just because SOME
   comparison target exists).
4. Check whether this same `totalBaseFood`/`tFOBBase` mismatch appears anywhere else in the
   codebase beyond `tolerance-status.js` (e.g., `analytics.js`'s own FOB_COMP-driven display,
   `at-a-glance.js`) — CLAUDE.md's own dev rules flag that a wrong field-mapping tends to recur
   across independently-written consumers of the same source data.

## Verification bar

- Reproduce the false-CRITICAL finding first, against real data, before changing anything (this
  repo's "measure it, don't reason about it" standing rule) — confirm `baseFd` really does fire
  CRITICAL uniformly across stores today.
- After the fix, confirm the same stores no longer show a uniform false CRITICAL, and that a
  genuinely correct comparison produces plausible, varied results (not just "the number changed").
- Render the actual Coaching findings pipeline (dispatch #94's consumer), not just the tolerance
  function in isolation, and confirm the fix is visible end-to-end.
- Full suite green, `npm run build` clean.

## Do NOT

- **Do not guess the correct target field from magnitude alone** — confirm via the actual parser/
  field-semantics trace (step 1) before repointing the comparison.
- **Do not touch any other `TOL_SPEC` entry** — this dispatch is scoped to `baseFd` only.
- **Do not re-litigate dispatch #94's own scope** — that dispatch is done; this is its explicitly
  deferred follow-up, not a re-review of its other findings.
