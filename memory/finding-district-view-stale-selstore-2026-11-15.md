---
name: finding-district-view-stale-selstore-2026-11-15
description: "✅ RESOLVED 2026-11-15 -- District View went blank (no error) on reopen after the owner had viewed any store and left via a nav item other than StoreDash's own Back arrow. Root cause: District View's render gate (App.js, view==='district'&&!selStore&&...) requires selStore to be null, but selStore was only ever cleared by StoreDash's Back button, never by the nav. Fixed by also clearing selStore in AppSidebar's District View nav handler (src/app/shell.js), same pattern as the existing routePanel clear. v5.790."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# District View blank screen on reopen (2026-11-15)

## Symptom

Owner: *"after clicking into District View first time, after navigating elsewhere and then
reopening it, it fails to load at all. Jst blank screen."* First open always worked; a later
reopen sometimes rendered nothing in the content area — no error banner, no "Try to recover" /
"Back to Home" escape hatch from the lazyPanel() ErrorBoundary added 2026-11-06 (that escape
hatch only fires on a thrown render error; this wasn't one).

## Root cause

`src/app/App.js`'s render for District View is gated:

```js
view==='district'&&!selStore&&!routePanel&&h(DistrictGrid,{...})
```

`selStore` is `App.js`'s own top-level state, set by `goStore(s)` (called when a store card is
clicked anywhere, including from inside `DistrictGrid` itself via `onSelectStore:goStore`), which
also flips `view` to `'store'` so `StoreDash` renders instead. The ONLY place in the entire file
that ever calls `setSelStore(null)` again is `StoreDash`'s own `onBack` handler:

```js
onBack:()=>{setView('district');setSelStore(null);}
```

Every other way of leaving the store view — clicking any other sidebar nav item (Analytics,
Labor Tools, another store card, Home, etc.) — changes `view` without touching `selStore` at
all. `grep -n "setSelStore" src/app/App.js` turns up exactly those two call sites and no others.

So: open District View (clean, `selStore` null) → click a store card → `view='store'`,
`selStore='<loc>'` → navigate away via the sidebar instead of StoreDash's own Back arrow → click
District View again → `setView('district')` runs fine, but `selStore` is still the old loc →
`!selStore` is `false` forever → the `h(DistrictGrid,...)` branch never evaluates true → nothing
renders in the content slot. No crash, so the lazyPanel ErrorBoundary never engages — this reads
as a dead silent blank, exactly what was reported.

Checked whether any other `view===` branch shares this `!selStore` dependency
(`view==='patch'`/`view==='org'` both render `OrgView` and do NOT check `selStore` at all) — this
gate is unique to District View, which is why only District View exhibited the bug.

## Fix

`src/app/shell.js`'s `AppSidebar` now takes a `setSelStore` prop (wired from `App.js`'s
`h(AppSidebar,{...selStore, setSelStore...})`) and the District View nav handler clears it:

```js
pi('analytics.district', 'District View', '⊞',
  ()=>{setSelStore?.(null); setView('district'); goRoute?.(null);},
  view==='district'&&!routePanel),
```

Same shape as the existing `goRoute?.(null)` clear that fixed the earlier "Home/District View
nav does nothing while a route panel is open" bug
(`dispatch-home-nav-clears-route-panel-2026-11-02`) — both are "a nav item flips `view` but
leaves some OTHER piece of state that a render gate also checks, stuck."

Home's own nav handler was left alone: its render gate (`view==='command'`) never checks
`selStore`, so there was nothing to fix there, and adding an unneeded clear would be change for
its own sake.

2 new tests, `src/__tests__/dispatch-district-view-stale-selstore-2026-11-15.test.js` (renders
the real `AppSidebar`, clicks the real District View nav item, asserts `setSelStore(null)` was
called — plus a safety test that nothing throws when the `setSelStore` prop is absent, matching
every pre-existing caller shape).

## Status: ✅ RESOLVED

v5.790. Full suite green (8174 tests), build clean, within payload budget.
