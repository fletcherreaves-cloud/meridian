---
name: dispatch55-part-b
description: Dispatch #55 Part B (Job C Batch 1), done. Converted six ModalShell overlay panels (sched-hub, perf-reviews, fob-analysis, fob-eom, eom-dashboard, count-cycle) to URL-addressable full-page views using the existing route:true infrastructure, taking it from 4 route panels to 10. Two panels had no internal chrome (wrapped directly in RoutePanelShell); two rendered their own ModalShell internally (swapped for RoutePanelShell in place); two hand-rolled their own backdrop/card/header from scratch (refactored to RoutePanelShell, one of them dropping the R7 hand-rolled-backdrop ratchet). All six showX booleans removed entirely, not just unused.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #55 Part B — Job C Batch 1, done

**2026-08-21**, executes Part B of `memory/dispatch-55.md`. Separate PR from Part A, on branch
`claude/dispatch55-part-b-jobc-batch1`, built off `origin/main` **before** Part A merged — the
dispatch's own instruction ("ship as two PRs... do not combine them") means this branch does not
contain Part A's `section:` corrections. That's expected and fine; the two PRs are independent and
reviewable separately, and merge order resolves any version-number/changelog overlap normally
(Part A shipped as v5.093 — confirmed by reading PR #526's diff directly — so this PR is v5.094).

## The six conversions

| id | label | component | file | shape before |
|---|---|---|---|---|
| `sched-hub` | Scheduling | `SchedulingHubPanel` | `src/app/App.js` (defined locally, not a view file) | hand-rolled bottom-sheet backdrop/tab-bar/close-button |
| `perf-reviews` | Performance Reviews | `PerformanceReviewsPanel` | `src/views/performance-reviews.js` | `h(ModalShell,{...})` with `subHeader` (tab bar) |
| `fob-analysis` | Food Cost | `FOBAnalysisPanel` | `src/views/analytics.js` | bare content, no shell at all |
| `fob-eom` | End of Month | `FOBEOMPanel` | `src/views/fob-eom.js` | bare content, no shell at all |
| `eom-dashboard` | Inventory Control | `EOMDashboardPanel` | `src/views/eom-dashboard.js` | `h(ModalShell,{...})` with `subHeader` (PanelChrome: location/date/export/tabs) |
| `count-cycle` | Count Cycle | `CountCyclePanel` | `src/views/count-cycle-panel.js` | hand-rolled backdrop/card/header/close-button from scratch, never used `ModalShell` |

Per-panel treatment, matching the dispatch's own split:

- **`fob-analysis` / `fob-eom`** had no internal header/chrome to strip, so they're wrapped
  directly in `h(RoutePanelShell, {...}, h(Panel, {...}))` at the App.js render call site — the
  same pattern the original four route panels (`dicompare`/`fcst-accuracy`/`proj`/`report`) use for
  wrapping components that don't render their own shell.
- **`perf-reviews` / `eom-dashboard`** already called `h(ModalShell, {...})` internally, so the fix
  is local to those files: swap `ModalShell` → `RoutePanelShell`, `onClose` → `onBack:onClose`,
  drop `maxWidth`/`zIndex` (RoutePanelShell doesn't use them — it fills the content area in place,
  no backdrop/centering/cap). **`RoutePanelShell` has no `subHeader` slot** (`ModalShell` does), so
  each panel's `subHeader` content — `perf-reviews`'s `TabBar`, `eom-dashboard`'s `PanelChrome`
  (location/date/export/tabs) — moved to be the first child inside the body instead. Visually this
  places the tab bar/chrome inside the scrolling body rather than in a pinned sub-header band; not
  pixel-identical to the old modal, but the same content, same order, same component. `eom-dashboard.js`
  had no other use of `ModalShell`/`Z`, so both were dropped from its import; `performance-reviews.js`
  still uses both elsewhere (`HelpGuideModal`), so its import stays as `{ ModalShell, RoutePanelShell, Z }`.
- **`count-cycle-panel.js`** hand-rolled a `position:'fixed', inset:0, background:'rgba(0,0,0,.75)'`
  backdrop + card + header (icon, title, dynamic subtitle line, "✕ Close" button) + body + footer
  caption — never imported `ModalShell` at all. Refactored to `h(RoutePanelShell, {title, icon,
  subtitle, onBack:onClose}, ...)` with the footer caption kept as a trailing div inside the body
  (RoutePanelShell has no footer slot). This is also the one panel in this batch that moves the R7
  hand-rolled-backdrop ratchet (`src/__tests__/ratchet-modal-backdrop-bypass.test.js`) — CEILING
  lowered 78→77 in the same commit, per that ratchet's own "lower the ceiling, this is not a bug in
  your change" instruction. (The other five didn't move it: `sched-hub`'s hand-rolled chrome lives
  in `src/app/App.js`, outside the ratchet's `src/views/` + `src/features/` scope; the two
  `ModalShell`-based panels were never counted; `fob-analysis`/`fob-eom` never hand-rolled a backdrop.)
- **`sched-hub`** was the most involved, handled last. `SchedulingHubPanel` is defined locally
  inside `App.js` (not a separate view file) and hand-rolled its own fixed bottom-sheet — backdrop,
  card, header row with a tab-pill-bar (`SCHED_TABS`: Labor Analytics / Scheduling / Schedule
  Summary / Labor Analysis / Labor Allocation / Skills) and a close button. Refactored to
  `h(RoutePanelShell, {title:'Labor & Scheduling', icon:'🗓', onBack:onClose, headerExtra:tabBar},
  active)` — the exact same tab-pill-bar JSX relocated verbatim into `headerExtra`, not rebuilt.
  The hub's six internal tabs stay internal tab-switching (`kind:'hub-tab'` in the registry, no
  sidebar entries of their own) — this mirrors Job B's Planning hub precedent (hub-first, tabs not
  exploded into separate routes). **Seven `modal===` dispatch ids funnel into this one hub**
  (`sched-hub`, `labor-analytics`, `scheduling`, `sched-summary`, `labor-analysis`,
  `labor-allocation`, `skills-matrix`) across two separate `onOpenModal` handlers in App.js (the
  main chain and a second one inside AtAGlance's `onOpenModal` prop) — every one of them kept its
  existing `setSchedTab('<tab-id>')` call untouched and only the `setShowSchedHub(true)` half
  became `goRoute('sched-hub')`. Verified via `grep -c 'setShowSchedHub(true)'` returning zero
  after the edit (also now enforced by the new test below).

## panel-registry.js

`route:true` added to all six. `section:`/`kind:`/`label:`/`icon:`/`perm:` untouched on every one —
this batch is presentation-only, matching the dispatch's explicit scope ("do not drift into IA").

## App.js bookkeeping — the six `showX` booleans removed entirely

Not just left unused: deleted from their `useState` declaration, the `anyModalOpen` OR-chain, and
the Escape-hatch sweep — same treatment the original four route panels already got. A route panel
has nothing rendering behind it that `anyModalOpen` needs to pause (it replaces AtAGlance/StoreDash/
etc rather than overlaying them), and Escape already backs a route panel out via the existing
`if(routePanel){goRoute(null);return;}` check that runs ahead of the showX sweep. `schedTab` stays —
it's which internal hub tab is selected, not a modal-visibility boolean, and none of this batch's
other components have an equivalent piece of state to preserve.

The six render lines also moved location in the JSX tree: they used to live in the "Modals rendered
at root of the flex layout (position:fixed, so location in tree doesn't matter)" block — true for a
`ModalShell`/hand-rolled-fixed panel, but **not** true for `RoutePanelShell`, which has no
backdrop/fixed positioning and needs to render inside the normal-flow main content area to actually
fill it. All six new `routePanel==='<id>'&&...` gates now sit alongside the original four, inside
the main content scroll area, right before its closing comment.

## Verification — what was actually checked, and why this is the ceiling

Per the dispatch's own bar: *"A conversion that renders the panel but breaks its deep link is the
failure mode, and a test that only checks `route:true` in the registry cannot see it."*

1. **`route:true` set** — trivial, covered by the registry ratchet test (updated to enumerate all
   ten ids: `count-cycle, dicompare, eom-dashboard, fcst-accuracy, fob-analysis, fob-eom,
   perf-reviews, proj, report, sched-hub`).
2. **`goRoute('<id>')` has a real call site** — the existing generic regex test
   (`panel-registry.test.js`, `'every route panel is opened via goRoute(...)'`) loops over
   `ROUTE_IDS` and now covers all ten automatically; ran it, passes.
3. **`routePanel==='<id>'` has a real render gate** — same file's sibling test, same mechanism,
   also passes for all ten automatically.
4. **The `modal==='<id>'` dispatch handler still calls `goRoute`, not a dead `setShowX(true)`** —
   this is the one the existing generic tests *can't* see (they only prove a `goRoute` call exists
   *somewhere*, not that the *old* call site is gone). Added a new dedicated test:
   `'Dispatch #55 Part B: no setShowX(true) call site survives for the six converted booleans'` —
   asserts zero matches for `setShowSchedHub(true)` / `setShowPerfReviews(true)` / `setShowFOB(true)`
   / `setShowFOBEOM(true)` / `setShowEOMDash(true)` / `setShowCountCycle(true)` anywhere in App.js,
   **and** zero matches for the six `useState` declarations. This is the exact regression class the
   dispatch calls out — the #366 shape (engine right, call site unwired), just inverted: a *working*
   render via the new gate, with a *stale* modal-open call site nobody notices because the panel
   still opens fine through whichever path still works.

**App.js has no existing render-level test harness to extend.** Checked before assuming: unlike
`shell.js`'s `AppSidebar` (rendered via `ReactDOMServer.renderToStaticMarkup` in
`shell-nav-snapshot.test.js` and the Part A promotion test), nothing in `src/__tests__/` mounts or
renders App.js itself — it's too large/stateful (Supabase client, IndexedDB, many `useEffect`s) for
a unit-test render, and no prior dispatch in this repo's history built one for it. So per the
dispatch's own fallback instruction, the verification ceiling actually reached is: (a) the registry
ratchet enumerating all ten ids, (b) the two existing generic `goRoute`/`routePanel` regex tests,
(c) the new regex-based "no stale setShowX(true), no stale declaration" test above. Items 3 and 4 of
the dispatch's four-point bar (URL updates via routing.js and a direct load lands on the panel;
browser back leaves the panel and returns) are structural guarantees of `routing.js` itself
(untouched, already tested by its own suite) plus the same `routePanel` state wiring the original
four route panels already rely on — not independently re-verified per-panel here, since doing so
would require the render harness this codebase doesn't have. Flagged explicitly rather than silently
assumed covered.

## Numbers

- **Tests:** 1860/1860 passing (1859 baseline + 1 new dedicated test; the registry ratchet test's
  assertion changed shape but didn't add a test file).
- **Ratchet maintenance:** `ratchet-modal-backdrop-bypass.test.js` CEILING 78 → 77 (count-cycle's
  hand-rolled backdrop removed).
- **Build:** entry chunk **1717.36 KB / 510.63 KB gz**, measured against **1717.88 KB / 510.61 KB
  gz** on the same `origin/main` tip *before* this PR's edits (stash-and-rebuild comparison, the
  same technique Part A used). Essentially flat — a hair smaller uncompressed, +0.02 KB gzip, both
  within noise. Confirmed before assuming: all six components were already lazy-loaded via
  `lazyPanel()` in App.js's import list (`SchedulingHubPanel` is the one exception, but it's defined
  locally in App.js itself, not a separate module to lazy-import — same as before this PR). None
  became a static import; the budget headroom (337.51 KB against the 850 KB gz ceiling) is
  unchanged in practice.

## Deviations from the plan, and why

- **`RoutePanelShell` has no `subHeader` slot**, unlike `ModalShell`. The dispatch's own per-panel
  notes anticipated this ("RoutePanelShell supports all of these — check its exact prop signature
  first") without spelling out the resolution. Chose: render the former `subHeader` content
  (`perf-reviews`'s tab bar, `eom-dashboard`'s `PanelChrome`) as the first child inside the body
  instead of inventing a new prop on the shared shell — smaller diff, no shared-component change,
  and consistent with `count-cycle`'s footer-caption treatment (also folded into body children,
  per the dispatch's own suggestion for that panel).
- Otherwise no deviations — six-for-six converted as scoped, `routing.js` untouched, no IA fields
  touched beyond `route:true`, SAGE/KB/About/Metric Lineage/Feature Requests/Local News untouched,
  no minimize-and-close affordance built.

## Open items for a future session

- The render-harness gap for App.js (noted above) is real and pre-existing, not introduced by this
  PR — worth flagging for whoever eventually wants a stronger deep-link guarantee than regex
  coverage provides. Not fixed here; out of scope for a presentation-only batch.
- Job C's remaining scope (SAGE/Knowledge Base/About/Metric Lineage/Feature Requests/Local News —
  the three right-side-modal builds plus the universal minimize-and-close affordance) is explicitly
  the next batch(es), not started here.
