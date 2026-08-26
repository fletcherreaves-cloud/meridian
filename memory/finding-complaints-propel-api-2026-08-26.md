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
- **`timeFrame=1` is confirmed = "YTD" among a real 5-option set, but the other 4 values are
  still uncaptured.** Owner-captured (2026-08-26) screenshot of the Timeframe dropdown: **YTD,
  Baseline YTD, Trailing 3 Months, Baseline Trailing 3 Months, History** — YTD was the option
  highlighted/selected at capture time, corroborating `timeFrame=1` = YTD. **None of these five
  is a single calendar month** — a real, new problem for wiring a monthly Performance Review
  figure: there is no "this month" `timeFrame` option to request directly. The likely path is
  requesting the widest option (`History`, once its numeric value is captured) and filtering
  client-side by `receivedDate`/`incidentDate` into whatever period a review month needs — same
  shape as how Meridian already treats other wide-pull-then-filter cloud streams. Capture the
  remaining 4 values' actual `timeFrame=` numbers (open one at a time, read the resulting
  request) before building anything.
- **`rowsPerPage` cap — STILL UNTESTED**, despite being asked about directly (owner's reply was
  an acknowledgment, not a measurement — do not read it as "confirmed fine"). The EcoSure
  visit-list endpoint capped a requested `rowsPerPage=50` at 20 despite the ask, so **any client
  must page until `results.length` reaches `totalCount`, never trust a large `rowsPerPage`
  value** — assume the same caution here until someone actually requests e.g. `rowsPerPage=100`
  and reads what comes back.
- **Only `CLOSED` was observed** — whether `caseStatus` has other values (open/pending) and
  whether those should count toward the metric is unconfirmed.

## 💡 Proposed resolution for "no single-month Timeframe" — a recommendation, not a decision

Raised to the owner 2026-08-26; his response was *"not sure yet how we resolve that"* — genuinely
open, not something to default into. Recorded here as the PM's recommendation for whenever he
decides, not as settled design:

**Pull the widest window once (`History`), store every case with its own `receivedDate`, and
bucket into whatever calendar month a review needs by filtering the STORED data — never by asking
Propel for "just this month."** This is the same "pull wide, filter by period at read time"
shape Meridian already uses for other cloud streams (e.g. auto-first metric sourcing across DAR/
Glimpse/Sales Ledger), not a new pattern. Concretely, this means a new Supabase table (with
`tenant_id`+RLS per the standing "new stream" checklist), an on-demand Playwright pull (same
persistent-profile design as EcoSure, a Sync button, never scheduled), and `autoPopulateKPIs`
filtering that table's rows by whichever date field is authoritative into the review's month —
matching how `metricAvg(ds, loc, range, ...)` already filters other per-day sources by a date
range today.

**Two sub-questions still need the owner's call, not a default:**
- Which date field is authoritative for "which month does this complaint count against" —
  `receivedDate` (when the case was logged) or `incidentDate` (when it actually happened)? They
  can differ by a day or more in the sample.
- Whether `History` genuinely returns everything with no floor, or is itself capped somewhere
  (unconfirmed) — if it's capped, a store's oldest history could still be unreachable and a
  narrower "pull `Trailing 3 Months`/`Baseline Trailing 3 Months` on a rolling cadence instead of
  one big `History` pull" design might be safer regardless.

**This is real scope, not a quick fix** — matches the EcoSure endpoint's own build complexity
(on-demand pull + new table + Sync button), not something to build opportunistically alongside a
smaller dispatch. Hold until the owner has time to think it through.

## What remains open before any pull is built

1. ~~What does `/100K` normalize against?~~ **Answered: guest count.**
2. Capture the other 4 `timeFrame=` values (Baseline YTD / Trailing 3 Months / Baseline Trailing
   3 Months / History) and confirm there's genuinely no single-month option — if there isn't,
   design the wide-pull-then-filter-by-date approach explicitly rather than defaulting into it.
3. Does `rowsPerPage` actually cap, and at what value? (asked, not yet measured)
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
