# Dispatch #154 — Performance Review continuity, Phase 5a: promotion/transfer segmented
# scoring — assignment-timeline detection + per-segment scoring engine (data/engine layer only)

**Context (2026-08-27):** Seventh build phase of the Performance Review "yearly continuity"
redesign — build-sequencing item **#5**. Full design and every owner decision are in
`memory/plan-performance-review-continuity-2026-08-26.md` — **read decision #3 in full before
starting** (it is the entire spec for this dispatch, including the owner's own words and the HR
research that shaped the "not a rigid formula" recommendation). Depends on dispatch #150 (v5.191,
the `staff_assignments` reports-to graph + `assignment-graph.js`), #151 (v5.192, RLS on that
graph), and #152 (v5.197, the per-person-per-year review data model — this dispatch's `person`
field is now in the SAME identity space `staff_assignments.person` uses).

Split into **Phase 5a (this dispatch): segment detection + segment-level scoring engine, no
UI** — the same phased pattern items #3 and #4 already used successfully (3a/3b, 4a/4b). Phase 5b
(surfacing segments in the review editor, letting a reviewer adjust the provisional rollup with
commentary) is separate, later work — likely folded into whatever dispatch finally builds #152's
still-pending Phase 4b UI, since both need the same "this review now has more than one simple
period to display" UI work. Do not attempt UI here.

## The real shape to build (owner's own words, decision #3)

Two scenarios, unified into ONE mechanism because they're the same underlying event from the data
model's point of view — an assignment-timeline change:

**A) Store transfer, same role.** *"it was always awarded based on the store data in which the
manager worked the majority of the month."* — majority-of-month wins that month's attribution.

**B) Role promotion (mid-cycle).** Changes which KPI framework applies (`DEFAULT_REVIEW_CONFIG`'s
`metrics`/`competencies` differ by `ROLE_KEYS`). HR-research consensus (already done, cited in the
plan doc, don't redo it): evaluate each period against the role actually held THEN, and the
overall rating is "a synthesized judgment, not a mechanical average."

**The unified mechanism:**
1. Split the affected period into segments at each assignment change.
2. Score each segment against **its own role's KPI framework and its own store's targets** — not
   a blend.
3. Surface all segments together (e.g. "Jan–Mar: AM @ Store 3708" / "Apr–Jun: GM @ Store 5183"),
   each with its own category scores. (Phase 5b — not this dispatch.)
4. The period/overall rollup is a **provisional weighted number** (segment length × segment
   score) as a *starting point* the reviewer can adjust with commentary — explicitly not a rigid
   formula per the HR-source consensus. Don't over-engineer this into something mechanical the
   sources themselves say it shouldn't be.

## What already exists (read the code, don't re-derive)

- **`staff_assignments`** (dispatch #150 schema): `{person, role, target_type, target, start_date,
  end_date}` rows. For a GM/AM/DM/SM (store-level roles, always leaf assignees per
  `assignment-graph.js`'s own header comment), a row is `{person, role, target_type:'store',
  target:<loc>, start_date}` — this genuinely already IS the assignment-timeline data source
  decision #3 needs; the 2026 backfill (`scripts/backfill-staff-assignments-2026.mjs`) already
  populates it from `qsr_employee_tenure`'s `store_start_date`/`job_title_code_start_date` for
  every currently-active person.
- **`src/engine/assignment-graph.js`**: `currentHolderOfTarget`, `directTargetsOf`,
  `resolveScope`, `whoOversees` — all resolve a graph AS OF ONE POINT IN TIME. **None of these
  reconstruct a person's own role/store HISTORY across a date range with multiple transitions** —
  that function does not exist yet and is real, new engine work this dispatch has to build (see
  scope item 1). Read this file's full header comment before writing anything — it documents the
  `person` identity-space convention (geid vs name string) this new function must respect.
- **`review.person`** (dispatch #152): the review's own person-identity field, same identity space
  as `staff_assignments.person`. This is the join key: given a review, `review.person` (or
  `review.name` as fallback per #152's own fallback rule) is what you query `staff_assignments`
  for.
- **`computeScores(review, cfg)`/`computeScoreBreakdown(review, cfg)`** (dispatch #152, current
  shape): score a review's `kpis.months`/`behavioralRatings` against ONE role's `cfg` for the
  WHOLE year record — `cfg.competencies[review.role]`, `cfg.metrics` are resolved once, for the
  single `review.role` the record carries. **This is the exact assumption a promotion breaks** —
  there is currently no way to score a SUBSET of months against a DIFFERENT role's framework
  within one `computeScores` call. Read `resolveReviewConfig`/`scoreMetricCategory`/`behavScore`
  in full before deciding how to extend this (see scope item 2).
- **`DEFAULT_TARGETS`** (`constants.js`): per-store targets, keyed by loc. A segment scored at a
  different store needs THAT store's targets, not `review.loc`'s.

## Scope for this dispatch

1. **New assignment-timeline reconstruction function** in `assignment-graph.js` (or a new,
   clearly-named sibling module if that fits better — your call, but keep resolution logic in ONE
   place per this project's standing "don't scatter resolution logic" rule from dispatch #150's
   own scope note): given `(person, periodStart, periodEnd, rows)`, return the ordered list of
   `{role, loc, start, end}` segments covering that period — every `staff_assignments` row for
   that person whose effective window overlaps `[periodStart, periodEnd]`, clipped to the period
   boundaries, "latest start ≤ date wins" resolved exactly like every other function in this file
   already does (do not invent a second resolution rule). A period with zero assignment changes
   returns one segment spanning the whole period (the common case — most reviews have no
   promotion/transfer; this function must be cheap and correct for that case, not just the rare
   one). Cycle-safety is not applicable here (this walks one person's own rows, not the graph), but
   handle a genuinely malformed input (e.g. two overlapping rows for the same person with no clear
   "latest start" winner) by picking the latest-start row per this file's established rule, not by
   crashing.
2. **Majority-of-month attribution** for a mid-month change (decision #3-A): when a segment
   boundary falls mid-month, the WHOLE month attributes to whichever segment covers the majority
   of that month's days — implement as a pure function taking a month's start/end and the segment
   boundaries, returning which segment "wins" that month for scoring purposes. This is the
   resolver the plan doc explicitly asks to build first (v1), with day-weighted apportionment
   explicitly deferred as a v2 "additional scoring block," not required here.
3. **Per-segment scoring**: extend (don't replace) `computeScores`/`computeScoreBreakdown` so a
   caller can score a SPECIFIC subset of months against a SPECIFIC role's `cfg` and a SPECIFIC
   store's targets — the natural shape is probably a new function (e.g. `computeSegmentScores(
   review, cfg, segment)`) that reuses the SAME `scoreMetricCategory`/`behavScore`/`combine`
   machinery `computeScores` already has (per dispatch #152's own "reuse the identical combining
   step" precedent — don't reinvent scoring math a second time), parameterized by the segment's
   role/loc/months instead of always reading `review.role`. Confirm whether `review.kpis.months`
   (auto-populated per dispatch #149's `autoPopulateKPIs`) already sources from the RIGHT store's
   data for months after a transfer, or whether auto-populate itself needs to become
   segment-aware — read `autoPopulateKPIs` before assuming either way; this is exactly the kind of
   "check whether an affordance already exists" question this project's standing rules want
   answered by reading code, not guessing.
4. **Provisional weighted rollup**: a simple function combining segment scores weighted by segment
   length (days or months — your call, document which and why) into ONE starting number — clearly
   documented as provisional/reviewer-adjustable, not authoritative. Do not build a UI affordance
   for the reviewer to adjust it (Phase 5b) — just make sure the computed value and the underlying
   segment scores are both exposed in a shape a future UI can read and let a human override.
5. **Tests**: the timeline-reconstruction function (a synthetic person with a mid-year store
   transfer, a synthetic person with a mid-year role promotion, a synthetic person with NO
   assignment changes — the common case must produce exactly one full-period segment, not an
   edge-case-only path); majority-of-month attribution (a transfer on the 10th of a 30-day month
   attributes the whole month to the destination; a transfer on the 20th attributes it to the
   origin); per-segment scoring (two segments with deliberately different role frameworks and
   different store targets score independently and correctly, not blended); the provisional
   rollup (a concrete numeric example, not just "it runs").

## Explicitly OUT of scope for this dispatch (do NOT touch)

- **Phase 5b**: any UI surfacing of segments in the review editor, any reviewer-facing way to
  adjust the provisional rollup with commentary. This dispatch's job is that the DATA and SCORING
  are correct; presenting them is later work (likely combined with #152's own still-pending
  Phase 4b UI dispatch, since both need the same "more than one simple period" editor work — flag
  this overlap explicitly in the PR body rather than silently deciding how they'll combine).
- Departure handling (#6), the new-manager notification panel (#7), the job-code config table
  (#8), email wiring (#9), multi-role-per-person (#10).
- The day-weighted v2 apportionment decision #3-A explicitly deferred — majority-of-month only.
- Auto-detecting a promotion/transfer FROM roster data and proposing it to the reviewer (the
  "propose-then-confirm flow for roster-detected changes," plan doc resolved item D) — that's
  item #7/#8 territory (job-code config + notification panel), not this dispatch. This dispatch
  assumes `staff_assignments` already correctly reflects reality (via the existing backfill/manual
  assignment records) and scores against it — it does not build the detection-and-proposal UX.

Do not let this dispatch grow into any of the above. If something here turns out to genuinely
require one of those first, stop and say so rather than expanding scope.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip (engine-only work, should be
  near-zero eager-chunk impact — flag if it isn't).
- PR body must state: (a) where the new timeline-reconstruction function lives and why; (b)
  whether `autoPopulateKPIs` needed to become segment-aware, and what you found when you checked;
  (c) the exact weighting rule chosen for the provisional rollup and why; (d) explicit
  acknowledgment of the Phase 5b/Phase 4b UI overlap for whoever picks up either next.
