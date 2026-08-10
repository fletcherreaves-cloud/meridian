---
name: feedback-performance-budget
description: Standing rule — every change carries a speed check; performance is a feature and regressions are bugs. Plus the companion rule that manual data sourcing is always temporary. Both requested by the owner in Notes 61 (2026-08-08).
metadata:
  type: feedback
---

# Standing rule: speed is a feature, and a regression is a bug

Requested verbatim by the owner in Notes 61: *"we should include a firm speed check
policy to ensure we don't inadvertently introduce lagging and any other performance
degradation, perceived or otherwise."*

**"Perceived or otherwise" is the operative phrase.** A change that adds 200 ms to a
render is not defensible because a benchmark still passes. The owner uses this on a phone,
in a restaurant, between other apps. That is the environment to optimise for.

---

## The budget

| Surface | Budget | How to measure |
|---|---|---|
| Entry chunk (uncompressed) | **≤ 2.8 MB**, trending down | `ls -la dist/assets/index-*.js` |
| Entry chunk (gzipped) | ≤ 850 KB | `gzip -c dist/assets/index-*.js \| wc -c` |
| Time to populated tiles | ≤ 15 s cold | `?trace=1` |
| Any new panel | **lazy by default** | must emit its own chunk |
| Test suite | ≤ 5 s | `npm test` duration line |

Baseline set 2026-08-08 at v4.901: entry 2722.5 KB / 801.3 KB gzipped, 974 tests in 1.97 s.
Numbers move down over time, never up. If a change pushes a number up, that is stated in
the commit body with the reason — never left for the owner to discover on their phone.

## How to apply

- **Check the entry chunk after any change that adds an import to `App.js`.** A single
  static import of a large module silently costs every user on every load. This is the
  specific mistake that produced the 3518 KB chunk — 58 static imports accreted one at a
  time, each individually reasonable.
- **New panels are lazy. No exceptions.** `lazyPanel()` in `App.js` handles the chunk and
  the Suspense boundary. A static import of a panel is a bug.
- **A dead import costs full price.** Four unused imports in `App.js` were pulling all
  161 KB of `store-analytics.js` into the entry chunk. Bundlers do not tree-shake a
  module that is imported for its side effects. Remove imports when removing usage.
- **Check whether a dynamic import will actually split** before claiming a win. If any
  module in the static graph also imports the target, the chunk does not move — rolldown
  prints `INEFFECTIVE_DYNAMIC_IMPORT`. Read the build output. (`parsers/index.js` looks
  like a free 124 KB and is not, because `pipeline.js` holds it in.)
- **Measure before and after, and put both numbers in the commit body.** "Improved
  performance" is not a claim, it is a feeling. `3518.0 KB -> 2722.5 KB` is a claim.
- **A passing build is not a passing load.** A lazy declaration placed above its
  `lazyPanel` definition is a temporal-dead-zone `ReferenceError` at runtime and builds
  perfectly clean. Verify declaration order, not just compilation.
- **Suspect the bundle before suspecting the handler.** On Notes 61 the obvious suspect
  was the `visibilitychange` refresh; reading it showed it was already well guarded, and
  the real cause of all three reported symptoms was one number — parse cost.

---

# Companion rule: manual sourcing is always temporary

Also requested in Notes 61: *"We should routinely audit to ensure things don't wind up
here long term. Anything developed can be manual at first to establish, then we should
always automate the data or use existing data to feed it. Always make a priority to do
this."*

**`MANUAL_ONLY_METRICS` must stay empty.** It reached zero on 2026-08-07 and that is now
the resting state, not an achievement. A metric parked there is a metric that is blank on
every device except the one that did the upload.

## How to apply

- **Manual first is fine; manual permanently is not.** Shipping a metric from an Excel
  upload to prove it is worth having is good. It becomes debt the moment it works.
- **When adding any metric, name its automated source in the same commit** — even if the
  wiring lands later. "Which auto stream will feed this?" is part of the design, not a
  follow-up.
- **Audit on a cadence**, not on discovery. `MANUAL_ONLY_METRICS.length` and the
  `compute6wk` resolution count are both one-line checks; run them whenever touching
  `metric-source.js`.
- **A derivation counts as automated** if all its inputs are. `tpph`, `spph`, `avgRate`,
  `oppCostDollar`, `actVsSched` and `actVsSchedOpp` are computed from auto-pulled atoms —
  no new pull needed. Prefer deriving from existing auto data over adding a new manual
  upload. Check the arithmetic against an existing panel before trusting it.

Related: [[data-sourcing-standard]], [[feedback-measure-dont-reason]], and the Resolver
concept in [[notes-61-queue]] — the Resolver is the productised, auditable form of exactly
these two rules.
