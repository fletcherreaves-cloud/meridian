# Dispatch #152 — Performance Review continuity, Phase 4a: per-person-per-YEAR data model +
# scoring engine restructure (data/engine layer only — no UI changes yet)

**Context (2026-08-26):** Fifth build phase of the Performance Review "yearly continuity"
redesign. Full design and every owner decision are in
`memory/plan-performance-review-continuity-2026-08-26.md` — **read that file in full before
starting**, especially decision #1 (the exact restructure this dispatch implements, in the
owner's own words). This is build-sequencing item **#4**, split into two parts for review-ability
the same way item #3 was (dispatch #150/#151) — **this dispatch is Phase 4a: the data model and
scoring engine only.** Phase 4b (the UI: review creation form, list view, the in-editor period
selector, and the three print functions) is a separate, later dispatch — do not attempt it here.

Depends on dispatch #148 (v5.189, role ladder), #149 (v5.190, override mechanism — the override
storage keys on `review_id`+`month`+`metricKey`, which this dispatch must keep working), #150/#151
(v5.191/v5.192, assignment graph + RLS — not directly touched here, but see the person-identity
note below).

## What exists today (read the code, don't re-derive — grounded in a full investigation pass)

- **`reviewId(name, year, half)`** (review-engine.js): builds `id` as
  `slug(name) + '_' + year + '_' + half` (e.g. `"ronald_mcdonald_2026_H1"`). This is the ENTIRE
  link between two reviews for the same person/year today — there is no person-identity field
  connecting an H1 record to its H2 counterpart. A name change, typo, or two employees sharing a
  name silently breaks or collides this link.
- **`blankReview(name, role, loc, year, half, cfg)`** (review-engine.js) constructs the review
  object. Top-level shape: `{id, name, role, loc, year, half, geid, status, templateSnapshot,
  kpis:{months}, behavioralRatings, comments, devPlan, wage, createdAt, updatedAt}`.
  - `kpis.months` is keyed by **absolute month number** (1-12), but **only populated for the
    half's 6 months** — `half==='H1' → months 1-6`, `half==='H2' → months 7-12`. The storage shape
    is already numeric-month-keyed (not half-scoped by construction) — only the population LOOP is
    half-scoped. This is a natural, low-risk extension: populate all 12 months instead of 6.
  - `behavioralRatings` only gets the half's two quarter keys (`{q1,q2}` or `{q3,q4}`).
  - `comments` ALREADY allocates all four `q1..q4` keys plus `midYear`/`eoy` regardless of half —
    this part needs no change, it was already forward-looking.
- **`computeScores(review, cfg)`** already computes **per-quarter** scores today, then aggregates
  to a half: returns `{q1:{...},q2:{...},half:{...}}` (or `q3`/`q4`/`half` for H2). There is no
  year-level aggregation anywhere — `half` is the ceiling today. `computeScoreBreakdown()` has the
  identical shape and the identical hard cap.
- **`schema.sql`'s `reviews` table**: `id text primary key, data jsonb, reviewee_name text,
  reviewee_loc text, review_year integer, review_half text check (in ('H1','H2')), status text,
  org text, owner_id uuid, created_at, updated_at`.
- **`review_overrides` table** (dispatch #149) keys on `review_id` (FK to `reviews.id`) + `month`
  (absolute 1-12) + `metricKey`. Since `month` is already absolute, this survives an id-scheme
  change mechanically fine as long as the FK target changes consistently — **there is no real
  override data to migrate** (matches decision #1's "no reviews in the system... safe to redesign
  clean" — re-confirm this is still true for `review_overrides` too before assuming it).
- **`review.geid`**: exists but is NOT a general person-identity field — it's narrowly the
  shift-attribution field for `SHIFT_ATTRIBUTABLE_ROLES = ['AM','DM','SM']` only (null for
  GM/AS/OM). Do not repurpose it as "the" person id without reading its one real consumer
  (`autoPopulateKPIs`'s shift-summary attribution) first.
- **Status/workflow**: `REVIEW_STATUSES` (`draft|submitted|approved|returned`) lives as one
  top-level `status` field per review record today, with `transitionReview()` appending to a
  `statusHistory` array. This is currently **per-half** (since a record is a half). See the real
  design decision this dispatch has to make, below.

## The real shape to build (owner's own words, decision #1)

*"the reviews should be per person per year... I'm not saying we need to lose the H1 and H2 more
so that they should be rolled up into the entire year review... quarterly roll ups to include the
mid year and end of year so I'd still wanna see all 4/4 individually plus a six month half first
half year review and a second six month second half year review."*

One review record per `(person, year)`, containing:
- Q1/Q2/Q3/Q4 scored individually (as today — just no longer split across two top-level records)
- H1 rollup = Q1+Q2, H2 rollup = Q3+Q4 (as today's `half` score already computes — generalize the
  SAME formula to run twice per record instead of once)
- A full-year overall rollup (Q1+Q2+Q3+Q4 — new; combine H1+H2 the same way H1 already combines
  Q1+Q2, don't invent a different aggregation rule)

**No migration burden — re-confirm, then proceed:** *"There are currently no reviews in the system
that have to be saved as they've all been for testing."* Every review record that exists today is
test data. Redesign the schema clean; do not build migration logic for zero real records. **Before
deleting/recreating anything, confirm live via the Supabase REST API (service-role key) that the
`reviews` and `review_overrides` tables are still empty or test-only** — this was true when the
plan doc was written, but re-verify rather than trust a days-old statement, per this project's
"measure it, don't reason about it" standing rule.

## Scope for this dispatch

1. **New id scheme.** Replace `reviewId(name, year, half)` with a year-only id
   (`reviewId(person, year)` or similar — your call on the exact name, but the FUNCTION SIGNATURE
   changes, so grep every call site). **Real design decision, make the call and document it:**
   should the review's person-identity field become the SAME `person` identity space dispatch
   #150/#151 already established for `staff_assignments.person`/`profiles.person` (a geid for
   roster-sourced roles, a plain name string otherwise) — unifying review identity with the
   assignment graph — or should it stay a freeform slugified name, decoupled from that system?
   Recommend the former (it directly serves decision #2's "the review follows the PERSON," and a
   future dispatch will need to resolve "whose review is this" against the assignment graph
   eventually anyway) — but this is a genuine architectural fork, not a mechanical rename, so make
   the call explicitly and write the reasoning in the PR body rather than silently picking one.
   Whichever you choose, do NOT repurpose the existing narrow `review.geid` shift-attribution
   field for this — it's null for GM/AS/OM and means something else entirely (see above).
2. **Restructure `blankReview`** to build a full-year object in one pass, dropping the `half`
   parameter and the half-scoped population loops:
   - `kpis.months`: populate all 12 months (1-12), not 6.
   - `behavioralRatings`: populate all four `q1,q2,q3,q4` keys, not two.
   - `comments`: unchanged (already full-year-shaped).
   - Drop the top-level `half` field from the object (a record now spans the whole year — there is
     no single "half" to store). See the status decision below for where half-ness moves to.
3. **Status/workflow — a real design decision the owner's own words already answer, read
   carefully.** The owner explicitly wants to "still... see all 4/4 individually plus a six month
   half first half year review and a second six month second half year review" — meaning the H1
   and H2 review CONVERSATIONS remain distinct real-world events with their own sign-off, even
   though they now live in one record. So `status`/`statusHistory`/`transitionReview()` must become
   **per-half within the year record** (e.g. `review.periods = {h1:{status,statusHistory,
   statusNotes}, h2:{...}}`), not a single year-level status — a year isn't "approved" as one
   atomic event, its two halves are approved separately, at different points in the year.
   `transitionReview(reviewId, half, newStatus, notes)` (new `half` parameter) is the natural
   extension of the existing function; keep its audit-trail shape (`{from,to,notes,at}`) identical,
   just nested under the right half. Do NOT design a third option (e.g. per-quarter status) — the
   owner's quote is specific to halves for the workflow, quarters are for scoring only.
4. **Extend `computeScores`/`computeScoreBreakdown`** to compute all of: `q1,q2,q3,q4` (as today,
   just always all four now, not half-gated), `h1` (=q1+q2, same formula as today's `half` for an
   H1 record), `h2` (=q3+q4, same formula as today's `half` for an H2 record), and a new `year`
   rollup combining h1+h2 via the IDENTICAL aggregation rule h1 already uses to combine q1+q2 (do
   not invent a different formula for the year level — generalize, don't reinvent). Return shape:
   your call on exact key names, but it must expose all four quarters + both halves + the year
   rollup from one call, not four separate calls.
5. **`schema.sql`**: drop `review_half` (a record is a full year now — no half column makes sense
   at the row level; per-half status now lives inside `data` JSONB per the status decision above).
   Confirm `review_overrides`' `review_id` FK still resolves correctly under the new id scheme (it
   should, mechanically — override rows key on `review_id`+`month`+`metricKey`, and month stays
   absolute). Live production Supabase — document exactly what SQL to run and what a human needs to
   verify, same pattern as every prior schema dispatch.
6. **Tests**: `blankReview`'s own describe block (`review-engine-snapshot.test.js`) needs updating
   for the new shape (12 months, 4 behavioral quarters, no top-level `half`, new id scheme) — don't
   leave the old half-scoped assertions in place expecting them to still pass by accident. New tests
   for: `computeScores`/`computeScoreBreakdown` producing all four quarters + both halves + year
   rollup correctly from one call; the year rollup formula matching h1's own q1+q2 formula applied
   at the h1+h2 level (a concrete numeric example, not just "it runs"); `transitionReview()`'s new
   per-half status shape, including that h1 and h2 can be in different statuses simultaneously
   (e.g. h1 `approved` while h2 is still `draft`) and that transitioning one half's status doesn't
   touch the other half's `statusHistory`.

## Explicitly OUT of scope for this dispatch (do NOT touch)

- **Phase 4b (later dispatch)**: `NewReviewForm`'s H1/H2 picker (a review is now just
  person+role+loc+year, no half selection at creation), `ReviewList`'s "Period" column (becomes
  just year, or a status-per-half summary), `ReviewEditor`'s in-record period selector (a way to
  navigate Q1/Q2/Q3/Q4/H1/H2/full-year views within one record — real, nontrivial UI work), and
  the three print functions (`printCheckpoint`/`printBlankForm`/`printReview`) which currently all
  derive `half` from the record and need a period-selector PARAMETER instead. None of this is
  in scope here — this dispatch's job is that the DATA and SCORING are correct; presenting them is
  Phase 4b's job. If leaving the UI unwired means the app doesn't build or existing UI breaks
  hard, that's expected and acceptable for this phase (matching how #150's assignment-graph engine
  shipped with zero UI wiring) — but if it's a trivial one-line fix to keep the existing UI from
  crashing (e.g. a null-check where `review.half` no longer exists), fix that specific crash, don't
  build the real Phase 4b UI.
- Promotion/transfer segmented scoring (item #5) — a review record still has exactly one
  `role`/`loc` for its whole year in this dispatch; making a MID-YEAR role/store change split
  scoring is explicitly item #5's job, built on top of this data model, not solved here.
- Departure handling (#6), the new-manager notification panel (#7), the job-code config table
  (#8), email wiring (#9), multi-role-per-person (#10).
- Do NOT touch `staff_assignments`/the assignment-graph resolution engine (dispatch #150) or the
  `reviews` RLS hierarchy-scope policies (dispatch #151) — this dispatch is about the shape of ONE
  review record, not who can see it.

Do not let this dispatch grow into any of the above. If something here turns out to genuinely
require one of those first, stop and say so rather than expanding scope.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`. **A full-suite regression is expected and acceptable here**
  given how central `blankReview`/`computeScores` are — if changed tests in `performance-reviews.js`
  itself (the UI file, out of scope for this dispatch) fail to even IMPORT because of the shape
  change, either fix the minimal crash (per the OUT-of-scope note above) or, if that's non-trivial,
  stop and report exactly what's blocked rather than guessing at UI scope that belongs in Phase 4b.
- `npm run build` must still pass clean — report before/after entry-chunk gzip.
- PR body must state: (a) the exact new id scheme and person-identity decision made in step 1, with
  reasoning; (b) exactly what SQL changed in `schema.sql` and what a human needs to verify live
  against production Supabase, confirming first that `reviews`/`review_overrides` are still
  empty/test-only before treating the schema change as migration-free; (c) confirmation that the
  year-rollup formula is proven identical in structure to the existing half-rollup formula, not a
  new invention.
