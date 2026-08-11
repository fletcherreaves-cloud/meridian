---
name: project-instrument-fix-189
description: "#189 — the click-trace instrument couldn't decompose the ~8.6s startup block because its spans are nested, not additive; what was added and what's still not measurable without React Profiler"
metadata:
  node_type: memory
  type: project
---

# #189 — making the click-trace instrument additive

## The bug in the instrument, not the app

`App.js` and `shell.js`'s `AppSidebar` both measure render cost the same way: take `_rt0 =
performance.now()` at the top of the function body, then read `performance.now() - _rt0` inside a
`React.useLayoutEffect` callback. `<Profiler onRender>` doesn't survive this app's production
React build (already tested, v4.917 — recorded in `App.js`'s own comment), so this hand-rolled
approach is the fallback.

The problem: layout effects fire **bottom-up, in one synchronous burst, after the whole tree has
committed to the DOM**. Every component using this pattern therefore has its measurement window
ending at essentially the *same wall-clock moment* — the one commit flush — no matter how deep in
the tree it sits or whether it's a parent, child, or sibling of another instrumented component.
Two spans that both end at the same instant, but started at different times, are **nested, not
additive**: the later-starting one is *contained inside* the earlier-starting one's number, not a
separate cost sitting beside it. Reading `AppSidebar: 8647ms` next to `App tree: 8821ms` as "the
sidebar cost 8647ms" is exactly backwards — but it's an easy misread, and #189 records it
happening once already before the subtraction was done by hand: `8821 − 8647 = 174ms` is what
App's own render body actually cost; the 8647ms is *everything from AppSidebar's render start
onward*, which is the residual that still needed decomposing.

## What was added

1. **The same span pattern, one level deeper, on all 4 possible active-panel views** —
   `AtAGlance` (`at-a-glance.js`, the default landing view), `DistrictGrid`, `OrgView`
   (`store-dash.js`), `StoreDash` (`store-analytics.js`). Whichever one is actually mounted
   renders as a **sibling** of `AppSidebar` under `App` (not nested inside it — `AppSidebar` is
   literally just the nav sidebar), so subtracting its span from `AppSidebar`'s isolates
   `AppSidebar`'s own render body from whatever's downstream of it.

2. **Automatic same-commit correlation and subtraction** (`utils/click-trace.js`,
   `selfTimeLines()`) — rather than requiring a human to eyeball two numbers and subtract by
   hand (as the issue's own analysis had to), the report now finds, for every `App tree` commit,
   the render events for `AppSidebar` and whichever panel fired **within the same commit**
   (timestamps within 8ms — same-commit layout effects fire in one JS tick with no yielding, so
   this window comfortably separates same-commit events from the next distinct commit) and
   reports three self-time figures automatically: App's own body, AppSidebar's own body, and the
   active panel's residual (its own render + DOM commit + anything it renders beneath itself).

   Verified against a hand-simulated 3-level commit (App 8821ms / AppSidebar 8647ms / panel
   8100ms): the automated math reproduces the issue's own by-hand 174ms figure exactly, and the
   three self-time pieces sum back to the original 8821ms total.

## What's still NOT solved

- **The active-panel residual is not further decomposed.** If e.g. `AtAGlance` reports an 8000ms
  residual, that's still "AtAGlance's own render + DOM commit + anything AtAGlance itself
  renders beneath it," not broken down further. The issue's own ask (item 2, "instrument the
  active-panel path") is satisfied at the granularity of "which of the 4 top-level views," not
  deeper — going further requires knowing *which panel is actually slow* first (a live capture
  names it), then adding the same pattern to whatever's inside that specific view. Premature to
  guess before that capture exists.
- **DOM-commit time is still bundled with JS render time inside the residual.** Separating "React
  reconciling/calling render functions" from "the browser actually mutating the DOM" requires
  React's Profiler `onRender` callback, which this app's production build doesn't support
  (established, not re-litigated here — see `App.js`'s own comment on the v4.917 attempt). If a
  live capture shows a large, still-unattributed residual after this ships, the next real step is
  probably a *dev*-mode capture (where Profiler works) to at least characterize the commit-vs-
  render split, cross-referenced against the production self-time numbers.
- **Not measured live.** This sandbox cannot run the actual app in a browser against production
  data. The correlation math is verified against a hand-built simulated event list (see the
  commit body), not a real capture. The owner needs to re-run `?clicktrace=1` in production and
  paste the new `── self-time (nested spans subtracted, #189) ──` report section — per the
  issue's own ask, item 4: "re-capture, then open a targeted issue against whatever the
  decomposition actually names."

## Why this is genuinely useful even before that recapture

Before this: 3.7% of blocked time was attributable to named spans; everything else was two
non-additive numbers requiring the reader to already know they shouldn't be summed. After this:
the report does the subtraction itself and extends the decomposition one level past
`AppSidebar`, into whichever view is actually active — turning "App tree 8821ms, AppSidebar
8647ms, good luck" into three labeled, additive figures that sum back to the total, with the
residual now pointing at a SPECIFIC one of 4 components instead of an undifferentiated "the rest
of the tree."
