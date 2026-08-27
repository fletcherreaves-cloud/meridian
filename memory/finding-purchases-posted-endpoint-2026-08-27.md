---
name: finding-purchases-posted-endpoint-2026-08-27
description: Dispatch #177 -- investigated the permanent stub for the EOM 'purchases-posted' check (src/engine/eom-diagnosis.js, id:'purchases-posted', pending:true, run:()=>[]). Found and confirmed live the real eBOS endpoint that carries invoice posted/pending status (GET /api/inv/{nsn}/purchase?purchase_status=Pending), reachable from the same Playwright auth session as the existing eBOS pull -- but all 27 stores currently have zero pending invoices, so the item SHAPE for the failing case is still unknown and a guess would be unsafe two days before a physical count. Left pending:true as-is; check still fails safe.
metadata:
  type: finding
---

# Purchases-posted EOM check -- the real endpoint exists, but its item shape is still unverified (#177)

## The question

`src/engine/eom-diagnosis.js` registers `{ id:'purchases-posted', label:'Purchases -- all
invoices posted (none pending)', order:60, enabled:true, requires:['purchases'], pending:true,
run:()=>[] }` -- a permanent stub for the owner's own documented EOM step 4
(`memory/project-eom-diagnosis-flow.md` §4): *"Verify all invoices are POSTED and nothing is
PENDING. Unposted/pending invoices cause easy-to-fix swings. Rare, but must be verified every
time."* Dispatch #177 (owner-approved, part of a pre-Saturday-physical-count audit) asked: is
there a real, reachable data source for this, and if so is it safe to wire before Saturday
2026-08-29?

**Confirmed before this dispatch started (PM session, cited in the dispatch doc):** no currently
pulled Supabase table carries a posted/pending status per invoice. `qsr_ebos_daily` only holds
aggregated daily $ totals; `qsr_raw_item_detail`'s per-WRIN history has `source:'invoice'` events
but no visible status field in a sampled row.

## Method

Per the dispatch's own order: (1) check whether the existing eBOS Playwright session's RAW API
response carries a status field that's being discarded on the way to the aggregated shape --
captured live, not guessed; (2) check `qsrsoft_kb` for a documented posted/pending concept; (3)
if a real, low-risk source turns up with time to spare, wire it for real; (4) otherwise leave
`pending:true` and write up the findings.

All live captures below ran via `.github/workflows/qsrsoft-ebos-pull.yml` (`workflow_dispatch`,
branch `dispatch-177-purchases-posted`, not merged to `main`) -- the same production eBOS
Playwright-login pull the app already runs daily, with new DEBUG-gated diagnostic logging added
to `scripts/qsrsoft-ebos-pull.mjs` for this investigation only (no change to the production
pull/aggregate/upsert path when the new flags are unset, which is every scheduled run). Auth =
the eBOS `X-Auth-Token` the pull already mints via headless Playwright login
(`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` GitHub Secrets); no credential was available in this agent
session itself, so every capture below ran through GitHub Actions and was read back via the
Actions API/job logs -- consistent with CLAUDE.md's "name the credential and the observation"
rule.

## Finding 1 -- `store_ledger`'s raw item has no status field (real capture, not guessed)

Ran the pull with `dump_fields=1` (existing `DUMP_EBOS_FIELDS` instrumentation, store 5183, July
2026). The complete key list of a real `Purchase`-type line item from
`GET /api/inv/{nsn}/purchase/store_ledger?start_date=...&end_date=...`:

```
id, line_item_id, name, invoice_identifier, posted_date, wrin, description, total_amount,
food_sub, paper_sub, ops_sub, linen_sub, happy_meal_sub, other_sub, other_charges_credits,
record_type, tax_1, tax_2, tax_3, state_tax, in_inventory
```

No status/posted/pending field anywhere in it. `record_type` values seen live across the sample:
`Purchase`, `Credit`, `Adjustment`, `Out` (the last is a transfer, already known from
`memory/project-eom-diagnosis-flow.md` §5) -- none of these read as a lifecycle/approval state.
This settles investigation step 1: the field genuinely isn't in this endpoint's response, it
isn't merely being dropped by `aggregateByDate()` on the way to `qsr_ebos_daily`.

## Finding 2 -- KB has one relevant article, confirms the concept but not an API schema

Queried `qsrsoft_kb` (public-read Supabase table, `title`/`body_text`) via the
`apikey`+`Authorization: Bearer` PostgREST recipe with `SUPABASE_SERVICE_ROLE_KEY` against
`VITE_SUPABASE_URL`. Title/body search for `pending invoice`, `unposted`, `invoice status`,
`not posted`, `post the invoice`, `approve invoice` returned exactly one hit,
**"July 8, 2026 - Purchases"**, a release-note article:

> *"There is now a way to easily view other charges or credits in the Purchases area... To view
> Other Charges or Credits begin by approving a pending invoice. The Invoice opens... The GL -
> Unknown number is also found under the History and Ledger tabs."*

This confirms "pending invoice" and "approve" are real front-end concepts in QSRSoft's Purchases
area (History tab, Ledger tab, an Invoice detail view opened by "View"), but it documents UI
workflow, not an API field name or status vocabulary. No article names an API status field.

## Finding 3 -- the real endpoint exists and is reachable from the same auth session (the actual unlock)

Added DEBUG-gated request+response logging (every `prod.ebos.qsrsoft.com/api/` call) to the pull
script and re-ran with `debug=1`. The Playwright navigation to `/cimt/inventory/purchases`
**lands by default on `?tab=approvePending`**, and that page load fires:

```
GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/purchase?purchase_status=Pending
-> 200, body: []   (store 3708, captured live)
```

Same `X-Auth-Token` header, same domain, same origin/referer as `store_ledger` -- i.e. this is
genuinely reachable from the identical auth session the daily eBOS pull already establishes, no
new auth path needed. This is the endpoint that backs the "pending approval" tab the owner's own
front-end workflow uses.

## Finding 4 -- confirmed empty fleet-wide, so the failing-case item shape is still unknown

Extended the probe to hit `GET /api/inv/{nsn}/purchase?purchase_status=Pending` for all 27
stores (still read-only, no persistence -- gated behind a new `probe_pending_invoices` workflow
input, off by default). Real result, one run, all 27 stores:

```
NSN 3708:  0 pending invoice(s)      NSN 20475: 0 pending invoice(s)
NSN 5183:  0 pending invoice(s)      NSN 24471: 0 pending invoice(s)
NSN 5985:  0 pending invoice(s)      NSN 29760: 0 pending invoice(s)
NSN 6178:  0 pending invoice(s)      NSN 31357: 0 pending invoice(s)
NSN 6838:  0 pending invoice(s)      NSN 32525: 0 pending invoice(s)
NSN 6972:  0 pending invoice(s)      NSN 33109: 0 pending invoice(s)
NSN 10034: 0 pending invoice(s)      NSN 33222: 0 pending invoice(s)
NSN 10422: 0 pending invoice(s)      NSN 33704: 0 pending invoice(s)
NSN 10915: 0 pending invoice(s)      NSN 34222: 0 pending invoice(s)
NSN 11657: 0 pending invoice(s)      NSN 35064: 0 pending invoice(s)
NSN 13113: 0 pending invoice(s)      NSN 35242: 0 pending invoice(s)
NSN 18213: 0 pending invoice(s)      NSN 37566: 0 pending invoice(s)
                                      NSN 38609: 0 pending invoice(s)
                                      NSN 43380: 0 pending invoice(s)
                                      NSN 43701: 0 pending invoice(s)
```

This is a clean, real "healthy" reading fleet-wide -- consistent with the owner's own "rare" in
the source doc, and itself a small piece of reassurance ahead of Saturday's count (nothing is
sitting unposted right now, at least by this endpoint's read of it). But it means **the item
shape for a genuinely pending invoice is unverified** -- I have never seen one, so I don't know
the field names a real check would need to key off (invoice number? vendor? days-pending? $
amount? a nested line-item array like `store_ledger`, or an invoice-header object?).

Tried one cheap, safe way to infer the shape without fabricating anything: the same endpoint with
`purchase_status=Approved` (a natural guess at the complementary status, since approved/posted
invoices obviously exist in volume). Real result: **`HTTP 400`** -- not a valid status value. So
guessing the status vocabulary is unsafe too; `Pending` is the only confirmed-valid value.

## Why this stays `pending:true`

Per the dispatch's own explicit bar and CLAUDE.md's "measure it, don't reason about it" /
"never force a risky change to a financial-verification check under time pressure" rules: I have
a real, confirmed, low-risk **read path** (endpoint, param, auth, response envelope for the
healthy case), but not a real, confirmed **item shape** for the one case the check exists to
catch. Writing detection logic now would mean fabricating field names for a financial-integrity
check two days before a physical inventory count, and the dispatch's own verification bar
("a test proving the check flags a store with a genuinely pending/unposted invoice in the
fixture data") cannot be met honestly without a real non-empty sample. A wrong field name would
either crash the check or -- worse -- silently read as "0 pending" forever, which is a strictly
worse failure mode than today's honest `pending:true` "awaiting data" state.

**Left `pending:true` and `run:()=>[]` unchanged.** Confirmed (re-reading `runDiagnosis()`,
`src/engine/eom-diagnosis.js`) this still fails safe exactly as the dispatch doc described: a
`pending:true` check is excluded from the normal run path (`if (!haveData || c.pending) {
pending.push(...); continue; }`) and surfaced explicitly as "awaiting data" in both the EOM
Dashboard's check list and the report footer -- never a silent clean pass.

## What a future dispatch needs to close this for real

1. **The exact call:** `GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/purchase?purchase_status=Pending`,
   headers `X-Auth-Token` (same eBOS token as `store_ledger`), `X-Current-Nsn`, `Accept:
   application/json`, `Origin`/`Referer` = `https://v3.myqsrsoft.com`/`https://v3.myqsrsoft.com/`.
   Returns `200` with a JSON array (empty when healthy).
2. **Still needed:** a real non-empty response to read the item's field names from. Two honest
   paths, neither attempted here because both need more than this dispatch's runway:
   - Wait for a store to actually have a pending invoice (this is meant to be rare, so this could
     be a long wait) and capture it opportunistically -- e.g. leave a low-cost scheduled probe
     running and alert on the first non-empty result.
   - Ask someone with QSRSoft UI/support access to intentionally create or find one pending
     invoice and share a screenshot or the Network-tab response for
     `.../purchases?tab=approvePending` -- fastest path, doesn't depend on a real invoice
     happening to be unposted at the right moment.
3. **The status vocabulary is not just `Pending`/`Approved`** -- `Approved` is confirmed invalid
   (400). Whoever picks this up next should not reuse that guess; either find the real value(s)
   from a captured request the front-end makes (e.g. watching the Ledger/History tab network
   calls) or ask QSRSoft/the KB for the enum.
4. **This is a snapshot endpoint, not a date-ranged one** -- unlike `store_ledger`
   (`start_date`/`end_date`), `purchase?purchase_status=Pending` has no date params in the one
   captured call; it appears to be "give me everything currently pending" as of now. A pull
   design for this would look different from `qsr_ebos_daily`'s daily-aggregate shape -- more
   like a point-in-time table that gets fully refreshed each pull, not upserted by date.

## Diagnostic instrumentation left behind (not merged to `main`)

All changes are on the unmerged branch `dispatch-177-purchases-posted`
(`scripts/qsrsoft-ebos-pull.mjs`, `.github/workflows/qsrsoft-ebos-pull.yml`):
- DEBUG-gated (`debug=1`, existing input) request+response logging for every
  `prod.ebos.qsrsoft.com/api/` call, to see what backs any Purchases-page tab without touching
  the production pull/aggregate path.
- A new `probe_pending_invoices` workflow input (off by default) that calls
  `purchase?purchase_status=Pending` for all 27 stores, read-only, no persistence -- the fastest
  way for a future dispatch to re-check "is anything pending right now" or to catch a real
  non-empty sample if one appears.
Kept diagnostic-only and gated exactly like the existing `DUMP_EBOS_FIELDS` pattern
(`6c37013`, `49c513a`) so it costs nothing on every scheduled run.

## Other `pending:true` stubs found while reading `eom-diagnosis.js`

None. Grepped the full file for `pending`: `purchases-posted` (line ~492) is the only check
registered with `pending:true`. Flagging per the dispatch's instruction to note any found, even
though the answer here is "there are no others" -- confirms the dispatch's own framing that this
was a single, known, isolated gap.

## Out of scope (per dispatch)

- `fob-components` check -- separate, already-diagnosed root cause, dispatch #176.
