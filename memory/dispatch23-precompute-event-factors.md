# Dispatch23 §1 — the forecast precompute job ignored events, fixed and measured

2026-08-19. `memory/dispatch-23.md` (PR #416) found a real gap in #415's
`scripts/forecast-week-precompute.mjs` while grounding the dispatch — not
something #415's own review caught.

## The bug

`forecastDay(loc, d, ds, {}, null, t)` — the script called `forecastDay` with
an **empty settings object**. `forecastDay`'s event-adjustment block
(`src/engine/forecast.js`, the `_evFactor` computation) reads
`settings._userEvents[loc][date]` and `settings._eventFactors[loc]`, and
short-circuits to `0` lift/dip whenever either is absent, or whenever
`settings.useEventRegistry` itself is falsy — **confirmed as a second,
independent way to reintroduce the same bug**, even with `_userEvents`/
`_eventFactors` populated correctly (see the "what I checked" section below).

Both were undefined in the original `cfg`. `_evFactor` folds directly into
`forecast` — the exact field the cache (`forecast_week_cache`) stores and
`weekProjections` reads. So a fully-cached store during a real tagged event
(a football game, a district holiday, a price change) silently showed the
UN-adjusted number, different from what the same store/day computes live in
the browser (which always builds
`cfg={...settings,_userEvents:userEvents||{},_eventFactors}`).

## The fix

The precompute script already fetched `labor_rows`/`qsr_daily_activity_rollup`/
model overrides live (per #415). Added the same pattern for events:

- `org_events` (all rows) → `orgEventsToDayMap()` (imported from
  `src/engine/events-import.js` — the same function `App.js`'s own startup
  hydration effect calls) → `userEvents`.
- `event_impact` (all rows) → the same per-store × event-type map shape
  `App.js`'s `_stEventImpact` builds → `setEventImpact()` (the module-level
  cache `forecastDay`'s `_evFactor` checks FIRST, before the learned/computed
  factors).
- `computeEventFactors(ds, userEvents)` (imported from `src/utils/events.js`,
  pure) → `eventFactors`.
- `cfg = { useEventRegistry: true, _userEvents: userEvents, _eventFactors:
  eventFactors }` — passed to every `forecastDay` call.

Every piece is imported from the real engine, not hand-copied — same
discipline `supplementLaborWithSched`/`fetchRecentActual` already established
in #415, so a future change to any of this logic reaches the precompute job
automatically.

## Verified against real Supabase data — not just "the script runs"

Found a genuine tagged event: loc `35242` (Cottondale), "Cottondale High
School Football (Home)", `impact_magnitude: High`, `impact_daypart: dinner`,
`2026-08-21`. Compared `forecastDay`'s output for that exact store/date, same
real loaded `ds`, with vs without the fixed `cfg`:

| | forecast |
|---|---:|
| WITHOUT event cfg (the bug) | $9,648 |
| WITH event cfg (fixed) | $10,121 |
| delta | **+$473** (a real lift, matching the tagged "High" impact) |

## What I checked, not assumed — the fix's real-world reach today

**Every real store with a tagged event landing in the current business week
happens to be assigned the `ae`/`ewma`/`simple` model** at the weekly
horizon. Read `forecastDay`'s own branching directly:
`_assignedModel==='ae'`/`'ewma'`/`'simple'` each **return early**, before the
function ever reaches the "Enhanced primary forecast" tail where `_evFactor`
is applied. This is a structural, pre-existing property of `forecastDay`
itself — **true in the live browser path too**, not something this fix
introduced or could have introduced. Confirmed directly: comparing with/
without the event cfg for Cottondale at its REAL assigned model (`ae`)
produced `delta: 0` — the store's actual live behavior. Only forcing
`forceModel:'dow'` (bypassing model assignment, the same mechanism
`ForecastAccuracyPanel`'s backtest uses) exercised the code path this fix
actually changed, which is how the $9,648 → $10,121 comparison above was
produced.

**What this means, stated plainly:** the fix is correct and necessary — a
store CAN be assigned `'di'`/`'dow'`/an engineered model at any time (model
assignment overrides are backtest-driven and can change per store), and for
those stores this was a real, silent divergence between the cache and live
computation. But its *observable effect on the district today* is smaller
than reading dispatch-23's framing alone would suggest, because the majority
of real stores currently sit on models that never consume event factors in
the first place. Recording this now so a future session doesn't re-discover
it and treat "the district didn't visibly change" as evidence the fix didn't
work.

## Tests

`src/__tests__/forecast-precompute-events.test.js` — two tests, both against
the real event shape found above (not a synthetic invented one):
1. The full real-shaped construction (`org_events` → `userEvents` →
   `eventFactors`) changes `forecastDay`'s output vs an empty cfg, using
   `forceModel:'dow'` to exercise the code path (same technique as the live
   verification).
2. Guards the specific way this could silently regress again: omitting
   `useEventRegistry:true` from `cfg` reintroduces the bug even with
   `_userEvents`/`_eventFactors` populated correctly — confirmed live before
   writing the test that this genuinely changes the outcome, not a
   speculative edge case.
