# Dispatch #162 — Performance Review continuity, build item #6: departure/termination handling

**Context (2026-08-27):** Ninth build phase of the Performance Review "yearly continuity"
redesign. Full design in `memory/plan-performance-review-continuity-2026-08-26.md` — **read
resolved item B in full before starting** (the "Second-pass gap review" section, ~line 456-465):
the owner's own words and exact mechanism are the spec for this dispatch, not a summary of them.
Depends on dispatch #150 (v5.191, `staff_assignments` graph), #151 (v5.192, RLS), #152 (v5.197,
per-person-per-year model), #154 (v5.199, segmented scoring) — all shipped. **Does NOT depend on**
`staff_assignments` actually being populated in production (still zero rows, confirmed twice this
session) — this dispatch builds the MECHANISM against the existing engine/schema; whether it has
real data to act on in production is a separate, already-tracked concern (dispatch #158's own
finding), not a blocker for writing correct code against the real shape.

## The exact mechanism (owner's own words, resolved item B)

*"Do the auto finalize but require approval in the ability to override it. The approval and
potential override should come from a job title code qualified to perform the review or above."*

So: a departure (`termination_entry_date` set, or a detected role change out of GM/AM/DM/SM/AS/OM)
**auto-finalizes the review provisionally and auto-clears the person from the new-manager panel
immediately** — no manual step needed for the routine case. But that auto-finalize is **not a
silent, unreviewable lock**: whoever is qualified to review that role (the person's normal
reviewer per the relative-hierarchy ladder, decision #4 — or anyone above them) can approve it as
final, or reopen/override it (e.g. the departure record was wrong, or they want to add closing
commentary first). **This reuses the exact same reviewer-hierarchy mechanism already built for
locked actuals (decision #4) — not a second authorization system.**

## What already exists (read the code, don't re-derive)

- **Decision #4's relative-hierarchy override mechanism** — `src/engine/review-engine.js` and/or
  `assignment-graph.js`'s `whoOversees`/`personOversees` (dispatch #150). Find the EXISTING code
  that currently gates override authority for locked auto-populated actuals (decision #4's own
  build — search for wherever `canOverride`/`hasPermission`-style checks reference the
  hierarchy ladder in `performance-reviews.js`'s `KPITab`, `onAddOverride` prop chain). Read it in
  full — this dispatch's departure-approval authority check must be the SAME mechanism, called
  the same way, not a parallel reimplementation.
- **Decision #4's unconditional Admin/Developer escape hatch** (resolved item C, plan doc) — a
  hard-coded OR alongside the relative-hierarchy check. The same escape hatch must apply here too
  — an Admin/Developer can always approve/reopen a departure-finalized review, independent of the
  computed ladder.
- **`review.periods.h1`/`h2`** (dispatch #152) — the per-half status/statusHistory/statusNotes
  shape. A departure-triggered finalize is a NEW transition source (not a human clicking Submit/
  Approve) — decide whether it's a new `status` value (e.g. `'auto-finalized'`) distinct from
  `'approved'`, or reuses `'approved'` with a `statusHistory` entry noting the auto-trigger. The
  UI (`StatusActionBar`, dispatch #157/v5.202) needs to distinguish "a human approved this" from
  "this auto-finalized, still reviewable" — read `StatusActionBar`'s current rendering before
  deciding the cleanest way to surface the distinction (a badge, a different status value, a
  `statusHistory` entry's `from`/`to`/`notes` — your call, but it must be visibly different in the
  UI, not just in the data).
- **Roster/tenure data for detecting a departure** — `qsr_employee_tenure` (mentioned in the plan
  doc's decision A, the backfill source) is the likely source for `termination_entry_date` and
  role-exit detection. Check what's already pulled/available (grep `qsr_employee_tenure` usage
  across the app) before assuming a new data pull is needed.
- **The "new-manager panel"** referenced by "auto-clear... from the new-manager panel" **does not
  exist yet** (confirmed by grep — zero matches for `new-manager`/`NewManagerPanel` anywhere in
  `src/`). That's build item #7, NOT this dispatch. **Scope this dispatch's "auto-clear" as: the
  underlying signal/flag a future new-manager panel would filter on** (e.g. a field or function
  that says "this person's departure is already handled, don't surface them"), not a UI change to
  a panel that isn't built yet. Don't block on #7; don't build #7 here either.

## Scope for this dispatch

1. **Departure detection**: a function (new, in `review-engine.js` or a clearly-named sibling —
   your call, matching this project's "keep resolution logic in one place" pattern) that, given a
   person and the current roster/tenure data, determines whether they've departed (termination
   date set) or exited the reviewable role ladder (GM/AM/DM/SM/AS/OM) entirely. Cheap, correct for
   the common case (nobody departed — most people, most of the time).
2. **Auto-finalize**: when a departure is detected for a person with an open (non-terminal-status)
   review this year, auto-transition the affected period(s) to a finalized state — reusing
   `transitionReview()`'s existing 4-arg signature (dispatch #157), not a new writer of
   `review.periods`. Record in `statusHistory` that this was an auto-trigger, not a human action
   (the `notes` field, or a new field on the transition record — your call, but it must be
   distinguishable from a human transition when read back).
3. **Approval/override authority**: reuse decision #4's hierarchy mechanism (found in step 1 of
   "what already exists" above) verbatim — the person's normal reviewer or above can approve the
   auto-finalize as final, or reopen it. Do not invent a second authorization path.
4. **UI**: `StatusActionBar` (or a new small addition near it) must visibly distinguish an
   auto-finalized-pending-review status from a normally-approved one, and offer the
   Approve/Reopen actions to whoever the hierarchy check says is authorized — reusing the
   existing button/permission-gate pattern already in `StatusActionBar`.
5. **The "auto-clear" signal**: expose whatever a future new-manager panel (#7) would need to
   filter a departed person out — a computed flag/function is enough, no new panel here.
6. **Tests**: departure detection (a synthetic person with a `termination_entry_date`, one with a
   role exit, one with neither — the common "no departure" case must be cheap/correct, not just
   an edge-case path); auto-finalize actually calls `transitionReview()` correctly and is
   distinguishable in `statusHistory` from a human transition; hierarchy-based approval/reopen
   authority (a qualified reviewer can act, an unqualified person cannot, Admin/Developer always
   can per the escape hatch); the UI test rendering the distinguishable status.

## Explicitly out of scope

- The new-manager notification panel itself (build item #7) — only the underlying "is this
  person's departure handled" signal, not a panel to display it.
- The job-code config table (#8) or email/notification wiring (#9) — unrelated, later work.
- Multi-role-per-person (#10) — unrelated, separate RLS migration.
- Populating `staff_assignments` in production, or the #150/#151 backfill SQL — owner-approval-
  gated per CLAUDE.md, out of this dispatch's scope to run.
- Any change to decision #4's hierarchy mechanism itself — reuse it exactly as built, don't modify
  it here (if you find it genuinely needs a change to support this, stop and say so rather than
  extending it unilaterally).

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`. `npm run build` clean, report before/after entry-chunk gzip.
- PR body must state: (a) exactly which existing function/mechanism decision #4's hierarchy check
  turned out to be, confirmed by reading it, not assumed; (b) the exact status/statusHistory shape
  chosen to distinguish auto-finalize from human approval, and why; (c) what data source departure
  detection actually reads, and whether it's already pulled or needed a new query (report which,
  don't silently assume).
