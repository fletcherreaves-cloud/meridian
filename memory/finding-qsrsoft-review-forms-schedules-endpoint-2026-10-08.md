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
never reach) — the dashboard's displayed "Score: NN.NN%" (seen in the owner's own screenshot) is
most likely computed client-side from `answered/total`, but this was not independently confirmed
against a specific on-screen value, and no further attempt was made to find a hidden score field.

## What this produced

- `src/engine/forms-reviews.js` — pure normalizer (`REVIEW_FORMS` map, `normalizeFormsReviewRow`),
  PII-safe (userIds only, no names).
- `supabase/schema-qsr-forms-reviews.sql` — `qsr_forms_reviews` table, tenant-scoped RLS,
  `primary key (tenant_id, loc, form_id, started_at)`.
- `scripts/qsrsoft-forms-reviews-pull.mjs` — two-path auth (direct Cognito mint + Playwright
  fallback, same pattern as every sibling pull), short-chunked GET pulls, no manual-upload
  fallback (same reasoning as the completion-pull sibling: nothing pre-existing to protect).
- `.github/workflows/qsrsoft-forms-reviews-pull.yml` + watched in `sync-failure-watch.yml`.

**Not done / explicitly deferred:** no UI panel yet (this pass was the data pipeline only); no
attempt to find a true score/points field beyond what's documented above; `checkFreshness` uses
wide warn/error thresholds (72h/168h) since these forms run per-store, not daily, so "no new
occurrence in N hours" alone isn't an outage signal the way a dark daily stream is — not a
measured threshold, flagged the same way this repo flags every unmeasured threshold.
