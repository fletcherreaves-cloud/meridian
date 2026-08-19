# Dispatch #24 — Workstream B: event scope + recurrence

**Board (2026-08-19):** `main` at v5.065 (`e718112`). Dispatch #23 §1 (the precompute event-factor
gap) shipped in PR #417, reviewed, merged. Nothing outstanding in the queue. **Workstream B is now
fully unblocked** — its own prerequisite (Workstream A landing first, so the calendar's real event
count doesn't slow `weekProjections` back down) shipped in PR #415, and §1's fix means the
precompute path now honors events correctly too, so B's larger event set won't quietly widen a gap
that's already closed.

This dispatch consolidates and supersedes `dispatch-23.md`'s §2 — read this one, not that one, for
Workstream B. §2's content is reproduced here with nothing new added; nothing in the repo touching
`org_events`/`calendar.js`/`events-import.js`/`retail-events.js` has changed since it was written.

---

## The problem, confirmed by reading the actual schema and write paths

- **`supabase/schema-org-events.sql`:** `org_events`'s primary key is `unique(loc, date_start,
  label)`, and `loc` is `not null` with **no scope/wildcard concept**. A district-wide event is
  structurally required to be N separate rows, one per store, not one row that expands to N stores.
- **`src/features/calendar.js:213`, `applyEventToStores`** — the manual write path. For a
  district-wide tag it loops `locsToTag.forEach(loc=>{ cur[loc][dk] = {...same payload...} })`,
  writing the identical event object into `mf_events` once per store. This is the literal
  mechanism behind "27 copies of Thanksgiving."
- **`src/engine/retail-events.js`** — `RETAIL_EVENT_RULES` (line 78) + `expandRetailEvents()`
  (line 173) already prove the recurrence half works correctly, year over year (six rules
  generating Black Friday, tax-free weekends, etc. — read the file's own header for the full
  chain and its "measured lift beats assumed lift" standing rule). **The mistake is what happens
  next:** `expandRetailEvents()` → `saveOrgEvents()` freezes the computed dates into static
  per-store `org_events` rows — the same one-row-per-store problem as above, just reached by a
  rule instead of a manual tag. The rule engine itself doesn't need reinventing; its output needs
  to stop being materialized and start being expanded on read, same as any other scoped event.
- **`src/engine/events-import.js:146`, `orgEventsToDayMap()`** — the read path that has to keep
  working. Downgrades cloud `org_events` rows into the per-day `mf_events` map shape every
  consumer reads (`forecastDay`'s `_evFactor` at `forecast.js:1621`, `computeEventFactors()` at
  `utils/events.js:37`). It already expands a **date range** into per-day entries; it does not
  yet expand a **scope** into per-store entries. That's the piece to add — ideally the only
  piece, so `forecastDay`/`computeEventFactors` need zero changes, matching the "zero
  forecasting-logic change" discipline Workstream A and dispatch23 §1 both already established.

## Design: one event row + scope, expand only on read

**Design (from `memory/plan-normalization-2026-08-17.md`):** one event row + scope (`all` / `OK` /
`FL` / an explicit store list); expand only the visible window; materialise only exceptions (the
RFC 5545 model). This is the standard, general answer to "one conceptual event, many stores" —
not something specific to this codebase.

**Open design questions — decide before writing code:**
1. **Per-store overrides.** If a district-wide event (scope `all`) is edited for one store (a GM
   marks it canceled locally, or adjusts the expected impact), where does that live? An exception
   row keyed by `(scope_event_id, loc)` is the RFC 5545 answer — confirm it fits `org_events`'
   existing consumers before committing to it.
2. **Rule-based and plain dated events in one schema.** `RETAIL_EVENT_RULES` needs to stay
   evaluable (a formula + a year in, dates out) while `applyEventToStores`'s manual entries stay
   literal dates. Both have to expand through the same `orgEventsToDayMap`-shaped read path so
   `forecastDay`/`computeEventFactors` see one consistent shape regardless of which produced the
   entry.

## Performance note — re-measure, don't assume A absorbed this

`weekProjections` still calls `computeEventFactors(ds, userEvents)` **unconditionally, once per
render, regardless of cache status** (`at-a-glance.js:1527`). Workstream A only removed the
O(events × 27 stores) `forecastDay` inner-loop cost for cache-hit stores, not the O(events)
indexing pass itself. Re-measure after B ships, using the plan's own click-trace
(`_mark('compute:weekProjections', ...)`), rather than assuming A fully absorbed the cost of B's
larger event set.

## Tracks

**#388.**

## What NOT to do

- Don't touch `forecastDay`'s or `computeEventFactors`'s event-consumption logic — both already
  read a per-store, per-day map (`settings._userEvents[loc][date]`); the fix is upstream of that,
  in how `org_events` rows become that map.
- Don't rebuild `RETAIL_EVENT_RULES`/`expandRetailEvents` — the rule engine is correct and already
  proven; only its materialize-then-freeze consumption needs to change.
