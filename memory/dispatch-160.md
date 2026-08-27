# Dispatch #160 — Panel-contract adoption pass: Leadership + Store One-Pager

**Context (2026-08-27):** Owner request, same session as the FOB/week-picker fixes (v5.203):
*"let's go ahead and do our standard cleanup with location selectors and conversation to url
page and anything else schema driven that needs updating."* Read as: run the standing
`memory/panel-contract.md` checklist (CLAUDE.md's own "touching a panel for any reason? also
check it against the panel contract" rule) against `src/views/above-store-onepager.js` and
`src/views/one-pager.js` — both were just touched for the v5.203 FOB/week-picker fixes and are
about to be touched again by dispatch #158 (custom range picker) — this is exactly the
"opportunistic, not a mandate to sweep all panels" moment CLAUDE.md describes, scoped to these
two panels specifically, not a 101-panel audit.

**If "conversation to url page" means something more specific than `route:true` URL-routing
adoption (item 3 below), it wasn't clear from the owner's message as relayed — read it as
`route:true` per the panel contract's own definition, but flag in the PR body if that reading
seems wrong once you're in the code, rather than guessing further.**

## What already exists — read `memory/panel-contract.md` in FULL before starting

It documents exactly what to check, with two already-converted reference examples
(`labor-allocation.js`, `report-subscriptions.js` — read both as the "what good looks like"
comparison). Five checklist items:

1. **Shell** — `ModalShell` (overlay/backdrop) vs `RoutePanelShell` (route, no backdrop). Read
   both panels' current close-button/backdrop implementation and classify which they should be.
2. **Date mode** — presets-only / presets+custom (`DateRangeControl`) / period-anchored. Dispatch
   #158 is already adding a custom-range option to `above-store-onepager.js`'s presets — if that
   dispatch lands first, this dispatch inherits its choice (don't re-litigate); if this dispatch
   runs first, coordinate the same decision dispatch #158 would need (whichever engineer picks
   this up second should read the other's PR before deciding, to avoid two different answers).
   `one-pager.js` ALREADY has presets+custom (`rangeMode`, `customRange`) — check whether it
   already uses `DateRangeControl` or a hand-rolled equivalent, and convert if not.
3. **Scope/location** — `LocationSelector`. Both panels currently hand-roll their own All/OK/FL
   toggle + supervisor-patch `<select>` + store `<select>` (`above-store-onepager.js` ~line
   450-455; check `one-pager.js`'s equivalent). Per the contract's section 3 rule: `LocationSelector`
   owns the UI; if either panel persists its scope in a shape `LocationSelector` doesn't natively
   produce, write the two small translation functions at the boundary (mirroring
   `report-subscriptions.js`'s `scopeToSelectorValue`/`selectorValueToScope` pattern) rather than
   migrating stored/URL state to match the component.
4. **`route:true` fit** — neither `leader-one-pager` nor `one-pager` currently has `route:true` in
   `panel-registry.js` (confirmed 2026-08-27 — both are plain `kind:'nav'` entries with no route
   flag). CLAUDE.md notes only 13/101 panels are `route:true` today and that ratio is expected to
   stay low — this is NOT an instruction to flip both to routed. Evaluate each independently:
   does a shareable/bookmarkable URL genuinely make sense for this panel (e.g. "send someone a
   link to this store's One-Pager for this week")? If yes for either, convert it (shell swap
   included, per item 1); if not, say why not in the PR body rather than silently skipping the
   question.
5. **Mobile wide-table scrolling** — CLAUDE.md's panel contract note: wide tables need
   `overflowX:'auto'`, not left `hidden` or unset. Both panels have per-store breakdown tables
   (`above-store-onepager.js`'s drilldown rows, `one-pager.js`'s own tables) — check each renders
   correctly horizontally-scrollable on a narrow viewport, fix any that don't.

## Explicitly out of scope

- Dispatch #158's actual custom-range-picker feature work and DO/OM/Owner investigation — this
  dispatch is contract-conformance on the EXISTING UI, not new features. If both dispatches are
  in flight together, whichever lands second should rebase cleanly (they touch overlapping
  regions of the same two files — expect a real merge, not just a squash-history conflict, and
  resolve it by reading both diffs, not by picking one side blind).
- Dispatch #159's auto-fill KPI investigation — unrelated file (`review-engine.js`).
- Any OTHER panel beyond these two — do not expand into a broader sweep.
- `ActionMenu`/`ActionMenus` adoption (contract item 4) — explicitly noted in the contract itself
  as "1/56 adoption... opportunistic, next time a panel with a real button-sprawl problem is
  touched" — only do this if one of these two panels genuinely has 3+ grouped actions that would
  benefit; don't force it.

## Verification bar

- New/changed unit tests pass (render-based, touching the real panel per this project's
  "verification must touch the call site" standing rule). Full
  `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk AND each panel's own lazy-chunk gzip
  (both are lazy-loaded — confirm that stays true).
- Check the mobile-scroll ratchet test (per CLAUDE.md's panel-contract note — find its exact name
  by grepping for the convention it guards, likely under `src/__tests__/`) and update its count if
  either panel's wide tables needed a fix.
- PR body must state, per checklist item (1-5 above): what was found, what was changed, and — for
  any item left unconverted — why, explicitly, not silently.
