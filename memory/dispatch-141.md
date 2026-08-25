# Dispatch #141 — Training Retention: patch / operator / org / state rollup report ("who is
# driving this")

**Owner's ask (2026-08-25), same message as dispatch #140's follow-up items:** *"If possible do a
patch and operator/org/state rollup report as well. It would be interesting to see who is driving
this."* A genuinely new aggregate view, not a fix to the existing per-store report — kept as its
own dispatch rather than folded into #140.

## What "who is driving this" actually requires — read before designing anything

The per-store report (`schedule-retention.js`) already computes a before/since split PER STORE,
anchored to that store's own marked "workshop week" (`markedWeekKey` — the week the user clicked
to mark as the class date for that specific store, since different stores attended on different
real dates). A rollup across many stores needs the SAME per-store before/after split for every
store in scope, then an aggregate of the DELTAS (post − pre) grouped by Patch/Operator/Org/State —
**not** a raw aggregate of one shared calendar period, since stores' actual workshop dates differ.
Reuse the per-store computation (`computeStoreWeeks`/`splitWeeksAtMark`/`aggregateSpan`) once per
store in scope; do not re-derive that math.

**⚠️ Blocking prerequisite, confirmed by reading the code — `markedWeekKey` is device-local, not
shared.** `schedule-retention.js`'s workshop-week mark is `localStorage.getItem('mf_sched_
retention_mark')` — **per-browser, per-device, never synced to Supabase.** A rollup computed in
one session has no way to see which week was marked for a store from a DIFFERENT device/session.
Per CLAUDE.md's standing rule ("every new persistent data type goes into Supabase — save on
upload + load on startup"), this needs a real cloud-persisted table before a cross-store rollup
can mean anything: something like `sched_retention_marks (loc text, week_key text, updated_at
timestamptz, tenant_id uuid)` with the same `accessible_locs`-scoped RLS pattern every other table
this session added uses (see `supabase/schema-lifelenz-shift-assignments.sql` or `supabase/
schema-qsr-punch-times.sql` for the exact shape to copy). Migrate `markWeek()`/the mark-read
effect in `schedule-retention.js` (dispatch #140, may be mid-flight — check `main` first) to read/
write this table instead of `localStorage`, keeping `localStorage` only as an optional same-
session fast-path cache if you want one, never as the source of truth. **Do this first** — the
rollup report is meaningless without it (every store not marked from THIS device would silently
read as "no workshop week," making every group's aggregate wrong in a way that looks like real
data).

## Grouping dimensions — confirm each source before trusting it

- **Patch (supervisor)** — use LIVE `supervisorGroups()`/`orgAssignments()` (`src/constants.js`),
  **not** the static `INV_ORG_COORDS[loc].sup` field. Dispatch #139 (`memory/dispatch-139.md`,
  merged this session) found the static field stale and fixed the panels reading it — check
  whether #139's actual code fix has landed on `main` by the time you start; if it has, its
  pattern is exactly what to copy here, don't re-derive it.
- **Operator** — `INV_ORG_COORDS[loc].op`. **Unverified whether this has the same live-vs-static
  problem as `sup` did** — #139's investigation was scoped to supervisor data specifically and did
  not check `op`. Measure before trusting it: grep for any live/Settings-editable operator
  assignment system the way `sup` had one; if none exists, `op` may simply be static/rarely-
  changing real data (state which, with evidence, don't assume either way).
- **Org** (MCDOK / Emerald Arches) and **State** (OK / FL) — `getStoreOrg()`/`INV_ORG_COORDS[loc]
  .state` (`constants.js`). Stable, already-correct dimensions per CLAUDE.md's Organization
  Context section — no known staleness issue, safe to use directly.

## Scope — build

1. **Persist workshop-week marks to Supabase** (the blocking prerequisite above) — new table +
   loader/saver in `src/lib/supabase.js`, migrate `schedule-retention.js`'s mark read/write.
2. **A new rollup view** — location for it is your call: a new tab alongside Training Retention
   in the Scheduling hub (if dispatch #140's hub-move has landed), or a mode/toggle within the
   same panel keyed off a broader-than-store `LocationSelector` scope (dispatch #140 flags this
   exact coordination point — check that dispatch's state before deciding). Either is acceptable;
   state your reasoning.
3. **Per-group aggregate**: for each store with a marked workshop week in the selected scope,
   compute its own pre/post delta (reuse `aggregateSpan`/`splitWeeksAtMark`), then dollar-weight-
   aggregate those deltas within each Patch/Operator/Org/State group (never average an average —
   same standing rule every other rollup in this codebase follows). Surface at minimum: Labor %
   delta, Sched-vs-Fcst hours delta, TPMH delta, per group — and rank/sort groups by improvement
   so "who is driving this" is answerable at a glance (a simple sorted table or leaderboard is
   fine; this doesn't need a chart to be useful, though reusing dispatch #140's small-sparkline
   language for the same metrics is a reasonable visual match if it fits cleanly).
4. Stores with no marked workshop week yet have no delta to contribute — exclude them from the
   rollup's aggregate (they have nothing to measure "since class" against) but state clearly in
   the UI how many stores in scope are excluded for this reason, so the rollup doesn't read as
   silently partial data.

## Do NOT

- Do not build the rollup on top of `localStorage`-only marks — the Supabase migration is not
  optional for this dispatch to mean anything.
- Do not assume `op` (operator) is either live or static without checking — state what you found.
- Do not re-derive `computeStoreWeeks`/`aggregateSpan`/`splitWeeksAtMark`'s math — call the
  existing functions per store, aggregate their outputs.

## Verification bar

- Mark a workshop week for a real store from this session, confirm it's readable via a fresh
  Supabase query (not just from the same browser session) — this is the concrete proof the
  Supabase migration actually works, not just that the UI still shows a mark locally.
- Render the rollup for a real multi-store scope (e.g. one full Patch) with at least 2 stores
  that have a marked week and 1 that doesn't; confirm the excluded store is called out, not
  silently missing.
- Confirm the Patch grouping uses live supervisor data (a store recently reassigned to a new
  supervisor, e.g. dispatch #139's "Mary" scenario, shows under the correct current group).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean; report before/after entry-chunk size.
