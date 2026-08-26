# Dispatch #151 — Performance Review continuity, Phase 3b: wire the assignment graph into
# `reviews` RLS for real hierarchy-scoped visibility (replaces `accessible_locs`-only gating)

**Context (2026-08-26):** Fourth build phase of the Performance Review "yearly continuity"
redesign. Full design and every owner decision are in
`memory/plan-performance-review-continuity-2026-08-26.md` — **read that file in full before
starting.** This is build-sequencing item **#3's second half** — dispatch #150 (merged, v5.191)
built the data layer (`staff_assignments` extended to a `{person, role, target_type, target,
start, end}` reports-to graph + `src/engine/assignment-graph.js`'s `resolveScope`/`whoOversees`/
`currentHolderOfTarget`/`directTargetsOf`) and explicitly deferred RLS wiring to a later dispatch
— **this is that dispatch.** Read `memory/dispatch-150.md` and `src/engine/assignment-graph.js`
in full (the file's own header comment documents the `person` identity-space design — geid for
roster roles, name string for AS/OM/DO — read it before writing any SQL against it).

Also depends on dispatch #148 (merged, v5.189 — the role ladder, `reviews: authenticated write`/
`update` policies currently gated only by a coarse "is this role allowed to write a review AT
ALL" check, explicitly NOT scoped to "can THIS caller edit THIS SPECIFIC review" — that comment
in `supabase/schema.sql` names this exact dispatch as the fix) and #149 (merged, v5.190 — for the
established SQL-mirrors-JS pattern, see below).

## The real gap this closes (read the code, don't re-derive)

`supabase/schema.sql`'s current `reviews` RLS:
- `"reviews: supervisor read"` / `"reviews: manager read own locs"` — grant SELECT only via
  `profiles.accessible_locs`, a flat manually-maintained array with no relationship to the real
  reports-to graph dispatch #150 just built. An AS's `accessible_locs` has to be hand-kept in sync
  with their actual patch; an OM's read access can't reflect "the union of my AS's patches"
  without someone manually flattening that into `accessible_locs` by hand, which defeats the
  entire point of building a graph.
- `"reviews: authenticated write"` / `"reviews: authenticated update"` — grant INSERT/UPDATE to
  ANY caller whose role is anywhere on the ladder (dispatch #148's coarse fix), with no check that
  the caller has any actual relationship to the review's store at all. A GM in store A can today
  write a review for store B's employee, as long as their role is on the allowed list.
- `staff_assignments`' own RLS comment (added by dispatch #150) says outright: *"mapping a
  logged-in user onto their own `person` identity in this graph is real, un-built Phase 3b
  work."* **This dispatch is what builds that mapping and wires it through.**

## Scope for this dispatch

### 1. Map a Supabase auth login to its `person` identity in the graph
Add a nullable `profiles.person text` column — the SAME identity space
`staff_assignments.person`/`target` already use (a geid for a roster-sourced role, or a plain
supervisor name string for AS/OM/DO — see `assignment-graph.js`'s header comment). This is an
admin-set value, not auto-derived: there is no reliable automatic link between a Supabase auth
account and a geid or a name string today (confirm this is still true by grep before assuming —
if you find one, use it instead of a manual field, but the existing code strongly suggests there
isn't one). Wire a simple editor for it into `src/views/admin.js`'s existing per-user profile
panel (it already edits `role` and `accessible_locs` inline per row — follow that exact pattern,
don't build a new UI surface). Add `assign_person_idx`-style index if useful for the lookup this
dispatch's RLS will do (`profiles (person)`).

### 2. A SQL mirror of the store→oversight-chain walk, callable from RLS
RLS policies run inside Postgres and cannot call `assignment-graph.js`'s JS functions directly —
same constraint dispatch #149 hit for `levelsAbove`, resolved there by writing `role_level()`/
`review_role_to_ladder()` as parallel SQL functions. Do the same here: a SQL function (recommend
`public.person_oversees_loc(caller_person text, loc text, asof date default current_date) returns
boolean`) that walks the SAME chain `whoOversees(loc, date, rows)` walks in JS — store → its
current holder → that holder's current holder → ... — checking at each rung whether `caller_person`
appears in the chain. Implement as a recursive CTE (or a plpgsql loop, your call) reading
`staff_assignments` directly.

**Cycle safety, translated to RLS's constraints:** `whoOversees()`'s JS behavior on a cycle is to
throw `AssignmentCycleError` — correct for application code, but an RLS policy function cannot
throw a friendly error per-row without breaking every query that touches a cyclic record. Cap the
walk at a fixed depth (recommend 10 — the real hierarchy is at most 5 rungs deep: store→GM is not
even a hop since GM is the store-level leaf, then GM→AS→OM→DO→VP→Owner is 5) and simply stop
(returning false / no further matches) if the cap is hit — a malformed cyclic assignment record
should silently fail to grant extra access via this path, not crash queries or hang. Document this
explicitly in a comment next to the function, since it's a deliberate divergence from the JS
function's "fail loudly" behavior and a future reader needs to know why.

**Also add a thin JS-side equivalent** for client-side UI gating (e.g. deciding whether to render
an edit affordance at all, before the user attempts a write RLS will reject) — a small wrapper
around the existing `whoOversees()` in `assignment-graph.js`, not a second implementation. Flag in
the PR body, same as dispatch #149 did for its SQL/JS ladder mirrors, that the SQL and JS versions
of this walk can drift if one changes without the other.

### 3. Extend `reviews` RLS
**Read:** add a new policy (e.g. `"reviews: hierarchy scope read"`) granting SELECT when the
caller's `profiles.person` is set AND `person_oversees_loc(caller's person, reviewee_loc)` is
true. This should be **additive** alongside the existing `accessible_locs`-based policies
(`"reviews: supervisor read"` / `"reviews: manager read own locs"`), not a replacement — a profile
with no `person` mapping yet (which is every profile that exists today, per dispatch #150's own
schema comment) must keep whatever access `accessible_locs` already grants it. Multiple permissive
RLS policies on the same table OR together in Postgres by default — confirm this table isn't using
restrictive policies anywhere (it isn't, per the current file) before relying on that.

**Write:** tighten `"reviews: authenticated write"` / `"reviews: authenticated update"` to also
require the caller either (a) be admin/owner (unconditional, matching every other override
mechanism this feature has built so far), or (b) have `person_oversees_loc(their person,
reviewee_loc)` true, or (c) — needed so this doesn't regress a caller who has no `person` mapping
yet but legitimately has `accessible_locs` covering the store — keep an `accessible_locs`-based
fallback identical in shape to the existing read policies. State plainly in the PR body which of
these you implemented and why; this is the exact gap #148's own comment named this dispatch to
close, so don't leave it unscoped-by-store again.

### 4. Tests
- The new SQL function's LOGIC, mirrored and tested via the JS equivalent from step 2 (same
  synthetic-graph fixtures dispatch #150's own tests already built — AS with 3 stores, OM over 2
  AS's, DO over a mix — reuse them, don't rebuild): assert the JS walk correctly says yes/no for
  each rung, and correctly returns false (not a throw) past the depth cap on a cyclic fixture.
- `profiles.person` round-trips through the admin.js editor (a targeted component/unit test
  matching however `admin.js`'s existing role/accessible_locs edits are already tested, if they
  are — check first).
- RLS itself can't be unit-tested from vitest (same constraint every prior schema dispatch has
  noted) — PR body must state exactly what a human needs to verify live (e.g.: set a test
  profile's `person` to a name string that `person_oversees_loc` should resolve against a specific
  store via a synthetic `staff_assignments` row, confirm a read succeeds where `accessible_locs`
  alone would have denied it, then remove the test row).

## Explicitly OUT of scope for this dispatch

- The yearly data-model restructure (item #4), promotion/transfer segmented scoring (#5),
  departure handling (#6), the new-manager notification panel (#7), the job-code config table
  (#8), email wiring (#9), multi-role-per-person (#10).
- Any UI change to how reviews are LISTED/filtered for a logged-in user beyond what RLS itself
  already implies (i.e. don't build a new "my hierarchy" dashboard view — that's presentation
  layer, separate from the access-control layer this dispatch is scoped to).
- Auto-deriving `profiles.person` from any roster/tenure source — confirmed above as a manual
  admin-set field for this dispatch; automatic derivation (if it ever becomes possible) is future
  work, not a gap to solve here.
- Do not touch `review_overrides`' own RLS (dispatch #149) — its read policy already mirrors
  `reviews`' visibility via subquery, so it inherits whatever this dispatch grants without any
  code change there; confirm this holds rather than re-implementing it, but don't add a redundant
  hierarchy check to that table too.

Do not let this dispatch grow into any of the above. If something here turns out to genuinely
require one of those first, stop and say so rather than expanding scope.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip (this is engine/schema/admin-panel
  work — the admin.js addition is a small existing-panel extension, should be near-zero eager-chunk
  impact; flag if it isn't).
- PR body must state exactly what SQL changed and what a human needs to verify live against
  production Supabase, same as #148/#149/#150's PRs — including the specific live test described
  in step 4 above (set a `person`, add a synthetic assignment row, confirm read access changes,
  clean up).
- PR body must explicitly state which of the three write-policy options in step 3 was implemented
  and why, since it's the exact deferred gap #148 named this dispatch to resolve.
