# Dispatch #116 — FOB Analysis: mobile users can't see the Contributors table below the fold

**Owner's ask, verbatim (2026-08-25):** *"for FOB Analysis (Food Cost) > make the Root Cause
Priority Matrix and Waste Entry Discipline expandable on click. Problem is on mobile, cannot see
the results below. Optionally you could just add scroll bar. As I fire these off today, they do
not have to be the priority."*

## Root cause (confirmed by reading the actual component)

`FOBAnalysisPanel` in `src/views/analytics.js` — the modal's content wrapper is:

```
div({style:{flex:1,background:'var(--surf)',...,display:'flex',flexDirection:'column',
  overflow:'hidden',...}},
  titlebar,
  kpiCards(),
  // ── Root-Cause Priority Matrix ────────────────────────────────── (header text:
  //    '🎯 Root-Cause Priority Matrix — Top Coaching Opportunities', up to 8 rows)
  // ── Data Discipline (#209) ──────────────────────────────────────  (header text:
  //    '📋 Waste-Entry Discipline', up to 8 rows)
  // ── Contributors table ────────────────────────────────────────── (the FOB_COMP table)
)
```

Every block from the title bar through Waste-Entry Discipline is `flexShrink:0` (fixed height) —
fine on a desktop-height viewport. Only the final block (the Contributors table) is
`flex:1,overflowY:'auto'`. The ancestor sets `overflow:'hidden'`. On a short mobile viewport, the
fixed-height stack above the table (title bar + 5 KPI cards that wrap + up to 8 Root-Cause rows +
up to 8 Waste-Entry rows) alone can exceed the available height, squeezing the `flex:1` table
region toward zero — and because the ancestor clips (`overflow:hidden`), there is no way to scroll
down to reach it. That is exactly the reported symptom: the two matrices render, but the
Contributors table "below" them is invisible with no scroll affordance.

## Scope

Fix `FOBAnalysisPanel` only (`src/views/analytics.js`). Two acceptable approaches, per the
owner's own framing — pick whichever most directly fixes "can't see the results below" with the
least risk to the existing desktop layout:

1. **Preferred / simplest:** make the *entire* content column beneath the title bar scroll as one
   region (move `overflow:'hidden'`/the lone `flex:1,overflowY:'auto'` off the last block and onto
   a wrapper around kpiCards()+Root-Cause+Waste-Entry+Contributors-table together, or equivalent).
   This guarantees every section is reachable on any viewport height without adding new component
   state, and matches the owner's own "optionally just add a scroll bar" fallback.
2. **Also acceptable, per the owner's primary wording:** make the Root-Cause Priority Matrix and
   Waste-Entry Discipline sections individually collapsible/expandable on click (collapsed by
   default, or capped to a few rows with a "show more" affordance — this file already has that
   exact pattern via `showAllLocs`/`m.locBreakdown.slice(0,showAllLocs?999:10)` a few lines above,
   reuse it rather than inventing a new toggle idiom).

Either is fine; a combination (collapsed-by-default matrices *and* a scrollable column) is fine
too if it's cheap. Do NOT touch `FOBEOMPanel`, `computeFOBMetrics`, `FOB_COMP`, or any other panel
— this is scoped to the one modal's layout/overflow behavior.

## Verification bar

- Render `FOBAnalysisPanel` (or the app) in a real mobile-width **and short-height** viewport
  (e.g. Playwright `page.setViewportSize({width:390,height:660})`, iPhone-class) with enough FOB
  data that both the Root-Cause Priority Matrix and Waste-Entry Discipline sections render with
  several rows — confirm the Contributors table is now reachable (visible directly or by
  scrolling), not clipped with no way to reveal it.
- Confirm the existing desktop-width rendering is unchanged (no new clipping, no double
  scrollbars, KPI cards / row-click-to-expand-location-breakdown behavior in the Contributors
  table still works).
- `npm run build` clean, full `npx vitest run` suite passing at the same or higher count as
  `main`.
- Report before/after entry-chunk size (this repo's standing perf-budget rule) even though this
  change should be layout-only and near-zero bytes.

## Do NOT

- Do not change `FOB_COMP`, `computeFOBMetrics`, or any FOB dollar/percentage math — this is a
  pure layout/overflow fix.
- Do not touch the Base Food % tolerance work (dispatch #115) or the Waste-Entry Discipline data
  logic (`computeStoreDataDiscipline`, `#209`) — only how these sections are laid out/scroll.
- Do not add a global CSS rule for `.modal`/similar that could affect other fixed-overlay panels
  in this file — keep the fix local to `FOBAnalysisPanel`'s own inline styles.
