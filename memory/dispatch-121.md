# Dispatch #121 — Forecasting Reference: update content, remove byline, convert to a route page

**Owner's ask, verbatim (2026-08-25, mobile screenshot):** *"Forecasting Reference > Need to
update to current > also remove the line with my name and title. And for reference, my title is,
Director of Strategy Planning and Improvement. > also it is in a very small panel, just go ahead
and convert to url page. > last version update was on v4.210. I feel like we have changed or
added some things to forecasting since then."*

## Where, confirmed by reading the actual files

`public/forecast-reference.html` — a **1470-line standalone static HTML document** (its own
`<html>/<head>/<style>`, not a React component), currently shown two ways: `App.js` (`showFcstRef
&& h(ModalShell, ...)`, ~line 3004) iframes it inside a small `ModalShell` (`maxWidth:1100`), and
that modal's own "↗ Open Full Page" button opens the same file directly
(`window.open('/forecast-reference.html', '_blank')`). `panel-registry.js`'s entry
(`{id:'fcst-ref', ..., kind:'test-kitchen', section:'forecasting', tkOrder:8}`) has no `route:true`
— confirmed not wired into the app's URL-routing system at all.

## Three real, confirmed problems — not assumed

1. **Stale byline, exactly as reported.** Lines ~403-405:
   ```
   Prepared by Meridian v4.210+
   Fletcher Reaves, District Manager
   Reference Date: June 2026
   ```
   The owner's title is wrong here (it's "Director of Strategy Planning and Improvement," not
   "District Manager" — given for the record, in case the correct title needs to appear anywhere
   else in the doc, e.g. the footer below). **Remove this whole line/block per the explicit ask**
   — do not just fix the title in place.
   - **Also check the footer** (~line 1465-1466): `Generated from Meridian v4.210+ source —
     <code>src/engine/forecast.js</code><br>Confidential — District Manager Internal Reference`.
     This isn't literally "the line with my name and title" (no name here), but it carries the
     same wrong role label and the same stale version tag. Fix or remove consistently with
     whatever you do to the byline — use judgment, but don't leave a second wrong "District
     Manager" reference sitting right below the one that was just removed for being wrong.
2. **Content is stale relative to the current forecast engine — confirmed, not just suspected.**
   Grepped the whole file for `simple`/`Simple`: **zero matches for the model itself** (only two
   incidental, unrelated uses of the word "simple" as an adjective). But `src/engine/forecast.js`
   has had a first-class `'simple'` model branch in `forecastDay()` since v4.532 (`if
   (_assignedModel==='simple'){...}`, confirmed at the `_assignedModel==='simple'` line) — the
   T3M/T6W/T3W trailing family that a 27-store backtest proved beats every engineered model for
   monthly store sales (v4.483, `memory/vision-and-roadmap.md` Workstream B Layer 3). This is a
   major, currently-undocumented model that has been live and propagated "engine-wide" (v4.532,
   `memory/simple-models-propagation.md`) for weeks. The existing "Model Types Overview" section
   (~line 486) and the model-specific sections after it (EWMA DOW, Adaptive Ensemble, Adaptive DI,
   Multi-Model Engine) need a new "Simple (Trailing T3M/T6W/T3W)" section alongside them, written
   at the same level of formula detail the existing sections use — not just a one-line mention.
   - **Also check** whether the Period-Total Scoreboard (v4.534, `runPeriodTotalBacktest` in
     `backtest.js`) belongs in this doc's existing "Model Assignment Guidance" section (~line
     1431) — it's a backtest/validation tool, not a `forecastDay()` calculation, so it may be
     legitimately out of scope for a document titled "all calculation formulas, model weights, and
     calibration parameters" (App.js's own subtitle for this panel). Use judgment; the Simple
     model itself is definitely in scope (it changes the actual forecast calculation), Period-
     Total Scoreboard is a closer call.
   - **Do the actual audit, section by section, against current `src/engine/forecast.js`** (and
     `backtest.js` where a section references backtesting/calibration) rather than guessing from
     changelog titles — the changelog tells you WHEN something changed, the current code tells you
     WHAT is actually true today. List what you found stale/missing in your PR, not just what you
     fixed, so a future pass has a paper trail.
3. **Cramped small-modal presentation, exactly as reported.** Convert this panel to a real URL
   route per this repo's now-standing panel-contract rule (`memory/panel-contract.md`) — flip
   `panel-registry.js`'s `fcst-ref` entry to `route:true`, wire it through `RoutePanelShell`
   instead of the current small `ModalShell`+iframe, following whatever pattern an existing
   `route:true` panel already uses (grep `panel-registry.js` for other `route:true` entries and
   read how their component is rendered in `App.js`/`shell.js` — don't invent a new wiring
   pattern). The underlying content can stay as the iframed static HTML file (rewriting 1470 lines
   of hand-authored formula documentation into a React component is not what was asked and is a
   large, unnecessary risk) — only the shell/routing changes. The existing "Download PDF"/"Open
   Full Page" header actions should still work (or "Open Full Page" may become redundant once the
   page itself has a real URL — your call, note which in the PR).

## Scope

`public/forecast-reference.html` (content + byline + version), `App.js`'s `fcst-ref` wiring, and
`panel-registry.js`'s `fcst-ref` entry. Do not touch `src/engine/forecast.js`,
`src/engine/backtest.js`, or any other panel's routing while doing this — read them to verify
content, don't modify them.

## Verification bar

- Render the converted route (`?panel=fcst-ref` or whatever URL scheme the existing `route:true`
  pattern uses) and confirm it opens as a full page, not a small modal, matching how another
  `route:true` panel behaves.
- Confirm the byline block is gone and the footer no longer states a wrong title.
- Confirm the version tag(s) reflect current reality (not a hardcoded "v4.210+" left in place) —
  state in the PR whether you made this dynamic (reading the live app version) or a manual bump
  that will go stale again like this one did, and why.
- Confirm the new Simple-model section is present and accurate against the actual
  `forecastDay()`/'simple' branch logic (not copied from a changelog description).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean.

## Do NOT

- Do not rewrite the entire 1470-line document from scratch — audit and update what's stale,
  don't redo what's already accurate.
- Do not modify `src/engine/forecast.js`/`backtest.js` — this is a documentation-accuracy and
  presentation dispatch, not an engine change.
- Do not leave a second wrong "District Manager" label in the footer while removing it from the
  byline — check both.
