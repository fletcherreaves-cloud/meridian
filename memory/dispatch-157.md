# Dispatch #157 — Performance Review continuity, Phase 4b + Phase 5b UI (combined):
# review editor must first catch up to #152's shipped per-year data model, then surface
# #154's segmented scoring on top of it

**Context (2026-08-27):** Eighth build phase of the Performance Review "yearly continuity"
redesign. Full design and every owner decision are in
`memory/plan-performance-review-continuity-2026-08-26.md` — **read decision #3 in full before
starting** (the segmented-scoring design, shipped as #154's engine). Also read `memory/
dispatch-152.md` and `memory/dispatch-154.md` in full — both explicitly deferred their UI phases
(4b and 5b) and both PR bodies flagged they'd likely need to combine into one UI dispatch, since
both need the same underlying capability: a review that now has more than one simple period to
display. **This dispatch is that combination.**

## ⚠️ Read this before scoping anything — the review editor is not merely "old-shaped," it is
## actively broken against #152's shipped data model, in specific, confirmed ways

The plan doc and #152/#154's own PR bodies describe the current UI as "the old H1/H2-only flat
form" — true as far as it goes, but an investigation pass for this dispatch (grounded in reading
`src/views/performance-reviews.js` directly, not the plan doc's assumption) found something more
specific and more urgent: **dispatch #152 changed the underlying data shape and function
signatures, and `performance-reviews.js` was only patched enough to stop it from crashing
(`dispatch-152-ui-crash-guard.test.js`) — several real, live features are now silently
non-functional, not just "not yet redesigned."** Confirmed by reading the code:

1. **The KPI/Behavioral period the editor shows is permanently stuck on H2, with no way to reach
   H1.** `ReviewEditor` computes `const mths = halfMonths(review.half); const qKeys =
   halfQKeys(review.half);`. `blankReview` (dispatch #152) no longer sets a top-level `half` field
   on a review at all — `review.half` is `undefined` for every review created since #152 shipped.
   `halfMonths(half){ return half==='H1' ? H1_MONTHS : H2_MONTHS; }` — `undefined==='H1'` is
   false, so this **always** returns `H2_MONTHS` (Jul–Dec), regardless of what the review actually
   needs. There is currently no UI control anywhere that lets a user reach Q1/Q2/H1 data on a
   review at all, even though `blankReview` now populates all 12 months and the engine
   (`computeScores`) computes q1–q4/h1/h2/year every time.
2. **The status/approval workflow is disconnected from real state.** `computeScores`/
   `computeScoreBreakdown` no longer return a `.half` key (only `q1,q2,q3,q4,h1,h2,year`) — so
   `scores.half?.overall` in the header (and in `ReviewList`'s `getScore()`) is always `undefined`,
   and the "% overall" pill never shows. Separately, `review.status` (top-level) no longer exists
   — `#152` moved status to `review.periods.h1.status`/`review.periods.h2.status` — so
   `ReviewEditor`'s `const status = review.status || 'draft'` always reads `'draft'`, and
   `ReviewList`'s status column (`r.status||'draft'`) always shows Draft, regardless of the
   review's real per-half status.
3. **The Submit/Approve/Return/Reopen buttons write to the wrong place.** `ReviewEditor`'s
   `doTransition(newStatus, notes)` calls `onTransition(review.id, newStatus, notes)`, which
   `PerformanceReviewsPanel`'s `handleTransition` forwards as `transitionReview(id, newStatus,
   notes)` — a **3-argument call** against the engine's new **4-argument** signature
   `transitionReview(id, half, newStatus, notes)` (dispatch #154/#152). This shifts `newStatus`
   into the `half` parameter slot and `notes` into the `newStatus` slot — e.g. clicking "Submit for
   Review" calls `transitionReview(id, 'submitted', '')`, which writes to
   `review.periods['submitted']` (a garbage key) with `newStatus` effectively `''`. Neither
   `periods.h1` nor `periods.h2` is ever actually updated by any button in the current UI.
4. **`ReviewList`'s Period column, Half filter, and Score column are all dead.** `r.half` is
   `undefined` for every #152-era review, so the row displays `"undefined 2026"`, the H1/H2 filter
   dropdown matches nothing, and `getScore()` (`computeScores(r,cfg).half?.overall`) is always
   `null` — the Score column is permanently blank.
5. **`NewReviewForm` still has a dead Period (H1/H2) dropdown.** `submit()` calls
   `blankReview(name, role, loc, year, cfg)` (5 args, correctly matching the new signature — this
   part was the actual crash fix #152 shipped) but never reads `half`/`setHalf` at all — the
   dropdown renders, is interactive, and does nothing.
6. **The three print functions** (`printCheckpoint`, `printBlankForm`, `printReview`) all still
   derive `half` the same broken way internally (`const half = review.half` or a passed-in `half`
   parameter sourced from the broken state above) — their period-scoped output is wrong for the
   same reason as item 1.

**None of this throws** — `dispatch-152-ui-crash-guard.test.js` (create a review, open it) passes
today, confirming the specific crash #152 fixed stays fixed. But the approval workflow, the list
view's period/status/score columns, and the H1-vs-H2 KPI view are all silently non-functional
right now, in production, for any review created since v5.197. **This is a real, live regression,
not a cosmetic gap** — fixing it is priority #1 of this dispatch's scope, ahead of adding segment
display. Cite these six points directly in the PR body rather than re-deriving them; they're
enumerated above from a direct code read specifically so this dispatch doesn't have to re-find
them.

## What already exists (read the code, don't re-derive)

- **`src/engine/review-engine.js`** — read these in full before writing any UI code:
  - `computeScores(review, cfg)` / `computeScoreBreakdown(review, cfg)` (dispatch #152): return
    `{q1,q2,q3,q4,h1,h2,year}`, each `{metrics, behavioral, overall}` (or the fuller breakdown
    shape for `computeScoreBreakdown`). No `.half` key exists anymore.
  - `blankReview(name, role, loc, year, cfg, person=null)`: builds `kpis.months` (all 12),
    `behavioralRatings` (all `q1..q4`), and `periods: {h1:{status,statusHistory,statusNotes},
    h2:{status,statusHistory,statusNotes}}` — **approval happens per-half, not once for the whole
    year**, per decision #1's owner quote. No top-level `half`/`status` field exists on the
    object.
  - `transitionReview(id, half, newStatus, notes='')`: 4-arg signature, `half` is `'h1'|'h2'`
    (lowercase, matching the `periods` keys — NOT `'H1'/'H2'` like the old `half` values used
    elsewhere in the UI file; check case carefully when wiring this up).
  - `halfMonths(half)`/`halfQKeys(half)`: unchanged, still expect `'H1'|'H2'` (uppercase) as
    input — these are a display-labeling helper, not tied to the new `periods` keys' casing.
    Reusable for driving the KPI/Behavioral tab's period selector once the UI passes a real value
    instead of `review.half`.
  - `computeSegmentedReview(review, cfg, ds, assignmentRows, opts={})` (dispatch #154): the
    entry point for segment display. Returns `{segments, hasTransitions, rollup}`. Defaults to the
    review's own full year; accepts `opts.periodStart`/`opts.periodEnd` for a sub-range — this is
    the explicitly-flagged hook for per-half segment display (dispatch #154's own comment: "NOT
    built or exercised here… flagged so a future caller knows the hook exists"). **THE COMMON
    CASE**: no `staff_assignments` rows for this person, or exactly one segment spanning the whole
    period → `hasTransitions: false`, and `rollup.value` is proven (by #154's own equivalence
    test) identical to `computeScores(review,cfg).year.overall` for that case — use `hasTransitions`
    to decide whether to render the segment UI at all; when false, the existing scores from
    `computeScores`/`computeScoreBreakdown` are correct and sufficient, no segment UI needed.
  - `computeSegmentScores(review, cfg, segment, ds)`: scores ONE segment
    (`{role, loc, months, qKeys, start, end}`) against its own role's framework/store's targets.
    Returns `{role, loc, start, end, months, qKeys, metrics, behavioral, overall}`.
  - `provisionalSegmentRollup(segments)`: returns `{value, provisional:true, note, segmentCount}`
    — **explicitly a starting point, not authoritative** (its own `note` field says so verbatim —
    surface that note text or equivalent language in the UI, don't just show the number).
  - `resolvePeriodAttribution(periodStart, periodEnd, segments)`: majority-of-days-in-range
    resolver — used internally by `computeSegmentedReview`, you likely don't need to call this
    directly from UI code.
  - `applyReviewOverrides(review, overrides)` (dispatch #149) — the RESOLVED review (auto actuals
    with active overrides applied) is what gets passed to scoring/display today; keep passing the
    resolved review, not the raw one, to any new segment-scoring calls too, matching the existing
    pattern (`ReviewEditor`'s `resolvedReview`).
- **`src/views/performance-reviews.js`** — the ONLY review editor UI, confirmed by grep (no other
  file renders/edits reviews). Key pieces you'll touch:
  - `ReviewEditor` (function, ~line 824): the per-review editing surface — header, status action
    bar, tab bar (`kpi`/`behav`/`devplan`/`summary`), all four tabs.
  - `NewReviewForm` (~line 2466): creation form, still has the dead `half`/`setHalf` state (item 5
    above).
  - `ReviewList` (~line 2356): the review list/filter/table (items 4 above).
  - `SummaryTab` (~line 2207): reads `scores.half` today (broken per item 2) — this is a natural
    home for the segment display (item 2 of scope below) since it already renders the score
    breakdown.
  - `printCheckpoint`/`printBlankForm`/`printReview` (~lines 1469/1593/1750): the three print
    functions (item 6 above).
  - `StatusBadge` (~line 2347): pure presentational, takes a `status` string — reusable as-is once
    fed a REAL per-half status instead of the broken always-`'draft'` value.
- **`PerformanceReviewsPanel`** (~line 2570): top-level panel, already wrapped in `lazyPanel()` in
  `App.js` (`const PerformanceReviewsPanel = lazyPanel(() => import('../views/
  performance-reviews.js')...)`) — this file is NOT in the eager entry chunk today; keep it that
  way (don't add a new top-level static import of this file or its heavy dependents anywhere in
  `App.js`).

## Scope for this dispatch

**Priority 1 — fix the confirmed live regression (items 1–6 above) so the editor correctly
reflects #152's actual shipped shape:**

1. **Build a real in-editor period selector.** Replace the dead `review.half`-derived `mths`/
   `qKeys` with actual UI state (e.g. a Q1/Q2/Q3/Q4/H1/H2/Year selector) that drives which
   months/quarters the KPI tab, Behavioral tab, and header score pill show — using
   `computeScores(resolvedReview, cfg)`'s real `{q1,q2,q3,q4,h1,h2,year}` keys instead of the
   nonexistent `scores.half`. `halfMonths`/`halfQKeys` remain usable for the H1/H2 selector
   positions specifically (they still take `'H1'/'H2'` uppercase) — but you'll need equivalent
   month/quarter lists for the Q1–Q4 and full-year positions too (check whether
   `QUARTER_MONTHS`/similar already exists in `review-engine.js` before writing a new one — it
   does, exported: `QUARTER_MONTHS`).
2. **Fix the status/approval workflow to read and write the real per-half state.** The header
   status pill, the status action bar (Submit/Approve/Return/Reopen), and `ReviewList`'s status
   column must all read `review.periods.h1.status`/`review.periods.h2.status` (whichever half is
   currently selected in the new period selector for the editor; `ReviewList`'s summary column can
   show both, e.g. "H1: Approved · H2: Draft" — your call on exact display, but it must reflect
   BOTH halves' real state, not one fabricated top-level value). Fix the `doTransition`/
   `handleTransition`/`transitionReview` call chain to pass the correct `half` argument
   (lowercase `'h1'|'h2'`) in the right position — this is the specific 3-vs-4-arg bug from item 3
   above.
3. **Fix `ReviewList`'s Period/Score columns and Half filter** to work against the real shape —
   Period shows the year (a review is year-scoped now, not half-scoped, so consider whether a
   single "Period" column still makes sense vs. showing per-half status directly, per decision #1's
   "I'd still wanna see all 4/4 individually plus H1/H2" — your call on exact layout, but the
   column must show REAL data). Score column should show a real value (e.g. the year overall, or
   whichever period the row-level UI decides to surface — document the choice).
4. **Remove or wire up `NewReviewForm`'s dead Period dropdown** — since a review is created once
   per person-year now (no period at creation, per decision #1 and #152's own scope note "a review
   is now just person+role+loc+year, no half selection at creation"), the honest fix is likely
   removing the dropdown and its `half`/`setHalf` state entirely, not wiring it to something that
   no longer applies at creation time. Confirm this reading against the plan doc before removing
   it outright.
5. **Fix the three print functions** to take an explicit period parameter (matching #152's own
   scope note: "the print functions... currently all derive `half` from the record and need a
   period-selector PARAMETER instead") rather than reading the broken `review.half`.

**Priority 2 — surface #154's segmented scoring (Phase 5b proper), built on top of the now-fixed
period selector:**

6. When `computeSegmentedReview(resolvedReview, cfg, ds, assignmentRows)` reports
   `hasTransitions: true` for the review's currently-selected period, surface the segments (e.g.
   "Jan–Mar: AM @ Store 3708" / "Apr–Jun: GM @ Store 5183"), each showing its own category scores,
   alongside `rollup.value` clearly labeled using (or paraphrasing) the engine's own `rollup.note`
   text as a starting point, not a final number. Add a commentary field the reviewer can use to
   record their own adjusted judgment (per the plan doc's explicit "not a rigid formula, reviewer
   can adjust" requirement — decision #3B) — a free-text field is sufficient; do not build a
   second computed-override mechanism, this is a human judgment call recorded as text alongside
   the provisional number, matching the existing `comments.*` free-text pattern already used
   elsewhere on the review object.
   - **Where does `assignmentRows` come from?** Check how `staff_assignments` rows currently reach
     other consumers (`assignment-graph.js`'s own callers, e.g. wherever RLS-scoped visibility or
     `resolveScope` is invoked from a panel) and reuse that same loading pattern — don't invent a
     new fetch path for this one component if an existing loader/prop already threads
     `staff_assignments` rows to a view.
7. **The common case (no transitions — the vast majority of reviews) must look and behave exactly
   as the FIXED (Priority-1) common case does** — i.e., once items 1–5 above are done, a review
   with `hasTransitions: false` should show no segment UI at all and just the regular period
   scores. Verify this explicitly with a test (see below), don't just assume it falls out for
   free.

## Tests

Render-based (per this project's "verification must touch the call site/consumer" standing rule
— render the actual `ReviewEditor`/`ReviewList`/`NewReviewForm`/`PerformanceReviewsPanel`
components, not just call engine functions in isolation, matching `dispatch-152-ui-crash-guard
.test.js`'s and `dispatch-155-labor-tools-tpph-rate.test.js`'s own approach). At minimum:

1. A regression test proving the Priority-1 fixes: create a review, transition it through
   Submit → Approve for H1 specifically, and assert `review.periods.h1.status` (not a fabricated
   top-level field) actually changed, while `review.periods.h2.status` stays `'draft'` — this is
   the test that would have caught the 3-vs-4-arg `transitionReview` bug and must fail against the
   pre-fix code.
2. A test that the editor can display and switch between H1 and H2 (or Q1–Q4) periods and shows
   the correct months/scores for each — proving the `review.half`-derived stuck-on-H2 bug is
   fixed.
3. A test for the flat/common case (`hasTransitions:false`) rendering correctly with no segment UI
   — the "must look exactly as it already does" requirement (scope item 7), verified, not assumed.
4. A test for a segmented review (`hasTransitions:true`, reuse or mirror the synthetic fixtures
   `dispatch-154-assignment-timeline.test.js`/`dispatch-154-segmented-scoring.test.js` already
   built) correctly rendering multiple segments and the provisional rollup with its "starting
   point, not final" framing visible in the DOM.
5. A test confirming a reviewer's manual commentary/override text on the rollup is entered, saved
   (via the existing `onSave`/`upsertReview` path), and reloaded correctly.

## Explicitly OUT of scope

- Any new engine/scoring logic — `computeSegmentedReview`/`computeSegmentScores`/
  `provisionalSegmentRollup`/`resolvePeriodAttribution`/`computeScores`/`computeScoreBreakdown`
  are already shipped and tested (dispatches #152/#154). This dispatch is presentation and
  wiring-correctness only. If you find the engine layer itself needs a change to support the UI,
  stop and say so rather than extending it here.
- `autoPopulateKPIs` becoming segment-aware (documented, open, explicitly deferred by #154's own
  PR body — a transferred segment's ACTUALS still reflect whatever was populated against
  `review.loc` for the whole year; only its TARGETS are correctly re-resolved per segment today).
  Note this limitation visibly in the segment UI if you can do so cheaply (e.g. a tooltip/caption
  on a transferred segment's actuals), but do not fix the underlying gap.
- Departure handling, new-manager notifications, the job-code config table, email wiring,
  multi-role-per-person (build-sequencing items #6–#10 in the plan doc) — unrelated, later work.
- Any change to `staff_assignments`' schema or RLS, or `assignment-graph.js`'s resolution logic —
  read from it, don't modify it.
- The "propose-then-confirm flow for roster-detected changes" (plan doc resolved item D) — that's
  job-code config + notification-panel territory (items #7/#8), not this dispatch. This dispatch
  assumes `staff_assignments` already correctly reflects reality and displays what
  `computeSegmentedReview` resolves from it.

## If the review-editor component doesn't match what's described above

It does — this was verified directly against `src/views/performance-reviews.js` on `main` post
dispatch #155 (v5.200) while writing this dispatch, including reading the exact broken call chains
cited in items 1–6. If a future engineer picks this up and the file has changed since, re-verify
rather than trusting this document — but the six numbered findings above are not guesses, they are
each traced to a specific function/line read directly.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`.
- `npm run build` clean, report before/after entry-chunk gzip. `performance-reviews.js` is already
  behind `lazyPanel()` in `App.js` — confirm this stays true (no new static import of it or a
  heavy new dependency added to the eager entry chunk) and report the LAZY chunk's size change
  too, not just the entry chunk, since that's where this dispatch's real weight lands.
- PR body must state: (a) explicit confirmation of each of the six Priority-1 findings above, and
  exactly how each was fixed; (b) whether `assignmentRows` needed a new loading path or reused an
  existing one, and which; (c) the exact UI location and shape chosen for the provisional-rollup
  commentary field; (d) explicit verification (not assumption) that the common
  (`hasTransitions:false`) case is visually/behaviorally unchanged from the Priority-1-fixed
  baseline.
