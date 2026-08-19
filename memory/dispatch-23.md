# Dispatch #23 — a precompute correctness gap, then Workstream B: event scope + recurrence

**Board (2026-08-19):** `main` at v5.064 (`a3f9711`). PR #415 (dispatch22, Workstream A) reviewed,
caught and fixed one real thing before merging (the branch was cut before PR #413 merged and would
have silently deleted `dispatch-22.md`/`MEMORY.md`'s index entries/the "three phases" note — caught
in the diff against current `main`, not the PR body, merged main into the branch first), migration
run, merged. Nothing else outstanding.

---

## 1. ⭐ Fix first: the forecast precompute job ignores events entirely

Found while reading `forecastDay` to ground this dispatch, **not something the #415 review caught**
— worth owning that directly rather than letting it sit undiscovered.

**The gap:** `scripts/forecast-week-precompute.mjs` calls `forecastDay(loc, d, ds, {}, null, t)` —
an **empty settings object**. `forecastDay`'s event-adjustment block
(`src/engine/forecast.js:1620-1651`) reads `settings._userEvents[loc][date]` and
`settings._eventFactors[loc]`, and short-circuits to **zero lift/dip** when either is absent
(`if(!_evTag || !settings.useEventRegistry) return 0`, line 1623). Both are undefined in the
precompute script's `cfg`. `_evFactor` folds directly into the `forecast` field
(`forecast = Math.round(lyAdjH * opsFactor * (1+wAdj) * (1+trendFactor) * (1+_evFactor) * ...)`,
line 1651) — the exact field `weekProjections` reads from the cache.

**The consequence:** for a fully-cached store, the At A Glance weekly total during a real event
(football game, a tagged price change, a district holiday) is silently **the un-adjusted number** —
different from what the SAME store would show computed live (the browser path still builds
`cfg={...settings,_userEvents:userEvents||{},_eventFactors}`, `at-a-glance.js:1528`). A
partial/missing cache falls back to live and gets it right; a full cache hit does not. This is
exactly the "a wrong number reaches someone" class CLAUDE.md names as the thing to catch before it
compounds — right now it's bounded (single user, and #415's own PR body was honest that no live
before/after was captured), but it gets **worse, not better, once Workstream B below lands**: B
grows the real event set from ~733 to ~11,000+ entries, so a store with an active event on more
days is more likely to hit this gap, more often.

**Fix:** the precompute script already fetches `laborRows`/`qsrActSummaryRows`/model overrides
live — add fetching `org_events` (or however Workstream B reshapes it) and building the same
`_userEvents`/`_eventFactors` shape the browser does (`computeEventFactors`, `src/utils/events.js:37`,
is already a pure function of `ds`+`userEvents` — importable here the same way
`supplementLaborWithSched` already was in #415). Verify the same way #415 verified the labor path:
pick a real (loc, date) with a known tagged event, confirm the precomputed `forecast` matches what
`forecastDay` produces live with the real event data, not just that the script runs without error.

Do this **before or alongside** Workstream B, not after — building B's bigger event set on top of a
precompute path that can't see events yet just widens the gap before anyone notices.

---

## 2. Workstream B — event model: scope + recurrence, expand on read

**Now unblocked.** The plan's interaction warning (`memory/plan-normalization-2026-08-17.md`) said
Workstream A had to land first, or `weekProjections` could get *slower* once the calendar carries
its real ~11,000 entries instead of the ~733 the pre-#391 bug was silently discarding. A shipped.
**One caveat, not a full clear:** `weekProjections` still calls `computeEventFactors(ds, userEvents)`
**unconditionally, once per render, regardless of cache status** (`at-a-glance.js:1527`) — Workstream
A only removed the O(events × 27 stores) `forecastDay` inner-loop cost for cache-hit stores, not the
O(events) indexing pass itself. Re-measure after B ships (the plan's own click-trace,
`_mark('compute:weekProjections', ...)`) rather than assuming A fully absorbed it.

**The problem, confirmed by reading the actual schema and write paths, not just the plan's framing:**

- `supabase/schema-org-events.sql`: `org_events`'s primary key is `unique(loc, date_start, label)`,
  and `loc` is `not null` with **no scope/wildcard concept** — a district-wide event is
  structurally required to be N separate rows, one per store, not one row that expands to N stores.
- `src/features/calendar.js:213`, `applyEventToStores` — the manual write path. For a district-wide
  tag it loops `locsToTag.forEach(loc=>{ cur[loc][dk] = {...same payload...} })`, writing the
  identical event object into `mf_events` once per store. This is the literal mechanism behind
  "27 copies of Thanksgiving."
  - **Design:** one event row + scope (`all` / `OK` / `FL` / an explicit store list); expand only
  the visible window; materialise only exceptions (the RFC 5545 model the plan describes).

**Prior art that already proves the recurrence half — read before designing anything new:**
`src/engine/retail-events.js`'s `RETAIL_EVENT_RULES` (line 78) + `expandRetailEvents()` (line 173)
already compute rule-derived dates on the fly, correctly, year over year (six rules generating
Black Friday, tax-free weekends, etc. — see the file's own header for the full chain and its
"measured lift beats assumed lift" standing rule). **The mistake, per the plan, is what happens
next:** `expandRetailEvents()` → `saveOrgEvents()` freezes the computed dates into static
per-store `org_events` rows — the same one-row-per-store problem as above, just reached by a rule
instead of a manual tag. The rule engine itself doesn't need reinventing; what needs to change is
that its output stops being materialized and starts being expanded on read, same as any other
scoped event.

**The read path that has to keep working:** `src/engine/events-import.js:146`,
`orgEventsToDayMap()` — downgrades cloud `org_events` rows into the per-day `mf_events` map shape
every consumer reads (`forecastDay`'s `_evFactor` at `forecast.js:1621`,
`computeEventFactors()` at `utils/events.js:37`). It already expands a **date range** into
per-day entries; it does not yet expand a **scope** into per-store entries. That's the piece to add
— ideally the only piece, so `forecastDay`/`computeEventFactors` need zero changes, matching the
"zero forecasting-logic change" discipline Workstream A already established for the same reason.

**Open design questions — decide before writing code, per the plan:**
1. **Per-store overrides.** If a district-wide event (scope `all`) is edited for one store (a GM
   marks it canceled locally, or adjusts the expected impact), where does that live? An exception
   row keyed by `(scope_event_id, loc)` is the RFC 5545 answer — confirm it fits `org_events`'
   existing consumers before committing to it.
2. **Rule-based and plain dated events in one schema.** `RETAIL_EVENT_RULES` needs to stay
   evaluable (a formula + a year in, dates out) while `applyEventToStores`'s manual entries stay
   literal dates. Both have to expand through the same `orgEventsToDayMap`-shaped read path so
   `forecastDay`/`computeEventFactors` see one consistent shape regardless of which produced the
   entry.

**Tracks:** #388.

---

## What NOT to do

- Don't touch `forecastDay`'s or `computeEventFactors`'s event-consumption logic — both already
  read a per-store, per-day map (`settings._userEvents[loc][date]`); the fix is upstream of that,
  in how `org_events` rows become that map. Same "zero algorithm change" discipline as Workstream A.
- Don't rebuild `RETAIL_EVENT_RULES`/`expandRetailEvents` — the rule engine is correct and already
  proven; only its materialize-then-freeze consumption needs to change.
- Don't defer the precompute event-factor fix (§1) to "after B" — do it first or alongside, since B
  is what makes the gap materially worse.
