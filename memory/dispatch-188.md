# Dispatch #188 — merge End of Month into Food Cost (owner-approved 2026-08-10, still open)

## Context

`memory/decisions-panel-inventory-2026-08-10.md` — the owner's full keep/merge/retire pass over
the panel registry — calls for: *"End of Month (`fob-eom`) → merge into Food Cost as an EOM
mode."* This is one of 7 approved merges from that pass that have not yet been executed (verified
2026-08-28: both `fob-eom` and `fob-analysis` are still separate, fully live registry entries).

**⚠️ Before doing any more of this list, know that one sibling item from the SAME 2026-08-10 doc
was explicitly reconsidered and reversed 11 days later**: dispatch #54 (2026-08-21) revisited
"Calendar → merge into Events & Tags" with the owner directly and got a different answer — keep
them as **four separate sidebar links** (Planning hub · Calendar · Events & Tags · Event Impact),
not a merge (`panel-registry.js` line ~51's comment, `memory/dispatch-54.md` line ~77-84). **This
dispatch (End of Month → Food Cost) has NOT been contradicted by any later dispatch** — checked
`memory/MEMORY.md` and `memory/dispatch-54.md`/`dispatch54-job-b.md` (which only did SECTION
grouping — same nav section, still separate panels — not panel merges) before writing this. If you
find anything during implementation suggesting the owner changed their mind on this one
specifically, stop and flag it rather than assuming either the merge doc or your own read wins.

## Files

**File/id/label naming in this registry is NOT consistent — verify with your own grep before
writing any code, do not trust file-name-implies-content** (dispatch #168's own self-correction,
cited in MEMORY.md, is the exact same mistake on a different panel). Verified 2026-08-28:

- Target (survives): registry id `fob-analysis` (label "Food Cost") → `FOBAnalysisPanel`, sourced
  from the `analytics.js` lazy group (`App.js`'s `_analytics()` loader) — NOT its own dedicated
  file.
- Source (retires after harvest): registry id `fob-eom` (label "End of Month") → `FOBEOMPanel`,
  `src/views/fob-eom.js`.
- Both are already `route:true` in `panel-registry.js` — no routing-migration work needed here,
  that half of the panel contract is already satisfied for both panels.

## Task

1. **Harvest first, per the standing retire rule** (`decisions-panel-inventory-2026-08-10.md`):
   read `FOBEOMPanel` in full and identify anything genuinely distinct from what
   `FOBAnalysisPanel` already does — a calculation, a visualization, a data view — before folding
   it in. Nothing gets deleted until scoped for salvage.
2. Add an "EOM" mode/tab to the Food Cost panel that reproduces `FOBEOMPanel`'s distinct
   capability (per its own established UI convention for multi-mode panels within this codebase —
   check how other panels in this registry already do a mode/tab switch, e.g. `count-cycle-panel.js`
   or the Planning hub's five-tab pattern, rather than inventing a new switcher pattern).
3. Retire the `fob-eom` registry entry and its standalone route; redirect the old `?panel=fob-eom`
   URL to the new mode on `fob-analysis` (don't just 404 an old bookmark/link).
4. **While you're in both panels anyway, opportunistically bring them into line with the panel
   contract** (`memory/panel-contract.md`) if it doesn't meaningfully widen this dispatch's blast
   radius: date-picker mode (presets/custom/period-anchored — state which), `LocationSelector`
   adoption if either panel has a hand-rolled scope picker, and print/export — Food Cost is
   plausibly one of the higher-value gaps if it has none today (check; `at-a-glance.js`/
   `signals.js`/`security-panel.js`/`patch-heatmap.js`/`crew-schedule-panel.js` were the
   previously-named highest-value gaps, Food Cost wasn't on that list, so check its current state
   rather than assuming it's missing).
5. Do not touch Count Cycle, Inventory, or Inventory Control — those are separate dispatches.

## Verification

- The merged panel renders both the original Food Cost content AND the harvested EOM
  capability, with a real screenshot/description of what the mode switch looks like.
- Old `?panel=fob-eom` deep link redirects correctly (or is confirmed to still resolve
  sensibly) rather than breaking.
- Full suite + build. Version bump per convention (check `origin/main` current version first).

## Out of scope

- Count Cycle → Inventory Control merge (separate dispatch, #189).
- Leadership One-Pager → Above-Store One-Pager merge (separate dispatch, #190).
- Any of the panel-contract items beyond what's naturally in-scope for the two panels this
  dispatch actually touches.
