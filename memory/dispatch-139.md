# Dispatch #139 — Supervisor patch data has two sources of truth; the static one is stale
# ("Mary missing in Crew Schedule")

**Owner's report (2026-08-25):** *"Supervisor groups are in settings (new supervisor Mary is
listed there and the new division between her and Brad) Mary missing in Crew Schedule."*

## Root cause — confirmed by reading the code, not guessed

Meridian has TWO systems for "which supervisor owns which store":

1. **Live, time-aware, Settings-editable** — `src/views/management.js`'s
   `SupervisorAssignmentsEditor` writes effective-dated rows to `settings.orgAssignments`,
   which `src/app/App.js`'s settings-sync effect (`App.js:655-662`) pushes into
   `setLiveSupervisorGroups()`/`setLiveAssignments()` on every change, and persists to Supabase
   `org_config` (key `'app_settings'`). `src/constants.js`'s `supervisorGroups()`/
   `orgAssignments()`/`whoRan()`/`groupsAt()` read this. **Mary is genuinely live here the
   moment she's saved** — confirmed, this half is not broken.
2. **Static, hardcoded, stale** — `src/constants.js`'s `INV_ORG_COORDS[loc].sup` field, one
   hardcoded name per store (e.g. every FL store is still `sup:'Brad Denley'` — Mary appears
   nowhere in this map and nothing writes to it at runtime).

**`src/components/PanelControls.js`'s `buildLocationHierarchy()`/`LocationSelector` — the shared
component Crew Schedule Lookup and 8 other panels use for their location picker — builds its
entire Patch tier from source (2), the static map.** That's the whole bug: Mary is real in
Settings, invisible to every picker built on `INV_ORG_COORDS.sup`.

## Confirmed blast radius (investigated, not assumed — full call-site list in this dispatch's
## originating investigation, available on request if the engineer wants the raw grep)

**Reads ONLY the static field (will never show Mary until fixed):**
- `src/components/PanelControls.js:137,180` — `buildLocationHierarchy`'s Patch tier +
  `LocationSelector`'s patch label lookup. **This is the one Crew Schedule Lookup hits.**
- `src/views/security-panel.js:181,183` — `scope.level==='patch'` matching.
- `src/views/smg-voice.js:28,36,53` — patch filter AND the patch list itself.

**Reads live data FIRST but silently falls back to the static field when the live lookup misses
(will show Mary for stores she's explicitly assigned, but silently reverts to Brad/stale for any
store not yet in the live assignment set — a real correctness gap, not just missing coverage):**
- `src/views/analytics.js:2249` — `orgFilter` patch pill.
- `src/views/labor-tools.js:1461-1518` — `groupBy==='patch'` grouping map.
- `src/views/store-dash.js:2285` — `groupDim==='patch'` grouping.
- `src/engine/pipeline.js:552`, `src/views/inventory.js:320,347` — fallback-only display fields,
  lower priority (labels, not filters/scoping).

**Already fully correct (live-only, no fix needed):** `above-store-onepager.js`,
`bullseye-tile.js`, `dt-speedofservice.js`, `graded-visits.js`, `labor-analysis.js`,
`one-pager.js`, `smart-targets.js`, `visit-readiness.js` and others — these already read
`supervisorGroups()` directly. Good precedent to copy.

## Fix

The static `.sup` field should stop being a scoping/filtering source. Two real options, your call
which fits better (state your reasoning):
1. **Point `buildLocationHierarchy()` at live `supervisorGroups()` instead of
   `invOrgCoords[loc].sup`** — the fix that actually reaches Crew Schedule Lookup and every other
   `LocationSelector` consumer in one place. Likely the highest-leverage single change.
2. **Also fix the 3 fully-static consumers** (`security-panel.js`, `smg-voice.js`) and the 3
   silent-fallback consumers (`analytics.js`, `labor-tools.js`, `store-dash.js`) to prefer live
   `supervisorGroups()` the same way the already-correct panels do — copy their pattern, don't
   invent a new one.

`INV_ORG_COORDS.sup` itself can stay as a same-session-load default/seed if useful (it already
partly plays that role for `seedAssignmentsFromGroups`/`DEF_SETTINGS.supervisorGroups`), but no
panel should treat it as authoritative once live data exists — this dispatch's job is to make
every patch-scoped filter and grouping check the live source first, matching the panels that
already do it correctly.

## Do NOT

- Do not touch `orgAssignments()`/`supervisorGroups()`/`whoRan()`/`groupsAt()`'s own logic — it's
  already correct and time-aware; this is purely about who CONSUMES it.
- Do not rewrite `SupervisorAssignmentsEditor` (`management.js`) — the write path is confirmed
  correct.
- Do not touch `src/views/one-pager.js:481` or other pure display-of-already-resolved-data call
  sites — they're downstream of an already-live resolution, not part of the bug.

## Verification bar

- Add a store to Mary in Settings' Supervisor Assignments editor (or confirm against whatever
  test fixture proves the point) and show Mary now appears in: Crew Schedule Lookup's Patch tier,
  Security Panel's patch scope, SMG VOICE's patch filter, Analytics' org filter, Labor Tools'
  patch grouping, and Store Dashboard's patch grouping — the full confirmed blast radius above.
- Confirm a store NOT yet touched by any live assignment still resolves sensibly (either its
  `INV_ORG_COORDS.sup` seed value, since nothing conflicting exists yet, or explicitly
  "unassigned" — your call, state which and why).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean.
