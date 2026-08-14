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
