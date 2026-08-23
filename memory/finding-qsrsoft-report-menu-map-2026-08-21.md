---
name: finding-qsrsoft-report-menu-map-2026-08-21
description: The COMPLETE QSRSoft report catalog - 108 McDonald's report screens with exact paths - from an unauthenticated static menu.json on a fourth host. This is the map of everything the reporting API can give us. Flags the reports that directly serve open Meridian roadmap items (Product Mix pricing, automating SMG VOICE, manager attribution, Part B new-hires) and the ones that overlap what Meridian already computes.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# The complete QSRSoft report catalog (owner capture, 2026-08-21)

```
GET https://api.sso.myqsrsoft.com/static/menu.json      <- NO AUTH HEADER AT ALL
Referer: https://v3.myqsrsoft.com/
```

**A fourth host, and a static unauthenticated file.** 48 top-level products, 467 nodes with a path,
**108 report screens under `/reports/mcd/`**. This is the whole surface area of the reporting
product — worth re-fetching periodically, since it is free and it changes when QSRSoft ships.

⚠️ **Not reachable from the Claude Code sandbox** — `api.sso.myqsrsoft.com` is blocked by the agent
egress proxy (`CONNECT tunnel failed, 403`). Owner capture only, unless the domain is allowlisted.

**Why this file matters more than it looks:** every capture so far carried
`Referer: https://v3.myqsrsoft.com/reports/mcd/<path>`. So this table is the **complete index of
which screen to open** to capture any endpoint we want. No more guessing whether a report exists.

## ❌ CORRECTION (same day) — most of what I called "unclaimed" is ALREADY PULLED

I wrote the section below recommending reports as new opportunities **without checking
`.github/workflows/` or `scripts/`**. That was wrong, repeatedly. `ls .github/workflows/ | grep qsr`
returns **21 QSRSoft pulls**. What actually exists:

| report I called an opportunity | reality |
|---|---|
| `people/employeeRoster` | ✅ **`qsrsoft-employee-roster-pull.mjs`** → `roster_role_counts` |
| `people/turnoverReport` | ✅ **`qsrsoft-turnover-pull.mjs`** → `turnover_monthly` |
| `people/rosterStatistics` | ✅ **`qsrsoft-roster-stats-pull.mjs`** → `roster_statistics` |
| `shift/shiftManagerSummary` | ✅ **`qsrsoft-shift-manager-pull.mjs`** |
| `product/productMixDrillDown` | ✅ **`qsrsoft-pmix-pull.mjs`** → `qsr_product_mix` |
| Forms | ✅ **`qsrsoft-forms-pull.mjs`** — but templates only, see below |

Also already pulled and not in my list at all: Digital App, McDelivery, On-Hand, Inventory History,
Live Pulse, Cash Anomaly, KB pull/analyze, Variance.

**So "Product Mix → Pricing Engine" is not blocked on a pull — the pull ships and writes
`qsr_product_mix`. What is missing is the ENGINE.** Same shape for Turnover: the data is in
`turnover_monthly`; nothing surfaces it.

### What is genuinely still open

- **Forms COMPLETION data.** `qsrsoft-forms-pull.mjs` captures **blank form templates** (questions,
  for printable checklists in `public/forms/*.json`). It does **not** touch
  `completionByForm`/`completionDetail`. The dashboard work stands.
- ⚠️ But **`forms.home` was already known**, contrary to my "third host family, auth unknown"
  framing: that script documents the host, uses `x-auth-token`, supports a pre-captured
  `QSRSOFT_FORMS_TOKEN` that skips login, and already calls **`GET /api/forms?orgId=…`** — the
  "forms list" endpoint I logged as an unexplored lead. It was in the repo the whole time.

### 🔴 Part B is NOT blocked on a capture — it is blocked on a PRIVACY DECISION already made

`qsrsoft-employee-roster-pull.mjs` **already fetches** `storeStartDate`, `storeEndDate`,
`jobTitleCodeStartDate`, `employmentStatus` and `geid`, and **already uses a restricted
`selectCols`** — its own comment: *"only job-code + status fields — so SSN/…"*. The allowlist
discipline I wrote up as a new requirement was already implemented.

But it **deliberately aggregates to `roster_role_counts` per store/month**, and states:
*"No individual-employee data is stored anywhere."*

**So the hire dates are already being read and deliberately discarded.** Part B does not need a new
endpoint, a new pull, or a capture — **it needs a decision to persist per-person tenure**, reversing
a privacy choice that was made on purpose. That is an owner call, and a materially different
conversation from "we can't find a hire-date field". Scope it that way.

## ⚠️ Method note — this is the fourth instance in one session

Same root cause each time: **claiming something is new without grepping the repo first.**

1. `jobTitleCode` "unknown" — the roster carried the mapping.
2. `regAudit` no-cookie "discovery" — already settled and documented in the pull script.
3. The DAR `/data_layer/v1/service/` auth question — **`qsrsoft-ops-pull.mjs:101` already hits that
   exact path with a direct token, twice daily, on a schedule.** I asked the owner to run five
   rounds of curl to test something the repo already proves in production.
4. This catalog.

`CLAUDE.md` already carries the rule ("Check whether a helper exists before writing one"). It is
evidently not enough on its own. **Before writing that anything is new, missing, or unclaimed, run
`ls .github/workflows/`, `ls scripts/`, and grep for the concept.** Cheaper than any of the above.

## 🎯 The reports that serve open roadmap items

| report | path | why it matters now |
|---|---|---|
| **Product Mix** | `product/productMixDrillDown` | `CLAUDE.md` "Next candidate areas: **Product Mix pull → Pricing Engine + Filet-O-Fish-Fridays correlation**." Here it is. Plus `product/productMixTrend` and **`product/menuPriceComparison` (RFM Price Comparison)** — pricing comparison is most of a pricing engine's input |
| **VOICE** | `service/voice` | 🔴 **SMG VOICE is MANUAL today** (PDF + Excel drop). If this report carries the same data, it retires a manual upload — directly against the standing "manual sourcing is always temporary" rule |
| **Shift Manager Summary** | `shift/shiftManagerSummary` | manager-on-duty by shift — the missing leg of **forms manager attribution**, and possibly cheaper than the roster+punches join |
| **New Hires** | `people/newHires` | dispatch #56 Part B, purpose-built |
| **Labor Exceptions** | `people/laborExceptions` | compliance/exception feed; companion to the punch-edit rule from `time-punches` |
| **Overtime Audit** | `people/overtimeAudit` | labor-cost and compliance signal Meridian has no equivalent of |
| **Turnover** | `people/turnoverReport` | a KPI Meridian does not report |
| **Student Permit Status Check** | `people/studentPermitStatusCheck` | **minor-labor compliance** — a genuine legal-risk area with no coverage today |
| **Roster Statistics** | `people/rosterStatistics` | may give roster insight **without PII**, sidestepping the `employee-roster` allowlist problem entirely. **Check this before building on the full roster** |
| **Report Finder** | `reportFinder` | QSRSoft's own search over its reports — worth a look before hunting manually |

## ⚠️ Reports that OVERLAP what Meridian already has — diff before adopting

| report | path | Meridian today |
|---|---|---|
| **VLH Over/Under** | `controlsLabor/vlhOverUnder` | 🔴 **we compute the VLH gap ourselves** from `lifelenz_schedules` |
| Schedule Variance | `controlsLabor/scheduleVariance` | we derive scheduled-vs-actual |
| Labor Schedules | `controlsLabor/laborSchedules` | `lifelenz_schedules` |
| Daily Activity Report | `shift/dailyActivity` | ✅ `qsr_daily_activity` |
| Daily Glimpse | `shift/dailyGlimpse` | ✅ emailed → `daily_glimpse_daily` |
| Sales Ledger | `sales/salesLedger` | ✅ emailed → `sales_ledger_daily` |
| Cash Sheet | `controlsCash/cashsheet` | ✅ emailed → `cash_sheet_daily` |
| Food Over Base | `controlsFood/fob` | ✅ `qsr_fob` |
| Register Audit | `controlsCash/registerAudit` | ✅ `audit_rows` |
| Operations Report | `shift/operationsReport` | 📤 manual upload |

**On VLH specifically** — `CLAUDE.md`: *"When two panels disagree on one number, diff the two
computations before debugging either."* Do **not** treat QSRSoft's as ground truth or assume ours is
wrong. Denominators, boundary (ours is LifeLenz-scheduled; theirs may be `compType`-based) and the
definition of variable labor may all differ. Pull once, diff the formulas. Agreement is free
validation of a number the app already shows; disagreement **is** the finding.

Note also the three emailed streams (Glimpse / Sales Ledger / Cash Sheet) all have **API screens
here** — which is exactly the "API over email, email ingestion is forward-only" rule's case for
migrating them, since an API pull can backfill and email cannot.

## The full catalog, by section

**people (22)** — `dashboard` · `birthdaysAnniversaries` · `employeeLookBack` · `empHoursThisWeek` ·
`empPayDetails` · **`employeeRoster`** ✅ · `employeeLookup` (Employee Time Punches) ·
`laborExceptions` · `newHires` · `overtimeAudit` · `payrollPayCycleStatus` · `employeePayPeriod` ·
`payrollLedger` · `rewards` · `rosterStatistics` · `shift` · `storePeoplePunches` ·
`studentPermitStatusCheck` · **`punch-extract`** ✅ (Time Punch Export) · `timeAttendance` ·
`turnoverReport`

**shift (16)** — `3PeaksReport` · `3DTrend` · **`dailyActivity`** ✅ · **`dailyGlimpse`** ✅ ·
`findMyPeak` · `focusOnService` · **`operationsReport`** · `peakTargetAndTracking` ·
`operationsByPunched` (Punched Summary) · `rank` · `operationMetricRecords` ·
**`shiftManagerSummary`** · `timeSliceSummary` · `trends`

**controlsCash (13)** — `adyenVariance` · `billableSales` · **`cashsheet`** ✅ · `cashStatistics` ·
`cashless` · `deposits` · `giftCardSummary` · `otherReceipts` · **`registerAudit`** ✅ ·
`safeCounts` · `taxDetails` · `taxExempt`

**sales (11)** — `consolidatedSales` · `kiosk` · `deliveryReport` (McDelivery) ·
`openLateCloseEarly` · `salesPointOfOrder` · **`salesLedger`** ✅ · `salesLedgerSummary` ·
`storeHours` · `salesWhereServed`

**controlsLabor (9)** — `allHours` · `laborAnalysis` · `laborSchedules` · `laborStatistics` ·
`laborAnalysisSummary` · **`scheduleVariance`** · **`vlhOverUnder`**

**digital (8)** — `dashboard` · `mobileApp` · `digitalUsage` · `digitalDelivery` (GMA Delivery) ·
`mobileOffersList` · `mobileProfitAndLossDetail` · `nationalEmployeeDiscount` (NED)

**product (8)** — `deliveryPrice` · `kitchenCapacity` · `productMixDiscount` (PMIX Discount) ·
**`productMixDrillDown`** · `productMixTrend` · **`menuPriceComparison`** (RFM Price Comparison) ·
`productOutage`

**controlsFood (7)** — `wastePromoDetail` (Comp Waste) · **`fob`** ✅ · `physicalInventory` ·
`inventoryCount` (Raw Item Counts) · `rawWastePromo` · `transfers`

**service (6)** — **`dtTimer`** ✅ · **`MOPServiceTimes`** ✅ · **`serviceTimesStatistics`** ✅ ·
**`voice`** · `yynn`

**other** — `businessUnit/consolidatedSalesBu` · `businessUnit/voiceRankings` · `reportFinder` ·
`dashboardtest` (Role Based DB) · `bigBetsIncentive` · `payroll/` · `recordsv2/dashboard`
(Employee Training Records)

✅ = already pulled, emailed, or captured by Meridian.

## How to use this for the next capture round

1. Pick the report from the table above.
2. Open `https://v3.myqsrsoft.com/reports/mcd/<path>`.
3. DevTools → Network → Fetch/XHR → run the report → capture the request.

**One report at a time, with a purpose.** A `people/*` sweep would pull payloads like the roster's
(SSN, address, DOB, race), and every such capture lands permanently in a session transcript that
cannot be retracted.
