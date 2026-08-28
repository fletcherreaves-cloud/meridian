# Dispatch #198 — panel-contract sweep: consolidate eom-dashboard.js's hand-rolled backdrops

## Context — single best batch target, measured fresh

Per the 2026-08-28 scoping pass: `src/__tests__/ratchet-modal-backdrop-bypass.test.js`'s CEILING
is currently **68**, freshly re-measured against `origin/main` (matches the test's own live scan —
not stale). Grouped by file, `src/views/eom-dashboard.js` alone carries **15 of the 68** hand-
rolled `position:'fixed', inset:0, background:'rgba(0,0,0...` backdrops — by far the single
largest concentration in one file, more than the next two files (`analytics.js`, `labor-tools.js`,
9 each) combined-minus-3. `eom-dashboard.js` already hosts a converted-tab-shell architecture (EOM
Dashboard / Food Cost / End of Month / Count Cycle all live here per dispatches #188/#189) that
apparently never got its own per-tab chrome consolidated onto one shared shell when those merges
landed — each tab/mode still hand-rolls its own backdrop instead of using the one RoutePanelShell
wrapping the whole panel.

## Task

1. **Read `src/views/eom-dashboard.js` in full before touching anything.** Confirm the file's
   actual current structure: is there one outer `RoutePanelShell`/`ModalShell` for the whole panel
   with each tab/mode's body hand-rolling a REDUNDANT backdrop underneath it (the FOBAnalysisPanel
   pattern dispatch #188 fixed in `analytics.js` — "real double chrome, not just an extra backdrop
   pattern"), or are some of the 15 hits genuinely separate top-level entry points that need their
   own shell? Don't assume uniformity — measure what's actually there first, per this repo's
   standing "measure it, don't reason about it" rule.
2. **Remove the redundant ones** where an outer shell already exists (the exact fix pattern
   dispatch #188 already established and documented for this same file's neighbor,
   `FOBAnalysisPanel`). For any hit that turns out to be a genuinely standalone entry point with no
   outer shell, convert it to `ModalShell`/`RoutePanelShell` properly rather than deleting its
   backdrop with nothing replacing it.
3. **Re-measure the ratchet CEILING fresh** after your changes — reproduce the test's own exact
   scan (`PATTERN = /position:\s*['"]fixed['"]\s*,\s*inset:\s*0\s*,\s*background:\s*['"]rgba\(0,0,0/`
   over `src/views/` + `src/features/`, excluding `*.test.js`) and set `CEILING` to whatever it
   actually measures — never by arithmetic subtraction from "15 removed." Update the file's own
   running comment history explaining the new number, matching the style of every prior entry in
   that file.
4. **Opportunistic panel-contract check**: while in this file, also check date-picker mode,
   `LocationSelector` usage, and mobile-scroll (`overflowX:'auto'`) compliance on any section you
   touch — but only where it doesn't meaningfully widen scope beyond the backdrop consolidation.

## Verification

- `ratchet-modal-backdrop-bypass.test.js` passes with its freshly re-measured CEILING.
- Visually/functionally: every mode/tab this file renders (EOM Dashboard, Food Cost, End of Month,
  Count Cycle) still opens, closes via its shell's close button, and shows content — a backdrop
  removal must never leave a mode un-closeable or double-chromed the other way (two nested shells).
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  immediately before committing — do not trust any number implied by this doc or prior context,
  several dispatches have landed on `main` concurrently this session).

## Out of scope

- The other 53 hand-rolled backdrops elsewhere (`analytics.js`/`labor-tools.js`/`calendar.js`/etc.)
  — those are scattered across genuinely different components per the scoping pass, not one cheap
  fix; a future dispatch per file/cluster if warranted.
- Any behavior change to EOM Dashboard / Food Cost / Count Cycle beyond the chrome consolidation.
