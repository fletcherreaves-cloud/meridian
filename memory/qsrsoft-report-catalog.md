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

---

# `suspicious_activity` — the events query (owner-captured 2026-08-14)

**This is the purpose-built exception endpoint #275 hoped existed.** It restores Tier A properly
and retires the 650-request funnel design for exception work.

```
POST https://api.security.myqsrsoft.com/security/suspicious_activity/v1/
     {startDate}/{endDate}/{nsn,nsn,…}?event_token={token}&orgId={orgId}
body: null      (literally the string 'null')
```

Note the path uses **underscores** (`suspicious_activity`) while the UI route in `menu.json` uses
hyphens (`suspicious-activity`). And the parameter order is **dates first, then stores** — the
opposite of `store_filter_options`'s `{orgId}/{nsn}/{startDate}/{endDate}`. Two easy ways to
write a 404.

## Why this changes the design

| | `any_transaction` (#275's original plan) | `suspicious_activity` |
|---|---|---|
| stores per request | **one** (path param) | **all 27, comma-separated** |
| dates per request | **one** (path param) | **a range** |
| mandatory filters | `final_register` **and** `time_slice` | none beyond `event_token` |
| district cost | ~650 requests/day | **~27 requests** (one per event type) for a whole range |
| backfill | *"no range pull, no cheap backfill"* | a date range is a parameter |

The backfill line matters most. `any_transaction`'s single-date path parameter is exactly the
constraint the **data-depth standing rule** says never to accept as a limit — and here it simply
doesn't apply. History is a wider date range, not more requests.

**Untested, worth one capture:** whether `event_token=all_events` is accepted here. If it is, the
whole district's exception feed for a range is **one request**, not 27.

## Response — attribution reaches the individual, both sides

```json
[{ "event_token":"cash_refund", "event_name":"Cash Refunds", "location":11657,
   "cashier_display":"Rachel R", "cashier_leid":36,
   "manager_display":"Juan D",   "manager_leid":14,
   "event_amount":151.14, "event_quantity":1,
   "login_timestamp":"2026-08-04 15:03:37", "logout_timestamp":"2026-08-05 00:59:05",
   "score_id":463160317, "user_reaction":null, "busn_dt":"2026-08-04",
   "loyalty_id":null, "reg_id":"13" }]
```

This is the "one step deeper — the person attached to a metric" the owner asked for, and it
carries **cashier and manager separately**, which is precisely the distinction #277 flagged as
needing to be modelled so manager-authorised exceptions don't pool onto a manager's ID and read
as personal misconduct. Available here without inference.

`location` is an **unpadded** integer (11657), not `nsn7()`. Same padding trap as everywhere else.

## Four things to settle before building a pull

### 1. Is this raw events or QSRSoft's own scoring? — MEASURE FIRST

**One** row came back for `cash_refund` across **27 stores × 13 days**. Two readings, and they
mean very different things:

- **(a) pre-filtered to scored/flagged events.** Supported by the presence of `score_id`, by the
  endpoint's name, and by $151.14 being a very large single cash refund for a McDonald's.
- **(b) cash refunds really are near-zero district-wide.**

If (a), we would be ingesting **QSRSoft's derived judgments, not raw facts** — which lands it on
the far side of #272's facts-vs-judgments line and changes both what it may be used for and who
may see it.

**The measurement, not a guess:** Meridian already tracks cash refunds in its Controls metrics
from the Glimpse/Cash streams. Compare the count for **11657 over 2026-08-01…08-13** against this
endpoint's one row. Many vs one settles it as (a) immediately.

### 2. `leid` is store-local — never join on it alone

`cashier_leid: 36` and `manager_leid: 14` are small integers, and `store_filter_options` returns
cashiers/managers as `{badge, geid, display}` — so `leid` is almost certainly the **badge**, which
is issued per store. Employee 36 at 11657 is a different person from employee 36 at 3708.

**Join key is `(location, leid)`.** This repo has four documented `loc`-padding incidents
(v4.809/823/827/831) from exactly this class of mistake; this one is worse because a wrong join
attributes an exception to the wrong human being.

### 3. There is no event timestamp

`login_timestamp` → `logout_timestamp` spans **9h55m** here. That is the *session*, not the event.
The only event-time information is `busn_dt` — a date.

So an exception can be placed within a shift, **not within an hour**, which rules out correlating
these against `qsr_daily_activity`'s hourly rows. Anyone reading `login_timestamp` as "when the
refund happened" will be wrong by up to a full shift.

### 4. `user_reaction` is an existing human review workflow

The field exists and is `null` here, meaning someone can respond to a flagged event inside
QSRSoft. Any pull must **carry it through and never overwrite it** — the same rule #269's ledger
needed for its human-applied classifications. If reviews are happening in QSRSoft's UI, a pull
that drops the field silently discards work.

## Sensitivity — the sharpest personnel data we have touched

A **suspicion score attached to a named cashier and a named manager**. Unambiguously a derived
judgment about identifiable individuals under #272, so **supervisor-and-above**, gated on subject
as well as role, failing closed when unmarked.

And `memory/attribution-validity-register-login.md` applies at full force: the name on the metric
is the name on the **login**, not necessarily the actor. That caveat is a footnote on a sales
metric; here it is the difference between an inquiry and an accusation. It must travel with the
data, not live in a doc.

---

# `data_layer/v1/service/voice` — SMG VOICE by API (owner-captured 2026-08-14)

**This retires the manual SMG PDF + FullScale Excel drop** (`memory/data-acquisition-shopping-
list.md` §C). All 27 stores and a full date range in one request.

```
GET https://api.reports.myqsrsoft.com/data_layer/v1/service/voice
    ?nsd=d&nsn={csv of unpadded NSNs}&orgId={orgId}&enterpriseName=McDonalds
    &startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&dsd=s&weekStart=3
    &selectCols={csv of metric fields}
```

Same host as DAR/ops (`api.reports.myqsrsoft.com`), so **the documented DAR auth constraint
applies**: token-only server-side fetch returns 401; use the Playwright in-browser
`page.evaluate()` pattern with an explicit `X-Auth-Token` header. Known and already solved.

**`weekStart=3` = Wednesday**, independently confirming `orgStartOfWeek: "Wednesday"` from the
org config — and it is a *parameter*, so the 14-day Wednesday-anchored block work can ask the API
for its own alignment rather than re-bucketing client-side.

`/data_layer/v1/` looks like a **family**; `service/voice` is one member. Worth enumerating.

## The response shape is better than the Excel drop, for one specific reason

Metrics come as **satisfied-count / total-count pairs**, not pre-computed percentages:

```json
{"storeNum":3708,"overallSatCnt":27,"overallCnt":31,"accuracySatCnt":27,"accuracyCnt":31, …}
```

That means district and patch rollups are **Σnumerator / Σdenominator** — correct weighting by
construction. The FullScale Excel gives percentages already computed, which cannot be
re-aggregated without averaging averages, the exact error the standing rule forbids.

Six dimensions — Overall, Accuracy, Clean, Fast, Friendly, Quality — each in three channel
variants: unprefixed (total), `dt*` (drive-thru), `fc*` (front counter). DT + FC reconciles to
total, checked on five stores.

**Each metric carries its own denominator, and they differ** — store 5183 has `accuracyCnt` 19 but
`fastCnt` 20, because respondents skip individual questions. There is **no single store-level n**.
Any panel showing "responses: N" for a store is wrong for at least one metric.

`storeNum` is an **unpadded** integer. Same padding trap as `suspicious_activity`.

## Granularity — one row per store for the WHOLE range

`dsd=s` and `nsd=d` appear to be date-summarisation and store-detail switches. The capture returns
**a single aggregate row per store**, not daily rows.

**Untested and worth one capture: `dsd=d`.** If it returns per-day rows, daily VOICE trending is
free. If not, the pull needs one request per period, which is still trivially cheap.

## Measured on the captured window (2026-08-01…08-13, n=723 overall)

| | OSAT |
|---|---|
| District | **78.8%** |
| Oklahoma (n=584) | 81.0% |
| Florida (n=139) | **69.8%** |
| Drive-thru (n=305) | 77.7% |
| Front counter (n=418) | 79.7% |

Other dimensions district-wide: Accuracy 81.2%, Friendly 79.3%, Fast 77.6%, Quality 76.9%,
**Clean 75.3%** (lowest).

The **11.2pp OK-vs-FL gap is real** (≈2.7σ) and lands on the same side as the McValue traffic
finding (FL −5.49pp) — two independent measures pointing at Florida. Worth pursuing as a question,
not yet a conclusion; both could share a cause, or neither.

DT-vs-FC at 2.0pp on those n's is **not** a difference.

## The finding that constrains every VOICE panel we build

Per-store samples over 13 days run **n = 10 to 66**. Wilson 95% intervals against the ≥90% OSAT
threshold in CLAUDE.md:

- **0 stores** are provably at or above 90%
- 14 are provably below
- **13 are statistically indistinguishable from 90%**

Concretely: 18213 reads 90.0% — CI [60, 98]. 37566 reads 70.0% — CI [40, 89]. Those two look 20
points apart and are not distinguishable. Only 43380 (93.8%, n=48, CI [83, 98]) is anywhere near
defensible as a top performer.

**So a per-store VOICE leaderboard over a two-week window is mostly ranking noise**, and a
red/amber/green chip against 90% would be asserting precision the sample cannot carry. This is
exactly the accuracy-integrity concern (P0 in `vision-and-roadmap.md`) arriving in a new stream.

Two implications for design, both cheap:
1. **Carry `n` everywhere** a VOICE percentage is displayed, and suppress or grey any store below
   a floor (n < 15 is a reasonable starting cut — measure it, don't fix it by taste).
2. **Longer windows for per-store judgments.** Rolling 28-day or the 14-day block ×2 gets most
   stores past n=40. District-level is fine at 13 days; per-store is not.

---

# CORRECTION — VOICE OSAT targets are PER STORE, not a flat 90%

Owner, 2026-08-14: *"each location's actual targets for that are in the yearly target excel
upload."* He is right, and my first VOICE read graded every store against the flat ≥90% in
CLAUDE.md. That was the wrong bar for 26 of 27 stores.

Source: `2026 Restaurant Targets (Updated) OK & FL.xlsx`, sheet `Table 1`, block **"2026 Customer
Satisfaction Targets"** — `VOICE OSAT PACE` per restaurant, alongside `VOICE Execute As Designed`,
`Overall Satisfaction B2B` and `1-800 Contacts`.

## The reversal

**Oklahoma targets are individualised (0.82 – 0.92). Every Florida store's target is exactly
0.70**, and FL has **no Last Year Results** in any customer-satisfaction column.

Re-grading the same 2026-08-01…08-13 window against each store's own target:

| scope | actual | own target (response-weighted) | gap |
|---|---|---|---|
| District | 78.8% | 82.3% | **−3.5pp** |
| Oklahoma | 81.0% | 85.2% | **−4.2pp** |
| Florida | 69.8% | 70.0% | **−0.2pp** |

**This inverts the conclusion I gave the owner.** I reported the raw 11.2pp OK-vs-FL gap as
Florida underperforming, and as corroborating the McValue traffic finding. Measured against the
bars each market is actually held to, **Florida is at target and Oklahoma is 4.2pp short**. The
raw gap is a real difference in *level*; it is not a difference in *performance*.

**But do not over-correct.** FL's 0.70 is a flat placeholder across all seven stores with no LY
basis to individualise from — and its `Overall Satisfaction B2B` allowance is 0.085 versus ~0.04
for Oklahoma, roughly double the permitted dissatisfaction. "Florida is at target" therefore means
"Florida clears a placeholder set low because there was no history," which is a weaker statement
than it sounds. The right follow-up is whether 0.70 is still the right bar, not whether Florida
passed it.

## What survives unchanged — and is strengthened

Against each store's **own** target, over 13 days:

- **0 stores provably above target**
- **4 provably below** — 5985, 5183, 35064, 32525
- **23 statistically indistinguishable from their own target**

So 85% of stores cannot be told apart from their target in a two-week window. The sample-size
constraint was never about which threshold was used; it survives the correction intact and is the
durable finding. The four provably-below stores are the actionable list.

## ⚠️ These targets are NOT in Meridian

`DEFAULT_TARGETS` (`src/constants.js`) carries **zero** OSAT/VOICE fields — `grep tOsat|tVoice|
tSatisf` returns 0. The workbook's operational blocks are present (`tOepe`, `tPark`, `tKvst`,
`tKvsu`, `tR2p`, `tTpph`, `tLabor`, `tFOB*`), but **three whole blocks are missing**:

- **Customer Satisfaction** — VOICE OSAT PACE, Execute As Designed, Overall Satisfaction B2B, 1-800
- **Digital Execution** — Digital App % of sales, App GC/R/D, McDelivery GC/R/D, wait time, stars
- **People** — crew staffing, shift leader, GM/DM/swing, total headcount, and three turnover targets

#288's VOICE pull would land data with **no target to grade it against**. Filed separately.

---

# `suspicious_activity` — is it filtered? KB checked, evidence is strong but not conclusive

Owner suggested checking the KB, on the theory the "suspicious" label implies default filtering.
Searched all 208 `qsrsoft_kb` rows. **No article documents the report itself**; the only coverage
is the *Insights dashboard tile*, in `Insights - Did You Know? - Dashboard Details` (23502591807127):

> *"The Security Suspicious Activity insight (for Premium Core subscribers) indicates suspicious
> activity during the time frame chosen using the settings gear. The transactions we are showing
> now are cash refunds, cashless refunds, overrings, and loyalty rewards. More will be added soon."*

That sentence reads as an enumeration of **which event types are covered**, not a threshold on
which instances qualify — so the KB leans *against* filtering, and it certainly documents no score
cutoff. It also confirms per-transaction receipt drill-down and camera integration.

**A local measurement points the other way, harder.** Meridian's own `DEFAULT_TARGETS` for the
store in the captured row:

```
'11657': tRefundCash: 68.88   (monthly $ target for cash refunds)
         tRefundCnt:  20.0    (monthly count, all refund types)
```

The single returned event is **$151.14 — more than twice that store's entire monthly cash-refund
budget, in one transaction.** A feed returning raw cash refunds would not surface exactly one row
across 27 stores × 13 days and have it be a 2× - monthly - budget outlier. Combined with `score_id`
being present, the balance of evidence favours **pre-scored events**.

**Not proven, so do not build on it.** The KB and the magnitude point opposite ways. The
definitive test is unchanged and cheap: compare our Controls cash-refund **count** for 11657 over
2026-08-01…08-13 against this one row. Many vs one settles it immediately.

If it is scored, we are ingesting **QSRSoft's derived judgments about named individuals**, which
is the far side of #272's line — and the `score_id` should be stored so the judgment stays
attributable to its author rather than reading as Meridian's own finding.

---

# 1-800 Customer Feedback — a CRCP→QSRSoft email bridge that must be SET UP to exist

KB article 16137918130711, *"How Do I Access and Use Customer Feedback & Recovery (1-800 & Voice)?"*
Found 2026-08-14 while checking the suspicious-activity filtering question.

1-800 complaints/praise/inquiries originate in **McDonald's CRCP system** (`crcp.mcd.com`), not in
QSRSoft. QSRSoft ingests them **by being added as an alert designee**:

1. Log in to `https://crcp.mcd.com/crcp/logon.do` with the owner-operator id
2. **Add Designee** — First `QSRSoft`, Last `QSRSoft`, Phone type "Phone – with Voice Mail",
   email **`customerfeedback@myqsrsoft.com`**
3. **Assign Alerts** — add that designee to an open "Initial Alerts" email box **for every location**
4. Save

Records then post to MyQSRSoft's **Customer Feedback** page (permission: *Customer Feedback App
Access*) — a table of every record for the user's locations, with actions taken, actions still
needed, and quick-close. The KB is explicit that this is **different from** the dashboard's
Customer Feedback card, which carries VOICE scores only.

## ⚠️ This is email ingestion — forward-only, and the clock starts at setup

**It is the `cash_sheet_daily` failure mode exactly**, and CLAUDE.md's API-over-email standing rule
names that cost: fifteen months of cash and controls history that cannot be recovered because the
source emails for earlier periods do not exist. An emailed stream's history begins the day it is
configured to send.

There is no API to backfill from here — CRCP pushes to a designee address or it does not. So
**every day before the designee is added is a day permanently absent from the record.** Unlike
almost everything else in this repo, the data-depth standing rule does *not* rescue this one; it is
the rule's own stated exception class.

**Open question only the owner can answer: is `customerfeedback@myqsrsoft.com` already a designee
on the CRCP account, for all 27 locations?** The targets workbook carries per-store 1-800 LY
figures (district total 223.3 → 2026 target 197.0), so the metric is reaching him somehow — but
that does not establish that it is flowing into QSRSoft, and the per-location alert assignment is
the part most likely to be partially done.

If it is set up: the Customer Feedback table is a pull target, and it carries **follow-up state**
(actions taken / still needed), which no other stream we have does.
If it is not: setting it up is a few minutes and starts accumulating immediately.

**Sensitivity:** individual customer complaints naming restaurants, and potentially staff. Facts
follow parity; any derived judgment (a "complaint-prone store" ranking) is supervisor-and-above
per #272.

---

# The district OSAT decline — first exploration (2026-08-14)

Survey-weighted, Oklahoma (the only stores with a LY figure in the targets workbook):
**LY 84.0% → YTD 2026 79.1%, −4.8pp. 18 of 20 stores declined**; only 43380 (+2.0) and 24471
(+0.8) improved. District YTD across all 27 is **76.9%** on 26,974 surveys.

## Q1 — is it still falling? UNANSWERABLE with what we have. Do not claim otherwise.

The Aug 1–13 window reads +1.9pp above the YTD average, which is tempting to call a recovery. It
is not one:

- Aug n=723 → SE ≈ **1.52pp**, so +1.9pp is **1.25 SE**. Would need ~3.0pp to be significant.
- **YTD already contains the Aug window**, so it is partly a self-comparison.

This is exactly the trap that made the 13-day Florida number look on-target when 7.5 months of data
put it 3.9pp below. Flagged here because I nearly repeated it one message after warning about it.

**What answers it:** VOICE exported by month, or by 14-day Wednesday block, for 2025–2026. The API
takes a date range, so this is N cheap requests. Until then the *shape* of the decline — gradual,
step-change, or already recovering — is unknown.

## Q2 — where the weakness sits

| dimension | YTD district |
|---|---|
| Accuracy | 80.3% |
| Friendly | 77.7% |
| **Overall** | **76.9%** |
| Fast | 75.8% |
| Quality | 75.2% |
| **Clean** | **71.9%** |

**Clean is the floor** — 5.0pp below Overall, 8.4pp below Accuracy.

**Drive-thru 76.8% vs front counter 76.7% — identical.** Whatever is happening is *channel-neutral*,
which argues against drive-thru-specific causes (window staffing, DT speed, park behaviour) and
toward something store-wide.

**Direct application:** CLAUDE.md records cleanliness as an acknowledged data gap for Visit
Readiness (`memory/project-graded-visits-pace.md`). **VOICE Clean Sat % is a measured cleanliness
signal we already have access to** and are not using. It is customer-perceived rather than
inspector-graded, so it is a proxy, not a substitute — but Visit Readiness currently has *nothing*
in that slot.

## Q3 — systemic, not concentrated

| DO | stores | LY | YTD | change |
|---|---|---|---|---|
| Amanda | 3 | 82.0% | 74.9% | −7.1pp |
| Krystiana | 4 | 84.0% | 77.4% | −6.6pp |
| Robert | 4 | 77.9% | 73.3% | −4.6pp |
| Ashley | 5 | 86.6% | 82.7% | −3.9pp |
| Steven | 4 | 87.4% | 84.5% | −2.8pp |

| operator | stores | LY | YTD | change |
|---|---|---|---|---|
| Ryan Thorley | 9 | 83.5% | 80.3% | −3.2pp |
| Rick/Kathy Thorley | 5 | 85.8% | 80.1% | −5.7pp |
| Gary Mornhinweg | 6 | 83.1% | 76.3% | −6.8pp |

**Every DO and every operator declined.** With 3–5 stores per DO the between-DO spread is not
strong evidence of differential performance; the finding is the uniformity. That rules out a
single bad patch, a departed DO, or one operator's practices — and points to a **common cause
acting on all 27 restaurants**.

## The hypothesis to PRE-REGISTER before pulling monthly data

**McValue.** It is the one district-wide change already dated and measured here
(`memory/project-mcvalue-2-fbp-document.md`): traffic down, average check up — customers buying
differently. A value-platform change that shifts mix and raises check is a plausible satisfaction
driver, and it hit every store at once, which matches the uniformity above.

Record the prediction **before** looking: if McValue drives it, the break is at the McValue date and
is a step, not a drift. Recorded after the fact it is a story; recorded first it is a test. Same
discipline as `store_assessments`.

**The confound that must be ruled out first:** a change in **survey composition**. If SMG changed
how invitations are issued — more app/digital-originated, different receipt placement, different
incentive — the respondent mix shifts and scores move with no operational change at all. A
uniform, district-wide, channel-neutral drop is *exactly* what a solicitation change looks like.

**Test:** survey volume per store per period. If response counts jump or shift channel mix at the
same date the scores break, suspect composition before operations. We have `# of Surveys` per store
already; the monthly pull gives it per period at no extra cost.

---

# OSAT decline — the monthly series, and the pre-registered hypothesis FAILS

Owner supplied VOICE monthly, Jan 2024 – Aug 2026 (827 rows, 27 stores, one "Total" row dropped).
Survey-weighted throughout.

## Annual

| year | surveys | OSAT | Clean | Accuracy | Fast | Quality |
|---|---|---|---|---|---|---|
| 2024 | 27,804 | 84.3% | 80.6% | 86.7% | 84.4% | 83.6% |
| 2025 | 26,561 | 82.2% | 78.0% | 84.3% | 81.8% | 80.7% |
| 2026 (to 8/13) | 13,487 | **76.9%** | **71.9%** | 80.3% | 75.8% | 75.2% |

Peak **88.7% (Aug 2024)** → trough **74.7% (Apr 2026)**, −14.0pp.

## The hypothesis I pre-registered is REFUTED

Recorded before looking: *"if McValue drives it, the break is a step at the McValue date, not a
gradual drift."*

**There is no step anywhere in 32 months.** Standard deviation of month-over-month change is
2.44pp; the largest single move is −5.4pp (2026-03), 2.2 sd — well inside what this series does
routinely. The decline is a **sustained drift beginning around March 2025** and continuing through
2026, not a discontinuity.

This holds regardless of what date McValue is assigned, so it does not depend on the date the owner
still owes. **A prediction recorded first and failed is worth more than one adjusted afterwards** —
McValue is not ruled out as a *contributor*, but the single-cause step-change story is dead, and
any future McValue-OSAT claim has to explain the absence of a break.

Note also OSAT **peaked in Jan–Feb 2025 (87.5%, 87.8%)** — the highest months in the series after
Aug 2024 — and only then began falling.

## Every dimension fell together

| dimension | peak | trough | drop |
|---|---|---|---|
| Clean | 85.8% (2024-08) | 68.0% (2025-12) | **−17.8pp** |
| Quality | 87.9% (2024-08) | 71.0% (2026-04) | −16.8pp |
| Fast | 88.6% (2024-08) | 72.8% (2026-03) | −15.8pp |
| OSAT | 88.7% (2024-08) | 74.7% (2026-04) | −14.0pp |
| Friendly | 88.7% (2025-02) | 74.8% (2026-04) | −13.9pp |
| Accuracy | 90.2% (2024-08) | 76.5% (2025-12) | −13.7pp |

**Five of six peak in the same month (Aug 2024) and all six fall 13.7–17.8pp.** Clean is worst and
falls furthest, consistent with the YTD dimension ranking. A decline this uniform across unrelated
attributes — cleanliness, speed, order accuracy, staff friendliness — is not what a single
operational failure looks like; those would move one or two dimensions, not all six in lockstep.

## The composition confound — WEAKENED, not eliminated

Monthly survey volume fell **27%**: 2024 avg 2,317/month → 2026 avg 1,686.

| test | r | verdict |
|---|---|---|
| raw levels (volume vs OSAT) | **0.589** | both series trend down — largely spurious |
| **month-over-month change** | **0.137** | t=0.74 on 29 df — **NOT significant** |
| year-over-year same-month | 0.413 | n=20, borderline, not significant |

The raw 0.589 looked alarming and is an artifact of two declining series. **Month to month, swings
in response volume do not predict swings in OSAT** — so the score decline is not explained by
period-to-period variation in who happened to respond.

**Why this is "weakened" and not "cleared":** a *slow structural* change in the response mechanism —
a gradual shift toward app-originated invitations, a receipt-format change, a changed incentive —
would move both series down together over years and would be **invisible** to a month-over-month
test. The detrended test rules out volume as a short-run driver. It cannot rule out a slow
composition drift, which is exactly the shape the data shows.

**What would settle it:** response *channel mix* over time (DT vs FC survey counts, and invitation
source if SMG exposes it), not response volume. The DT/FC split is already in the monthly export.

## Next

Owner supplied three McDonald's Business Building Roadmap PDFs (Q2 2024, Q4 2024, Q1 2025 + Yearly)
— national promotional calendars. These cover the period where the decline begins and are the
natural next test: a marketing-driven mix shift is a district-wide simultaneous change of exactly
the kind the uniformity implies. Not yet read.

---

# `security-events` — the RAW transaction feed, and it has timestamps

Owner-captured 2026-08-14 (UI + `store_filter_options` for a single store/day/event type).
`v3.myqsrsoft.com/security/security-events` — **a different report from Suspicious Activity**, and
the more useful of the two for our purposes.

## It solves the gap that limited `suspicious_activity`

The catalog records of `suspicious_activity`: *"There is no event timestamp… only `busn_dt`… an
exception can be placed within a shift, not within an hour."* **`security-events` does not have
that problem.** Its transaction table carries:

```
Date · Time (16:32:59) · Day Part · Register · Crew · Manager ·
Manager Code Entered · Tender Type · Overring Amount · View Detail
```

Per-second event times, so these **can** be joined to `qsr_daily_activity`'s hourly rows — the
correlation `suspicious_activity` could not support.

**`Manager Code Entered` is a control field we did not know existed.** In the captured day, 2 of 3
overrings show `false`. An override performed without the manager code being entered is a
first-class loss-prevention signal, and nothing else we pull exposes it.

## This is now strong evidence that `suspicious_activity` IS filtered

`security-events` returned **3 POS overrings for one store on one day**. `suspicious_activity`
returned **1 cash refund across 27 stores over 13 days**. Different event types, so not proof —
but combined with `score_id` and the $151.14 outlier (2× that store's monthly cash-refund budget),
the balance now clearly favours **`suspicious_activity` = scored/ranked subset**, `security-events`
= raw stream.

**The clean test, now trivially available and better than the Controls comparison I proposed
earlier:** run **both** endpoints for the **same store, same date, same `event_token`**. Identical
counts = both raw. Fewer from `suspicious_activity` = it filters. One capture settles it.

## `Top Contributors` is QSRSoft ranking named individuals

The report leads with a **Top Contributors** panel — managers and cashiers ranked by event count
(`Dallas L - 51: 2`, `James T - 9: 1`, …). That is a per-person ranking authored by the vendor, so
it is a **derived judgment** under #272: supervisor-and-above, with
`memory/attribution-validity-register-login.md`'s caveat attached — the name is the name on the
login. Do not re-present it as a Meridian finding.

## Four corrections and confirmations from the filter-options capture

### 1. CONFIRMED — `leid` **is** the badge, and it is store-local

`suspicious_activity` returned `manager_leid: 14`; this store's manager list contains
`{badge: "14", display: "Liz  - 14"}`. The predicted join key **`(location, badge)`** is right, and
badges are small per-store integers, so joining on badge alone across stores would attribute events
to the wrong person.

### 2. CORRECTION — register lists are **window-dependent**, not a static store config

The catalog says registers are per-store and must never be hard-coded. That is right but
understated. The earlier capture gave 3708 `POS0002/0006/0007/0008/0009/0013/**0014**/0016/0019`;
this one (single day) gives `…/0013/**0015**/0016/0019`. **The list reflects registers active in the
queried window**, not the store's terminal inventory. So it cannot be cached as a store attribute
either — only as a per-window observation.

### 3. Sentinel rows exist for unattributable events — exclude them from any per-person rate

```
managers: {badge: null,  geid: "unavailable", display: "Unavailable - null"}
          {badge: "000", geid: "unavailable", display: "Unavailable - 000"}
cashiers: {badge: "999999999", …}   {badge: "", …}
```

Events genuinely have no attributable person. A naive per-person rollup creates a phantom employee
"Unavailable" carrying a large event count and, worse, a large *rate*. Filter on
`geid === "unavailable"` — the flag is explicit, so this needs no heuristics.

### 4. The GEID gap persists

Every real manager and cashier still has `geid: null`; only the sentinels carry a value, and that
value is the string `"unavailable"`. The **POS badge → empID → geid** chain remains unjoined, and
`/admin/geidLookup` + `/admin/missingGeids` remain the route to closing it.

## Full `event_types` enumeration (27), confirmed

`total_order_promo` · `mobile_promo` · `other_promo` · `all_promo` · `delivery_promo` ·
`cash_refund` · `cashless_refund` · `pos_overring` · `pos_auto_discount` · `mobile_discount` ·
`other_discount` · `all_discount` · `coupon` · `t_red_before` · `t_red_after` ·
`duplicate_card_swipe` · `drawer_open` · `high_lock_out` (+`_tender`/`_amount`/`_item`) ·
`employee_meal` · `manager_meal` · `loyalty_reward_ids` · `billable_sales` ·
`electronic_benefit_transfer` · `all_events`

**`all_events` is the only entry with no `display` field**, which suggests it is a control value
rather than a real category — worth testing whether it is accepted as an `event_token` on the
events queries, since that would collapse 26 requests into one.

`tender_types` includes **`No Tender`**, which 2 of the 3 captured overrings used.
`billable_orgs` is empty for 3708, consistent with the owner's account of billable sales as rare.

## Unattributable events may be KIOSK orders — owner hypothesis, 2026-08-14

> *"For the unattributable results, could be kiosk orders. I believe typically POS 6-11. I can
> confirm but should be close."*

Plausible and it changes the handling. If the sentinel rows (`geid: "unavailable"`, badge
`null`/`000`/`999999999`/empty) are self-service kiosk transactions, they are **not a data-quality
gap** — they are a legitimate category with genuinely no employee involved.

**Revised guidance: segment, do not discard.** Excluding them from *per-person* rates is still
correct (a kiosk has no person to attribute to), but they must be reported as their own line rather
than dropped. Two reasons:

1. **A kiosk-vs-staffed exception rate is operationally interesting in its own right.** If overrings
   or refunds occur at different rates on kiosks than on staffed registers, that is a finding — and
   it is invisible if the rows are filtered away.
2. **Silent exclusion biases store comparisons.** Kiosk mix varies by store. Dropping kiosk events
   from the numerator while a store-level denominator still includes kiosk sales understates
   exception rates at high-kiosk stores.

**Not yet confirmed — the test is one capture.** The `security-events` transaction table carries
both `Register` and `Crew`. Pull one store for a week (or `all_events` for a day) and group by
register: if the unattributed rows cluster on POS0006–POS0011, the hypothesis holds. The captured
sample cannot test it — all three overrings were POS0002 with named crew.

**Register topology is emerging, and it matters beyond this.** For 3708 we now have evidence of at
least three roles: **staffed order points** (POS0002, named crew), **probable kiosks** (0006–0009
present in the list, owner's 6–11 range), and **payment funnels** (POS0013, which #275 found
receives orders originating on other terminals). #275's funnel-register discovery step should
expect this mix rather than treating every register as equivalent — a kiosk is not a funnel and
should not be probed as one.

## `top_contributors` — the security family's URL/body pattern, and a denominator trap

Owner-captured 2026-08-14.

```
POST https://api.security.myqsrsoft.com/security/top_contributors/v1/{orgId}/{nsn}?orgId={uuid}
body: {"event_token":"pos_overring","start_date":"2026-08-14","end_date":"2026-08-14"}
```

**This settles the calling convention for the `security-events` family, and it differs from
`suspicious_activity`:**

| | `suspicious_activity` | `security-events` family |
|---|---|---|
| stores | comma-separated list **in the path** | **one** NSN in the path |
| dates | **in the path** | **in the POST body** |
| event token | query string | **in the POST body** |

So a district pull of this family is **27 requests per event type per window**, not one — unless the
path accepts a comma list the UI never sends. Untested; the Locations-picker question stands.

`start_date`/`end_date` in the body confirms native **range** support, matching the LW/LM/WTD/MTD
and calendar presets in the filter panel.

## It reconciles exactly — so this family is RAW, not scored

Manager rows sum 2+1 = **3**. Cashier rows sum 1+1+1 = **3**. The transaction table for the same
store/date/token showed exactly **3** transactions.

`top_contributors` is therefore a plain aggregation of the underlying events — no threshold, no
scoring, nothing dropped. Two consequences:

1. **It is fully derivable from the transaction feed.** If we pull transactions we do not need this
   endpoint at all. One fewer thing to build and keep in sync.
2. It is further evidence that **`security-events` is the raw stream** and `suspicious_activity` is
   the filtered/scored one — though the definitive same-store/same-date/same-token comparison is
   still outstanding.

`key_filter` is the **badge** (`"Dallas L - 51"` → `"51"`), confirming the badge/`leid` identity a
third time, with `key_filter_type` naming the role dimension.

**A person appears in both lists.** Dallas L-51 is manager on 2 events and cashier on 1. Cross-
checking the transaction rows: Dallas was Crew on row 1 (manager James T-9) and Manager on rows 2
and 3. So manager-vs-cashier is a **per-event role, not a person attribute** — any employee model
that assigns one role per person will mis-attribute.

## ⚠️ The ranking has no denominator — do not surface it as-is

`top_contributors` ranks people by **raw event count**. Dallas has 2 overrings; the report does not
say how many transactions Dallas supervised. A manager working five shifts will out-rank one
working a single shift with no difference in behaviour whatsoever, and the person who appears "top"
is frequently just the person who was there most.

This is exactly the normalisation #275 already specifies — *rate-normalise per $1,000 of that
person's own sales, and guard the zero denominator*. Recording it here because the vendor presents
the un-normalised version prominently at the top of the report, which is precisely how a raw count
gets mistaken for a finding.

Under #272 this is a derived judgment about named individuals: supervisor-and-above, with the
attribution caveat attached. Presenting QSRSoft's un-normalised ranking inside Meridian would
compound the vendor's framing error with our own authority.

## Still outstanding

The **transactions** call itself. Following this pattern it is most likely
`POST /security/security_events/v1/{orgId}/{nsn}` with the same body plus optional filter keys
(day part, register, cashier, manager, tender type, manager-code flag).
