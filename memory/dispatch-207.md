# Dispatch #207 — route:true for `planning` (Planning Hub)

## Context — the last easy URL-migration candidate, `events` deliberately excluded

Dispatch #192/#205/#206 converted 31 panels to `route:true`, closing out the original candidate
list. `planning` (Planning Hub) and `events` (Events & Tags) were the two holdouts every prior
dispatch doc named and deferred, on the stated reasoning that both are defined **inline in
`src/app/App.js`** rather than in their own view/feature file — "a materially different
conversion shape."

**That framing turned out to overstate the risk for `planning` specifically.** A fresh scoping
pass (2026-08-28) found `SchedulingHubPanel` — a module-level function in `App.js`, immediately
above `PlanningHubPanel`, same "tab array + hub panel" shape — was **already converted to
`route:true`** as `sched-hub`, well before the #192/#205/#206 project even started (Dispatch #55
Part B), with **zero file extraction**: its hand-rolled backdrop return became
`h(RoutePanelShell, {title, icon, onBack, headerExtra: tabBar}, active)` in place, in the same
file. `PlanningHubPanel` is the same shape and can take the same treatment. **This dispatch is
`planning` only.**

**`events` is NOT part of this dispatch — genuinely riskier, deferred to its own future dispatch.**
`EventsAndTagsPanel` itself has no chrome of its own; its two real backdrops live inside two
*different* delegate components (`EventCalendar` in `src/views/store-dash.js`, `CalendarManagerPanel`
in `src/features/calendar.js` — the latter ~1068 lines with several genuine secondary popups
(day-detail, rule form, bulk-import sheet, AI-search preview) that need the same kind of careful
per-hit triage dispatch #198 did across `EOMDashboardPanel`'s 15 hits, concentrated in one already
-complex file). Do not fold it into this dispatch or any future batch without its own dedicated
scoping pass, sized more like #198's single-file sweep than #192/#205/#206's single-component swaps.

## Baseline (re-check both fresh before starting — standard "never copy a number" rule)

- `panel-registry.test.js`'s `ROUTE_IDS` = 31 (post-#206). Includes `sched-hub` — read that entry
  and `SchedulingHubPanel`'s current App.js implementation as your literal template.
- `ratchet-modal-backdrop-bypass.test.js`'s `CEILING = 42`. **`ROOTS = ['src/views', 'src/features']`
  only — `src/app/App.js` is never walked by this test.** `PlanningHubPanel`'s hand-rolled backdrop
  lives in App.js, so converting it will **NOT move `CEILING`** — real chrome simplification, zero
  ratchet interaction. Don't let the commit or PR body claim a CEILING decrease for this dispatch;
  say explicitly why there isn't one (out-of-scope file, not a regex-evasion case like #206's
  smg-voice/task-queue).

## The panel

`PlanningHubPanel`, `src/app/App.js` (currently ~lines 396–426, re-locate fresh — line numbers
drift). Tab array `PLANNING_TABS` (currently ~line 389): 5 tabs — `targets`/`monthly`/`pace`/
`yearly`/`smart`. Currently a hand-rolled `position:'fixed',inset:0,background:'rgba(0,0,0,.82)',
zIndex:460` backdrop.

**Registry entry today**: `{ id:'planning', label:'Planning', icon:'🎯', perm:'analytics.store',
kind:'nav', section:'planning' }` — add `route:true`.

## Task

1. **Convert `PlanningHubPanel` to `RoutePanelShell`, in place, no file extraction** — mirror
   `SchedulingHubPanel` exactly: pull the tab-strip JSX into a local `tabBar` variable (matching
   `SchedulingHubPanel`'s own `tabBar` at its current line ~467), return
   `h(RoutePanelShell, {title:'Planning', icon:'🎯', onBack:onClose, headerExtra:tabBar}, active)`.
2. **Move its render from the "modals at root" bucket into the `routePanel===` gated main-content
   section** — same block where `sched-hub`/`ranking`/etc. already render:
   `routePanel==='planning'&&h(PlanningHubPanel,{...,onClose:()=>goRoute(null)})`.
3. **Rewire all 6 open call sites** (grep `setShowPlanningHub` across `src/` to confirm the exact
   count fresh, don't trust this number blindly — it was 6 as of the scoping pass):
   `modal==='planning'`, `'monthly-proj'`, `'pace-target'`, `'yearly-proj'`, `'unified-targets'`,
   `'smart-targets-v2'` — each currently does `setPlanningTab(...)` then `setShowPlanningHub(true)`;
   change the second call to `goRoute('planning')`, keep the `setPlanningTab(...)` companion call
   exactly as-is (the tab selection still needs to happen before/with the route change).
4. **Remove the `showPlanningHub`/`setShowPlanningHub` `useState`**, its `anyModalOpen` entry, and
   its Escape-sweep `setShowPlanningHub(false)` call — replace each removal with the established
   one-line comment style (`// showPlanningHub — dispatch #207: replaced by routePanel==='planning'
   (see routePanel above).`), matching #205/#206's exact comment pattern.
5. **Add `route:true`** to the `planning` registry entry.

## Ratchet updates

1. **`panel-registry.test.js`'s `ROUTE_IDS`** — add `'planning'`, keep sorted, extend the running
   narrative comment (31 → 32), noting explicitly that `sched-hub` was the template and this was a
   same-file, no-extraction conversion.
2. **`ratchet-modal-backdrop-bypass.test.js`'s `CEILING`** — re-run the test's own scan after your
   change to CONFIRM it stays at 42 (App.js is out of `ROOTS` scope, so this should be a no-op) —
   don't just assume, actually run the scan and note the confirmation in the comment, one line is
   enough since there's no real delta to explain in depth this time.
3. **`shell-nav-snapshot.test.js`** — re-run; shouldn't need changes for a pure route flip.

## Verification

- Planning opens via its own bookmarkable URL (`?panel=planning`), closes back to no-route state,
  lands on the correct tab for each of the 6 old entry points (verify `setPlanningTab` still fires
  correctly for each, now paired with `goRoute` instead of `setShowPlanningHub(true)`).
- Add a ratchet test matching #205/#206's "no setShowX(true) call site survives" pattern for
  `setShowPlanningHub`.
- `ROUTE_IDS` ratchet passes with `planning` added (32 total). `CEILING` confirmed unchanged at 42
  (re-run the scan, don't assume).
- Full suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- `events` (`EventsAndTagsPanel`) — deliberately excluded, see Context above. Needs its own
  dedicated dispatch, scoped and sized separately (closer to #198's single-file sweep shape than
  this dispatch or #192/#205/#206).
- Redesigning `PlanningHubPanel`'s actual tab content — this is purely a shell/routing conversion.
