# Dispatch #148 — Performance Review continuity, Phase 1: real role/level system
# (replaces the 3-tier stub, fixes the live reviews RLS write gap)

**Context (2026-08-26):** First build phase of the Performance Review "yearly continuity" redesign.
Full design, every owner decision, and the measured findings this dispatch is built on are all in
`memory/plan-performance-review-continuity-2026-08-26.md` — **read that file in full before
starting.** Do not re-derive anything it already answers; do not re-litigate a decision already
made there. This dispatch is scoped to build sequencing item **#1** from that doc only.

## What's already measured (don't re-check, just use it)

- `src/engine/permissions.js`'s `DEFAULT_ROLES` today has only 3 tiers: `admin` (level 1),
  `area_supervisor` (level 2), `manager` (level 3). Roles are already described as
  "org-configurable (not hardcoded)" in that file's own header comment.
- `supabase/schema.sql`'s `reviews` RLS policies check `get_my_role() = 'supervisor'` — a literal
  string mismatch against the real role id `'area_supervisor'`. This bug means the "supervisor
  read" policy has likely never matched a real logged-in supervisor.
- `reviews` RLS write policies (`"reviews: authenticated write"` / `"reviews: authenticated
  update"`) currently check only `auth.uid() is not null` — ANY authenticated user can insert or
  overwrite ANY review row today. This is a live, owner-acknowledged gap, deliberately held open
  specifically for this dispatch to fix correctly (see the plan doc's build-sequencing item #0) —
  **fixing this is required scope for this dispatch, not optional.**
- The review-role ladder this whole feature needs (plan doc decision #4, sharpened by decision #6):
  **SM/AM/DM → GM → AS → OM → DO → VP → Owner/OO**, where AM and DM are the SAME functional role
  split by pay classification (decision #5 — AM=salaried, DM=hourly), not two rungs of the ladder.
  So the real ladder has 7 rungs: `SM/AM/DM` (one rung, 3 titles) → `GM` → `AS` → `OM` → `DO` →
  `VP` → `Owner/Developer` (top, always-override per decision #6's "Root override" resolution).

## Scope for this dispatch

1. **Extend `DEFAULT_ROLES` in `src/engine/permissions.js`** to the real 7-rung ladder above.
   Keep the existing `level`/`permissions`/`color`/`system` shape — this is filling out an existing
   pattern, not inventing a new one. `admin`/`manager` stay as system roles (unclear yet whether
   they collapse into GM/Owner or stay distinct utility roles — if genuinely ambiguous, ask the PM
   rather than guessing; this is exactly the kind of judgment call this project's standing rules
   want surfaced, not silently resolved).
2. **Add a pure "N levels above" resolver** — a function that takes two role ids and the ladder and
   returns how many rungs apart they are (or null if not comparable), for later reuse by the
   override-authority and review-visibility work (later dispatches). Keep it a small, testable,
   standalone function — do not wire it into the review UI yet, that's out of scope here.
3. **Fix `supabase/schema.sql`**:
   - Correct the `'supervisor'` → `'area_supervisor'` string mismatch in the `reviews` RLS policies
     (and audit whether the same string appears elsewhere in the file with the same bug — grep for
     `'supervisor'` across the whole file before assuming this is the only occurrence).
   - Tighten `"reviews: authenticated write"` / `"reviews: authenticated update"` to require the
     caller's role be one of the real roles from step 1 that should plausibly be able to write a
     review at all (not "any authenticated user") — a coarse but real improvement; this does NOT
     need to be the full hierarchy-scoped "who can edit THIS specific review" logic yet (that's
     later build-sequence work, per the plan doc) — just close the "anyone, period" hole.
   - This is a live production Supabase schema — after writing the SQL, the PM will apply it via
     the Supabase SQL editor and confirm live; do not assume `schema.sql` being idempotent
     (`create table if not exists` + `drop policy if exists`/`create policy`) means it's safe to
     silently re-run without review — flag exactly what changed for the PM to apply.
4. **Tests**: cover the new `DEFAULT_ROLES` shape and the "N levels above" resolver with real unit
   tests. RLS policy correctness can't be unit-tested from `vitest` — note in the PR body exactly
   what to verify live (e.g. a live query as a non-admin role should now be rejected for a write
   it previously would have silently succeeded at).

## Explicitly OUT of scope for this dispatch (later build-sequence items)

- The person/role/store effective-dated assignment model (`staff_assignments` extension) —
  build-sequencing item #3.
- The per-person yearly review data-model restructure — item #4.
- Promotion/transfer segmented scoring — item #5.
- Departure auto-finalize handling — item #6.
- The new-manager notification panel — item #7.
- The job-code→role Supabase config table — item #8.
- Wiring the "N levels above" resolver into any actual review-locking/visibility UI — that needs
  the assignment model (item #3) to know who's actually being compared, not just the ladder.

Do not let this dispatch grow into any of the above — each is its own dispatch. If something here
turns out to require one of those to be done first, stop and say so rather than expanding scope.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip.
- PR body must state exactly what SQL changed in `schema.sql` and exactly what a human (or the PM,
  live) needs to run/verify against production Supabase — this dispatch's code changes alone don't
  take effect against the live database until that SQL is applied there.
