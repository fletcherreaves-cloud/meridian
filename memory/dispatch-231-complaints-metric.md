# Dispatch #231 — Customer Complaints: build the pull and wire the Complaint Contacts/100K metric

**Origin:** `memory/finding-complaints-propel-api-2026-08-26.md` found a real, working Propel
endpoint (`GET /api/customer-care?action=getCustomerCareRestaurantCaseList`) for per-store customer
complaint cases, confirmed against `review-engine.js`'s `complaints` metric
(`key:'complaints', label:'Complaint Contacts/100K'`), which has `src:'manual'` and **no automated
actual-data source anywhere in the app**. Every open measurement question blocking a build has
since been resolved (2026-09-05, same day): the denominator (guest count), all 5 `timeFrame`
values, whether `rowsPerPage` caps, and the owner's design decision for the "no single-month
option" problem. This dispatch is the actual build.

## What already exists (measured, not assumed)

- **Endpoint confirmed working, full payload shape documented.** `locationId` = the existing
  27-store hierarchy-node map (already solved for EcoSure/CFV/RGR/PEAK — no new store enumeration
  needed). Response: `{totalCount, results:[{locationId, parentCaseId, childCaseId, issueCode,
  issueSubCode, incidentDate, receivedDate, caseStatus, abbreviatedCustomerComments,
  customerComments, childCases:[]}]}`.
- **Denominator resolved:** the `/100K` in "Complaint Contacts/100K" normalizes against guest
  count, already a live Meridian metric via existing DAR/sales-cloud sources — no new pull needed
  for that half.
- **All 5 `timeFrame` values measured and owner-confirmed against the real dropdown**: `1`=YTD,
  `2`=Baseline YTD, `3`=Trailing 3 Months, `4`=Baseline Trailing 3 Months, `5`=History.
  `timeFrame=6` cleanly 400s — there is no 6th option. None is a single calendar month.
- **`rowsPerPage` does NOT cap** for this endpoint (unlike EcoSure's) — a single call per store at
  `timeFrame=5` with a generous `rowsPerPage` returns everything in one shot; page defensively
  until `results.length` reaches `totalCount` as the safety net, not the expected path.
- **Design decided (owner, 2026-09-05):** pull `timeFrame=5` (History) once per store, store every
  case with its own `incidentDate`, and bucket into whatever calendar month a Performance Review
  needs by filtering the STORED data at read time — never by asking Propel for "just this month."
  Same wide-pull-then-filter shape this app already uses for other cloud streams.
- **Auth/automation precedent already settled for this exact host** — `finding-ecosure-propel-
  api-2026-08-22.md`'s own conclusion (re-derive, don't re-litigate): propel.mcd.com is SSO+MFA
  gated, headless automation is impossible, and the **actual shipped pattern for every Propel/PEAK
  source in this app to date is a browser-console bulk-capture script + a Node import script**,
  run manually/periodically by the owner — NOT a persistent-profile Playwright Sync-button service.
  That heavier design was explicitly recorded as a fallback "if manual capture proves painful," not
  the default; at complaints' real volume (~62/store/year at the one measured store) the same
  lightweight pattern already proven today for PEAK (`browser-peak-visit-detail-bulk-capture.js` +
  `import-peak-visit-detail.mjs`) is the right starting design here too.
- **`v=` version-drift caution, freshly learned (2026-09-05):** Propel's `v=` query parameter is a
  live build number (`786` on 08-26, `802` on 09-05), not a stable API version. **The capture
  script must read a fresh `v=` from a real live request at the time it's written/run — never
  hardcode a value copied from an old finding file or a previous version of the script itself.**

## What's missing

1. No capture script for complaints (nothing like `browser-peak-visit-detail-bulk-capture.js` /
   `browser-ecosure-bulk-capture.js` exists yet for this endpoint).
2. No Supabase table for complaint cases (needs `tenant_id`+RLS per the standing "new stream"
   checklist), and no import script to parse + upsert into it.
3. No wiring from any such table into `review-engine.js`'s `complaints` metric — it still reads
   `src:'manual'`.
4. `caseStatus` values beyond `CLOSED` are unconfirmed — whether open/pending cases exist and
   should count toward the metric is still open (see Task 2).

## Task 1 — build the browser-console capture script

New file `scripts/browser-complaints-bulk-capture.js`, modeled directly on
`browser-peak-visit-detail-bulk-capture.js`'s structure and header conventions (paste-into-
DevTools-Console on a signed-in `propel.mcd.com` tab; extensive header comment on why a console
script and not a pull, citing the EcoSure finding's settled reasoning verbatim where it still
applies; **never log/record a cookie, token, or the real `customerComments`/
`abbreviatedCustomerComments` text** — only structural fields, matching this repo's established
security posture for this endpoint).

Chain: for each of the 27 stores (reuse the existing hierarchy-node map), call
`getCustomerCareRestaurantCaseList` with `timeFrame=5` (History) and a generous `rowsPerPage`
(e.g. 500 — no cap was measured, but page defensively if `results.length < totalCount` regardless,
same discipline as every other bulk-capture script in this repo). Push each raw `results[]` entry
into the output array, RAW and unmodified, same as every other script here. **Re-derive `v=` at
write time** — do not copy `802` (or any other value) forward as a hardcoded constant without a
fresh check; log a warning if a request 409s, matching the diagnosis this session already worked
out for the version-drift failure mode.

Output shape: `{_source, _captured, cases: [<raw result entry>, ...]}` — decide this shape
deliberately (don't just copy PEAK's `visits` key name) since the import script in Task 2 will
consume it fresh, not inherit an existing contract.

## Task 2 — new Supabase table + import script

New table (name TBD, e.g. `customer_complaints`) with `tenant_id`+RLS per the standing checklist.
Natural key: `childCaseId` (unique per case, including the nested-`childCases` split entries —
flatten those into their own rows at import time, carrying the parent's `parentCaseId` for
traceability, matching how the finding file documents the "Multiple Issues" case-splitting
behavior). Store `incidentDate`/`receivedDate`/`issueCode`/`issueSubCode`/`caseStatus`/
`locationId` (mapped through the existing hierarchy-node→`loc` map) as columns; store
`customerComments` too (real customer-submitted free text, not the structured-PII class of field
EcoSure's `reviewedWithName` is — no `get_or_create_employee_token()`-style tokenization applies
here per the finding file's own security note, but still not a field to print/export/log
casually).

New `scripts/import-complaints-history.mjs`, modeled on `import-peak-visit-detail.mjs`'s or
`import-graded-visits-bulk.mjs`'s pattern (whichever fits closer once the exact upsert semantics
are decided — this is genuinely NEW rows on first import, not an enrichment of existing rows like
PEAK's, so `import-graded-visits-bulk.mjs`'s upsert-on-conflict-key shape is the closer model).
While building this, resolve the two still-open data questions from the finding file:
- Whether `caseStatus` has values besides `CLOSED` (log distinct values seen across the real
  27-store pull; decide whether non-`CLOSED` cases count toward the metric based on what's found,
  not in advance).
- Whether `issueSubCode` values with a `-` (e.g. "Charged - Equipment or Operations Issue") ever
  arrive with encoding quirks — trim/normalize on ingest if so, matching the EcoSure finding's own
  established caution for this class of field.

## Task 3 — wire into the Complaint Contacts/100K metric

Replace `review-engine.js`'s `complaints` metric's `src:'manual'` with a real actual-data path:
count cases (by `incidentDate`, per the owner's decided bucketing field) within the review's
period, divide by guest count for the same period, × 100,000. Reuse whatever existing helper this
app uses for period-filtered cloud-stream aggregation (e.g. the same shape `metricAvg(ds, loc,
range, ...)` already uses for other per-day sources filtered by a date range) rather than writing
a new one-off filter.

## Explicitly out of scope

- **Persistent-profile Playwright automation / a Sync button** — not this dispatch. The manual
  browser-console-script pattern is the right starting design per the measured volume and the
  EcoSure precedent's own stated fallback ordering. Revisit only if manual capture proves genuinely
  painful in practice (matching the "manual sourcing is always temporary, but this is a legitimate
  named exception" standing-rule carve-out already established for EcoSure).
- Any change to how `guest count` itself is sourced — already a live metric, reused as-is.
- SMG or any other unrelated data source.
- A UI panel for browsing raw complaint cases — this dispatch is metric-wiring only; a
  drill-down/detail view (if ever wanted) is a separate follow-on, not bundled in here.

## Verification (required)

1. `scripts/browser-complaints-bulk-capture.js` exists, follows established conventions, never
   logs real comment text or cookie/token values, and re-derives `v=` rather than hardcoding a
   stale value.
2. A real capture run's numbers, reported honestly: total cases across all 27 stores, any
   `caseStatus` values found beyond `CLOSED`, any `issueSubCode` encoding quirks found.
3. New table + import script, with `tenant_id`+RLS confirmed (same measurement discipline as every
   other "new stream" checklist item — don't just assert it, check the anon key gets zero rows).
4. `review-engine.js`'s `complaints` metric produces a real, non-`manual` number for at least one
   store/period, spot-checked by hand against the raw case count for that period.
5. Full test suite + `npm run build` clean, eager-payload budget unchanged.
