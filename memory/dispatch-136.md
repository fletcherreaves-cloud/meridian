# Dispatch #136 — Speed of Service print/export + Record Day location picker,
# print/export, and recent-record highlighting

**Owner's asks (2026-08-25):**
1. *"Speed of Service > Great Job! > Let's add print/export abilities."*
2. *"Record Day Intelligence > Give me location picker and allow print and export options to
   carry that to format > also, not sure how to accomplish this thought in my mind, but let's
   figure out a way to highlight recent breaks on any method printed and displayed (either
   actually highlight, use a new record set chip or something that will look good)."*

Two independent panels, bundled into one dispatch since both are small, additive asks on panels
already touched this session (no shared files, safe for one engineer to do sequentially).

## Part 1 — Speed of Service print/export

`src/views/dt-speedofservice.js` (dispatch #128 just shipped the per-store target color bar here
— read that recent work first so you don't collide with it) has no print/export today. Add it
following this session's established pattern: reuse `ExportDropdown` for CSV/data export, and a
full-content printable report (the `extraHTML`/`generateAndPrint` pattern dispatches #122/#129/
#134 all just used — read one of those for the exact shape) rather than native `window.print()`
against a scrolled/chart-heavy layout, which would hit the same viewport-clipping trap those
dispatches already fixed elsewhere. The printable output should cover whatever's currently in
view: district/station summary, the per-store table with its color-banded targets, and the trend/
daypart chart data in tabular form (a chart image is fine too if straightforward, but the
underlying numbers must be present either way — a print output that's chart-only with no numbers
isn't useful).

## Part 2 — Record Day: location picker + print/export + recent-record highlighting

Confirmed by reading the file: `src/views/record-day.js` (`RecordDayPanel`) has **no location
filtering at all** today — grepped the whole file, no `LocationSelector` import, always computes
and shows every store's records. Dispatch #130 (already shipped) added print/export/`ModalShell`
conformance but not a location scope.

1. **Location picker** — add `LocationSelector` (`src/components/PanelControls.js`,
   `mode:'progressive'` per this app's standing mobile-usability convention) so the owner can
   scope the whole panel (all 6 tabs — Overview/Recent/Sales/Speed/DOW/Top Days) to one store, a
   patch/state, or all locations. Confirm `computeRecords()`'s existing scoring isn't
   store-agnostic in a way that breaks under a narrowed location set — it almost certainly already
   takes `stores`/`ds` and filters internally per-store, so this is very likely a UI-layer
   filter on top of already-store-keyed data, not an engine change; verify before assuming.
2. **Print/export carries the location scope** — dispatch #130's `ExportDropdown`/print-report
   wiring needs to respect whatever scope the new location picker sets, not always the full
   district. State how you threaded the scope through (a prop, a filtered `data` object before it
   reaches the export/print builders — whichever fits the existing dispatch #130 code shape with
   the least disruption).
3. **Highlight recent record-breakers wherever they appear, not just the "Recent" tab.** The owner
   explicitly left the exact mechanism up to you ("not sure how to accomplish this... highlight,
   use a new record set chip, or something that looks good"). `RecentBreakersTab`'s existing
   `windowDays` concept (already a real, working "how recent counts as recent" control per the
   panel's own UI) is the natural definition of "recent" to reuse — don't invent a second
   definition of recency. Options to consider (pick one or combine, your call, state reasoning):
   - A small "🏆 NEW" or "🔥" chip next to any record value (in Overview/Sales/Speed/DOW/Top Days)
     that was ALSO broken within the current recent-window, cross-referencing
     `data.recentBreakers` against whatever record entry is being rendered on each tab.
   - A distinct background/border treatment on that cell, consistent with this app's density-
     first, low-chrome visual language (not a loud badge that clutters a data-dense table).
   - Whatever you land on must survive into the PRINT output too (per the owner's explicit "on any
     method printed and displayed") — a hover-only or color-only signal that print strips out
     (e.g. relying purely on a background tint print might not render, see this session's own
     `print-color-adjust` finding from dispatch #129) doesn't satisfy "printed."

## Scope

`src/views/dt-speedofservice.js` (print/export only — do not touch dispatch #128's target-color-
bar logic) and `src/views/record-day.js` (location scope + print/export scope + highlight). Do
not touch `computeRecords()`'s scoring/record-detection logic beyond what's needed to filter by
location scope.

## Verification bar

- Speed of Service: trigger print/export and confirm the underlying numbers (not just a chart
  image) are present in the output.
- Record Day: select a single store via the new picker, confirm all 6 tabs narrow to that store's
  data, and confirm print/export reflects that same narrowed scope (not the full district).
- Record Day: confirm the recent-record highlight appears on-screen AND survives into the printed
  output (verify the actual print HTML/CSS, not just the live DOM) for a record that's genuinely
  in the recent-breakers window, and does NOT appear for an older record.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean.

## Do NOT

- Do not touch dispatch #128's Speed of Service target-color-bar/station-selector logic.
- Do not touch `computeRecords()`'s scoring logic beyond location filtering.
- Do not invent a second "how recent is recent" concept — reuse `RecentBreakersTab`'s existing
  `windowDays`.
