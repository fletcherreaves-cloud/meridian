# QSRSoft report catalog — the full site map, and what it unlocks

Source: `GET https://api.sso.myqsrsoft.com/static/menu.json` — **no auth header required**, a
public static file. Owner captured it 2026-08-14 while probing Any Transaction.

It is the complete navigation tree for every QSRSoft enterprise client, with every report path
and its permission key. Treat it as the authoritative index of what is available to pull, and
re-fetch it periodically — it is how we find out what exists without hunting the UI.

---

## 1. The `/security/` section — FIVE reports, we knew about one

```
/security/security-events        Security Events
/security/suspicious-activity    Suspicious Activity      ← purpose-built exception feed
/security/any-transaction        Any Transaction          ← the one we probed (#275)
/security/store-rankings         Store Rankings
/security/camera-settings        Camera Settings
```

**`suspicious-activity` is exactly the endpoint hypothesised in #275** — the thing that would
replace pull-everything-and-filter with a purpose-built feed. `security-events` and
`store-rankings` are also directly relevant to the loss-prevention work.

**Probe all three before building #275's funnel-register design.** If Suspicious Activity
returns pre-identified exceptions, the entire volume problem (650 requests/day across 8 time
slices × 3 funnel registers × 27 stores) disappears.

Note `alwaysShowForQsrAdmins: true` on all of them, and permission `security_access`.

## 2. SMG VOICE is INSIDE QSRSoft

```
/reports/mcd/service/voice       VOICE      permission: voice
```

`memory/data-acquisition-shopping-list.md` §C lists VOICE as a separate vendor portal needing its
own auth stack, and flagged "worth checking whether QSRSoft mirrors any VOICE data before
building a second auth stack." **It does.** Same reporting host, same token ladder.

Also in Service: `YYNN`, `MOP Service Times`, `DT Timer`, `Service Times Statistics`.

## 3. QSRSoft has punch data — #278's source question is settled

```
/reports/mcd/people/storePeoplePunches   Store Time Punches   (tags: Employee Time Punch Audit)
/reports/mcd/people/punch-extract        Time Punch Export    (adminOnly)
/reports/mcd/people/employeeLookup       Employee Time Punches
/reports/mcd/people/timeAttendance       Time and Attendance
/reports/mcd/people/overtimeAudit        Overtime Audit
/wfm/audit/punch_audit_report            Time Punches (audit)
```

#278 argued QSRSoft over LifeLenz on history depth and identifier-space grounds, gated on a
punch-for-punch comparison. **The reports exist**, including a dedicated *export*
(`punch-extract`, admin-only) which is likely the cleanest pull target.

## 4. The GEID bridge exists as a tool

```
/admin/geidLookup      GEID Lookup     (appAccess: crew_portal)
/admin/missingGeids    Missing GEID
```

#275 flagged a **third identifier space** — POS operator number (`"Richard  - 20"`) → `empID` →
`geid` — as fragile, joined through a first name with no surname. QSRSoft has a GEID lookup
tool, so the mapping is likely available rather than needing to be inferred.

## 5. The two parsers that parse into nothing now have report paths

```
/reports/mcd/product/productMixDrillDown   Product Mix        permission: pmixCI
/reports/mcd/product/productMixTrend       Product Mix Trend
/reports/mcd/product/productMixDiscount    PMIX Discount
/reports/mcd/people/laborExceptions        Labor Exceptions   permission: mcdLaborExceptions
```

`parsePMixData` (`parsers/index.js:1209`) and `parseLaborExceptions` (`:1542`) both exist with no
table, loader or pull — shopping-list §F and §H.

## 6. Cash reports we are not pulling

```
/reports/mcd/controlsCash/deposits          Deposits
/reports/mcd/controlsCash/safeCounts        Safe Counts
/reports/mcd/controlsCash/cashStatistics    Cash Statistics
/reports/mcd/controlsCash/billableSales     Billable Sales
/cimt/cash/skims                            Skims
/cimt/cash/drawer-countdown                 Drawer Countdown
/cimt/cash/safe-count                       Safe Count
```

**`deposits` is worth a look.** The deposit-lapping analysis was closed on the grounds that
QSRSoft cannot see deposit *timing* — a deposit counts as accounted for when entered, so a held
deposit produces no variance. A dedicated Deposits report may carry entry timestamps that the
cash-sheet aggregate does not. That does not reopen the finding, but it is worth checking what
the report actually contains before the conclusion is treated as permanent.

`billableSales` being its own report corroborates the owner's account of it as a rare
pre-arranged house-account function, not a transaction count.

## 7. Datapass — a dataset-sharing platform

```
/datapass/catalog     Dataset Catalog
/datapass/featured    Requested Datasets
```

`appAccess: datapass`, roles `operator` / `qsr_admin` / `mcd_admin`. A formal dataset catalogue
with authorisations and a file tracker — potentially a **bulk** data route rather than
report-by-report scraping. Worth understanding before building more individual pulls.

---

## How to use this file

The menu is a **capability index**, not an API spec. A path here proves a report exists and names
its permission key; it does not give the endpoint, which still needs a DevTools capture. But it
removes the guesswork about *what to look for* — and it is how we found that three of our
"needs a separate vendor portal" assumptions were wrong.

Re-fetch when hunting for a new data source, before assuming something is unavailable.

---

# Org identity and entitlements

Source: `GET https://api.sso.myqsrsoft.com/user/info?userId={uuid}&orgId={orgId}` (requires
`x-auth-token`). Captured 2026-08-14.

| field | value |
|---|---|
| `orgName` | **RKT Inc.** |
| `orgId` | `org-a546d4ef-684a-4f25-8bc0-6580af068875` |
| `clientId` | `2433` |
| `enterpriseClient` / `countryCode` | `McDonalds` / `US` |
| **`orgStartOfWeek`** | **`Wednesday`** |
| owner `eID` / `geid` | `eu065119` / `200234453` |
| SAML `role` | `Franchisee Office Staff` (per-store roles all `Operator`) |

**`orgStartOfWeek: "Wednesday"` is the vendor's own configuration**, independently confirming the
week-start convention that `constants.js:103` asserts as "McDonald's standard" and that the
McValue 14-day block design (`memory/project-mcvalue-2-fbp-document.md`) rests on. It is no
longer just our comment.

## ⚠️ 29 locations in the QSRSoft org, 27 in Meridian

```
QSRSoft org `locations` : 29
Meridian STORE_NAMES    : 27
McDonald's SAML `nsns`  : 27

In QSRSoft org but NOT in Meridian : 23021, 28819
In QSRSoft org but NOT in SAML     : 23021, 28819
In Meridian but NOT in QSRSoft org : (none)
```

**RESOLVED — owner, 2026-08-14: 23021 and 28819 are SOLD OR CLOSED stores. Data retained in the
org but not current.** That is why they hold no McDonald's operator role and are absent from
`saml.nsns` / `saml.roles`.

**Not a live risk today, and the reason is worth knowing.** Every pull script hardcodes its own
`STORE_NSNS` list — `qsrsoft-dar-pull` · `-ops-pull` · `-ebos-pull` · `-onhand-pull` ·
`-shift-manager-pull` · `-employee-roster-pull` · `-roster-stats-pull` · `-mcdelivery-pull` ·
`-digital-app-pull` · `-pull`. Neither loc appears anywhere in `src/` or `scripts/`, so they have
never entered our data at any period. That is also why the 2024 DAR backfill returned **25**
stores rather than 27 — the list, not the org, decides.

**The standing guard:** never source a pull's store list from the org's `locations` array. It
carries sold and closed restaurants, and a district aggregate built from it would silently
disagree with every Meridian total. `STORE_NAMES` (or a script's own `STORE_NSNS`) is the roster.

**The upside, per the data-depth rule:** their history is *retained*. If a longer district
baseline is ever wanted for a period when they were trading, that data exists and is reachable —
it simply will not arrive by accident. Treat them as an opt-in historical source, and as a
portfolio-composition event in `memory/store-events-material-changes.md` if any analysis window
ever spans their exit.

## QSRSoft's own RBAC groups

`Office Manager` · `Maintenance` · `Operations Manager` · `Owner Operator` ·
`Director of Operations` · `System Administrators`

**`security_access` appears only in `Director of Operations`** (plus the owner's own permission
set) — not in Owner Operator, Operations Manager, or Office Manager.

Informative for #272 rather than contradictory. The owner set derived flags at
**supervisor-and-above**; QSRSoft gates its *transaction-level investigation console* at DO.
Different objects — a flag on a store dashboard is not the Suspicious Activity tool — so both
can be right. But it is a useful external reference point: the vendor independently landed near
the same line.

PII is granular and separately permissioned: `pii_ssn`, `pii_payrate`, `pii_annual_salary`,
`pii_terms`, `pii_emergency_info`, `pii_emp_info`, `pii_emp_phone_number`, `pii_name`,
`pii_payrate_reports`. A finer-grained model than Meridian's, worth borrowing conceptually.

---

# `store_filter_options` — register discovery + the exception taxonomy

```
POST https://api.security.myqsrsoft.com/security/store_filter_options/v1/
     {orgId}/{nsn}/{startDate}/{endDate}?event_token=undefined&orgId={orgId}
body: null
```

Serves **both** Any Transaction and Suspicious Activity. Returns, per store per date range:

- **`event_types`** — 27 server-side-filterable exception types: `cash_refund`,
  `cashless_refund`, `pos_overring`, `t_red_before`, `t_red_after`, `all_promo`/`total_order_promo`/
  `mobile_promo`/`other_promo`/`delivery_promo`, `all_discount`/`pos_auto_discount`/
  `mobile_discount`/`other_discount`, `coupon`, `duplicate_card_swipe`, `drawer_open`
  ("Unauthorized Drawer Open"), `high_lock_out`(`_tender`/`_amount`/`_item`), `employee_meal`,
  `manager_meal`, `loyalty_reward_ids`, `billable_sales`, `electronic_benefit_transfer`,
  `all_events`
- **`registers`** — `{value: "POS0013", display: 13}`. **This is the register-discovery endpoint**,
  and registers are genuinely per-store: 43380 has POS0001/0002/0006/0007/0008/0009/0013/0019
  (8); 3708 has POS0002/0006/0007/0008/0009/0013/0014/0016/0019 (9). Each has one the other
  lacks — never hard-code them.
- **`managers`** and **`cashiers`** — separate lists of `{badge, geid, display}`, confirming the
  manager/cashier distinction is first-class
- `tender_types`, `lock_out_type`, `billable_orgs` — also per-store

## The GEID gap is systemic

`geid` is `null` for **every** cashier and manager at both stores sampled, while the owner's own
record carries a real GEID. The field exists in the schema; the mapping is simply unpopulated.

That is what `/admin/missingGeids` and `/admin/geidLookup` are for. Populating it would close the
**POS badge → empID → geid** chain that #275 flagged as fragile — currently joinable only through
a first name with no surname and doubled internal whitespace.

**Still outstanding:** the actual Suspicious Activity *events* query, carrying a real
`event_token`. `store_filter_options` is the page's preload, not the search. That request decides
whether #275 is a couple of dozen requests a day or the 650-request funnel design.
