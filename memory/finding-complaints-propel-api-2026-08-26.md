---
name: finding-complaints-propel-api-2026-08-26
description: A working Customer Care complaint-case API on propel.mcd.com — per-store complaint cases with issue code/subcode, dates, status and customer comments. Unlocks the actual-data side of Performance Review's Complaint Contacts/100K metric, which has had zero automated source until now.
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

**⚠️ Turning a raw case count into a `/100K` RATE needs a guest-count denominator for the same
period — not yet resolved, and not something to guess at.** `totalCount` (or a filtered subset of
it) is the numerator; what "100K" normalizes against (guest count for the period? transactions?)
needs to match whatever the label's own "/100K" convention actually means at this org. Confirm
with the owner before wiring, same discipline `dispatch-132.md` already applied to this exact
metric.

## Integration constraints — identical to the EcoSure precedent, reuse that design, don't re-derive it

- **SSO + MFA gated, same as every other Propel endpoint.** Headless/unattended pull is
  impossible — `finding-ecosure-propel-api-2026-08-22.md`'s "on-demand, not scheduled" design
  (owner-approved, Playwright + persistent authenticated browser profile on the #65 Mac mini,
  `workflow_dispatch` only, no `schedule:` block, human triggers it and completes MFA once per
  session) applies here without modification — this is the same host, the same auth, the same
  answer.
- **Per-STORE call** (`locationId`) — a full-estate pull is **27 calls**, same shape as the
  EcoSure CEV endpoint. Reuse the existing hierarchy-node map; no new store enumeration needed.
- **`rowsPerPage` cap untested above 5** (the UI's own page size) — the EcoSure visit-list
  endpoint capped a requested `rowsPerPage=50` at 20 despite the ask, so **any client must page
  until `results.length` reaches `totalCount`, never trust a large `rowsPerPage` value** —
  assume the same caution here until directly tested.
- **`timeFrame=1` is UNCONFIRMED to mean "YTD"** — it's the value observed while the UI's
  Timeframe dropdown showed YTD selected, but the mapping itself was not captured. Capture the
  dropdown's other options (and their resulting `timeFrame=` values) before building anything
  that needs a specific window (e.g. a trailing-12-months pull, or a single calendar month) —
  do not assume `1` is the only or the default value.
- **Only `CLOSED` was observed** — whether `caseStatus` has other values (open/pending) and
  whether those should count toward the metric is unconfirmed.

## What remains open before any pull is built

1. What does `/100K` normalize against? (owner input needed)
2. What are `timeFrame`'s other values, and which is the right one for a monthly review period?
3. Does `rowsPerPage` actually cap, and at what value?
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
