# Dispatch #130 — Record Day Intelligence: add reporting/print/export (+ panel-contract sweep)

**Owner's ask (2026-08-25):** *"Record days needs reporting abilities and print/export/pdf > all
formatted per our schema."*

## Confirmed by reading the actual component — this is a real gap, not a broken feature

`RecordDayPanel` (`src/views/record-day.js:824`) has **zero** print/export/report capability
today — grepped the whole file: no `print`, no `Export`, no `ExportDropdown` import anywhere. It
also does not use the shared `ModalShell` — it hand-rolls its own overlay (`div({style:S.overlay,
onClick:closeOnBg})`) and its own close button (a bare `✕` button, ~line 863-866), not the
standardized one `memory/panel-contract.md` establishes. It is `kind:'optional'` in
`panel-registry.js` (not `route:true`).

The panel tracks sales-volume/speed/day-of-week/top-days records across 6 tabs (Overview, Recent,
Sales Volume, Speed, DOW, Top Days — see `TABS` const and the tab-body switch at
`record-day.js:883-889`), each backed by `computeRecords(ds, windowDays)`.

## Scope — build

1. **Print/export/PDF**, following this repo's established pattern (same family as dispatch #116's
   and #122's/#129's fixes this session, and `StoreOnePager`'s `generateAndPrint()` precedent in
   `analytics.js`) — a real printable view of the CURRENTLY SELECTED tab's content at minimum;
   consider (your call, state reasoning) whether a full multi-tab report (all 6 tabs in one
   printable document) is more useful than a per-tab print given this is a "look what we hit"
   report likely to be shared/posted, not just an operational panel. Add CSV/Excel export via the
   existing `ExportDropdown` component (`src/views/store-dash.js`, already used by
   `FOBAnalysisPanel` and others) — reuse it, don't hand-roll a new export mechanism.
2. **Panel-contract conformance** (owner's standing instruction, "sweep and update to match our
   schema" — see `memory/panel-contract.md`), while you're in this file:
   - Replace the hand-rolled overlay + `✕` button with `ModalShell` (or `RoutePanelShell` if you
     also convert this to `route:true` — see next point), matching the standardized close-button
     pattern other panels already use.
   - Consider converting to `route:true` — this is a reasonably substantial panel (6 tabs of real
     content) and the owner's standing instruction is to continue the URL-page migration
     opportunistically while touching each panel. If you do, follow an existing `route:true`
     panel's wiring pattern (`panel-registry.js` + `App.js`/`shell.js`) and update the
     `record-day` registry entry's `kind`.
   - Check the date/window control: the panel currently has its own `windowDays` selector (60-day
     default). Check whether `DateRangeControl` fits or whether a "rolling window in days" control
     is a legitimate exception (this isn't a from/to date range, it's a trailing-window size) —
     state your reasoning either way.

## Scope limits

`src/views/record-day.js` and its `panel-registry.js` entry only. Do not touch `computeRecords()`'s
scoring/record-detection logic — this dispatch is presentation/export, not a change to what counts
as a record.

## Verification bar

- Trigger print/export from at least 2 different tabs (e.g. Speed and Top Days) and confirm the
  output reflects that tab's actual current data, not a stale/wrong tab.
- If converted to `route:true`, confirm the panel is reachable via its own URL and the promotion
  test pattern (`memory/panel-contract.md`'s "the test is the contract" rule) actually renders it,
  not just that `section:`/`kind:` fields were set.
- State plainly what panel-contract items were checked and what changed vs. was left alone with
  reasoning.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean;
  report before/after entry-chunk size if `route:true`/lazy-loading changes were made.

## Do NOT

- Do not change `computeRecords()`'s record-detection/scoring logic.
- Do not remove the existing Reset Records functionality — export/print is additive.
