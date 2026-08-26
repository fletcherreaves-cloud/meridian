# Dispatch #143 — Print/export for the 3 highest-value gaps: At A Glance, Signals, Security Panel

**Context (2026-08-26):** Yesterday's sweep (dispatch #139's investigation) found only 5/56
`src/views` panels import `ExportDropdown`; ~17 have no print/export mechanism at all despite
showing tabular/reportable data. Owner approved doing this work today while traveling: *"Could
definitely be done while I'm traveling and teaching class."* Scoped to the 3 highest-value gaps
from that sweep rather than all 17 — keep each dispatch a size one engineer can actually finish
and verify well in one pass; the rest of the 17 stay backlog for a future opportunistic pass or a
follow-up dispatch.

## Panels in scope, and why they're the highest-value gaps

1. **`src/views/at-a-glance.js`** (2926 lines) — the main dashboard, heavily tabular (KPI tiles,
   store rankings, movers). No export mechanism of any kind today.
2. **`src/views/signals.js`** (1747 lines) — correlation/signal data tables (Scanner results,
   Signal Lab, LiveOps tracking). No export mechanism today.
3. **`src/views/security-panel.js`** (1080 lines) — findings table. No export mechanism today.
   ⚠️ Also just touched by dispatch #139 (patch-scope live-data fix, `scopeMatches`) — read that
   recent diff first so print/export work doesn't collide with it.

## Pattern to follow — established across dispatches #122/#129/#134/#136, do not invent a new one

`ExportDropdown` (imported from `store-dash.js`, lazy per the established pattern — see
`record-day.js`'s or `dt-speedofservice.js`'s recent import for the exact shape) for CSV/data
export, plus a full-content printable HTML report (`generateAndPrint()`/`buildPrintHTML()`-style
function, see any of the four prior dispatches for the shape) — never bare `window.print()`
against a scrolled container (the "only captures what's currently visible in the scrolled
viewport" trap dispatch #122 diagnosed and fixed; still applies to these three panels' own
scrollable regions).

For each panel:
- **At A Glance**: the print/export should cover whatever's currently in view given the active
  location scope and date range — KPI tiles' current values, the store-ranking table in full (not
  just what's scrolled into view), and the movers strip. State your call on how much of this
  dense a dashboard to include in one printable view vs. splitting into sections — this is a
  real design decision, not a mechanical one; a print output that's illegibly dense is not useful.
- **Signals**: export/print should cover the currently-active tab's data (Scanner results table,
  or Signal Lab's configured signals, or LiveOps — whichever tab is active when triggered) with
  the underlying numbers present, not just a rendered chart image.
- **Security Panel**: export/print the current findings table, respecting whatever filter/scope
  is active.

## Do NOT

- Do not touch dispatch #139's `security-panel.js` patch-scope fix (`scopeMatches`) or any
  scoring/finding-detection logic in any of the three panels — this is print/export only.
- Do not use bare `window.print()` on a scrolled container.
- Do not attempt all 17 panels from the original sweep — these 3 only.

## Verification bar

- Trigger print/export on each of the 3 panels and confirm the underlying numbers (not just
  chart images) are present in the output, and that a filtered/scoped view's export reflects that
  scope, not an unfiltered dump.
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean; report before/after entry-chunk size.
