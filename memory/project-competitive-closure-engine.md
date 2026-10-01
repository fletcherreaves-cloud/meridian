# Competitive / Own-Store Closure Impact Engine (2026-10-01)

## Why this exists

The 2026-09-30 dispatch (chat analysis, logged separately) measured Sonic's Oct-Dec 2025
closure in Holdenville by hand: a flat before/after comparison said +22.5% to Holdenville's
sales, but running the IDENTICAL calculation on 7 other district stores with no competitor
event at all showed the whole district running +11.3% hot that quarter against the same
flat-growth baseline — a seasonal artifact, not competition. The real, control-adjusted
effect was closer to +6-16% and faded over the quarter.

`computeEventFactors`'s existing per-store trimmed-DOW-mean calc (`src/utils/events.js`) is
exactly this naive before/after method, single-store. It's the right tool for a one-day event
that hits every store the same way (weather, a game, a holiday) — it is the wrong tool for a
multi-week closure, because there's no way for a single-store calc to net out "what was the
rest of the district doing that quarter anyway."

## What was built

`src/engine/competitive-closure.js` — a difference-in-differences engine using a synthetic
control group, the standard econometric approach for this exact problem (Abadie, Diamond &
Hainmueller's synthetic control method). Scoped to exactly two event types:
`CLOSURE_EVENT_TYPES = ['comp_closure', 'own_closure']`.

- **`pickControlPool`** — same-state stores (via `INV_ORG_COORDS`), excluding the treated
  store and any candidate with its own overlapping contaminating event
  (`comp_closure`/`comp_new`/`own_closure`/`construction`/`road_closure`) in the analysis
  window.
- **`computeClosureImpact`** — fits non-negative, simplex-constrained weights (`w≥0, Σw=1`)
  over the control pool via projected gradient descent (pure JS, no new dependency — the
  problem is small: a handful of donors, a few dozen weekly pre-periods) to best match the
  treated store's own pre-event weekly sales trend, then compares the treated store's actual
  post-event path against what that synthetic control implies. Reports weekly impact (so a
  decaying effect, like the real Sonic finding, shows up week-by-week rather than flattened to
  one number), a flat-average cross-check alongside the fitted weights, pre-fit R²/RMSE, and a
  coarse high/moderate/low confidence rating (deliberately not a bare float — a 0.62 vs 0.58
  pre-fit R² isn't a meaningfully different trust level to someone deciding how much to lean on
  the number, and a single decimal invites the same false precision the naive 22.5% did).
  Fails soft (`ok:false` + a `reason`) on insufficient data at every stage rather than throwing
  or guessing.
- **`summarizeClosureFactor`** — reduces a result to the single clamped scalar (±25%, matching
  the ceiling the other two `_evFactor` paths in `forecast.js` already enforce) that slots into
  `settings._eventFactors[loc][type]`.
- **`projectAnalogImpact`** — for a closure with no post-period data yet to measure (e.g.
  Braum's/Pauls Valley, still ongoing), maps a different closure's already-measured weekly
  decay curve (e.g. Sonic/Holdenville's) onto the target store's own growth-adjusted baseline,
  matched by week-offset-from-closure-start. This generalizes the by-hand Pauls Valley
  projection from the 2026-09-30 chat analysis.

## Wiring

`src/utils/events.js`'s `computeEventFactors` calls `_applyClosureFactors` at the end of its
existing per-store loop. For each loc with a `comp_closure`/`own_closure` tag spanning ≥7 days
(below that, a single-day tag isn't what this engine is for — left on the naive calc), it runs
`computeClosureImpact` with the SAME `userEvents` the naive loop already has, and overwrites
`factors[loc][type]` only when the result is `ok` and NOT low-confidence. Everything else
(every other event type, every closure tag the engine can't confidently measure) is untouched
— the naive calc stays the fallback, never removed.

No forecast.js change was needed: `_evFactor`'s "learned historical impact" tier already reads
`settings._eventFactors[loc][t]` directly (`forecast.js:1744`), and every call site that builds
`_eventFactors` already threads the same `userEvents`/`settings._userEvents` object through to
`computeEventFactors` (`projections.js`, `at-a-glance.js`, `analytics.js` ×2, confirmed by
grep). The closure engine's override sits transparently inside the existing priority chain:
Event Impact Registry (curated, store-measured) > learned (`_eventFactors`, now
control-corrected for closures) > stored expected-impact.

New event type: `own_closure` added to `constants.js`'s `EVENT_TYPES`/`EVENT_TYPE_GROUPS`
('🏪 Store Events')/`EVENT_TYPE_VISIBILITY` (`'calendar'` — planned ahead, customer-facing,
grouped with `road_closure`/`construction` rather than the short operational-incident types
above it).

## Deliberately deferred (not built this pass)

- **Sibling-store displaced-demand modeling for `own_closure`'s reverse direction.** When OUR
  store closes for remodel, some of its demand likely shifts to nearby sibling stores — the
  mirror image of what this engine measures for a competitor closing. `computeClosureImpact`
  can already measure this if a sibling's loc is passed as `loc` (the function doesn't care
  *why* the treated store's environment changed), but there's no dedicated helper that
  auto-identifies "which siblings are near this closing store" the way `pickControlPool`
  auto-identifies controls. Scoped out because it needs a real distance/overlap model
  (`INV_ORG_COORDS` lat/lng alone is a coarse same-state proxy, not drive-time) — worth
  building once there's a real `own_closure` case to validate it against.
- **Dedicated ad-hoc UI/report surface.** This pass wires the engine into the forecast path
  only (`_eventFactors` → `_evFactor` → the forecast number itself). There's no new panel
  showing "here's the measured closure impact, confidence, and weekly curve" — that data is
  only visible today by calling `computeClosureImpact` directly (as the by-hand chat analysis
  did) or by noticing the forecast moved. A Visit-Readiness/Signals-style surface for this is a
  reasonable follow-on once there's been more than one real `own_closure` to show.
- **Smart Targets `excludeDates` auto-detection.** Smart Targets' trailing-average models don't
  currently know to exclude a closure window from their baseline the way they might exclude a
  known outage. Not addressed here — the closure engine feeds `_eventFactors`/forecast only,
  not Smart Targets' separate trailing-median calc.

## Test coverage

`src/__tests__/competitive-closure.test.js` — 15 tests: core DiD recovery (true lift vs.
confounded naive deviation, using an independent hand-rolled naive calc so the "DiD beats
naive" assertion isn't circular), pre-fit R², weekly decay capture, soft-fail paths,
`pickControlPool`'s state/contamination filtering, `summarizeClosureFactor`'s clamp, and a
`computeEventFactors` integration test exercising the full real-store wiring (real OK loc
codes, so `pickControlPool`'s `INV_ORG_COORDS` lookup runs for real) — this is the one test
that would fail if `_applyClosureFactors`'s wiring into `computeEventFactors` were reverted.

One bug found and fixed in the fixture itself while building this: `buildFixture`'s original
default `baseDaily` only had keys for the default loc names (`T1/C1/C2/C3`); calling it with
different loc codes (real OK store numbers, for the integration test) without overriding
`baseDaily` silently produced `undefined * dowFactor = NaN` for every row, which
`metric-source.js`'s `_ok(v,'pos')` check discards — so every store had zero resolvable sales
days and `computeClosureImpact` correctly reported `no_treated_data`. Not a bug in the engine;
fixed by generating a default `baseDaily` keyed off whatever locs are actually passed in.
