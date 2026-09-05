---
name: finding-complaints-propel-api-2026-08-26
description: A working Customer Care complaint-case API on propel.mcd.com — per-store complaint cases with issue code/subcode, dates, status and customer comments. Unlocks the actual-data side of Performance Review's Complaint Contacts/100K metric, which has had zero automated source until now. Denominator confirmed (guest count); Timeframe has no single-month option, so a monthly figure needs a wide pull filtered by date.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Customer complaints have an API — `propel.mcd.com/api/customer-care`

Owner-captured 2026-08-26, live from a logged-in Propel session (Customer Care Restaurant View,
store 03708 Ardmore-Broadway). **No session cookie is recorded in this file; see the security
note.** Real customer complaint text was in the response — paraphrased/truncated below rather than
reproduced verbatim; see that same note.

## The endpoint

```
GET https://propel.mcd.com/api/customer-care
      ?v=786
      &action=getCustomerCareRestaurantCaseList
      &locationId=<hierarchy-node>
      &timeFrame=1
      &page=1
      &rowsPerPage=5
      &sortBy=childCaseId
      &descending=false
```

Required headers observed: `hierarchy-level: 12`, `hierarchy-node: <same value as locationId>`,
`territory-code: 840`, `referer: https://propel.mcd.com/app/`, `accept: application/json`.
**Auth is cookie-based** (`GlobalAS_SessionId` + friends) — the exact same auth mechanism already
documented for the EcoSure/CFV/RGR endpoints in `finding-ecosure-propel-api-2026-08-22.md`, not a
separate credential. `locationId` **is** the `hierarchy-node`, matching that file's already-solved
identity chain exactly (`195500300689` = Ardmore-Broadway = Meridian `loc` `0003708`) — **the
27-store hierarchy-node map from that file is directly reusable here, no new mapping work
needed.**

## The payload

```json
{
  "totalCount": 60,
  "results": [
    {
      "locationId": "195500300689",
      "parentCaseId": 35139570,
      "childCaseId": 35139570,
      "issueCode": "Service",
      "issueSubCode": "Received Wrong Ingredients",
      "incidentDate": "2026-01-05",
      "receivedDate": "2026-01-06",
      "caseStatus": "CLOSED",
      "abbreviatedCustomerComments": "<~200-char preview>",
      "customerComments": "<full customer narrative text>",
      "childCases": []
    }
  ]
}
```

| field | notes |
|---|---|
| `locationId` | the hierarchy-node, same value passed in as `locationId=`/`hierarchy-node:` |
| `parentCaseId` / `childCaseId` | equal for a simple case; a case with multiple bundled issues (the UI's "Multiple Issues" row) has `childCases[]` populated, each with its own `childCaseId` and its own `issueCode`/`issueSubCode` — one observed case split into a `Service`/`Charged - Equipment or Operations Issue` case AND a nested `Unspecified`/`Mobile Refund Request` child, both dated the same day |
| `issueCode` | category — observed values: `Service`, `Quality`, `Unspecified` |
| `issueSubCode` | subcategory, e.g. `Received Wrong Ingredients`, `Received Wrong Menu Item`, `Speed of Service`, `Condition / Texture / Appearance`, `Charged - Equipment or Operations Issue`, `Mobile Refund Request` |
| `incidentDate` / `receivedDate` | ISO `YYYY-MM-DD`; a day or two apart typically (customer reports after the fact) |
| `caseStatus` | observed: `CLOSED` (only status seen in this capture — open-case values unconfirmed) |
| `abbreviatedCustomerComments` | ~200-char truncated preview of the below |
| `customerComments` | full customer-submitted narrative text — real, sometimes lengthy (one example ran ~1500 characters). **Handle like customer-submitted free text, not an internal record** — see security note |
| `childCases` | array, empty for a simple case; see `parentCaseId`/`childCaseId` above |

## The measured number — 60 complaint cases, one store, YTD 2026

**Store 03708 (Ardmore-Broadway) alone has `totalCount: 60`** for the `timeFrame=1` window, which
the UI's own Timeframe dropdown showed as **YTD** at capture time — roughly one complaint case
every 4 days, ~8 months into the year. This is the first real, measured complaint volume Meridian
has ever seen for any store; nothing in the app previously had a live number to compare against.

## 🎯 What this unlocks — the Complaint Contacts/100K metric's missing ACTUAL side

`review-engine.js`'s `complaints` metric (`key:'complaints', label:'Complaint Contacts/100K'`) has
`src:'manual'` — confirmed via dispatch #132's own investigation (still true, re-checked
2026-08-26): **no automated actual-data source exists anywhere in the app for this metric.** The
*target* side was separately investigated and settled (no real workbook column — the yearly
workbook's "1-800 Contacts" is a raw count, not a `/100K` rate; target is override-only via
`tComplaintsTarget`, `target-overrides.js`). This endpoint is the first real candidate for the
*actual* side.

**✅ RESOLVED (owner, 2026-08-26): the `/100K` denominator is guest count.** So the metric is
`(complaint case count / guest count for the same period) × 100,000` — a real, computable rate
once the case-count side has a matched period. Guest count itself is already a live Meridian
metric (multiple DAR/sales-cloud sources feed it elsewhere in the app) — no new pull needed for
that half.

## Integration constraints — identical to the EcoSure precedent, reuse that design, don't re-derive it

- **SSO + MFA gated, same as every other Propel endpoint.** Headless/unattended pull is
  impossible — `finding-ecosure-propel-api-2026-08-22.md`'s "on-demand, not scheduled" design
  (owner-approved, Playwright + persistent authenticated browser profile on the #65 Mac mini,
  `workflow_dispatch` only, no `schedule:` block, human triggers it and completes MFA once per
  session) applies here without modification — this is the same host, the same auth, the same
  answer.
- **Per-STORE call** (`locationId`) — a full-estate pull is **27 calls**, same shape as the
  EcoSure CEV endpoint. Reuse the existing hierarchy-node map; no new store enumeration needed.
- ✅ **RESOLVED 2026-09-05 — all 5 `timeFrame` values measured directly** (store 03708 Ardmore-
  Broadway, live console probe, `v=802` — see the version-drift note below). `timeFrame=6` cleanly
  **400 Bad Request**, confirming there is no 6th option; only 1–5 are real:

  | `timeFrame` | `totalCount` | date pattern (5-row sample, ascending by `childCaseId`) | inferred label |
  |---|---|---|---|
  | 1 | 62 | Jan–Feb 2026 | **YTD** |
  | 2 | 49 | 2024 – early 2025 | **Baseline YTD** (same YTD window, prior year) |
  | 3 | 27 | mid-June 2026 onward | **Trailing 3 Months** |
  | 4 | 14 | mid-2025, same months as `timeFrame=3` | **Baseline Trailing 3 Months** |
  | 5 | 182 | starts Jan 2024 | **History** |

  ✅ **Owner-confirmed 2026-09-05 by reading the actual dropdown: the labels match exactly as
  inferred above.** No longer just well-evidenced — visually verified. **None of the five is a
  single calendar month.** For a monthly Performance Review figure, pull `timeFrame=5` (History)
  and filter client-side by `incidentDate` into whatever period is needed — same wide-pull-then-
  filter shape Meridian already uses for other cloud streams.
- ✅ **RESOLVED 2026-09-05 — `rowsPerPage` does NOT cap, unlike EcoSure's endpoint.** Measured
  directly at `timeFrame=1` (`totalCount=62`): `rowsPerPage=5`→5 results, `20`→20, `50`→50,
  `100`→62 (topped out at the real total, not an artificial ceiling below it). A real pull can
  request a large `rowsPerPage` and get everything in one call per store per `timeFrame` — no
  EcoSure-style forced pagination needed, though paging defensively until `results.length` reaches
  `totalCount` is still the safer general pattern for a store with more cases than any guessed
  number.
- ⚠️ **NEW finding 2026-09-05: the `v=` query parameter is a live, drifting Propel build number,
  not a stable API version — do not hardcode it long-term.** The original 2026-08-26 capture used
  `v=786`; by 2026-09-05 the real UI was sending `v=802` for both `customer-care` and `navigation`
  (`getDescendants`) calls, and every request using the stale `786` value failed with a uniform
  `409 Conflict` regardless of `timeFrame`/`rowsPerPage` — a version-gate rejection, not a data or
  auth problem (confirmed by the identical failure across 10 varied requests, and by success the
  moment `v` was corrected). **Any future capture or pull must re-derive `v=` from a fresh live
  request each time it's built**, not reuse a value recorded in an old finding file — this applies
  to every Propel endpoint, not just this one.
- **Only `CLOSED` was observed** — whether `caseStatus` has other values (open/pending) and
  whether those should count toward the metric is unconfirmed.

## ✅ RESOLVED 2026-09-05 — design decision made: wide pull, filter by date at read time

Raised to the owner 2026-08-26; his response then was *"not sure yet how we resolve that"* —
genuinely open. **Decided 2026-09-05: pull the widest window (`History`, `timeFrame=5`) once,
store every case with its own `incidentDate`, and bucket into whatever calendar month a review
needs by filtering the STORED data — never by asking Propel for "just this month."** Owner's own
words confirming the approach: *"each case is dated, we can infer monthly data from there."**

This is the same "pull wide, filter by period at read time" shape Meridian already uses for other
cloud streams (e.g. auto-first metric sourcing across DAR/Glimpse/Sales Ledger), not a new
pattern. Concretely, this means a new Supabase table (with `tenant_id`+RLS per the standing "new
stream" checklist), an on-demand Playwright pull (same persistent-profile design as EcoSure, a
Sync button, never scheduled), and `autoPopulateKPIs` filtering that table's rows by whichever
date field is authoritative into the review's month — matching how `metricAvg(ds, loc, range, ...)`
already filters other per-day sources by a date range today.

**One sub-question owner-answered (2026-08-26, hedged — "pretty sure it is incident date"):**
`incidentDate` (when the complaint actually happened) is the field to bucket by, not
`receivedDate` (when the case was logged) — treat as the working assumption, not fully certain
per the owner's own hedge; confirm if it matters for a real number someone will act on.

**One sub-question still open:**
- Whether `History` genuinely returns everything with no floor, or is itself capped somewhere
  (unconfirmed) — if it's capped, a store's oldest history could still be unreachable and a
  narrower "pull `Trailing 3 Months`/`Baseline Trailing 3 Months` on a rolling cadence instead of
  one big `History` pull" design might be safer regardless.

**This is real scope, not a quick fix** — matches the EcoSure endpoint's own build complexity
(on-demand pull + new table + Sync button), not something to build opportunistically alongside a
smaller dispatch. The design question is resolved; the build itself is a real dispatch-sized task
whenever it's picked up.

## What remains open before any pull is built

1. ~~What does `/100K` normalize against?~~ **Answered: guest count.**
2. ~~Capture the other 4 `timeFrame=` values and confirm there's genuinely no single-month
   option.~~ **Answered 2026-09-05: all 5 values measured (1=YTD, 2=Baseline YTD, 3=Trailing 3
   Months, 4=Baseline Trailing 3 Months, 5=History), `timeFrame=6` 400s confirming no 6th option,
   and confirmed none is a single calendar month** — see the table above.
3. ~~Does `rowsPerPage` actually cap, and at what value?~~ **Answered 2026-09-05: no cap observed
   up to 100 (topped out at the real `totalCount` of 62, not an artificial ceiling).**
4. Are there `caseStatus` values besides `CLOSED`, and should they be included?
5. Does a `-` prefixed `issueSubCode` like "Charged - Equipment or Operations Issue" ever appear
   with real encoding quirks (the raw payload used a plain hyphen, not an en-dash, unlike this
   file's own earlier rendering — worth double-checking on ingest, matching the EcoSure finding's
   own "trim on ingest" caution for other Propel fields with formatting quirks).

## 🔒 Security note

The capture included a full cURL with a live `GlobalAS_SessionId` cookie and the real
`customerComments`/`abbreviatedCustomerComments` text for 5 real customer complaints. **Neither is
recorded here** — this file keeps only the endpoint shape, header *names*, the field schema, and
short paraphrased examples of the category/subcategory text (which is UI-visible, not sensitive).
The session should be treated as disclosed-by-sharing; re-authenticate before the next capture.
Full customer narrative text should be handled with the same care as any customer-submitted free
text if it's ever surfaced in-app — not printed/exported/logged without thinking about it first,
though it is not the structured-PII class of field the EcoSure `reviewedWithName` employee field
is (no `get_or_create_employee_token()`-style tokenization applies here; there's no person-name
field in this payload).
