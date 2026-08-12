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
| Entry chunk (gzipped) | ≤ 850 KB | `npm run build` — enforced, see below |
| Time to populated tiles | ≤ 15 s cold | `?trace=1` |
| Any new panel | **lazy by default** | must emit its own chunk |
| Test suite | ≤ 5 s | `npm test` duration line |

Baseline set 2026-08-08 at v4.901: entry 2722.5 KB / 801.3 KB gzipped, 974 tests in 1.97 s.
Numbers move down over time, never up. If a change pushes a number up, that is stated in
the commit body with the reason — never left for the owner to discover on their phone.

**⚠️ Correction (v4.984, #207): the `gzip -c ... | wc -c` measurement line above is WRONG —
do not use it.** Measured, not assumed: a plain `gzip -9` recompression of the built
`index-*.js` comes in **~10 KB lower** than what vite/rolldown's own build reporter prints
for the identical file (831.60 KB reported vs 823.94 KB from `gzip -9`, vs 825.94 KB at
gzip's default level 6 — not just a compression-level gap, a different measurement method
entirely). Every gzip figure cited in this repo's commit history back to v4.901 is vite's
own printed number, not a recomputed one — so a script or habit that re-gzips the file
independently silently enforces a DIFFERENT, more lenient budget than the one actually being
tracked. **Budget enforcement is now code, not a convention to remember** —
`scripts/check-bundle-budget.mjs` (wired into the `build` npm script itself, so `npm run
build` runs it automatically in CI, deploy, and locally) runs `vite build` and parses ITS
own printed "index-*.js ... gzip: NNN.NN kB" line, then fails (exit 1) over 850 KB. This is
the fix for the very next bullet below ("read the build output") — headroom had fallen to
8.28 KB by v4.983 with build output printing a clean number the whole time; nobody needed to
have missed anything for it to reach that.

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
  like a free 124 KB and is not, because `pipeline.js` holds it in.) **Real instance, not
  hypothetical (#207, v4.984):** `App.js` already had `one-pager.js` (64KB) and
  `above-store-onepager.js` (55KB) behind `lazyPanel()` — correctly written, and still
  defeated, because `forms-library.js` and `report-subscriptions.js` (the panels that each
  statically import one of them) were THEMSELVES still static imports in `App.js`. The lazy
  wrapper was real; the module graph still had a static path to the same code one hop away.
  The warning printed on every build for an unknown length of time before anyone read it —
  exactly why this budget is now a code gate (`scripts/check-bundle-budget.mjs`), not a
  convention.
- **Measure before and after, and put both numbers in the commit body.** "Improved
  performance" is not a claim, it is a feeling. `3518.0 KB -> 2722.5 KB` is a claim.
- **A passing build is not a passing load.** A lazy declaration placed above its
  `lazyPanel` definition is a temporal-dead-zone `ReferenceError` at runtime and builds
  perfectly clean. Verify declaration order, not just compilation.
- **Suspect the bundle before suspecting the handler.** On Notes 61 the obvious suspect
  was the `visibilitychange` refresh; reading it showed it was already well guarded, and
  the real cause of all three reported symptoms was one number — parse cost.
- **Measure both sides of a before/after in the same session, on the same tree — never mix
  measurement sessions.** #230's own commit measured its "before" number by stashing the
  change and rebuilding on what was believed to be a clean `origin/main` checkout, but that
  checkout wasn't re-verified against a fresh, controlled back-to-back run — the number that
  shipped (820.18 KB → 721.82 KB, −98.36 KB) was off by ~2 KB on both ends from the owner's
  own back-to-back measurement on the real tree (818.02 KB → 721.87 KB, **−96.15 KB**,
  headroom 31.98 KB → 128.13 KB). Neither side's arithmetic was wrong — the baseline
  itself was measured in a different session than the after-number, which is exactly
  the failure mode this whole rule exists to prevent. Notably, the wrong delta (−98.36)
  landed suspiciously close to the isolated-98 KB figure the commit's own text explicitly
  warned not to quote — a coincidence worth treating as a red flag, not a confirmation,
  next time a "measured" delta lands suspiciously close to a number you already had in
  your head before measuring.

## Realization-ratio calibration (measured, 2026-08-12) — prose vs. code

**Prose and code compress very differently — size future wins by which one you're removing.**

| Change | Raw removed | Gzip realized | Ratio (gzip/raw) |
|---|---|---|---|
| #230 (MERIDIAN_CHANGELOG, prose) | ~257 KB | 96.15 KB | **0.373** |
| #207 batch 1 (code) | — | — | 0.0755 |
| #207 batch 2 (code) | — | — | 0.0566 |

Repetitive natural-language prose (the changelog array) realizes gzip savings at roughly
**5–6× the rate of removing code** from the entry chunk, because a large uniform prose blob
dominates the chunk's shared gzip dictionary far more than an equivalent amount of denser,
more-varied JS. **Do not budget a future code-only lazy-load win using #230's ratio** — size
it at the low end (0.057–0.076) instead. Concretely: #232's remaining candidates (~488 KB raw
of statically-imported panels + 195 KB of Chart.js) will NOT produce another ~96 KB win at
#230's ratio — expect roughly 28–37 KB at the code-realistic ratio. Still worth doing; just
don't sell it as "another #230."

## Eager-payload blind spot, confirmed and fixed (#244, 2026-08-12)

`check-bundle-budget.mjs` gated only on the entry chunk's own printed gzip line — blind to
every file `dist/index.html` `<link rel="modulepreload">`s, which the browser fetches just as
eagerly as the entry file, as separate HTTP requests, before the app can render anything.
#232 Finding 1 (#238) and Findings 2+3 (store-dash split) each flipped the entry-only number
in opposite, misleading directions — see the two entries above. #244 re-measured the #238
bracket independently (`gzip -9` on `1c6e4c7` pre and `3980e71` post) to settle it:

| | entry only | eager total (entry + modulepreload) |
|---|---|---|
| pre-#238 (`1c6e4c7`) | 698.99 KB | **854.81 KB — over the 850 KB budget** |
| post-#238 (`3980e71`) | 469.36 KB | **744.09 KB** |
| delta | −229.63 KB | **−110.72 KB** |

**The finding that matters isn't the smaller delta — it's that pre-#238 was already over
budget.** The old entry-only gate reported 127.66 KB of headroom on a build that was
actually 4.81 KB over the real 850 KB limit. It was passing an over-budget bundle. That
makes #238 the fix that took the app from over budget to under budget, not the cosmetic
−237 KB win its own commit described.

**Fixed, not recalibrated.** `check-bundle-budget.mjs` now parses vite's gzip line for every
chunk (not just the entry one), reads `dist/index.html` for the entry `<script type="module">`
and every `<link rel="modulepreload">` (explicitly excluding `rel="prefetch"` — idle-time, not
eager), sums their gzip sizes, and gates that sum. The 850 KB budget itself is unchanged — it
was always a proxy for bytes-parsed-before-interactive, which eager-total measures correctly
and entry-only did not. Reported headroom on the current tree dropping from ~365 KB
(entry-only, stale) to ~81 KB (eager-total, corrected) is **the number becoming true, not a
regression** — 365 KB of headroom against the entry file alone was never real headroom
against what the budget is meant to bound.

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
