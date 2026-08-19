# Dispatch #30 — Workstream D follow-up: the block is cleared, nothing else has moved

**Board (2026-08-19):** `main` at v5.069 (`6c6af7e`). Workstreams A, B, C, E, and G are shipped;
F has its first slice shipped. This is a follow-up to dispatch #26 (Workstream D), not a new
workstream — D itself was dispatched but never started (checked: no open or merged PR touches
`PanelControls.js` adoption, and no ratchet test for the bypass volume exists anywhere in
`src/__tests__/`). The one thing that's changed since dispatch #26: **the condition it was
waiting on has now cleared.**

---

## What actually unblocks today

Dispatch #26's own words: *"Don't start the broad panel-shell conversion before reading Workstream
E's routing-vs-modals section — converting 55 panels to a shell that's about to change would be
doing it twice."* **E shipped in PR #426.** The shell isn't "about to change" any more — it changed,
and it changed into something dispatch #26 didn't anticipate: not one unified shell, but **two**,
by deliberate design.

## New architectural fact: there are now two shell shapes, not one — D's contract has to name both

`src/components/ModalShell.js` now exports **`RoutePanelShell`** alongside `ModalShell` — added by
Workstream E, on purpose, as a *second* shape: same header visual language (icon/title/subtitle,
one dismiss action) but "no backdrop, no maxWidth cap, no centering" because a route **replaces**
the view instead of overlaying it (`ModalShell.js`'s own comment on `RoutePanelShell`). This is the
right design call — a route panel and a modal are genuinely different things — but it means
Workstream D's original goal of "one layout contract" can't mean "fold everything into
`ModalShell`." **The real contract is: modal → `ModalShell`, route (per `panel-registry.js`'s
`route:true`) → `RoutePanelShell`, nothing else rolls its own.** Write that down as part of D's
panel-contract deliverable — it's a fact the original dispatch didn't have.

## Re-measured fresh against current `main` — unchanged, and the newest panel proves why

Same exact patterns dispatch #26 used, re-run today, after two more workstreams' worth of merged
PRs (E's four routed panels, F's Visit Readiness verdict, G's brand-new Labor Allocation panel):

| Component | Adoption (dispatch #26, 2026-08-19) | Adoption (today) |
|---|---|---|
| `DateRangeControl` | 0/55 | **0/56** |
| `LocationSelector` / `ActionMenus` | 1/55 (`eom-dashboard.js`) | **1/56** (same file) |
| `ModalShell` | 9/55 | **9/56** |
| `dateRange` prop | 8/55 | **8/56** |

(56, not 55 — `labor-allocation.js` is a genuinely new panel file, from the PR just merged.)

**Zero movement, and the newest panel in the codebase is the freshest proof of why.**
`src/views/labor-allocation.js` — written and merged *today*, in the same PR that shipped
Workstream G — has **zero** references to `ModalShell`, `RoutePanelShell`, `DateRangeControl`,
`LocationSelector`, or `ActionMenus` (checked directly). It rolls its own modal-shaped `OUTER`/`CARD`
divs and its own tab-button styling from scratch, inline, in the same style dispatch #26 already
found in the other 55. This isn't a hypothetical risk of the compliant path losing to convenience —
it just lost, again, in code that landed this same session. **The compliant path is still not the
cheapest one**, which was dispatch #26's central claim and central concern (*"if the component is
missing something a real panel needs, fix the component before converting more panels around the
gap"*).

## What this means for the landing sequence — same steps, sharpened by the new evidence

Dispatch #26's five-step sequence is unchanged and still correct. Two adjustments given what's now
known:

1. **The two hand-conversions should include `labor-allocation.js`** as one of the two (the
   "awkward" one is a natural fit — it has three tabs, a daypart filter, and a custom modal shell
   all in one file) alongside one simple panel. Converting the newest, freshest example is cheaper
   leverage than reaching back into older panels, and it directly tests whether `RoutePanelShell`/
   `ModalShell` can actually absorb a real multi-tab panel's needs — if they can't yet, that's
   exactly the "fix the component before converting more panels" signal dispatch #26 called for.
2. **The panel contract's shell field is no longer speculative — write it against the two real
   shells that exist today** (`ModalShell` for modals, `RoutePanelShell` for `route:true` panels),
   not a hypothetical single shape.

Everything else stands as written in dispatch #26: seed any bypass-volume ratchet at a number you
measure yourself with the ratchet's own exact pattern (don't copy the table above or the original
plan's figures), convert opportunistically after the two hand-conversions, never a sweep.

## Tracks

None named in the plan for this workstream specifically (unchanged from dispatch #26).

## What NOT to do

- Don't fold `RoutePanelShell` and `ModalShell` into one component — Workstream E split them on
  purpose because a route and a modal behave differently (replace vs. overlay, no backdrop vs.
  backdrop). The panel contract should name both, not unify them.
- Don't copy the adoption table above, or dispatch #26's bypass-volume estimates, into a ratchet
  `CEILING` — re-measure with the ratchet's own exact pattern when you write it, per the standing
  precedent (`ratchet-raw-metric-rows.test.js`'s header) already cited in dispatch #26.
- Don't do a 55-panel (now 56-panel) sweep. Two hand conversions — one of them
  `labor-allocation.js` — then opportunistic, then the ratchet holds the line.
