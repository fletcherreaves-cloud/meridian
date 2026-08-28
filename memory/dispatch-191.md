# Dispatch #191 — merge Calendar into Events & Tags (owner re-confirmed 2026-08-28)

## Context — a correction to the record, not a new decision

`memory/decisions-panel-inventory-2026-08-10.md`'s original merge list included *"Calendar →
merge into Events & Tags. Long-standing overlap, already pruned from nav."* `memory/dispatch-54.md`
(2026-08-21) recorded what read as a reversal of that: the owner was asked about IA grouping and
answered *"Calendar / Events & Tags / Event Impact → fold into Planning"* — which dispatch #54's
author interpreted as **keep all three as separate sidebar links inside one Planning section**,
not a merge of Calendar into Events & Tags specifically (`panel-registry.js` line ~51's comment:
"Planning (the hub, keeping its five tabs) · Calendar · Events & Tags · Event Impact — four
sidebar links").

**The owner re-confirmed 2026-08-28, directly, in response to that read: "not sure I remember
saying that. They can merge. It makes sense."** Treat the 2026-08-10 merge decision as the live
one — Calendar merges into Events & Tags. dispatch #54's four-separate-links framing was this
session's own inference from an ambiguous answer about section *grouping*, not a deliberate
reversal of the panel-*merge* question; the owner's direct statement here resolves the ambiguity.
**Event Impact stays a separate panel** — the owner's original list never named it as a merge
target, and nothing here changes that. This dispatch is Calendar-into-Events-&-Tags only.

## Files (verify via App.js's lazyPanel()/state block before writing code — same drift caveat as
   dispatches #188-190)

- Target (survives): registry id `events` (label "Events & Tags").
- Source (retires after harvest): registry id `calendar-manager` (label "Calendar").
- Grep `App.js` yourself for the exact component names/files and current `route:true` status of
  both — do not assume either is already routed.

## Task

1. **Harvest first** (standing retire rule): read the Calendar panel in full, identify anything
   distinct from Events & Tags before folding it in — recurring-rule logic, a calendar-grid
   visualization, anything Events & Tags doesn't already do.
2. Fold Calendar's distinct capability into Events & Tags (as a tab/mode, matching this codebase's
   existing multi-view pattern — check precedent, don't invent a new switcher).
3. Retire the `calendar-manager` registry entry and its nav link; redirect the old
   `?panel=calendar-manager` / `?modal=calendar-manager` deep link into Events & Tags rather than
   breaking it.
4. Update the Planning-section comment in `panel-registry.js` (the one currently describing "four
   sidebar links: Planning hub · Calendar · Events & Tags · Event Impact") to reflect the new
   three-link reality — that comment is now stale the moment this merge ships, fix it in the same
   PR rather than leaving a doc-drift landmine for the next session (CLAUDE.md's own "a rule that
   describes code which no longer exists costs more than no rule" applies equally to comments).
5. Opportunistic panel-contract check on Events & Tags while you're in it (date-picker mode,
   LocationSelector, print/export), same "don't meaningfully widen blast radius" guard as
   dispatches #188-190.
6. Do not touch Event Impact or the Planning hub itself.

## Verification

- Merged panel renders both original Events & Tags content and the harvested Calendar capability.
- Old Calendar deep link redirects sensibly.
- The stale "four sidebar links" comment near `panel-registry.js`'s Planning cluster is corrected.
- Full suite + build. Version bump (check `origin/main` current version first — several dispatches
  are landing today).

## Out of scope

- Event Impact, the Planning hub's five internal tabs.
- Dispatches #188/#189/#190 (unrelated panel clusters, may be landing in parallel).
