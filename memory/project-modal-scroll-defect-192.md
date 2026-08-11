---
name: project-modal-scroll-defect-192
description: "#192 P1 — the modal/scroll sizing defect reported five times: what was actually broken, why it wasn't one shared ModalShell bug, and the guard test that found it's wider than reported"
metadata:
  node_type: memory
  type: project
---

# #192 P1 — the "one class defect, reported five times" turned out to be four defects

The issue's own framing was: *"These are not five polish items. They are the same modal/scroll
sizing defect... `ModalShell` already exists... fix the sizing contract there and add a
class-level guard test."* **That framing was wrong about the mechanism, even though the
instinct — "fix the class, not five patches" — was right.** None of the five reported sites
actually go through `ModalShell`. Worth recording so nobody re-reads the issue text later and
goes looking for a `ModalShell` bug that isn't there.

## What each item actually was

1. **District EOM Summary — table-cutoff.** Hand-rolled modal (`eom-dashboard.js`), not
   `ModalShell`. The real defect: `div({style:{overflowX:'auto'}}, h('table',{style:{width:'100%'}}))`.
   `width:'100%'` caps the table AT the wrapper's width, so there's nothing to overflow —
   the browser's table auto-layout compresses/cuts off columns instead of triggering the
   scrollbar. Fix: `width:'max-content', minWidth:'100%'` (the pattern already correct in
   `analytics.js`'s `MonthlyProjectionsPanel` table). Found 4 instances in `eom-dashboard.js`
   alone; a guard test (`src/__tests__/scroll-table-width.test.js`) found **12 more** across
   `above-store-onepager.js`, `analytics.js`, `at-a-glance.js`, `sage.js`, `scheduling.js` (2 of
   3 — the third already has per-column `minWidth`s summing to 734px, which works correctly and
   is the test's one documented `EXEMPT`), `smg-voice.js`. All 16 fixed the same way.

2. **Planning → Monthly — two unrelated things under one report.** (a) The
   `MonthlyProjectionsPanel` table (`analytics.js`) had column-freeze (`position:sticky,left:0`
   on the Store cell) but no row-freeze (`top:0` on the header) — the one table in the codebase
   with only half the freeze; everywhere else that freezes one axis freezes both
   (`store-dash.js`, `smart-targets.js`). Fixed with a 2-row sticky thead (group row + field
   row), each needing its own `top` offset since sticky rows stack — `THEAD_ROW_H=23` is an
   *estimated* row height, not measured, so a few px of visual seam is possible and is a
   cosmetic risk, not a functional one. (b) "the scrollbar sits on the screen edge" was a
   completely separate bug in the **hub shell** (`App.js`'s `PlanningHubPanel`, and identically
   `SchedulingHubPanel`): `paddingTop:16` with no `paddingBottom` — the bottom-sheet-style card
   filled all the way to the viewport's physical bottom edge, so any horizontally-scrolling
   table's native scrollbar rendered flush against the screen edge. Fixed by mirroring
   `paddingBottom:16`.

3. **Planning → PACE — a component reused for two different jobs.** `CurrentMonthPaceSection`
   (`analytics.js`) hardcodes `maxHeight:240, flexShrink:0` — correct when it's ONE section
   embedded above a bigger page (which is what it's for in `MonthlyProjectionsPanel`), wrong
   when `pace-to-target.js` uses it as the *entire* panel body, leaving a 240px table pinned at
   the top and a large empty area below. Added a `fillHeight` prop that swaps the cap for
   `flex:1, minHeight:0` when the section IS the whole panel.

4. **Projections → supervisor expand — already fixed, not a live bug.** `git log -G
   "maxHeight:'95vh'"` shows this landed in `ee8a94b` (v4.966, #178 item 1) before this issue
   was filed. The comment at the exact cited line (`features/projections.js:1366`) documents the
   fix and the Mary Ratliff repro that found it. **No code change in this pass.** If the symptom
   is still reproducing, it's a different screen than the one this issue names — most likely
   item 2 above, which shares the "supervisor group, some stores unreachable" shape.

5. **Calendar grid — cosmetic, same family.** Event chips were single-line `nowrap +
   textOverflow:ellipsis`; switched to a 2-line `-webkit-line-clamp` (the standard multi-line
   idiom, not used elsewhere in this file so there was no existing convention to match).

## The guard test

`src/__tests__/scroll-table-width.test.js` — a textual scan (not an AST), same tradeoff as the
loader-field-map and `sync-failure-watch` tests: it windows forward from every
`overflowX:'auto'` for the next `<table>`'s style block and flags `width:'100%'` with no
`minWidth` anywhere in that block. False negatives are possible (an unusual layout structure
could dodge the 600-char window); a false positive is caught the next time someone touches that
file. It does **not** guard the sticky-header, hub-padding, or fillHeight fixes — those are each
one-off, not a repeated textual pattern — so items 2 and 3's fixes have no regression guard
beyond the normal test suite. If either recurs, that's the signal a real guard is worth building
for that specific shape too.

## Why this matters beyond the five bugs

The issue diagnosed a *symptom class* correctly (five things that feel the same to a user) but
guessed at a *mechanism* (one shared component) without checking. The guard test — built to
enforce the ACTUAL mechanism (a textual anti-pattern, not a component) — immediately found the
defect was 4x more widespread than the five reports implied. That's the same lesson
`memory/feedback-measure-dont-reason.md` already names: a plausible-sounding cause (matches the
"ModalShell exists, must be the shared thing" pattern) is exactly the kind of wrong that isn't
obviously wrong until you grep.
