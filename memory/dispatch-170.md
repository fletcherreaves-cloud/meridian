# Dispatch #170 — Product Mix cloud data never populates: `loadPmixRows()` fetches ~2.5M rows on every open

## Owner report (verbatim, 2026-08-27)

> "not sure if product is supposed to be populating anything as of yet (v5.207) BUT SO FAR
> EVERYTIME I HAVE TRIED THE CLOUD DATA, IT HAS NOT POPULATED AFTER WAITING SEVERAL MINUTES"

## This is NOT the previously-fixed bug — a genuinely new, measured root cause

Confirmed by reading the live code first: `ProductMixPanel` (`src/views/labor-tools.js`) DOES
correctly call `ensureLazyFill('pmixRows')` — the wiring gap that caused an earlier, similar-
sounding symptom (v5.187/v5.188, "Cloud tab always showed 'No Cloud Product Mix Data'" because
`labor-tools.js` never called `ensureLazyFill` at all) is fixed and stayed fixed. This is a
different problem that has emerged since: **the table has grown too large for the loader's
unbounded default.**

**Measured live** (service-role key, `qsr_product_mix`, 2026-08-27): a query for
`date >= 400 days ago` (the loader's actual default window) returns **`content-range: 0-0/2526181`
— 2,526,181 rows.** The table's real data only starts 2026-01-01 (~237 days ago), so the 400-day
default is not really "the last 400 days" — it is "the entire table," and the entire table is now
2.5M+ rows and growing (two pulls/day × 27 stores × hundreds of items).

`src/lib/supabase.js`'s `loadPmixRows(daysBack = 400)` is the ONE loader for this data (confirmed
by grep — single call site, `App.js`'s `configureLazyFill({ loaders: { pmixRows: loadPmixRows } })`,
no arguments passed, so the 400-day default is what actually runs). It fetches via
`_pagedParallel`, which first runs an exact-count query, then either pages the result in parallel
(fast path) or falls back to a slow SEQUENTIAL fetch if the count query itself times out — and
dispatch #169's own measurement notes (`finding-pmix-item-correlations-2026-08-27.md`) already
recorded `count=exact` timing out with a `57014` statement timeout on this same table earlier this
session. Whether the count succeeds (as it did in this measurement, ~4.6s) or times out and falls
back to the sequential path, **either way the client ends up trying to pull ~2.5 million rows into
the browser on every single panel/tab open** — this is very plausibly (not yet certain — see
"verify" below) what "waiting several minutes, never populates" actually is.

## The mismatch that caused this

`ProductMixPanel`'s own UI never needs anywhere near 400 days by default: `cloudRange` state
defaults to `'30'` (a 7/30/90/180/'all' selector), and the range filtering (`cloudFiltered`, ~line
343) happens CLIENT-SIDE against the already-fully-loaded `ds.pmixRows` — i.e., the panel already
pulls everything up front and only displays a slice of it. **Do not simply shrink the loader's
default to something like 30 days, though** — `loadPmixRows` is also `ds.pmixRows`'s ONLY source,
and dispatch #169's Signal Lab/Scanner work (v5.215, just shipped) genuinely needs real historical
breadth for correlation (its own acceptance test pulled the FULL captured history for one item,
7,916 rows across ~237 days, to reproduce the Filet-O-Fish/Friday signal). A too-aggressive shrink
would silently break dispatch #169's correlation feature, and would also silently make
`ProductMixPanel`'s own `'180'`/`'all'` range options lie (they'd show whatever the reduced fetch
window happens to contain, not what the label promises, since there's no re-fetch-on-range-change
mechanism today — `cloudFiltered` only ever filters what's already in `ds.pmixRows`).

## Task

1. **Verify the actual cause first, live, before assuming the row-count theory is the whole
   story** (per this repo's "measure it, don't reason about it" standing rule) — reproduce the
   panel open with the real loader in a way that measures wall-clock time and confirms the browser-
   side fetch pattern (parallel-page count vs. sequential fallback), not just the server-side
   query timing already measured above. If the real bottleneck turns out to be something else
   (e.g. a specific slow page, a client-side processing step over 2.5M rows once fetched, a
   Supabase connection-limit throttle from firing thousands of parallel page requests at once),
   say so and fix that instead of assuming the row count alone explains it.
2. **Redesign so the fetch is actually scoped to what's needed**, not "fetch everything, filter
   client-side." Two consumers, two different needs — reasonable approaches (pick based on what
   step 1's measurement shows, explain the tradeoff in the PR):
   - Make `loadPmixRows` accept the SAME opt-in-scale pattern dispatch #169 just established for
     the Scanner (bounded-by-default, explicit-opt-in for the expensive path) — e.g. load a
     genuinely bounded recent window by default (enough to cover `ProductMixPanel`'s common
     30/90-day views without the 2.5M-row cost), and give Signal Lab's correlation work its own
     explicit, wider fetch path (it already pulls its own fixture/history for verification: reuse
     that same "ask for what you actually need" discipline instead of relying on the shared
     lazy-fill blob covering both).
   - Or: keep one shared load but make it genuinely date-scoped per the CALLER's actual need
     (`ProductMixPanel`'s `cloudRange` selection, Signal Lab's own correlation window) rather than
     a single fixed 400-day constant — this likely means `ensureLazyFill('pmixRows')`'s signature
     or the lazy-fill mechanism itself needs to accept a range, which is a bigger change to
     `metric-source.js`'s `LAZY_FILL_SOURCES` contract; only take this path if it's cleaner than
     the two-path option above once you've looked at both consumers' real needs.
   - Whichever direction: `ProductMixPanel`'s `'180'`/`'all'` range options must either genuinely
     fetch what they claim (even if slower, with a visible loading state) or be removed/relabeled
     if the new design can't honor them — never let the label silently lie about what's shown.
3. **Fix the `_pagedParallel` parallel-fetch pattern itself if it's part of the problem**: firing
   2,500+ concurrent page requests (2.5M rows ÷ 1000/page) from a browser is a real hazard
   independent of THIS table's size — check whether `_pagedParallel` caps concurrency anywhere, and
   if not, whether that's worth fixing generally (it's shared by all 10 of this function's callers
   per its own header comment) or narrowly scoping to this dispatch's actual fix. Use judgment;
   don't scope-creep into a general `_pagedParallel` rewrite unless the measurement in step 1 shows
   it's actually part of THIS bug.

## Verification

- Reproduce the reported symptom first (confirm it's real and measure its actual shape), THEN fix,
  THEN show the same measurement clean — per this repo's "reproduce a reviewer's/reporter's root
  cause before fixing it" rule.
- A render-based test against the real `ProductMixPanel` proving the Cloud tab populates within a
  reasonable bound (not "eventually," an actual assertion), plus a test proving dispatch #169's
  Signal Lab correlation feature (just shipped, v5.215) still gets the historical breadth it needs
  after whatever scoping change lands here — this fix must not regress the thing that shipped an
  hour before this bug was reported.
- Standard suite + build bar.

## Out of scope

- Any other lazy-fill source (`auditRows`, `wasteRows`) — this dispatch is `pmixRows`-specific,
  though if the root cause turns out to be in shared `_pagedParallel` code, note whether the other
  9 callers are at similar risk (don't fix them here, just flag it).
