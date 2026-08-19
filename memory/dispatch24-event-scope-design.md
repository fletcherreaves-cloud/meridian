# Dispatch24 Workstream B — event scope + recurrence (#388), design + implementation

2026-08-19. `memory/dispatch-24.md` (PR #416/#417 already merged; this is the follow-on
Workstream B it describes) consolidates and supersedes dispatch-23.md §2.

## The problem, confirmed

`org_events`' PK is `unique(loc, date_start, label)`, `loc not null` — no scope/wildcard concept.
Both write paths materialize a district-wide event as N per-store rows:
- `applyEventToStores` (`src/features/calendar.js`) — manual multi-store hand-tagging, loops
  `locsToTag.forEach(loc => cur[loc][dk] = {...identical payload...})`.
- `expandRetailEvents()` → `saveOrgEvents()` (`src/engine/retail-events.js`) — the rule engine
  already computes the right dates + the right per-state store filter; the mistake is only what
  happens after: one full event object per matching store, frozen into the DB.

## Design decision: expand-on-read, not materialize-on-write (RFC 5545 model)

One event row + `scope` (`store` / `state` / `all` / `list`) + a resolved `scope_locs` store list,
expanded to per-store day-map entries only in `orgEventsToDayMap()` (the read path every consumer —
`forecastDay`, `computeEventFactors`, the Calendar Manager UI — already reads from). Per the
dispatch's explicit constraint, **`forecastDay`/`computeEventFactors` are unchanged** — they only
ever see `orgEventsToDayMap`'s output, same shape as before.

## RLS — the finding that changed the plan mid-flight

The obvious approach (add a permissive scope-aware SELECT policy) would have been a real
cross-tenant leak. `schema-org-events.sql`'s original per-row policies were **already dropped** by
`schema-multitenant-phase2-rls.sql`'s generic do-block (org_events is on that table list) and
replaced with tenant-only PERMISSIVE policies (`tenant_select`/`insert`/`update`/`delete`, gated on
`tenant_id = current_tenant_id()`). `schema-rls-phase2-loc.sql` then layered ONE RESTRICTIVE
policy (`org_events_loc_scope`) on top, checking `my_locs()` against `loc`. That restrictive/
permissive split is load-bearing (its own comment: "a permissive per-loc policy beside the tenant
ones would GRANT more access, not less" — permissive policies OR together, restrictive ones AND).

So the fix (`supabase/schema-org-events-scope.sql`) **replaces the one existing restrictive policy**
on `org_events` with a version that branches on `scope`: `scope='store'` keeps the exact original
per-row check (zero behavior change for the ~2,708 existing rows); `scope<>'store'` checks
`scope_locs` array overlap against `my_locs()` instead. No new permissive policy is added, so
tenant isolation is untouched.

`loc` stays `not null` and the existing `(loc, date_start, label)` unique constraint / upsert
mechanism is completely unchanged — `scope<>'store'` rows get a synthetic sentinel loc (`*ALL*`,
`*STATE:OK*`, `*LIST:<sorted locs>*`) that can never collide with a real (numeric) store loc. This
was the cheapest way to avoid touching `loc`'s constraint given ~2,708 rows already depend on it.

## Open design question #1 — per-store overrides

"If a district-wide event is edited for one store (a GM cancels it locally, or adjusts expected
impact), where does that live?" — a new `org_event_exceptions` table, keyed `(event_id, loc)`, the
RFC 5545 exception-instance answer. Kept as its own table rather than a column on `org_events`
because it's inherently per-store, so it reuses the exact same two-layer RLS pattern (tenant
permissive CRUD + per-loc restrictive) every other loc-keyed table already uses, unmodified — no
scope-branching needed there at all.

`orgEventsToDayMap(events, iconFor, exceptions)` is the only reader that knows about exceptions —
a `'canceled'` exception drops that one store's day-map entry (siblings in the same scoped event
untouched); a `'modified'` exception merges `overrides` onto just that store's entry. Passing no
`exceptions` (every pre-existing call site) is a no-op — full expansion, no skips — so this is
purely additive and every existing caller is unaffected.

**Shipped in this pass:** the table, RLS, the read-path expansion + exception application (tested),
and CRUD helpers (`loadOrgEventExceptions`/`saveOrgEventException`/`deleteOrgEventException`) in
`src/lib/supabase.js`. **Deliberately deferred:** a Calendar Manager UI affordance for a GM to
actually create an exception ("cancel for my store" button). The dispatch asked for the mechanism
and where it lives, not a UI — building one wasn't asked for and would have doubled this PR's size
for a feature with no caller yet. Tracked as the natural next slice once the UI need is confirmed.

## Open design question #2 — rule-based and manual events in one schema

Both already produce the SAME flat per-store event shape (`expandRetailEvents()`'s output and
`applyEventToStores`'s cloud-sync diff, via `diffUserEventsForCloudSync`) — that convergence
already existed and is NOT touched. The fix is a single new pure function,
`collapseScopedEvents(events, {allLocs, stateOfLoc})` (`src/engine/events-import.js`), inserted at
the two existing "about to call `saveOrgEvents`" call sites:
- `calendar.js`'s `approveBulk()` (the retail-events / bulk-import write path) — wraps
  `bulkPreview.events` before the `saveOrgEvents()` call. The flat array itself is untouched
  everywhere else (the review grid, the local `orgEventsToDayMap` hydration) — only what actually
  reaches the DB changes.
- `App.js`'s `syncUserEventsToCloud()` (the manual hand-tag path) — wraps `upserts` (from
  `diffUserEventsForCloudSync`) the same way.

`collapseScopedEvents` groups by `(dateStart, dateEnd, label, type, category)`; a group of 1 is left
completely alone (`scope:'store'`, byte-identical to today); a group of 2+ computes `scope` by
comparing the group's loc set against the full roster (`'all'`) or one state's full roster
(`'state'`), else `'list'` (an explicit, possibly-partial set — still ONE row, just no clean
state/district label). Per the dispatch's explicit constraint, **`expandRetailEvents` and
`RETAIL_EVENT_RULES` are not touched** — this only changes what happens to their output on the way
to the DB.

## Verified

- 11 new tests (`src/__tests__/events-scope.test.js`): `collapseScopedEvents`'s four scope outcomes
  (store/all/state/list) + independent grouping of two same-day events; `orgEventsToDayMap`'s scope
  expansion (a scope:'all' row reaches every store), a round-trip equivalence proof against the OLD
  flat-array behavior (every field an existing consumer reads matches exactly — scope/scopeState are
  the one deliberate, additive, harmless difference), and legacy `scope`-less rows behaving exactly
  as `scope:'store'`; the exceptions mechanism (canceled drops one store, modified overrides fields
  for one store, omitting exceptions is a no-op).
- Full suite: 1544/1544 pass (1533 + 11 new). Build clean, entry-chunk budget unaffected (509.80 KB
  gzipped vs 850 KB budget — these are engine/lib files already in the bundle, not new panels).
- **Not yet measured against live Supabase data** — this migration has not been run in production.
  Per this repo's own "measure, don't reason" rule: the owner needs to run
  `supabase/schema-org-events-scope.sql` before any of this takes effect; until then every code
  path here degrades to the pre-existing behavior (self-healing `saveOrgEvents` strip, `scope`
  defaults to `'store'` on read). Re-running `expandRetailEvents` → `approveBulk` for the ~733
  existing retail events after the migration lands will be the first real test of the ~27:1
  collapse ratio in production; that hasn't been done in this pass.

## What was NOT done (explicitly, per the dispatch's constraints)

- `forecastDay`/`computeEventFactors` — zero changes, confirmed by the round-trip test.
- `RETAIL_EVENT_RULES`/`expandRetailEvents` — zero changes; only wrapped downstream.
- `applyEventToStores` — zero changes; still loops per-store into `mf_events` locally (that's a
  local, not a DB, cost — collapsing happens where it actually matters, at the cloud-sync boundary).
- The `weekProjections` re-measurement the dispatch asked for after B ships (still calls
  `computeEventFactors(ds, userEvents)` unconditionally every render per `at-a-glance.js:1527`,
  independent of Workstream A's cache-hit fix) — deferred to its own pass once this migration is
  actually live and the real (collapsed) event count is known, so the re-measurement uses real
  post-collapse row counts rather than a guess.
