# The Patch — the new front-facing DO/OM/Area Supervisor home screen (2026-11-07)

## Where this came from

Second real build from the "Four Decks" role-based home-screen exploration. Owner: *"go ahead
and build The Patch next."* Same turn, two forward-looking design asks, captured here and acted
on where concrete:

1. *"allow cascading roles to see views at or below their level through use of tabs or
   toggles."* Answered concretely for this tier: clicking any store in The Patch drills straight
   into that store's own real **Game Plan** (`GamePlanFormat`, reused directly, not a summary of
   it) — a DO/OM/AS sees exactly what their GM sees for that store, for real. This is the pattern
   to repeat when The Bridge is built (clicking a patch there should drill into that patch's own
   real The Patch).
2. *"for the Shift Scoreboard, eventually, let's allow customization as to what metrics should be
   shown... what would make a floor manager go 'wow'"* — not built yet (explicitly "eventually").
   Captured as task #122 with a concrete recommendation (favor divergence/flag signals —
   traffic-vs-sales divergence, staffing gap vs need, a binary cash-integrity flag — over more
   raw numeric tiles) for whenever it's picked up.

## What it's built on

Not a new data engine for the rollup/map/list — every field (`sales`, `vsLYSales`, `laborPct`,
`smgOsat`, `severity`, `flags`) is already computed per store by `assembleBriefStoreData()`
(`src/features/morning-brief.js`), reached via `brief.stores` directly rather than
`buildCuratedHomeItems()`'s pattern-grouped `items` — a territory map needs each store's OWN
status; `patternItems()` deliberately collapses that into "N of M stores flagging rule X," which
is right for a text list and wrong for a map.

**Every number is real or it doesn't render**, same discipline as Game Plan:
- `computePatchRollup()` (`src/engine/patch-plan.js`) **dollar-weights** the patch's vs-LY
  comparison — sums real $ and real implied-LY $ across only the stores with a genuine matched-
  day comparison, then takes ONE ratio. Never averages the per-store percentages directly, which
  would let a small store's swing outweigh the patch's biggest store (CLAUDE.md's standing
  "dollar-weight aggregates, never average averages" rule).
- Labor%/OSAT are a simple cross-sectional mean of today's already-resolved per-store values —
  a same-day snapshot across stores, not the time-series average-of-averages that rule warns
  about.
- A patch with zero real LY comparisons, zero labor data, etc. returns `null`, never `0` or
  `NaN` presented as if it were a real fact.
- `computePatchMap()` places stores using their **real `INV_ORG_COORDS` lat/lng**
  (`src/constants.js`), normalized into the patch's own bounding box — never a fabricated
  territory shape. A store missing real coordinates is dropped from the map, not guessed at.
- `rankNeedsAttention()` shows each flagged store's own real top flag headline; never a generic
  placeholder, never padded.

## Default + opt-out mechanics (generalized from Game Plan's)

`FORMAT_ALTITUDE`/`DEFAULT_FORMAT_BY_ALTITUDE` (`src/views/curated-home.js`) replaced the
single-purpose `STORE_ONLY_FORMATS` set Game Plan introduced — now a format can declare which
ONE altitude it's meaningful at (`gameplan` → `store`, `patch` → `patch`), and the default-
selection/visibility logic reads from that map generically instead of hardcoding a second
special case. Same "never override an existing saved preference" rule as Game Plan.

## Files

- `src/engine/patch-plan.js` (new) — `computePatchRollup()`, `computePatchMap()`,
  `rankNeedsAttention()`. Pure, unit-tested (`src/__tests__/patch-plan.test.js`).
- `src/views/patch-plan-view.js` (new) — `PatchPlanFormat` component, embeds `GamePlanFormat`
  for the drill-down.
- `src/views/curated-home.js` — generalized format-altitude logic, the `patch` branch, and a
  `storeLevelItems` memo (forces `buildCuratedHomeItems(brief, 'gm')` independent of the
  viewer's own role, so the drill-down has real per-store items to filter by store name).
- Tests: `src/__tests__/patch-plan.test.js` (engine), `src/__tests__/curated-home-patch-plan.test.js`
  (panel-level: default selection, saved-pref respect, the drill-down + back link, the altitude-
  visibility gate, the all-clear fallback). One pre-existing test
  (`curated-home-panel.test.js`'s area_supervisor altitude-label check) updated to explicitly
  select Checklist first, same pattern Game Plan's own PR already established.

## Deliberately out of scope for this pass

- The Bridge (district/VP/Owner/Admin) and Shift Scoreboard (SM/AM/DM) — not built yet.
- An "Operator" tier view (owner's own org concept — `operatorOf()`/`operatorGroups()` in
  `src/constants.js`, distinct from the supervisor-patch ladder) — owner asked to "dream up" a
  mockup for this, not build it for real; tracked as task #121, not acted on here.
- "Visits this week" / "avg visit readiness" style stats from the original mockup — would need
  real integration with the visit-readiness engine; dropped from this pass's rollup row in favor
  of only what's directly derivable from `assembleBriefStoreData()` without pulling in a second
  subsystem.
