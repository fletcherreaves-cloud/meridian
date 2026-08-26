# Dispatch #149 — Performance Review continuity, Phase 2: lock auto-populated actuals,
# reason-required override, enforced at the database level

**Context (2026-08-26):** Second build phase of the Performance Review "yearly continuity"
redesign. Full design and every owner decision are in
`memory/plan-performance-review-continuity-2026-08-26.md` — **read that file in full before
starting**, especially decision #4 (just updated with the exact override-dropdown wording) and
decision #6 (measured RLS/persistence findings). This dispatch is build-sequencing item **#2**
only. Dispatch #148 (merged, v5.189) already built the role ladder this depends on — read
`memory/dispatch-148.md` and the current `src/engine/permissions.js` to see what's available:
`DEFAULT_ROLES` (the 7-rung ladder) and `levelsAbove(roleId, aboveRoleId, ladder)`.

## The bug this fixes (confirmed by reading the code, not assumed)

`review-engine.js`'s `autoPopulateKPIs(review, ds)` unconditionally overwrites `mo[key]` for every
`src:'auto'` metric on every run — e.g. `if (oepeAvg != null) mo.oepe = oepeAvg;` with no check for
an existing value. Compare to the TARGET-field fills a few lines away, which DO check first:
`if (mo[slot] == null && officialTgts[tf] != null) mo[slot] = officialTgts[tf];`. Net effect: a
manual correction to an auto-sourced actual is silently destroyed the next time the review is
opened (auto-populate reruns on every load). This dispatch fixes it.

## The exact mechanism to build (owner's own words, from the plan doc decision #4)

*"Lock actual results from editing when imported. You could provisionally allow someone in a
higher user role to manually update and correct, but require a reason to do so. Could be
accomplished using a dropdown for Inaccurate Data, Incomplete Data, or Something Else (Explanation
required)."*

- Every `src:'auto'` KPI actual cell in `performance-reviews.js`'s `KPIGrid` (the `FormattedNumInput`
  for the "Actual" row — currently freely editable for every metric regardless of `src`) becomes
  **read-only by default**.
- An authorized overrider gets a visible override affordance (small pencil/edit icon) that opens a
  form: new value + a reason dropdown with **exactly three options — "Inaccurate Data" /
  "Incomplete Data" / "Something Else"** (free-text explanation REQUIRED when "Something Else" is
  picked, optional for the other two).
- **Authorization**: `levelsAbove(reviewedRole, callerRole, DEFAULT_ROLES) >= 2` (the owner's own
  worked example: a GM's own reviewer is AS; override needs OM or higher — `levelsAbove('gm','om')
  === 2`), **PLUS an unconditional Admin/Developer override regardless of ladder distance**
  (decision #6-C, already resolved — build this as a separate `role in ('admin','owner')` OR,
  not something that has to fall out of the ladder math being right).
- **src:'manual' metrics are UNCHANGED** — they were never auto-imported, they stay exactly as
  freely editable as they are today. Only `src:'auto'` metrics get this treatment.

## Recommended data-shape approach — read carefully, this resolves a real design tension

The dispatch spec says "enforced in RLS (not just the client)." Postgres RLS is row-level, not
JSONB-key-level — `reviews.data` is one big JSONB blob holding the ENTIRE review (comments, manual
fields, status, everything), so a plain RLS policy cannot cleanly say "this one key inside the
JSONB can't change unless you're 2+ levels up." Two ways to get real enforcement; **recommend the
second, but this is an engineering judgment call, adjust if you find a better path**:

1. Trigger-based: a Postgres trigger comparing `OLD.data` vs `NEW.data`, walking the months/keys
   that are `src:'auto'`, and rejecting the UPDATE unless the caller's role clears the hierarchy
   check. Complex, couples SQL logic to the JS-side `src:'auto'` metric list (a de-sync risk).
2. **Separate override storage (recommended):** don't try to lock the raw actual field at all —
   let `autoPopulateKPIs` keep refreshing `mo[key]` freely on every run (that's CORRECT behavior,
   you want the freshest cloud data). Instead, add a new table (or a separate top-level JSONB
   column on `reviews`, either is fine) purely for override RECORDS:
   `{review_id, month, metric_key, value, reason, note, overridden_by, overridden_at}` — one row
   per active override. This is a genuinely row-level thing RLS can gate cleanly (INSERT requires
   the hierarchy check via a `get_my_role()`-based policy referencing the SAME role set
   `levelsAbove` uses). At read/score time, the effective actual for a cell = the override record's
   value if one exists for that (review, month, metric), else the auto-populated `mo[key]`. This
   also elegantly fixes the original bug for free: an override can never be clobbered by
   `autoPopulateKPIs` re-running, because it lives somewhere that function never touches.

Either way: **every override event must append to a durable audit trail** (who/when/old value/new
value/reason) — reuse ONE audit-log shape for this if the assignment-record audit trail from
decision #6 gets built in the same dispatch window; do not invent two different shapes for
"who changed what and why" across this codebase.

## Scope for this dispatch

1. Fix the `autoPopulateKPIs` unconditional-overwrite bug (the root cause) — regardless of which
   storage approach you pick for overrides, this specific bug (target fields null-check, actual
   fields don't) needs its own explicit test.
2. Build the override storage (recommend: separate table/column, see above) with RLS enforcing the
   `levelsAbove`-gated write, plus the unconditional admin/owner override.
3. Wire `KPIGrid` (performance-reviews.js): read-only actual cells for `src:'auto'` metrics,
   override affordance + the exact 3-option reason dropdown, resolving the effective value
   (override-if-present else auto-populated) for display AND for scoring (`rateMetric` and
   everything downstream that reads `mo[m.key]` needs to see the resolved value, not the raw one —
   check every call site, don't just fix the input cell).
4. Audit trail visible somewhere real on the review (even a simple "Override history" expandable
   section is enough for this dispatch — a full UI treatment isn't required, just don't make the
   audit trail invisible/inaccessible).
5. Tests: the `autoPopulateKPIs` fix, the `levelsAbove`-gating logic (2+ levels + admin/owner
   escape hatch, including a negative case — someone 1 level up should be rejected), and the
   resolved-value logic (override present vs absent) for both display and scoring.
6. `schema.sql` changes (new table/column + RLS) — same pattern as dispatch #148: this is live
   production Supabase, document exactly what SQL to run and what to verify live, don't assume it
   auto-applies.

## Explicitly OUT of scope (later build-sequencing items)

- The person/role/store effective-dated assignment model (item #3) — do NOT try to make override
  authority hierarchy-scoped by WHO reports to whom yet; `levelsAbove` alone (rung distance on the
  ladder) is the full authorization check for this dispatch. "Is this specific OM actually this
  specific GM's chain of command" is later work.
- The yearly data-model restructure (item #4), promotion/transfer scoring (#5), departure handling
  (#6), the new-manager panel (#7), the job-code config table (#8), email wiring (#9).

Do not let this dispatch grow into any of the above. If something here turns out to genuinely
require one of those first, stop and say so rather than expanding scope.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip.
- Manually verify in a rendered `KPIGrid` (or a targeted test) that: an auto-sourced actual cell is
  read-only for an unauthorized viewer, an authorized overrider can submit the 3-option dropdown
  form, "Something Else" without an explanation is rejected client-side, and the resolved value
  (not the raw auto value) is what scoring uses.
- PR body must state exactly what SQL changed and what a human needs to verify live against
  production Supabase, same as dispatch #148's PR did.
