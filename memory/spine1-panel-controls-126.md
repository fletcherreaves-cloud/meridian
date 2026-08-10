---
name: spine1-panel-controls-126
description: Issue #126 (Spine 1). Step 1 built the four shared panel controls (DateRangeControl, LocationSelector, ActionMenu/ActionMenus, PanelChrome) plus two additive ModalShell options — pure addition, no call sites. Step 2 (2026-08-10) migrated the Inventory Control pilot onto them and found two real reasons the shared components don't fit every panel as-is: no date-RANGE concept for a monthly-period panel, and a live-vs-static patch-source mismatch that blocked adopting LocationSelector's patch tier.
metadata:
  node_type: memory
  type: project
---

# Spine 1 step 1 — shared panel controls (2026-08-10)

Built per issue #126: the foundation for "one copyable panel design used everywhere"
(`memory/decisions-panel-inventory-2026-08-10.md`, `memory/notes-60-queue.md`). **Pure
addition** — new files only, zero existing call sites touched, zero behavior change.
Measured: entry chunk 844.26 KB → 844.30 KB gzip (+0.04 KB) — the only thing that landed
in the entry chunk is the two small ModalShell.js additions (opt-in, default-off); the new
component files aren't imported by anything yet, so they cost nothing until step 2 wires a
panel to them.

## What exists now

- `src/components/PanelControls.js` — `DateRangeControl`, `LocationSelector`, `ActionMenu`/
  `ActionMenus`, plus the pure logic each renders from (`resolveDatePreset`,
  `isValidCustomRange`, `buildLocationHierarchy`, `locationSelectorLocs`,
  `nonEmptyActionGroups`) — tested directly, no jsdom needed (this repo's Vitest config runs
  `environment:'node'`, so component *rendering* has no test precedent anywhere in `src/`;
  the logic that decides what renders does).
- `src/components/PanelChrome.js` — `PanelChrome({location, dateControl, exportSlot, actions,
  tabs})`. Renders band 2 (location · date · export, export pushed right via `marginLeft:
  'auto'`) and band 3 (actions left, tabs right via `marginLeft:'auto'`) in `ModalShell`'s
  `subHeader` slot. Omits a band with no slots filled; never reorders.
- `ModalShell.js` gained two opt-in props, both default `false`/off so the existing 42 call
  sites are unaffected (verified in `panel-controls.test.js`, structural — call the component
  function directly and inspect the returned element tree, same "no jsdom" approach as above):
  - `scroll` — top-aligned + page-scrolling + uncapped height, for panels shaped like
    `MetricCorrelationExplorer`/`DistrictLensPanel` instead of the default centered dialog.
  - `tintHeader` — tints the header band `var(--surf2)`, matching those same reference panels.
- **Export**: no new component. Step 2 passes the existing `ExportDropdown`
  (`store-dash.js`, exported at `:3620`) into `PanelChrome`'s `exportSlot` — `PanelChrome`
  deliberately does not import `store-dash.js` itself (that module is a large lazy chunk; a
  static import from a shared, potentially-eagerly-used component would risk dragging it into
  wherever `PanelChrome` ends up, the same class of mistake PR #122 made with `labor-tools.js`).

## Step 2 shipped (2026-08-10) — Inventory Control, the named pilot

`src/views/eom-dashboard.js`'s `EOMDashboardPanel` (`📦 Inventory Control`, ~3300 lines, the
app's most button-dense panel) now self-wraps `ModalShell` with `subHeader: h(PanelChrome, ...)`
instead of being wrapped externally by `App.js` — `App.js`'s call site simplified from a
6-line `h(ModalShell, {...}, h(EOMDashboardPanel, {...}))` to one line, since PanelChrome's
slot content depends on state that lives inside the panel, not in `App.js`. This is the actual
pattern step 2 established, not the sketch below (kept for what it got right — `ActionMenus`
grouping, `LocationSelector`'s worked shape for panels where it fits cleanly).

The 16-button wall (grown from "14" since the issue was scoped) collapsed into 4 `ActionMenus`
groups — Reports / Scans / Monitor / Pulls (3 in the issue's worked example; this panel earned
a 4th, Monitor, rather than force-fitting Snapshot/Change Monitor/Flow into Reports or Scans).
The mode toggle (Scoreboard/EOM Count/Count Cycle) moved into PanelChrome's `tabs` slot — it's
a view-tab selector, not an action. `ActionMenu` gained `title` passthrough (a small, generic,
backward-compatible addition) so the long descriptive tooltips on those 16 buttons weren't lost
when they became dropdown items.

### Two things this panel does NOT use, and why — read before assuming every panel fits

1. **No `DateRangeControl`.** This panel's "when" control is a single accounting-month
   `<select>` (`recentPeriods(4)`), not a trailing-N-days range. `DateRangeControl`'s preset
   catalog (7d/14d/28d/…) has no period-select equivalent. Kept the native `<select>` and put
   it in `PanelChrome`'s `dateControl` slot as raw content — `dateControl` just renders
   whatever's passed, it doesn't require literally being `DateRangeControl`. Don't assume every
   panel's "when" axis is a day-range; some are calendar periods.

2. **`LocationSelector` NOT used for the patch/state/store picker — the real finding of this
   step.** `LocationSelector`'s patch tier (`buildLocationHierarchy`, `PanelControls.js`)
   derives from the STATIC `INV_ORG_COORDS[loc].sup` seed in `constants.js`. This panel's own
   patch filter correctly reads the LIVE supervisor assignment
   (`supervisorGroups()` → `orgAssignments()` → the settable `_liveAssignments` override — a
   real reassignment mechanism this app supports, confirmed in `constants.js`, not
   hypothetical). These are two genuinely different data sources for "who supervises this
   store" that can diverge the moment a reassignment is saved. Could not confirm from the
   sandbox whether they're currently in sync — an anon-key `org_config` read came back `[]`,
   which is ambiguous under RLS (could mean "no live overrides" or "RLS is filtering the
   read"), not proof either way. Swapping the patch source on that unverified assumption would
   risk silently mis-grouping a store on a financially-scoped filter (patch-scoped FOB
   reporting) the next time a supervisor changes. Kept the panel's own bespoke state-pills +
   patch-`<select>` + store-`<select>` markup, unchanged, just relocated into `PanelChrome`'s
   `location` slot as raw content — same reasoning as `dateControl` above.
   **Before any future panel adopts `LocationSelector`'s patch tier for real, either (a)
   confirm `INV_ORG_COORDS[loc].sup` and `supervisorGroups()` are kept in sync by construction
   (e.g. one is generated from the other), or (b) give `buildLocationHierarchy` a way to accept
   a live patch source instead of always reading the static seed.** Neither was done here —
   flagged, not fixed, consistent with this session's "surface it, don't guess" standard.

Not swapped either, and correctly so: `exportSlot` = the panel's own CSV button (this panel
never had `ExportDropdown` — CSV-only was already correct for it, nothing to adopt).

### Verification limits — said plainly, not glossed over

Build (`npx vite build`) and the full test suite (95 files / 1165 tests) pass, and the
entry-chunk delta measured flat (`eom-dashboard.js` is lazy-loaded; the shared components were
already in the entry bundle from step 1). Interactive browser verification (minted an
authenticated session via the Supabase admin API, same approach as prior sessions) was
attempted but blocked by a Chromium↔proxy incompatibility in this sandbox specifically — `curl`
reaches the same Supabase host fine through the identical proxy, Chromium does not
(`net::ERR_CONNECTION_RESET`), and further debugging that gap wasn't a good use of time against
this task. Every prop/handler/disabled-state mapping was checked by hand against the original
markup line-by-line rather than skipped, but this has NOT been visually confirmed in a running
browser. Flagging this explicitly rather than claiming a verification that didn't happen.

## Left for a future step

- The raw `zIndex` 456/460 used by the two reference panels (`MetricCorrelationExplorer`,
  `DistrictLensPanel`, both above `Z.modal`=300 and `Z.nested`=400) still needs reconciling —
  issue #126 flagged this as a step-2+ concern; Inventory Control didn't touch it (its own
  original `zIndex:Z.nested` was already a proper Z-map value, not a magic number, so there was
  nothing to reconcile on this pilot specifically).
- The live-vs-static patch-source question above, if a future panel wants `LocationSelector`'s
  patch tier for real.
- `ExportDropdown` itself still wasn't touched.
