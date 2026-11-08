---
name: plan-view-as-scope-2026-11-08
description: View As Role sandbox (task #97) extended with a store/patch scope picker + an "@" tag in the always-on banner, owner request 2026-11-08. Fixes a real correctness gap the sandbox had from day one (an unrestricted admin/owner simulating GM/DO saw an arbitrary store or the whole district masquerading as one patch).
metadata:
  type: project
---

# View As Role — scope picker + "@" tag (2026-11-08)

Owner, same day as The Ledger shipped: *"add a way for me to select what patch or operator or
store to mimic when I select in a alternate view. Tag @ would be awesome!"*

## The real bug this surfaced

The View As Role sandbox (task #97) only ever simulated the NAV/PANEL SHAPE for a role — it never
narrowed which stores feed that shape. For a real GM/DO/AS, that was invisible: their own `ds` is
already RLS-scoped to exactly their own store/patch, so "whatever `ds` contains" was already
correct. But an admin/owner's `ds` is unrestricted (sees everything), so:

- "View as GM" rendered `storeItems()`'s `(brief.stores||[]).find(s=>s.hasData)` — the first
  store that happened to sort first, not any specific one.
- "View as DO" rendered `PatchPlanFormat` with **all ~27 stores**, as if the whole district were
  one supervisor's patch — `computePatchRollup`/`computePatchMap` would dollar-weight and map the
  entire org, nothing like what a real DO actually sees.

This was never caught earlier because PR #1739 (same day) was the first time Curated Home even
respected `effectiveRole` at all — before that fix, simulating never reached this panel.

## The fix

`viewAsScope` (`src/app/App.js`) — a single string whose meaning depends on the simulated role's
altitude (`altitudeForRole()`, `src/engine/curated-home.js`):

- **`store` altitude** (gm/sm_am_dm/manager) → a real store loc, options from `STORE_NAMES`.
- **`patch` altitude** (area_supervisor/om/do) → a real supervisor name, options from
  `supervisorGroups()` keys.
- **`district` altitude** (vp/owner/admin) → no scope concept — The Ledger's own self-service
  "Operator:" picker (already shipped, v5.689) already covers operator-level mimicking for
  every account, real or simulated, so it is **not duplicated** here.

Resets to `null` whenever the simulated role changes or View As Role is exited — same
never-persisted, resets-on-reload posture `viewAsRole` itself already has (deliberately: nobody
should get stuck mid-simulation after walking away).

`src/views/curated-home.js`'s `CuratedHomePanel` takes the new `viewAsScope` prop and derives
`scopedBrief` — `brief.stores` filtered to the one store or the one patch's real stores, with a
locally recomputed `summary` (`summarizeStores()`) so the RED/AMBER/GREEN tile counts reflect the
narrowed set too, not the full district's. Every downstream consumer (`buildCuratedHomeItems`,
`myStore`, `storeLevelItems`, `PatchPlanFormat`'s `stores` prop) reads `scopedBrief`, not `brief`,
now. A real (non-simulated) GM/DO's own `ds` is already this narrow, so `viewAsScope` is simply
absent there — zero behavior change for any real, non-simulated login.

## The "@" tag

Two places, per the owner's own "Tag @ would be awesome":

1. **`ViewAsBanner`** (`src/app/shell.js`, always visible while simulating) — now reads
   *"👁 VIEWING AS {role} @ {scope} — nav and panel visibility only..."* once a scope is picked,
   or just the role name if not.
2. **Curated Home's own header** — a small amber `@ {name}` chip next to the format picker, on
   every render path (Game Plan/Patch/Ledger's own screens and the generic Checklist/Bullets/
   Narrative shell), so the simulated scope is visible without having to look back at the top bar.

The second selector itself lives in `ProfileMenu` (`src/app/shell.js`), directly under the
existing "View as role" select — only rendered once a role with real scope options to narrow is
picked.

## Files

- `src/app/App.js` — `viewAsScope` state (+ `setViewAsRole` wrapper that resets it),
  `viewAsAltitude`/`viewAsScopeLabel`/`viewAsScopeOptions` derived from `altitudeForRole()` +
  `STORE_NAMES`/`supervisorGroups()`, threaded to both the `AppTopbar` props block and the
  `CuratedHomePanel` render call.
- `src/app/shell.js` — `AppTopbar`/`ViewAsBanner`/`ProfileMenu` all gain the 4 new props; the
  second select + the banner's "@" tag.
- `src/views/curated-home.js` — `summarizeStores()`, `scopedBrief` memo, every downstream
  `brief.stores`/`brief` reference swapped to the scoped version, the `scopeTag` chip.
- Tests: `src/__tests__/dispatch-view-as-scope-2026-11-08.test.js` (AppTopbar/ProfileMenu/banner
  render-level), `src/__tests__/curated-home-view-as-scope-2026-11-08.test.js` (the actual
  filtering correctness — narrows to one store, one patch, an honest all-clear for a scope with
  no real stores). Confirmed no regression against the two pre-existing sandbox test files
  (`dispatch-view-as-role-sandbox-2026-11-05.test.js`, `dispatch-profile-menu-restore-session-
  2026-09-19.test.js`).

## Status

Shipped. Full suite 7206/7206, `npm run build` clean (678.61 KB eager payload, within the 850 KB
budget).
