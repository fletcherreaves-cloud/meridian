---
name: spine1-panel-controls-126
description: Issue #126 (Spine 1 step 1) — the four shared panel controls (DateRangeControl, LocationSelector, ActionMenu/ActionMenus, PanelChrome) plus two additive ModalShell options. Pure addition, no call sites migrated yet. How to wire a panel to it in step 2.
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

## Wiring a panel in step 2 (not done yet — the Inventory Control pilot is the plan)

```js
import { PanelChrome } from '../components/PanelChrome.js';
import { DateRangeControl, LocationSelector, ActionMenus, resolveDatePreset } from '../components/PanelControls.js';
import { ExportDropdown } from '../views/store-dash.js';

// inside the panel:
const [range, setRange] = useState(() => resolveDatePreset('7d', MY_PRESETS)); // per-panel default
h(ModalShell, {
  title: '…', onClose, scroll: true, tintHeader: true,   // only if this panel matches that shape
  subHeader: h(PanelChrome, {
    location: h(LocationSelector, { stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value, onChange: setValue }),
    dateControl: h(DateRangeControl, { presets: MY_PRESETS, value: range, onChange: setRange }),
    exportSlot: h(ExportDropdown, { rows, columns, title }),
    actions: h(ActionMenus, { groups: [{ label: 'Reports ▾', items: [...] }, { label: 'Scans ▾', items: [...] }] }),
  }),
}, ...);
```

`LocationSelector` takes `mode:'store'` for genuinely single-store panels (a simple picker,
no All→State→Patch chain — "a control that never does anything trains people to ignore
controls," per the issue).

## Left for step 2 / not addressed here

- No panel actually renders `PanelChrome` yet.
- The raw `zIndex` 456/460 used by the two reference panels (above `Z.modal`=300 and
  `Z.nested`=400) still needs reconciling — issue #126 flagged this as a step-2+ concern,
  not step 1's.
- `ExportDropdown` itself wasn't touched — "adopt the existing" per the issue, not rebuild.
