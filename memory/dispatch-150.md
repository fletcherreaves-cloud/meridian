# Dispatch #150 — Performance Review continuity, Phase 3a: effective-dated person/role/store
# assignment model + 2026 backfill (data layer only — no RLS/visibility wiring yet)

**Context (2026-08-26):** Third build phase of the Performance Review "yearly continuity"
redesign. Full design and every owner decision are in
`memory/plan-performance-review-continuity-2026-08-26.md` — **read that file in full before
starting**, especially decision #2 (the recursive reports-to graph shape) and decision #6 (the
`staff_assignments` table already exists, unused). This dispatch is build-sequencing item **#3**,
split into two parts for review-ability — **this dispatch is Phase 3a: the data layer only.**
Phase 3b (extending `reviews` RLS to use this model for hierarchy-scoped visibility, instead of
just `accessible_locs`) is a separate, later dispatch — do not attempt it here.

Depends on dispatch #148 (merged, v5.189 — `DEFAULT_ROLES`/`levelsAbove()`) and dispatch #149
(merged, v5.190 — the override mechanism, for context on the established patterns to follow, not
because this dispatch touches overrides).

## What already exists (read the code, don't re-derive)

- `supabase/schema.sql`'s `staff_assignments` table: `{id, profile_id, store_loc, start_date,
  end_date, notes}` — currently has ZERO code references anywhere in `src/` (confirmed by grep).
  This dispatch is what finally wires it up.
- `src/constants.js`'s supervisor-org system — `orgAssignments()`/`whoRan(loc, date, list)`/
  `groupsAt(date, list)` — is the EXACT pattern to extend, not reinvent. Read it in full. Its
  shape: `{loc, supervisor, start}` rows, "latest start ≤ date wins" resolution. The person-level
  model this dispatch builds needs the identical resolution logic, generalized with one more axis.
- `scripts/qsrsoft-employee-roster-pull.mjs` / the `qsr_employee_tenure` table has real per-person
  `store_start_date`/`job_title_code_start_date`/`org_start_date` history — the source for the
  2026 backfill (see below). `src/engine/people-reports.js`'s `parseEmployeeRosterApi` shows the
  field shapes.

## The real shape to build — owner's own words, quoted in the plan doc's decision #2

The assignment model must be a **general reports-to graph**, not a fixed-depth tree: AS = patch
of stores; OM = 2-4 AS's patches combined; DO = whatever mix of OMs/AS's/stores is assigned to
them (a DO's own direct assignments can be a MIX of levels — not uniform). So each assignment row
needs `{person, role, target, start}` where `target` is EITHER a store location code OR another
person's id — and resolving "what is person X's full scope of stores as of date D" means: X's own
direct store assignments UNION the (recursively resolved) scope of every person assigned to
report to X, all evaluated at the SAME date D via the identical "latest start ≤ date wins" rule
already proven in `whoRan()`.

## Scope for this dispatch

1. **Extend `staff_assignments`** (don't create a new table): add a `role` column (a
   `DEFAULT_ROLES`-id or `ROLE_KEYS` value — decide which and document why; recommend the review
   ROLE_KEYS since that's what a review record's own `role` field uses, mapped to the ladder via
   `REVIEW_ROLE_TO_LADDER` — dispatch #149 — when ladder-level comparisons are needed elsewhere).
   Add a `target_type` (`'store'` | `'person'`) and repurpose/rename `store_loc` to a generic
   `target` column, OR add a parallel `target_profile_id` column — pick whichever is cleaner, but
   the schema must be able to express "reports to store X" and "reports to person Y" as the same
   kind of row. `end_date` already exists in the table; keep it (matches the "start-only model —
   the next assignment implicitly ends the prior one" convention `orgAssignments()` already uses,
   but the table's own existing `end_date` column suggests explicit end dates were also intended
   — reconcile this: does a new assignment implicitly end the prior one at the same target, or is
   `end_date` load-bearing? Read `orgAssignments()`'s own comment on this before deciding; if
   genuinely ambiguous, flag it rather than guess).
2. **Build the resolution engine** (new module, e.g. `src/engine/assignment-graph.js` or extend
   `constants.js` if that fits the existing pattern better — your call, but keep it in ONE place,
   don't scatter resolution logic): a function that, given a person id and a date, returns their
   full resolved store scope (recursive union, as above). Also a function for the inverse —
   "who is assigned to (and above) store X as of date D" — since both directions are needed by
   later dispatches (person→stores for scoring rollups; store→person for review routing). Must
   detect and safely handle a cycle in the reports-to graph (A reports to B who reports to A) —
   this should never happen in real data, but a malformed assignment record must not infinite-loop
   the resolver; fail loudly (throw or return a clear error marker), don't silently truncate.
3. **2026 backfill** (resolved plan-doc item A — real scope, not deferred): a script or one-time
   migration that reconstructs this year's real assignment history from `qsr_employee_tenure`'s
   `store_start_date`/`job_title_code_start_date` for every currently-active person in a
   review-eligible role bucket (GM/DM/SM cleanly identified by job code; AM by the
   `hourly_pay_rate` split — see plan doc decision #5's measured rule; AS/OM/DO have no roster
   code at all, so seed them from whatever's already known — e.g. the existing
   `orgAssignments()`/`DEF_SETTINGS.supervisorGroups` seed data for AS, and leave OM/DO
   unseeded/empty since no such role holder exists yet in production — Ashley Podraza's real OM
   promotion, per the plan doc, is still ~1 month out at time of writing).
4. **Tests**: the resolution engine (a synthetic multi-level graph — AS with 3 stores, OM over 2
   AS's, DO over 1 OM + 1 standalone AS — matching the plan doc's own "mixed levels" DO example;
   assert the full recursive union resolves correctly; assert the cycle-detection behavior; assert
   "latest start ≤ date wins" holds across a real historical reassignment). The backfill logic
   (feed it a synthetic `qsr_employee_tenure`-shaped fixture, assert the right assignment rows
   come out) — do not require live Supabase access for these tests, this repo's test env doesn't
   have it (mock the query layer, matching how other loader tests in this repo already do it).
5. `schema.sql` changes — same pattern as #148/#149: this is live production Supabase, document
   exactly what SQL to run and what to verify live, don't assume it auto-applies. The RLS on
   `staff_assignments` already has read/write policies (dispatch #148 already fixed their
   `'supervisor'`→`'area_supervisor'` string bug) — check whether the schema extension (new
   columns) needs any RLS policy changes at all, or whether the existing row-level policies still
   apply correctly to the wider row shape (likely yes, since RLS is row-level not column-level —
   confirm this rather than assume).

## Explicitly OUT of scope for this dispatch (do NOT touch)

- **Phase 3b**: wiring this model into `reviews`' own RLS for hierarchy-scoped read visibility
  (replacing the current `accessible_locs`-based policies) — a separate, later dispatch, once this
  data layer is proven and reviewed on its own.
- The yearly data-model restructure (item #4), promotion/transfer segmented scoring (#5),
  departure handling (#6), the new-manager notification panel (#7), the job-code config table
  (#8), email wiring (#9), multi-role-per-person (#10).
- Do NOT wire the resolution engine into any review UI, scoring, or override-authorization logic
  yet — `canOverrideLockedActual` (dispatch #149) intentionally stays rung-distance-only for now,
  per that dispatch's own explicit scope note. Making it "does this specific OM actually manage
  this specific GM" aware is future work once this data layer exists and is trusted.

Do not let this dispatch grow into any of the above. If something here turns out to genuinely
require one of those first, stop and say so rather than expanding scope.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip (this dispatch is engine/schema-only,
  should be near-zero eager-chunk impact — flag it if it isn't, since nothing here should be a
  static top-level import into a UI panel).
- PR body must state exactly what SQL changed and what a human needs to verify live against
  production Supabase, same as #148/#149's PRs.
- PR body must explicitly state how the `end_date`-vs-implicit-end question (scope item 1) was
  resolved and why, since it's a real, load-bearing design decision this dispatch has to make.
