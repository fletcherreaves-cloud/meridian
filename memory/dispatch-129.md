# Dispatch #129 — FOB Analysis: fix print output (+ opportunistic panel-contract check)

**Owner's ask (2026-08-25):** *"Food Cost (FOB Analysis) needs print formatting appplied > as with
earlier requests, let's make sure as we are in panels today to sweep and update this as needed as
well to match our schema."*

## Root cause, confirmed by reading the actual component

`FOBAnalysisPanel` (`src/views/analytics.js:2965-3351`) already has a print button
(`btn({onClick:()=>window.print()...},'🖨 Print')`, ~line 3248) and an `ExportDropdown` (CSV/Excel)
next to it — this is NOT a "missing feature," it's a **broken print output**. Dispatch #116 (this
same session, already merged) wrapped this panel's KPI cards + Root-Cause Priority Matrix +
Waste-Entry Discipline + Contributors table in one shared `flex:1,overflowY:'auto'` scroll region
so mobile users could scroll to see everything on SCREEN. That fix now creates exactly the print
trap already diagnosed and fixed once this session for a different panel (dispatch #122, Events &
Tags): **a bare `window.print()` on a scrolled `overflow:auto` region only captures what's
currently visible in the viewport**, not the full scrolled content. So today, printing FOB
Analysis likely clips the Root-Cause Matrix/Waste-Entry Discipline/Contributors table to whatever
happened to be scrolled into view at print time — this is very likely exactly what "needs print
formatting applied" is describing.

## Scope — fix the print path

Follow the SAME pattern dispatch #122 just established for Events & Tags (`EventCalendar` in
`store-dash.js`) rather than inventing a third approach: build a real print affordance that renders
the FULL current result set (KPI cards, Root-Cause Priority Matrix, Waste-Entry Discipline,
Contributors table — respecting whatever location/month filter is currently selected) in one
unscrolled view for printing, instead of relying on native `window.print()` against the scrolled
container. Either a dedicated printable-HTML generator (this repo's other precedent:
`StoreOnePager`'s `generateAndPrint()`/`@media print` pattern, same file) or a `@media print`
stylesheet that temporarily un-scrolls the results region — pick whichever fits this panel's
existing structure with the least new code, consistent with how #122 made that same call.

## Opportunistic panel-contract check (owner's standing instruction, `memory/panel-contract.md`)

While in this panel, also check it against the standing conventions and fix what's actually
non-conforming — don't assume, verify each:
- Close (×) button — compare against `ModalShell`'s standardized close button; if hand-rolled,
  conform it.
- Date/month selector — `FOBAnalysisPanel` uses its own month `<select>`; check whether
  `DateRangeControl` (`src/components/PanelControls.js`) fits this panel's month-picking need or
  whether a month-granularity control is a legitimate exception (state your reasoning either way,
  don't silently leave it inconsistent without checking).
- Location selector — confirmed earlier this session this panel uses a flat `<select>`
  (all/ok/fl/per-store), not `LocationSelector`. Check whether converting it fits, given this
  panel's population is used for filtering, not multi-select drill-down.
- `route:true` — check `panel-registry.js`'s `fob-analysis` entry; it's already `goRoute` per
  App.js's `onOpenModal` wiring (confirm this — if already route:true, nothing to do here).

Don't do a mechanical conversion of every one of these if it doesn't fit — this is the same
"opportunistic, not a mandate to sweep" standing rule already in CLAUDE.md. State what you checked
and what you changed vs. left alone, with reasoning.

## Scope limits

`FOBAnalysisPanel` in `src/views/analytics.js` only. Do not touch `FOBEOMPanel` or other FOB-
related panels unless you find the identical print-clipping bug there too — if you do, flag it in
the PR as a follow-up rather than fixing it in this dispatch (keep this PR reviewable).

## Verification bar

- Load FOB Analysis with a filtered dataset large enough to have overflowed the scroll region
  before this fix (i.e., reproduce the actual clipping bug first), trigger print, and confirm the
  FULL current result set appears in the printable output — not just what was scrolled into view.
- State plainly what panel-contract items were checked and what (if anything) changed.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean.

## Do NOT

- Do not touch `FOBEOMPanel` or unrelated FOB panels.
- Do not change the CSV/Excel `ExportDropdown` behavior — only the print path.
- Do not undo dispatch #116's mobile-scroll fix — the screen-scrolling behavior stays, only the
  PRINT output needs to bypass it.
