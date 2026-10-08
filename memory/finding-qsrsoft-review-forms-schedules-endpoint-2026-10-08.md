---
name: finding-qsrsoft-review-forms-schedules-endpoint-2026-10-08
description: Live-measured (real Cognito login, real API calls, this session's cloud environment allowlisted forms.home.myqsrsoft.com) findings on where the 4 MCDOK People confidential review forms (Crew Review, Crew Trainer Review, Maintenance Review, Shift Manager Review) actually surface in QSRSoft's API, and two real endpoint quirks (single-day query returns zero rows; wider date windows can silently drop recent rows) that the new pull script (qsrsoft-forms-reviews-pull.mjs) is built around.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# QSRSoft review forms — `schedules/scheduled` is the real source (measured 2026-10-08)

**Owner's ask:** build a pull for the 4 MCDOK People review forms (Crew Review, Crew Trainer
Review, Maintenance Review, Shift Manager Review) that `qsrsoft-forms-completion-pull.mjs`
(`completionDetail`) never surfaces.

## Form IDs (confirmed via `GET /api/forms?orgId=...&isPublished=true`)

| formId | title |
|---|---|
| `24409bc6-a228-473b-b070-ed4160f3c93a` | MCDOK Shift Manager Review |
| `2af5d678-329b-4378-945f-d40eddaf17e1` | MCDOK Crew Trainer Review |
| `5c0cc473-c394-4fa7-b76f-e8cf80fb0156` | MCDOK Maintenance Review |
| `8c430399-a218-4b1f-aa85-89aca8cc441d` | MCDOK Crew Review |

All four: `categoryTitle: "MCDOK People"` (category id `b1d61136-213e-4c2a-bfc0-67e133474919`),
`requestApproval: "approval"`, `participants: "reviewedWith"`, `allowConfidentialSubmission: true`,
same 3 approver groups. Not the same category as the literal "People Development" category
(different forms entirely: Crew Performance Review / Maintenance Performance Review / Peak Shift
Performance Verification Tool — different formIds, unrelated to this finding).

## ✅ Measured live: `completionDetail` and `completionByForm` do NOT carry these forms

Queried both, 90-day window, all 27 stores + `noLocation`, using a real minted Cognito ID token
(owner's own credentials, `USER_PASSWORD_AUTH`, confirms MFA is genuinely off — matches CLAUDE.md):

- `completionByForm` with the 4 formIds supplied explicitly → **0 rows**.
- `completionDetail` (no formId filter — server returns whatever's actually assigned) →
  **133,324 total rows, 0 matching any of the 4 target formIds.**

Not a sampling gap — the server's compliance/schedule system genuinely does not route these
confidential, approval-gated review forms through either endpoint.

## ✅ Measured live: `forms/schedules/scheduled` does carry them

```
GET https://forms.home.myqsrsoft.com/api/forms/schedules/scheduled
    ?orgId=a546d4ef-684a-4f25-8bc0-6580af068875&userId=<requesting user's QSRSoft userId>
    &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    &weekStartDate=...&weekEndDate=...&monthStartDate=...&monthEndDate=...
    &locations=<27 unpadded NSNs, comma-joined>
x-auth-token: <token>
```

Returns an array of `{response, form}` pairs for every form type (routine checklists included);
`response` is present only once an occurrence has actually been **started** — there is no
missed/open/schedule concept at all on this endpoint, unlike `completionDetail`.

`userId` scopes the request to that account's own visibility (`sharedWith`/`predefinedSharedWith`
access) — confirmed working for the owner's own account, which all 4 target forms' metadata lists
in `predefinedSharedWith`. A different `QSRSOFT_USERNAME` would need re-measuring, not just
swapping the userId constant.

### Raw `response` shape (one real example, store 5985, captured live)

```json
{
  "userId": "a3121437-...",            // the reviewer's QSRSoft userId
  "formId": "8c430399-...",
  "startedAt": "2026-10-08T19:26:37.739Z",
  "locations": ["5985"],
  "reviewedWith": [{ "name": "Sudahi Gomez", "userId": "39abfa0d-..." }],  // PII — see below
  "sessions": [{ "name": "HYATT STACEY", "startTime": "...", "endTime": "...", "userId": "a3121437-..." }],  // PII — see below
  "totalQuestions": 38,
  "answeredQuestions": 18,
  "isConfidential": true,
  "sharedWith": ["26a9c0de-...", "89ccf3b4-...", ...],
  "linkId": "undefined",
  "anonymous": false,
  "isDeleted": false,
  "foodSafety": null
}
```

🔴 **PII note:** `reviewedWith[].name` (the employee being reviewed) and `sessions[].name` (the
reviewer) are both plaintext names on the raw payload. Neither is stored in `qsr_forms_reviews` —
same rule `qsr_forms_completion.completed_by` already established (schema-qsr-forms-completion.sql's
header): the stable `userId` is the person key; names are never persisted. `sessions` is not
stored at all.

## 🔴 Quirk 1 — a single calendar day returns ZERO rows (API behavior, not missing data)

`startDate=endDate=2026-10-08` → **0 total rows, for every form**, not just the 4 target ones.
Widening to `yesterday→tomorrow` (a 3-day span) immediately surfaced everything. **Any caller must
query a multi-day window, never a single day**, including when the caller only cares about "today."

## 🔴 Quirk 2 — a WIDER window can silently return FEWER recent rows than a narrower one

Same day, three windows, same 27 stores:

| window | total rows | target-form matches (today) |
|---|---:|---:|
| today only (1 day) | 0 | 0 |
| yesterday→tomorrow (3 days) | 937 | **157** |
| week-back→today (8 days) | 2,748 | **2** |

The 8-day window returned *more total rows* than the 3-day window but caught almost none of
today's 157 in-progress occurrences — only 2, both from two days earlier. This is the same class
of silent-truncation risk `qsrsoft-forms-completion-pull.mjs`'s own header already documents for
this host family ("a naive year-long backfill could silently truncate"), now independently
confirmed on a sibling endpoint. **The pull script must use short, overlapping chunks (3 days,
matching that sibling's measured-safe size), never one wide call** — `qsrsoft-forms-reviews-pull.mjs`
enforces `MIN_CHUNK_DAYS=2` (quirk 1) and defaults to `CHUNK_DAYS=3` (quirk 2) for exactly this
reason.

## 🔴 No "submitted" flag exists on the source

Dumped the full raw object (both `response` and `form`) for several live in-progress occurrences,
including one started 19:26 UTC with the probe running at ~19:27 — i.e. actively being filled in
right now. **Only two top-level keys exist on a review-form entry: `response` and `form`.** No
`schedule` object (unlike the routine checklist forms, which carry one), and no
`completedAt`/`status`/`submitted` field anywhere in either object. The only completion signal is
`answeredQuestions` vs `totalQuestions`.

Observed today's in-progress entries plateau at a form-specific near-max rather than a clean 100%:
Crew Review commonly settles at 36/38, Maintenance Review at 37/39, Crew Trainer Review at 30/32,
Shift Manager Review at 55/58 — consistent with `completionByForm`'s own documented
conditional-branching caveat (a form can legitimately finish a few questions short of its nominal
total). **This means `completion_ratio < 1` is NOT by itself evidence a review is still open** —
whether a given ratio represents "done" is a judgment call for whatever consumes this table, not
something the pull or its normalizer asserts. No `pointsPossible`/`pointsReceived`-style score
field was found anywhere in this shape either (unlike `completionByForm`'s shape, which these forms
never reach) — at the time this section was written, the real score field had not yet been
found. **It has since been found — see the follow-up section below. The paragraph above
describing the dashboard Score as "most likely answered/total" is SUPERSEDED and wrong; kept
here, struck by this note, because the correction is more useful than a silent edit.**

## ✅ FOLLOW-UP (same day, 2026-10-08) — the real Score, and the actual review content

Second pass, in response to the owner's ask: "see if we can see the contents of the review as
well... see if you can figure out the scoring part." Both answered live, same session, same
credentials.

### The real content/score endpoint

```
GET https://forms.home.myqsrsoft.com/api/forms/responses/questions
    ?orgId=...&formId=...&userId=...&startedAt=...
```

Requires exactly `formId`, `startedAt`, and `userId` (or `anonId`) — a bare/partial call returns
`400 {"message":"formId, startedAt, and userId or anonId are required"}`, confirming the shape
before it was even tried with full params. Returns `{"questions": [...]}`, one entry per question
on the form, each carrying its own `answer` and (for scored questions) `pointsReceived` — this is
the SAME question list `GET /api/forms/questions?formId=...` returns for the blank form template,
just with `answer`/`pointsReceived`/`lastEditedAt` merged in per-response.

**`answer` is a 0-based INDEX into that question's own `options[]`, not the points value
directly.** Confirmed by resolving several real indices against their options and checking the
paired `pointsReceived`: options `Outstanding(3)/Excellent(2)/Good(1)/NeedsImprovement(0)`,
`answer:1` (index 1 = "Excellent") paired with `pointsReceived:2` — matches only when read as an
index, not as a literal points value. Held across every question checked.

### The real Score — points-weighted, NOT completion_ratio

**completion_ratio (answered/total question COUNT) is not the dashboard's Score.** Measured side
by side on real responses, same session:

| form | raw answered | answered% | points | **real Score** |
|---|---|---:|---|---:|
| Maintenance Review, store 5985 | 38/39 | 97.44% | 29/100 | **29.00%** |
| Maintenance Review, store 10422 | 37/39 | 94.87% | 91/100 | **91.00%** |

Two responses nearly identical by answered-count (97% vs 95%) scored 29% and 91% respectively by
points — the metric the owner's dashboard actually shows is about review QUALITY (the ratings
given), not how many fields got filled in. The real formula:

```
scorePct = Σ pointsReceived / Σ pointsPossible   (summed over questions with pointsPossible > 0)
```

Every form's point-bearing questions summed to exactly **100** in every capture — a deliberate
100-point rubric by the forms' own design, not a coincidence worth normalizing further.
`src/engine/forms-reviews.js`'s `normalizeFormsReviewContent()` implements this.

### 🔴 PII land mine found in the SAME payload: a real pay-rate field

These forms embed at least one free-text question literally titled **"Current Wage"**, whose
`answer` is the employee's actual hourly pay rate (e.g. `"17.00"`). This is the exact
`pii_payrate`/`hourlyPayRate` scope CLAUDE.md's standing PII rules already flag as sensitive on
`employeeRoster`/`storePeoplePunches` — now confirmed reachable through an ordinary form response
too, not just those two endpoints. **Handled by allow-list, not denylist:** `content` only ever
stores questions where `hasOptions === true` (a structured rating/choice question, resolved to
its selected option's label) — every free-text, date, or other open-ended question is dropped
unconditionally regardless of its title, so a FUTURE wage-adjacent question with different wording
is caught by the same rule without needing to be anticipated by name.

### Crew Review's content/score is NOT reachable by the owner's own account

Sampled 11 responses spread across Crew Review's full history (106 total responses) — **11 of 11
denied**, every time: `403 {"message":"You are not authorized to view this confidential
response"}`. The SAME call, same account, succeeded on every sampled response for the other 3
forms (Shift Manager Review, Crew Trainer Review, Maintenance Review) — both ends tested, not just
one. This is a real, form-specific authorization rule on QSRSoft's side, unrelated to this form's
own `predefinedSharedWith` (which DOES list the owner's userId) — sharedWith apparently does not
by itself grant per-response content visibility for this particular form. `CONTENT_ACCESSIBLE_
FORM_IDS` (`forms-reviews.js`) excludes Crew Review's formId so the pull doesn't spend an API call
per Crew Review occurrence (there were already 106+ and climbing) on a request known to always
fail. If QSRSoft-side permissions for this account are ever changed, re-measure before assuming
this still holds.

## What this produced

- `src/engine/forms-reviews.js` — pure normalizers: `normalizeFormsReviewRow` (schedule-list
  metadata), `normalizeFormsReviewContent` (score + PII-safe content), `REVIEW_FORMS`,
  `CONTENT_ACCESSIBLE_FORM_IDS`.
- `supabase/schema-qsr-forms-reviews.sql` — `qsr_forms_reviews` table (tenant-scoped RLS,
  `primary key (tenant_id, loc, form_id, started_at)`), now including `score_points_possible`/
  `score_points_received`/`score_pct`/`content`/`content_available`.
- `scripts/qsrsoft-forms-reviews-pull.mjs` — two-path auth (direct Cognito mint + Playwright
  fallback), short-chunked GET pulls for the schedule list, PLUS one additional per-occurrence
  `responses/questions` GET for every occurrence whose form is in `CONTENT_ACCESSIBLE_FORM_IDS`
  (paced 150ms apart). No manual-upload fallback (same reasoning as the completion-pull sibling).
- `.github/workflows/qsrsoft-forms-reviews-pull.yml` + watched in `sync-failure-watch.yml`.

**Not done / explicitly deferred:** no UI panel yet (this pass is still the data pipeline only —
score/content are now in the table, nothing renders them). `checkFreshness` uses wide warn/error
thresholds (72h/168h) since these forms run per-store, not daily — not a measured threshold,
flagged the same way this repo flags every unmeasured threshold.

## 🔴 CORRECTION (same day, first real production run) — "Quirk 2" was mis-diagnosed; the real
## cause is `endDate` being EXCLUSIVE, and it subsumes "Quirk 1" too

The pull shipped, the Supabase table was created by hand (idempotent `create table if not
exists`, run manually in the SQL editor — same as every other `schema-*.sql` file in this repo,
confirmed via a live `PGRST205` query before and after), and the workflow was triggered manually
to backfill. **It saved only 2 rows for the whole 14-day window**, when a same-day manual probe
earlier in this file had found 157 in-progress occurrences on 2026-10-08 alone. Real job log:

```
[forms-reviews] pulling 2026-09-24..2026-10-08 in 5 chunk(s) of ~3 day(s)
[forms-reviews] 2026-09-24..2026-09-26: 787 raw entries -> 0 saved
[forms-reviews] 2026-09-27..2026-09-29: 796 raw entries -> 0 saved
[forms-reviews] 2026-09-30..2026-10-02: 788 raw entries -> 0 saved
[forms-reviews] 2026-10-03..2026-10-05: 782 raw entries -> 0 saved
[forms-reviews] 2026-10-06..2026-10-08: 787 raw entries -> 2 saved
```

The first 4 chunks' zero counts are plausibly real (these forms' `lastEditedAt` was 2026-10-08
for several of them — McGill Molly edited them THAT DAY — consistent with the review program
genuinely starting around 2026-10-06, not a bug). **The last chunk is the tell.** `2026-10-06
..2026-10-08` (3 days wide, end = today) saved only 2 rows, but an exploratory probe earlier
this same file documented found **157** target-form matches in a same-width window,
`2026-10-07..2026-10-09` (end = **tomorrow**, one day later). Same width. Wildly different
result. The variable that actually matters is not window WIDTH (this file's original "Quirk 2"
write-up) — it's **whether the window's end date reaches one day past the day you actually want**.
`startDate===endDate` returning zero rows ("Quirk 1") is the identical mechanism at its most
extreme: a range that starts and ends on the one day you want excludes that day entirely.

**One quirk, not two: `endDate` is exclusive.** `chunkDays()` was rewritten so every chunk it
returns queries one calendar day past its own logical last day — the old single-day special case
is gone, replaced by unconditional padding that covers both the single-day and the
wider-but-ending-at-today cases with one mechanism. Re-measure before assuming this still holds
if QSRSoft ever changes this endpoint's behavior; this file's original "Quirk 2" section above
is **superseded by this correction**, not deleted, so a future reader can see exactly what was
believed, what disproved it, and what replaced it.

**Process note:** the original two-probe comparison (1-day / 3-day-ending-tomorrow / 8-day-
ending-today) never isolated the real variable because no two probes differed in ONLY width or
ONLY end-date-padding — exactly the trap CLAUDE.md's own "measure it, don't reason about it" rule
exists to catch. The production run's own log, compared against an EARLIER exploratory probe of
the same width, is what isolated it. A passing test suite and a clean build did not catch this —
only checking the actual row count the real pull produced did.
