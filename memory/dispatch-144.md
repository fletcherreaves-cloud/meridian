# Dispatch #144 — Convert the 4 panels with real correctness exposure to the standard
# LocationSelector, not just the cosmetically-inconsistent ones

**Context (2026-08-26):** Yesterday's sweep found only 9/56 `src/views` panels use the
standardized `LocationSelector` component; most of the other 47 already read live supervisor/org
data correctly through their own one-off pills/selects, so converting all of them is a pure
DRY/consistency nicety, not urgent. **But 4 of those 47 are different** — they were named
specifically in dispatch #139's blast-radius list as still having a **silent static-data
fallback** even after that dispatch's live-source fix landed: they read live data first, but
fall back to the stale `INV_ORG_COORDS.sup` seed for any store not yet covered by a live
assignment row, which is a real (if narrow) correctness gap, not just a style one. Converting
these 4 to `LocationSelector` removes the fallback entirely, since `LocationSelector`/
`buildLocationHierarchy` (post dispatch #139) is now live-only.

Owner approved this work today: *"Could definitely be done while I'm traveling and teaching
class."*

## Panels in scope (all 4, confirmed by dispatch #139's own investigation)

1. **`src/views/analytics.js`** — `orgFilter` patch pill (~line 2249), static fallback.
2. **`src/views/labor-tools.js`** — `groupBy==='patch'` grouping map (~lines 1461-1518), static
   fallback (dispatch #139 already fixed this call site's IMMEDIATE static read by switching it
   to live `supervisorGroups()` — re-read the current code before assuming what's left to do;
   this dispatch's remaining job may just be the `LocationSelector` UI conversion, not a data-
   correctness fix, since #139 may have already closed the gap here).
3. **`src/views/store-dash.js`** — `groupDim==='patch'` grouping (~line 2285), static fallback.
4. **`src/views/smg-voice.js`** — patch filter AND patch list (~lines 28-53), was **fully
   static** before #139 (not just a fallback) — re-read current code first, since #139's PR may
   have already touched this file too; confirm what (if anything) is left before assuming scope.

**Read dispatch #139's merged PR diff first** (`git log --oneline --all | grep -i
dispatch-139`, or just re-read each of these 4 files' current `.sup`/patch-handling code) to see
exactly what #139 already fixed vs. what's still a raw `INV_ORG_COORDS` read or a one-off
pill/select that isn't `LocationSelector` — do not assume the dispatch's original (pre-#139)
description of these 4 files still matches current `main`.

## Pattern to follow

`LocationSelector` (`src/components/PanelControls.js`), `mode:'progressive'` per this app's
standing convention (see `crew-schedule-panel.js`/`record-day.js` for recent, correct usage).
Per `memory/panel-contract.md`'s section 3: if a panel persists its scope in a different shape
than `LocationSelector`'s `{level,id}` value, translate at the UI boundary — do not migrate the
panel's stored/persisted scope shape to match the component (see `report-subscriptions.js`'s
`scopeToSelectorValue`/`selectorValueToScope` for the established pattern).

## Do NOT

- Do not touch any of these panels' actual metric computation/aggregation logic — this is scope-
  selector UI only.
- Do not assume dispatch #139 left these 4 files untouched — re-read current `main` first; only
  fix what's actually still broken/inconsistent, not what #139 already closed.
- Do not expand to the other 43 panels using their own (already-correct) ad-hoc pickers — those
  are out of scope for this dispatch.

## Verification bar

- For each of the 4 panels, confirm it now uses `LocationSelector` (not a raw `INV_ORG_COORDS`
  read) for its patch/org scope, and that a store recently reassigned to a new live supervisor
  resolves correctly with no fallback path remaining.
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean; report before/after entry-chunk size.
