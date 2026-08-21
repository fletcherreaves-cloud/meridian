---
name: dispatch55-part-a
description: Dispatch #55 Part A, done. Established the owner's standing panel-metadata rule (kind is lifecycle, section is placement, section must be truthful even when inert) with a real promotion test, corrected the three forecasting panels' wrong section values, renamed LifeLenz Bridge, and investigated both owner-flagged bugs (Forecast Audit greyed-out is by design; Fcst Reference is confirmed stale, proposal only).
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #55 Part A — the forecasting section, done

**2026-08-21**, executes Part A of `memory/dispatch-55.md` (the REVISED version, superseding the
earlier draft that would have emptied Test Kitchen — see `81d7017`, PR #524). Part B (Job C Batch
1) ships separately, per the dispatch's own "ship as two PRs, do not combine them" instruction.

## The three section: corrections

| panel | was | now |
|---|---|---|
| `proj` (Projections) | `planning` | `forecasting` |
| `lfz-gap` (LifeLenz Gap) | `scheduling` | `forecasting` |
| `lifelenz-bridge` | `scheduling` | `forecasting` |

Takes the `forecasting` section from 7 to the owner's full 10 members (`notes-67-queue.md:34-36`).
`proj` was the dangerous one: left wrong, a future `kind` flip would have silently dropped
Projections into the Planning section the owner approved as exactly four links (#516). All three
edits are inert today — every `forecasting`-section panel is still `kind:'test-kitchen'` — which is
precisely the point of the owner's standing rule below: correctness now, at zero visual cost.

Also: the section's own label, `'Forecasting'` → `'Forecasting and Labor Projections'`
(`panel-registry.js`), equally inert today.

## The standing rule (CLAUDE.md, UI Conventions)

Landed in `CLAUDE.md` by the owner's own commit (`81d7017`, PR #524) ahead of this PR:
**`kind:` is lifecycle, `section:` is placement, and `section:` must be truthful even when nothing
renders it.** Owner: *"assign them a category, but leave them in the test kitchen. That way if I
decide to promote them, they'll naturally fall into the right section... we should probably handle
all panels this way moving forward."*

25 of 82 panels carry an inert `section:` (`test-kitchen` 10, `hub-tab` 11, `internal` 4) — fields
nothing renders and therefore nothing checks. `proj`'s stale `section:'planning'` was exactly that
kind of rot, sitting unnoticed since Job B. The guard this dispatch ships closes that gap for good.

### The guard, in two halves

1. **Structural ratchet** — every panel's `section:` resolves to a real `SECTIONS` id. Already
   enforced by `panel-registry.test.js`'s `'every panel has a label and a known kind and section'`
   test (checks `sects.has(p.section)` for all of `PANELS`). No new test needed — it already locks
   this for every panel added from here on.
2. **The promotion test** (`src/__tests__/shell-nav-snapshot.test.js`, new describe block) — for
   each of the ten current `kind:'test-kitchen'` panels, flips `kind` to `'nav'` **on the live
   registry object** (restored in a `finally`), renders the actual `AppSidebar` via
   `ReactDOMServer.renderToStaticMarkup`, and asserts the panel's label appears in the text-node
   slice between its section's header and the next header. A test asserting `panel.section ===
   'forecasting'` would pass even if `panelsForSection`/`renderSection` were broken — the #366
   shape (engine right, call site unwired) this repo has already paid for once. This renders the
   real consumer instead.

**Scope note the promotion test surfaced, not fixed here:** `⚗ TEST KITCHEN` in `shell.js` is a
separate, hand-maintained list of literal `navPBeta('id')` calls (the block starting `// PRUNE
(Notes 24, v4.517)`) — it is **not** derived from `panel.kind`. Promoting a Test Kitchen panel
today is therefore still two edits, not one: flip `kind:` in the registry, **and** delete the
`navPBeta('id')` line in `shell.js`, or the panel renders in both places at once. Collapsing that to
a true one-field flip would mean making the Test Kitchen block itself `kind`-driven — a real
`shell.js` refactor, out of scope for Part A's "nothing about today's nav moves" bar. Flagged for a
future dispatch, not silently assumed solved by the promotion test passing.

## The rename

`lifelenz-bridge`'s label → **`Recommended WFM Forecast Adjustments`**
(`notes-67-queue.md:82`, `dispatch-54.md:149`). The only user-visible change in this PR.

Checked against the dispatch's own warning ("roughly triple the current length, and this nav
truncates rather than wraps"): confirmed true before this PR — `AppSidebar`'s `navItem` had no
`flex`/`overflow` constraint on the label span, so a label wider than the sidebar's fixed 220px
(desktop) / 260px (mobile) width would overflow and get invisibly clipped by the nav container's
`overflowX:'hidden'`, mid-word, with no ellipsis and no way to see the rest (the `title` tooltip
only existed when the sidebar was collapsed). Since the rename is this PR's own change, fixed it in
the same PR rather than shipping a label that visually breaks: the label span now gets
`flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'`, and the
`title` tooltip now carries the full label whenever the item isn't disabled, expanded or collapsed.
Purely cosmetic, applies uniformly to every nav item, verified by the full test suite staying green
(text-node assertions are unaffected by style/title changes).

## The two owner-flagged bugs — investigated, reported, not built

Per the dispatch's own instruction: "investigate and report; fix here only if the fix is small and
obvious."

**Forecast Audit "why is it greyed out?"** (`notes-67-queue.md:77,113`) — **by design, not a bug.**
Diffed against its nine `analytics.forecasting` siblings: `forecast-audit` is the *only* one whose
nav entry passes `{ disabled: !selStore }` (`shell.js`, the `navPBeta('forecast-audit', ...)` call),
and the only one whose `onOpenModal` handler (`App.js:2636`) and render gate (`App.js:3085`,
`showAudit&&selStore&&...`) both require a selected store. That's because it audits one specific
store's forecast inputs day-by-day and cannot render meaningfully without one — unlike its siblings,
none of which gate on `selStore` at all. The greyed-out look is `navItem`'s existing `disabled`
styling (`opacity:0.45`, `cursor:'not-allowed'`), and it already carries a `"Select a store first"`
tooltip. The trigger: clicking "back" from Store Dashboard to District View explicitly nulls
`selStore` (`App.js:1959,2763`), so browsing at district level — an ordinary thing to do — leaves
Forecast Audit disabled while every other forecasting panel stays clickable. No fix proposed; this
reads as correct, if under-explained, UX.

**Fcst Reference "make sure it is current and updated"** (`notes-67-queue.md:75,87`) — **confirmed
stale.** It renders `public/forecast-reference.html` in an iframe (`App.js:2891-2904`) — a static,
hand-authored page, last touched 2026-06-26 (`git log`), footer-labeled "Prepared by Meridian
v4.210+" while the app is now v5.093. Two concrete staleness points inside it:
- An "All 27 locations — operational notes and model flags" table with per-store recommendations
  frozen at authoring time (e.g. "Model degrading recently (12-14% MAPE). RECOMMEND RE-ENABLING
  DI." for Duncan-Hwy 81) that do not update as models get re-run or re-calibrated.
- A New Store Ramp note pinned to a specific window ("As of Jun 2026 (~14 weeks)... calibration
  should not be run until approximately September 2026") that silently becomes wrong once that
  store ages past the window, with nothing to flag it.

Not rewritten here, per the dispatch's "propose, don't unilaterally rewrite" instruction. Proposal
for a future dispatch: either a lightweight recurring-review reminder (cheapest, same staleness risk
recurs on its own schedule), or making the per-store status table read live `model_assignments` /
MAPE data instead of a hand-maintained snapshot (bigger lift, permanently closes the staleness
class — matches the same "don't leave a field nothing checks" logic as the standing rule above).

## Verification

`src/__tests__/shell-nav-snapshot.test.js`: `EXPECTED` baseline re-captured (only change: `LifeLenz
Bridge` → `Recommended WFM Forecast Adjustments`, in both the main snapshot and the
`analytics.forecasting` permission-hidden set). Three new describe blocks:
- **Membership diff** — renders `AppSidebar` across full-access/betaMode-off, betaMode-on, and
  optional-panels-visible, asserting `PRE_PART_A_LABEL` ('LifeLenz Bridge') is gone and
  `POST_PART_A_LABEL` ('Recommended WFM Forecast Adjustments') is present in the non-beta
  dimensions — and, correctly, absent under `betaMode:true` too, since `lifelenz-bridge` stays
  `kind:'test-kitchen'` and is beta-hidden exactly as before the rename.
- **Test Kitchen census** — `⚗ TEST KITCHEN` still renders, still exactly 10 panels, all 10 still
  vanish under `betaMode:true`, unchanged from pre-Part-A.
- **The promotion test** — described above.

1872/1872 tests (13 net new). `npm run build` clean. Entry chunk: **1718.00 KB / 510.65 KB gz**,
measured against **1717.88 KB / 510.61 KB gz** on the same `main` commit *before* this PR's edits
(stash-and-rebuild comparison) — a ~0.04 KB gzip delta from three field-value edits plus a small
style tweak, as expected. The `1680 KB / 493.6 KB gz` baseline quoted in `dispatch-55.md` (carried
from the v5.092 changelog) predates PR #522/#524 landing on `main` and was already stale before this
PR started; recorded here so the real baseline doesn't get lost again.
