# Dispatch #147 — Print/export for the next 3 highest-value gaps: Yearly Projections,
# Schedule Summary, Promo/Discount ROI

**Context (2026-08-26):** Follow-up to dispatch #143 (which covered At A Glance / Signals /
Security Panel, the top 3 of ~17 panels found lacking print/export). Re-swept `src/views/` today:
9/57 panels now import `ExportDropdown`. Filtered the remaining gap list down to panels that are
(a) real, currently-registered, user-reachable panels (not internal sub-components or
already-print-equipped views — `performance-reviews.js` was checked and already has a full
custom print system, `printReview`/`printCheckpoint`/`printBlankForm`; excluded) and (b)
genuinely dense/tabular, not primarily visual. Owner approved doing print/export work
opportunistically while unavailable (2026-08-26, teaching a scheduling class).

## Panels in scope, and why they're next

1. **`src/views/yearly-projections.js`** (308 lines, `panel-registry.js` id `yearly-proj`,
   `kind:'hub-tab'`, Planning hub) — the store-by-store yearly targets table. Directly relevant to
   today's own session (Delivery Wait/2nd Side/McDelivery Star Rating target fixes all live here).
   No export mechanism today.
2. **`src/views/schedule-summary.js`** (169 lines, `App.js` `ScheduleSummaryPanel`, Scheduling &
   Labor hub `tab==='summary'`) — the all-stores-at-once weekly LifeLenz schedule band (Labor %,
   Sched vs Fcst hours, TPMH, Fixed/Floor %). Genuinely dense: one row set per store, all 27 at
   once. No export mechanism today. Note: this file also exports `StationBreakdown`, reused by
   `schedule-retention.js` (dispatch #134) — do not touch that shared function's signature, only
   add export/print around the panel's own top-level render.
3. **`src/views/promo-roi.js`** (160 lines, `panel-registry.js` id `promo-roi`, `kind:'nav'`,
   `section:'operations'`) — per-store Promo/Discount ROI verdicts (pays/costs/neutral) with real
   dollar/pct figures. No export mechanism today.

**Explicitly excluded — do not add to scope:** `performance-reviews.js` (already has a mature
custom print system, not a gap); `top-bottom-performers.js` (real panel but `kind:'test-kitchen'`,
not yet promoted — per `panel-registry.js`'s own convention this is expected to stay small-scope
for a long time, not a gap to chase); any panel not in the list above.

## Pattern to follow — established across dispatches #122/#129/#134/#136/#143, do not invent a new one

`ExportDropdown` (imported from `store-dash.js`, lazy via `React.lazy` — see `at-a-glance.js`'s or
`signals.js`'s recent import from dispatch #143 for the exact shape) for CSV/JSON export, plus a
full-content printable HTML report (`generateAndPrint()`/`buildPrintHTML()`-style function — see
any prior dispatch for the shape) — never bare `window.print()` against a scrolled container.

For each panel:
- **Yearly Projections**: export/print the full store-by-store target table for whichever
  scope/filter is currently active — every target field currently rendered, not a curated subset.
- **Schedule Summary**: export/print the current week's (or whatever period is selected) all-store
  band in full — every store row, not just what's scrolled into view.
- **Promo/Discount ROI**: export/print the current verdict table (pays/costs/neutral per store)
  respecting whatever scope/filter is active.

**While in each file, also check it against `memory/panel-contract.md`** (close button via
`ModalShell`/`RoutePanelShell`, date picker mode, `LocationSelector`, wide tables scrolling
horizontally on mobile) per the standing "touching a panel for any reason" rule — bring it into
line only if it doesn't meaningfully widen this dispatch's blast radius; this is opportunistic,
not a mandate to rebuild any of the three panels' existing scope/filter UI.

## Do NOT

- Do not touch `performance-reviews.js` — it already has a real print system, out of scope here.
- Do not touch `StationBreakdown`'s signature in `schedule-summary.js` — `schedule-retention.js`
  depends on it exactly as-is.
- Do not use bare `window.print()` on a scrolled container.
- Do not expand beyond these 3 panels.

## Verification bar

- Trigger print/export on each of the 3 panels and confirm the underlying numbers (not chart
  images) are present in the output, and that a filtered/scoped view's export reflects that scope.
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean; report before/after entry-chunk gzip and eager-payload gzip.
