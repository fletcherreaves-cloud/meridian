# Dispatch #31 — real click trace closes both open re-measurement items, with a correction

**Board (2026-08-19):** `main` at v5.070 (`d9c33e1`). All 7 workstreams shipped or dispatched.
This is not a new workstream — it's real Mac Mini click-trace data from v5.069, in production
usage, that answers the exact open item both dispatch #27 (PR #426) and dispatch #29 (PR #428)
named as unmeasurable from the sandbox ("this sandboxed session's browser can't reach Supabase").
**It corrects a specific claim on `main` and surfaces a second, larger problem the correction
didn't anticipate.**

---

## Correction to dispatch #27: the remount cost did NOT drop — it's the single largest cost measured

Dispatch #27 (`memory/dispatch-27.md`): *"For any store with a full `forecast_week_cache` hit,
weekProjections's dominant cost... is now a cache read, not a recompute — the specific 4.3s figure
almost certainly dropped since the plan was written."* That was a reasonable inference at the time
(no live data existed to check it against) — the real trace refutes it:

| Interaction | Count | Worst | Total |
|---|---:|---:|---:|
| `✕` (modal close) | 32 | 2493ms | **46,497ms** |
| `←` (route-panel back, Workstream E) | 2 | 1499ms | 2,869ms |
| `✕ Close` | 2 | 1431ms | 2,842ms |

**Modal-close alone is 46.5 of ~89.8 seconds of all long-task time in this session — 52% of
everything.** Averaging ~1453ms per close, worst 2493ms. Not a rounding error, not "almost
certainly dropped" — it is measurably the dominant cost in real usage, still.

**The route-panel back button costs the same as a modal close** (~1435ms avg over 2 clicks,
directly comparable to the 32-click modal average). This is worth naming plainly: Workstream E's
routing change did not touch this cost. `App.js`'s render gates
(`view==='command'&&!anyModalOpen&&!routePanel&&h(AtAGlance...)`) unmount `AtAGlance` for a route
panel exactly the way they unmount it for a modal — a route panel replacing the view still tears
`AtAGlance` down completely, so returning from one is a full remount, same as closing a modal.
E gave four panels URLs. It did not reduce this cost for them.

## A second, bigger finding neither dispatch #27 nor #29 anticipated: most of the cost isn't `weekProjections` any more

Named spans:

| Span | Calls | Worst | Total |
|---|---:|---:|---:|
| `compute:weekProjections` | 18 | 1277ms | **22,499ms** |
| everything else combined (`channelRows`, `svcEffective`, `ctrlEffective`, `autoItems`, …) | — | ≤39ms worst each | ~1,780ms |

React self-time (nested spans subtracted):

| Component | Renders | Worst | Total (residual self-time) |
|---|---:|---:|---:|
| `AtAGlance` | 58 | 2479ms | **65,715ms** |

**`weekProjections` accounts for only 34% (22,499 of 65,715ms) of `AtAGlance`'s own cost.** The
remaining **43,216ms — 66%, and larger than `weekProjections` itself** — has no named span at all.
Two honest possibilities, not distinguished by this trace alone:

1. **Cache coverage is incomplete for some of this district's 27 stores right now.** The cache-hit
   check in `at-a-glance.js:1575` (`weekDayKeys.every(dk=>_cache[loc+'_'+dk])`) requires the FULL
   current week present per store — a store with even one missing day falls all the way back to
   live `forecastDay` computation for that store. 18 `weekProjections` calls at ~1.25s average is
   consistent with a meaningful fraction of stores still missing full-week cache coverage, not
   with a clean full-cache-hit district.
2. **Even a full cache hit isn't free.** `weekProjections`'s own code runs `computeEventFactors`
   once, indexes `ds.qsrActSummaryRows` for the cloud-actuals patch, and maps over every store ×
   7 days regardless of cache status (`at-a-glance.js:1533-1569`) — none of that is instrumented
   separately, so its cost is invisible inside the single `compute:weekProjections` span, and
   whatever remains outside that span (React reconciliation over `AtAGlance`'s full render tree,
   the DOM commit itself) isn't measured by any span in this file at all.

**Either way, fixing `weekProjections` alone — even to zero — leaves roughly two-thirds of
`AtAGlance`'s real-world cost untouched.** That's a materially different problem than the one
Workstream A was scoped to solve.

## Scale, for context

`AtAGlance` render+commit is **65.7 of 71.7 seconds (92%)** of all measured React work in this
session, across 66 renders in one person's one session. This is not a rare edge case — it is the
dominant cost of using the app.

## What to do with this, concretely

1. **Instrument the cache-hit rate directly.** Add a counter or a `_mark()` around the
   `_cacheHit` branch in `weekProjections` (`at-a-glance.js:1575`) that logs (or exposes via the
   existing perf-trace mechanism) how many of the district's stores hit the cache vs. fell back to
   live computation, per render. This turns "possibility 1 vs. possibility 2" above into a
   measured fact instead of a guess — exactly the standing rule (*"measure it, don't reason about
   it"*) this session has already invoked three times.
2. **If cache coverage is the gap**: check `forecast_week_cache` freshness/completeness against
   all 27 stores directly (the precompute script, `scripts/forecast-week-precompute.mjs`, runs
   daily — confirm it's actually completing for every store, not silently partial).
3. **If cache coverage is fine and the cost is elsewhere**: the remaining 43s needs its own
   `_mark()` instrumentation around the uninstrumented parts of `weekProjections` (event factors,
   cloud-actuals indexing) and, separately, a Chrome Performance recording focused on the DOM
   commit itself (not JS compute) for an `AtAGlance` remount — this may be a React
   reconciliation/render-tree-size problem, which no amount of caching fixes.
4. **Don't treat Workstream E as having addressed the remount cost.** It didn't, and the trace
   shows it directly (route-panel `←` costs the same as modal `✕`). If the remount cost is worth
   fixing further, the `anyModalOpen`/`routePanel` unmount-and-rebuild pattern itself is the next
   place to look — not a new workstream to scope today, just a correction to what's already been
   marked "handled" in prior dispatches.

## What NOT to do

- Don't re-cite dispatch #27's "almost certainly dropped" framing for the 4.3s figure — this real
  trace supersedes it. Cite this dispatch's numbers instead.
- Don't assume the fix is "make `weekProjections` faster" without first measuring the cache-hit
  rate — two-thirds of the cost isn't even in that span, per the numbers above.
- Don't credit Workstream E with fixing the remount-on-close cost for the four routed panels — it
  didn't; the trace shows the same per-close cost for `←` as for `✕`.
