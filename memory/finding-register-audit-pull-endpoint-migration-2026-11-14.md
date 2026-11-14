---
name: finding-register-audit-pull-endpoint-migration-2026-11-14
description: "GH issue #1314 -- QSRSoft Register Audit Pull had been failing every run since 2026-09-21 on a 403 explicit IAM deny. Root cause, new endpoint, and every re-verified field formula."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# Register Audit Pull endpoint migration (2026-11-14, GH issue #1314)

## Root cause

`scripts/qsrsoft-register-audit-pull.mjs` called `GET https://api.reports.myqsrsoft.com/reports/mcd/controlsCash/regAudit`.
Every scheduled run since 2026-09-21 (~2 months) failed:

```
[audit-pull] browser-context 403 body: {"Message":"User is not authorized to access this
resource with an explicit deny in an identity-based policy"}
```

This is **not** a token problem -- login and token capture both succeeded every run (confirmed
in the job logs: `token captured: true`). QSRSoft deprecated or denied this specific legacy
endpoint for this account.

## The real endpoint (confirmed live, 2026-11-14)

Found by watching `v3.myqsrsoft.com`'s own network traffic while it successfully rendered the
real Register Audit report (Playwright, logged into the live app with real credentials):

```
GET https://api.reports.myqsrsoft.com/data_layer/v1/cash/register-audit-by-employee
    ?nsn=<comma-separated UNPADDED>&orgId=...&enterpriseName=McDonalds
    &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dsd=d&weekStart=3&nsd=d
    &registerType=cashier&selectCols=<comma-separated allowlist, REQUIRED>
Header: x-auth-token: <token>
```

- `registerType` is still a real, server-validated request filter (`[cashier, manager,
  preparer]` -- a bogus value gets a real `400` naming the allowlist). The existing 3-calls-
  per-window architecture (dispatch #59) is unchanged.
- `selectCols` is required (a 400 names it if omitted) but **silently drops any unrecognized
  column name with no error** -- a 200 response proves nothing about whether a requested column
  actually exists. This bit the Cash O/S investigation below.
- `x-auth-token` is REQUIRED on this endpoint (the old one needed none, just Origin/Referer). A
  token minted directly via `getFreshToken()` (Cognito, no browser) gets a plain `401` here --
  confirmed live -- even though it works for several other qsrsoft pulls on this same host. Only
  a token captured from a real browser session (the existing Playwright fallback) works.

## Formulas re-verified live, not guessed

Every formula below was checked by computing it from raw API fields and comparing against the
REAL on-screen value for a real employee/date, via Playwright against the live report.

| UI column | Formula | Verification |
|---|---|---|
| Drawer Sales | `netSalesAmt` | direct field |
| Average Check | `netSalesAmt / (netSalesEatinQty + netSalesTakeoutQty)` | Aaden W: 4083.73/(0+351)=11.6346 → displayed "$11.63". Abbigail H: 2285.57/(0+210)=10.883 → "$10.88" |
| Promo Pct | `promoAmt / netSalesAmt` | Aaden W: 76.68/4083.73=1.878% → "1.88%" |
| **T-Red Before/After Pct** | **`tredsBeforeAmt / netSalesAmt`** (and After analog) | **A real correction, not a rename.** The old endpoint's formula (inherited from dispatch #34, never independently confirmed) was qty/transactions -- a RATE. Checked and REJECTED: it does not reproduce the displayed %. The real formula is a $ SHARE OF SALES. Abbigail H: T-Red Before $28.92/sales $2285.57 = 1.2655% → displayed "1.27%"; T-Red After $4.59/$2285.57 = 0.2009% → "0.20%". |
| T-Red Before/After Avg | `amt / qty` | unchanged, still confirmed: 28.92/10=2.89 → "$2.89"; 4.59/1=4.59 → "$4.59" |
| Manual Refund/Overring $ | `manualRefundOverrings` (one field, was `manOverringAmt`) | direct field, same concept |
| Manual Refund/Overring Qty | **still absent** | same finding as the original dispatch #44 (`finding-cash003-manoverringqty-absent-2026-08-20.md`), re-confirmed: no Qty sibling exists on this endpoint generation either |
| POS Overrings $/Cnt | `overringAmt` / `overringQty` | field names unchanged |
| Refund Cnt/Cash $/Cashless $ | `cashRefundsQty+cashlessRefundsQty` / `cashRefundsAmt` / `cashlessRefundsAmt` | same two-pair shape as before under renamed fields; **not independently re-verified against a nonzero example** -- every real row sampled during this migration happened to have zero refunds. Self-describing field names, not a blind guess, but flagged as the one smaller residual judgment call in this pass. |
| Emp/Mgr Meal $/Cnt | `empMealDiscountAmt/Qty`, `mgrMealDiscountAmt/Qty` | direct fields |

## Cash O/S $ and % -- confirmed UNAVAILABLE, not skipped

The one field this pass could NOT recover. Tried and ruled out:

1. **Arithmetic from available fields.** Candidates against a real displayed value of **-$0.16**
   (Aaden W, store 29760, 2026-11-09, `netSalesAmt`=4083.73, `countedCash`=1349,
   `closingReading`=6229273.54, `openingReading`=6224834.61, `skimTotal`=0,
   `cashlessSalesAmt`=3064.77):
   - `countedCash - (closingReading - openingReading - skimTotal)` = **-3089.93**
   - `countedCash - netSalesAmt` = **-2734.73**
   - `countedCash + cashlessSalesAmt - netSalesAmt` = **+330.04**
   None are remotely close. `closingReading`/`openingReading` almost certainly span more than
   this one employee's shift (their delta, $4,438.93, doesn't even match this employee's own
   $4,083.73 in sales) -- not a simple per-employee cash-drawer baseline.
2. **Field-name guessing via `selectCols`.** ~25 plausible names (`overShortAmt`,
   `cashOverShort`, `expectedCash`, `cashVariance`, `startingTill`, `cashSalesAmt`,
   `drawerVariance`, `tillVariance`, etc.) were added to `selectCols` one and several at a time.
   Every request came back `200 OK` but the guessed field was silently absent from every
   response -- this endpoint drops unrecognized columns with no error, so a 200 proves nothing.

**Conclusion:** `cashOSDollar`/`cashOSPct` map to `null` in `mapRow()`, explicitly documented in
the code (not a silent gap). Any consumer that needs Cash O/S for Register Audit should keep
relying on its existing manual-upload source until a real derivation surfaces -- same "measured,
not fabricated" standard this script already held itself to for the original `manOverringQty`
absence.

## Verification

- 29 unit tests updated/passing (`src/__tests__/register-audit-pull.test.js`), including a
  dedicated test pinning the corrected T-Red Pct formula.
- Full suite: 8086 tests passing. Build clean, within payload budget.
- **Live dry-run** (real QSRSoft credentials, real Supabase): `QSRSOFT_AUDIT_START_DATE=2026-11-04
  QSRSOFT_AUDIT_END_DATE=2026-11-05` → **722 rows saved** across cashier/manager/preparer, 27/28
  stores (the 28th, 0044689/Lindsay, is a real not-yet-opened store, not a pull failure), zero
  errors.
