# Dispatch #34 — Phase 0a live captures: Register Audit endpoint, Any Transaction settled, SSO org-roles

**2026-08-19, follow-up to dispatch #33 (`memory/dispatch-33.md`, PR #442/#444).** The owner captured
three real DevTools sessions against live QSRSoft access this session does not have. This file is
the durable handoff of what they show — the engineer implementing dispatch #33's remaining pieces
should start here instead of guessing endpoints again.

**No bearer tokens are reproduced in this file.** The owner's captures included live
`x-auth-token`/Cognito bearer values — those are session-lived credentials, not data, and are
deliberately omitted below. Whoever implements this pulls a fresh token via the existing auth
modules (`scripts/lib/qsrsoft-auth.mjs`'s `getFreshToken()`), not from this file.

---

## Part 1 — Register Audit: real endpoint confirmed

Settles `scripts/qsrsoft-register-audit-pull.mjs`'s `fetchRegisterAuditDay()` — its shipped
"grounded starting hypothesis" comment (guessing `/reporting/v2/cash/cash-sheet-extract` with a
`segmentBy=employee` param) is **wrong**. The real request, captured live:

```
GET https://api.reports.myqsrsoft.com/reports/mcd/controlsCash/regAudit
    ?nsn=<comma-separated store numbers, UNPADDED — e.g. 3708,5183,...>
    &orgId=a546d4ef-684a-4f25-8bc0-6580af068875
    &enterpriseName=McDonalds
    &startDate=YYYY-MM-DD
    &endDate=YYYY-MM-DD
    &dsd=d
    &weekStart=3
    &nsd=d
    &resultType=byDateEmployee
    &registerType=cashier
Header: x-auth-token: <token>
```

Two things worth noting before implementing:

- **It takes a date RANGE and all 27 stores in one call** (comma-separated `nsn`), not one
  store/date per request like the shipped scaffold's per-`(loc, date)` loop assumes. The captured
  sample was `startDate=2026-08-12&endDate=2026-08-18` × all 27 `STORE_NSNS`, and returned one row
  per employee per store per business date — hundreds of rows in a single call. **This changes
  `pullOneDay()`'s shape**: it should likely call this endpoint once per date (or once per date
  range) with the full store list, not loop per-store. Re-derive `fetchRegisterAuditDay`'s
  signature around that rather than keeping the current per-store loop structure.
- **`nsn` in the response is unpadded** (e.g. `3708`, not `0003708`) — convert to the 7-char
  zero-padded `loc` format (`String(nsn).padStart(7,'0')`) before it touches `audit_rows`' PK
  `(loc, date, emp)`. This repo has four prior incidents (v4.809/823/827/831) from exactly this
  class of bug — treat the conversion as load-bearing, not incidental.

### Real response field names (differ from what `saveAuditRows()` currently expects)

Captured fields, per employee/store/date row: `busnDt`, `nsn`, `empID`, `empName`, `allNetSales`,
`transactions`, `overShortAmt`, `promoAmt`, `promoQty`, `tRedBeforeQty`, `tRedBeforeAmt`,
`tRedAfterQty`, `tRedAfterAmt`, `drawerOpens`, `overringQty`, `overringAmt`, `manOverringAmt`
(manager-applied over-ring, not previously documented in the parser), `refundCashQty`,
`refundCashAmt`, `refundCashlessQty`, `refundCashlessAmt`, `empMealDiscQty`, `empMealDiscAmt`,
`mgrMealDiscQty`, `mgrMealDiscAmt`.

**No `avgCheck` field appears** in the real response, though `saveAuditRows()` (both the shipped
script's local twin and `src/lib/supabase.js:859`) has an `avgCheck` column. `allNetSales` /
`transactions` gives you that ratio if the column needs populating — confirm against
`analyzeRegisterAudit` (`src/utils/register-audit.js`) whether it actually consumes `avgCheck` or
can be left null.

**`mapRow()`'s translation is NOT fully mechanical — flag before writing it live:**

| `saveAuditRows()` expects | confirmed source | confidence |
|---|---|---|
| `loc`, `date`, `emp` | `nsn` (padded), `busnDt`, `empID` (or `empName` — confirm which is the stabler join key) | high |
| `drawerSales` | `allNetSales` | high |
| `drawerOpens` | `drawerOpens` | high |
| `promoAmt`/`promoCnt` | `promoAmt`/`promoQty` | high |
| `tRedBDollar`/`tRedBCnt`, `tRedADollar`/`tRedACnt` | `tRedBeforeAmt`/`tRedBeforeQty`, `tRedAfterAmt`/`tRedAfterQty` | high |
| `refundCash`/`refundCashless` | `refundCashAmt`/`refundCashlessAmt`; `refundCnt` = sum of both qty fields | high |
| `posOverAmt`/`posOverCnt` | `overringAmt`/`overringQty` — **does `manOverringAmt` fold in here, or is it a distinct column not yet in `saveAuditRows()`'s schema?** | **unconfirmed** |
| `empMealDisc`/`empMealCh`, `mgrMealAmt`/`mgrMealCnt` | `empMealDiscAmt`/`empMealDiscQty`, `mgrMealDiscAmt`/`mgrMealDiscQty` | high |
| `cashOSDollar`/`cashOSPct` | `overShortAmt` is the dollar; **no `%` field observed — compute from `overShortAmt`/`allNetSales`, or confirm `analyzeRegisterAudit` derives it itself and this column can stay null** | **unconfirmed** |
| `avgCheck` | not in response — see above | **unconfirmed** |
| `tRedBPct`, `tRedAPct`, `tRedBAvg`, `tRedAAvg` | not directly in response — likely computed (rate = qty/transactions, avg = amt/qty), matching how `parseRegisterAudit` derives them from the manual Excel export today | **unconfirmed — check `parseRegisterAudit`'s own derivation logic (`src/parsers/index.js:974`) and mirror it exactly rather than re-deriving from scratch** |
| `drawerGC` | no obvious source field | **unconfirmed** |

This table is deliberately not a finished `mapRow()` — the unconfirmed rows are exactly the ones
dispatch #33's own caution (throw instead of guess, since this is personnel-sensitive data) was
protecting against. The fix here is not to fabricate the missing pieces; it's to open
`parseRegisterAudit` and match its computed-field logic 1:1 against these new field names, and to
run the pull once against a short real window before trusting it — a wrong overring/cash-short
number is exactly the kind of error `analyzeRegisterAudit`'s risk scoring would silently launder
into a false accusation against a real employee.

---

## Part 2 — Any Transaction: Tier A is dead, Tier B confirmed viable, plus a bonus endpoint

Settles dispatch #33 Part 2 / `data-acquisition-shopping-list.md` §B's open question.

### The capture

```
curl 'https://api.security.myqsrsoft.com/security/any_transaction/v1/3708/2026-08-18?orgId=a546d4ef-684a-4f25-8bc0-6580af068875'
  --data-raw '{"final_register":13,"time_slice":"10:00-13:00"}'
```

**New host discovered:** `api.security.myqsrsoft.com` — distinct from `api.reports.myqsrsoft.com`
(Register Audit, DAR, eBOS) and from `api.sso.myqsrsoft.com` (Part 3 below). Note the security
subdomain for any future security-report work.

Path params are `{nsn}/{date}` (store + single date, both required, both singular). The POST body
adds `final_register` (a single register number) and `time_slice` (a single discrete window, e.g.
`"10:00-13:00"` — 3-hour blocks, the same granularity family as `qsr_peaks_sales`'
`segmentBy=peaks`/`time_slice` elsewhere in this codebase). **No exception-type filter parameter
exists anywhere in the request.**

### Verdict: Outcome 3 from dispatch #33 Part 2, and slightly worse than scoped

`data-acquisition-shopping-list.md` §B laid out three outcomes. This is Outcome 3 — "one date at a
time, no range, no filter" — except **narrower still**: it's also one store and one register and
one time-slice per call, not even a whole-store whole-day pull. The response for this single
3-hour/one-register window was 137 transactions, nearly all normal `TRX_Sale` rows (one
`TRX_Refund`). To find every exception across 27 stores × ~8-10 registers × ~8 time-slices × 365
days would mean enumerating that full cross product with no server-side narrowing — the "full
firehose" case, at a granularity far below daily.

**Corroborating capture — the UI's own filter-options endpoint proves there is no exception-type
dimension to find:**

```
POST https://api.security.myqsrsoft.com/security/trans_filter_options/v1/3708/2026-08-18?orgId=a546d4ef-684a-4f25-8bc0-6580af068875
→ { "registers": [...], "managers": [...], "cashiers": [...] }
```

This is what populates the Any Transaction UI's own filter dropdowns for a given store/date — and
it offers exactly three filter dimensions: register, manager, cashier. **No `trx_types` /
`exception_types` / anything filter-adjacent to transaction category exists in this response.**
This isn't just "the one sample call I saw didn't use a filter" — it's the report's own filter
menu confirming the dimension doesn't exist to select. Treat Outcome 3 below as fully confirmed,
not inferred from absence in a single request.

**Tier A (district-wide daily exception-only standing pull) is dead as scoped.** Per
`data-acquisition-shopping-list.md`'s own fallback: **Register Audit (§A, Part 1 above) carries
all standing employee-level attribution**, and Any Transaction moves to **Tier-B-only** — on-demand,
investigation-triggered, one store/date/register/window at a time, exactly as the owner's original
on-demand design already assumed. No further Tier A design work is needed; close that question in
the plan file rather than revisiting it.

### Bonus: `transaction_detail` — confirms Tier B works and is richer than expected

A second captured endpoint, called by clicking into a specific row from the `any_transaction` list:

```
GET https://api.security.myqsrsoft.com/security/transaction_detail
    ?store_busn_dt=YYYY-MM-DD
    &order_key=<from the any_transaction row, e.g. POS0012:763031481>
    &pos_session_start_date=YYYY-MM-DD
    &pos_session_start_time=HH:MM:SS
    &nsn=<store, unpadded>
    &lookup_badges=<cashier's badge number, parsed off the "Name - ##" cashier field>
    &manager_id=<or "null" literal string if none>
    &operator_id=<same badge number>
    &event_name=<trx_type from the list row, e.g. TRX_Sale>
    &node_id=<final_register from the list row, e.g. POS0013>
    &orgId=a546d4ef-684a-4f25-8bc0-6580af068875
Header: x-auth-token: <token>
```

Returns a `modalPayload` with:
- `trans_header` — loc (name-annotated, e.g. `"3708 - ARDMORE-BROADWAY"`), point-of-delivery
  (`pod`, e.g. `"Drive Thru"`), sale type, register #, receipt #, totals, session start/end times
- `trans_items` — full itemized line list, including **combo parent/child nesting** (`level`
  0/1), per-line `qty_voided`, `qty_promo`, `orig_amt` vs `amt` vs `red_amt` (reduction) — this is
  the T-Red concept at line-item grain, richer than Register Audit's per-employee daily aggregate
- `trans_item_totals` — order-level reduction totals, split **before-total vs after-total** (the
  same before/after distinction Register Audit aggregates daily)
- `trans_tenders` — payment breakdown by tender type (cash, cashless-by-network, change given)
- `operator` / `manager` — names with badge numbers

This confirms Tier B (on-demand, full detail, one transaction/store/date-range at a time) is fully
buildable once someone wants it — worth a follow-up dispatch when an actual investigation needs it,
not before.

**Camera/video linkage — still open, not settled by this capture.** The plan file (§7) asked
whether a flagged/exception row populates a `View Details`/camera field. This capture's
`transaction_detail` call was for a normal `TRX_Sale` (not the `TRX_Refund` that also appeared in
the same list), and **no camera/video field appears anywhere in the response** for that normal
sale. That doesn't answer the question either way — it needs a `transaction_detail` pull on an
actually-flagged row (the refund, a void, an over-ring) to test, since a camera link plausibly only
populates for exception types. Leave this open; don't conclude "no camera support" from a
non-exception sample.

---

## Part 3 (bonus, unprompted) — SSO `getOrgInfo`: QSRSoft's own role/permission model

A third capture, offered by the owner as "maybe useful" rather than requested by any dispatch:

```
POST https://api.sso.myqsrsoft.com/graphql
Header: authorization: <Cognito bearer>
Body: {"operationName":"getOrgInfo","variables":{"orgId":"org-a546d4ef-684a-4f25-8bc0-6580af068875","showSupportUsers":false},"query":"query getOrgInfo(...) { getOrgInfo(...) { groups { name groupId permissions } } }"}
```

Returns every permission **group** (role) configured for this org in QSRSoft, each with a stable
`groupId` (`grp-...`) and its full permission-string list. The group names present today: Accounting
Partner, **Operations Manager**, Office Manager, Default Role, Crew (×2), General Manager, Shift
Manager, Department Manager, Maintenance, **Owner Operator**, System Administrators, **Supervisor**,
Office Assistant, Floor Supervisor, **Director of Operations**, Senior Department Manager, Payroll
Partner.

**Direct relevance to the pending Operations Manager/DO/AS settings request** (owner, 2026-08-19,
not yet captured anywhere until now — see the backlog entry added alongside this file): QSRSoft
already treats **"Operations Manager"** and **"Director of Operations"** as first-class, named role
groups with real `groupId`s — this is external precedent for the exact tier names the owner asked
Meridian to add under Patches/org-structure settings, not just an internal naming preference. Worth
keeping in mind if RBAC role names in `profiles.role` are ever reconciled against QSRSoft's own
model (not proposed here — just noted so a future session doesn't have to rediscover it), but this
does **not** unblock or change the settings feature itself, which only needs Meridian-side role/tier
additions (see backlog entry).

No further action item from Part 3 beyond the backlog capture — this was informational, not a
blocker resolution.
