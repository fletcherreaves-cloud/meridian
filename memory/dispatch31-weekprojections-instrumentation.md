# Dispatch #31 — real click trace: correction + cache-hit instrumentation

2026-08-19. `memory/dispatch-31.md` — real Mac Mini click-trace data from v5.069 in production
usage, closing the exact re-measurement gap both dispatch #27 (PR #426) and dispatch #29
(PR #428) flagged as unreachable from this sandboxed session's browser ("can't reach Supabase").
This is not a new workstream; it's a correction to a claim already on `main` plus the
instrumentation the dispatch asked for.

## Correction recorded

Dispatch #27's `memory/dispatch-27.md` said the 4.3s modal-close remount cost "almost certainly
dropped" once Workstream A's `forecast_week_cache` landed. The real trace refutes that: modal
close (`✕`) is still 46.5 of ~89.8s of all long-task time in the session (52%), and the new
route-panel back button (`←`, Workstream E) costs the same per click (~1435ms avg) — routing
gave four panels URLs, it did not touch the remount cost either one pays on close. **Cite
`memory/dispatch-31.md`'s numbers going forward, not dispatch #27's "almost certainly dropped"
framing.**

## What this session verified live, beyond what the dispatch itself could measure

The dispatch named two undistinguished possibilities for why `weekProjections` still costs
~1.25s/call even after Workstream A: (1) incomplete `forecast_week_cache` coverage forcing a
live `forecastDay` fallback for some stores, or (2) even a full cache hit isn't free. This
session's environment (unlike the sandbox that produced dispatch #27/#29) has confirmed
Supabase network access (CLAUDE.md's 2026-07-31 resolution) — so rather than leaving both
possibilities open, queried `forecast_week_cache` directly:

```
curl -G ".../forecast_week_cache" --data-urlencode "select=loc,dt" --data-urlencode "dt=gte.2026-08-10"
```

Result: **100% coverage** — all 27 stores present for every date 2026-08-19 through 2026-08-25
(the current business week, `weekStartDay=3`/Wednesday). **Possibility 1 is refuted for the
window checked right now**: the cache is not the gap. This points at possibility 2 — the cost is
in the per-store/per-day work that still runs regardless of cache-hit status (event factors,
cloud-actuals indexing, `fetchRecentActual`'s labor-row scan on every cache-hit day), or in
React reconciliation/DOM commit outside any span. Caveat stated plainly: this confirms coverage
*as of right now*, not necessarily at the exact moment the original trace was captured — the
daily precompute could have been mid-run or a store newly added at that time. That's why the
instrumentation below is permanent, not a one-time check.

## Instrumentation shipped (the dispatch's concrete ask)

**`src/utils/click-trace.js`**: new `count(name, n=1)` export — a discrete, untimed tally,
alongside the existing `mark()`. Needed because `mark()`'s own 1ms floor (documented in its own
header) would silently drop a cache-hit/miss count: reading a plain object is a handful of
lookups, not real work, so it would almost never clear 1ms and the count would vanish from the
report exactly when it's most useful (a clean 100%-cache-hit render). `count()` has no floor —
every call is tallied — and is included in `buildReportLines()`'s report under a new
`── counters ──` section, reset alongside `_tasks`/`_marks`/`_renders` in `mfClickTrace.reset()`.

**`src/views/at-a-glance.js`**'s `weekProjections` useMemo now reports, per render:
- `weekProjections:storeCacheHit` / `weekProjections:storeCacheMiss` (via `count()`) — exactly
  answers "how many of the district's stores hit the cache vs fell back to live computation,
  per render," turning the dispatch's "possibility 1 vs 2" into a measured fact on every real
  session, not just this one manual check.
- `compute:weekProjections:eventFactors`, `compute:weekProjections:cacheIndex`,
  `compute:weekProjections:cloudActualsIndex` — the three uninstrumented setup blocks the
  dispatch named directly ("the remaining 43s needs its own `_mark()` instrumentation around the
  uninstrumented parts of weekProjections").
- `compute:weekProjections:cacheReadDay` (wraps `fetchRecentActual`, the per-day call that STILL
  runs even on a full cache hit) vs `compute:weekProjections:liveForecastDay` (wraps the
  `forecastDay` fallback) — separates "cache hit but still not free" cost from "cache miss, full
  recompute" cost, which the single outer `compute:weekProjections` span couldn't distinguish.

No logic changed — every value wrapped in `_mark`/preceded by `_count` computes exactly what it
computed before; this is purely additive instrumentation, same posture as every other `_mark`
call already in this file.

## What NOT done (matches the dispatch's own "what NOT to do")

- Did not touch the `anyModalOpen`/`routePanel` unmount-and-rebuild pattern — the dispatch calls
  that "not a new workstream to scope today, just a correction to what's already been marked
  handled." Recorded here, not fixed here.
- Did not assume `fetchRecentActual`'s `locRows` fallback-filter (over `ds.laborRows` when
  `ds.laborByLoc` doesn't have the store) is the hidden cost — that's exactly the kind of
  "confident theory" CLAUDE.md's standing rule warns against forming before a fresh trace with
  the new marks confirms it. The new `compute:weekProjections:cacheReadDay` span will show
  whether it's real the next time someone runs `?clicktrace=1` against production.
- Did not re-run Workstream A's original 189-call/82s baseline claim — only dispatch #27's
  specific "almost certainly dropped" inference about it.

## Verified

- New `src/__tests__/click-trace.test.js` (4 tests) — `click-trace.js` had zero prior coverage;
  covers `mark()`'s off-by-default no-op/error-propagation contract and `count()`'s safety
  (never throws) — the properties that matter most for code that runs inside every real user's
  session whether or not they ever open `?clicktrace=1`.
- 1569/1569 tests pass (4 new). Build clean; `at-a-glance.js`'s own lazy chunk unaffected in any
  way that matters (121.90 kB / 33.13 kB gzip, in line with its prior size); entry-chunk budget
  511.99 KB / 850 KB (338 KB headroom).
- Did not re-verify the instrumentation against a live authenticated browser session — same
  limitation dispatch #27/#29 already documented (this sandbox's in-browser `fetch` to Supabase
  fails even though server-side `curl` — used for the cache-completeness check above — works).
  The next real-browser session with `?clicktrace=1` will be the first to see these marks in an
  actual report.
