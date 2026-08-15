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

**What would settle it:** response *channel mix* over time. **DONE — see below.**

## ✅ CHANNEL-MIX TEST RUN (2026-08-14) — the composition confound is CLOSED

The monthly export gives DT% , FC% and the blended overall, but **not** the channel counts. It does
not need to: `overall = dtShare·dtPct + (1 − dtShare)·fcPct` is one equation in one unknown, so

```
dtShare = (overall − fcPct) / (dtPct − fcPct)
```

recovers the mix per store-month. **555 of 824 store-months solvable**; the remainder had DT and FC
within 5pp of each other, where the inversion is numerically unstable — a precision limit, not a
selection bias.

Survey-weighted drive-thru share of responses, Jan 2024 → Aug 2026:

```
2024-01 35.9%   2024-07 41.5%   2025-01 44.8%   2025-07 50.1%   2026-01 35.8%   2026-07 44.3%
2024-04 45.3%   2024-10 47.7%   2025-04 43.5%   2025-10 38.8%   2026-04 37.4%   2026-08 42.2%
```

**Trend +0.108 pp/month, t = 1.47 — not significant.** The mix oscillates around ~42% with no drift.

**Both legs of the measurement-artifact explanation are now closed:**

| test | result |
|---|---|
| response **volume** vs OSAT, month-over-month | r = 0.137, t = 0.74 — not significant |
| response **channel mix** drift over 32 months | +0.108 pp/mo, t = 1.47 — not significant |

**The decline is therefore real.** Not a solicitation change, not a volume artifact, not a channel
shift. A −7.4pp fall in district OSAT from 2024 to 2026, across 18 of 20 stores, every DO and every
operator, is measuring something that actually happened to the guest experience.

That closes the "is it even real" question and moves the whole investigation to **cause**. The
remaining candidates are operational or competitive, and the national marketing calendar (#290) is
the covariate that would let them be tested.

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

**CONFIRMED not user-facing (owner screenshots, 2026-08-14):** the Events dropdown runs
alphabetically from *All Discounts* to *Unauthorized Drawer Open* with **no "All Events" entry**.
It is single-select — no multi-select checkboxes. So `all_events` exists in the API enum and the UI
never sends it, which is exactly why it carries no `display`.

Note the asymmetry: the **category** rollups `all_discount` / `all_promo` ARE offered in the UI
("All Discounts", "All Promos"), while the **global** rollup is not. The vendor exposes
within-category aggregation but not across-category — possibly because `all_events` backs the
Insights tile rather than this report.

### ✅ TESTED AND ACCEPTED (owner, 2026-08-14) — 26 requests collapse to 1

`{"event_token":"all_events","start_date":"2026-08-14","end_date":"2026-08-14"}` against
`top_contributors` for 3708 returns real aggregated data, not an error:

```
managers: Dallas L - 51 (2)   James T - 9 (2)   Liz R - 14 (1)          -> 5
cashiers: Shauntell S - 10 (2) Anthony S - 84 (2) Dallas L - 51 (2)
          Mariah M - 27 (1)                                            -> 7
```

**`all_events` is a valid `event_token` even though the UI never offers it.** A district pull does
not need one request per event type.

#### Two findings inside that response, both of which would have caused bugs

**1. Manager and cashier totals DO NOT match — 5 vs 7.** For `pos_overring` they matched exactly
(3 and 3). Across all event types they do not, so **manager attribution is optional per event**:
two of the seven events have a cashier and no manager. Entirely sensible — a loyalty reward or an
employee meal needs no manager authorisation — but it means:

- The event count for a store/day is the **cashier** total, not the manager total.
- Any schema requiring both, or any join assuming a manager exists, drops rows or silently
  produces nulls. `manager_leid` must be nullable and *expected* to be null.
- Manager-side and cashier-side rates have **different denominators** and cannot be compared
  directly.

**2. The same person has different display strings on different endpoints.**
`store_filter_options` returns `"Liz  - 14"` (double space, no surname initial); `top_contributors`
returns `"Liz R - 14"`. Same badge, same human, two spellings.

That is the fragile-name-join hazard #275 flagged, now demonstrated *within the same API family
on the same day*. **Join on `(location, badge)` only. Never on the display string** — and never
assume a name seen on one endpoint will match the other.

#### Volume calibration — and what it does to the filtered-vs-raw question

Seven events across **all** types for one store on one day. Extrapolated naively that is roughly
**2,500 events district-wide per fortnight** — a very manageable pull.

**`all_events` is REJECTED by `suspicious_activity`** (owner-tested 2026-08-14):
`"Invalid event_token in query parameter: all_events"`. So the two endpoints validate
`event_token` against **different allowed sets** — further evidence they are separate subsystems,
not two views of one feed.

That gives the two families opposite scaling, and they land in the same place:

| | requests for a full district window |
|---|---|
| `suspicious_activity` | **~26** — one per event type; all 27 stores and the whole date range per call |
| `security-events` family | **~27** — one per store; `all_events` and the whole range per call |

Either is cheap. Choose on **content**, not cost: `security-events` carries per-second timestamps
and `Manager Code Entered`, which `suspicious_activity` does not.

## ✅ SETTLED — `suspicious_activity` IS a filtered subset. Decisively.

Same store, same date, same event type, both endpoints (owner-tested 2026-08-14):

| endpoint | 3708 · 2026-08-14 · `pos_overring` |
|---|---|
| `security-events` (transaction table) | **3 transactions**, $5.55 + $7.41 + $11.00 |
| `top_contributors` | reconciles to **3** on both manager and cashier sides |
| **`suspicious_activity`** | **`[]` — zero rows** |

Three real overrings exist and `suspicious_activity` returns **none of them**. This is not a mild
threshold; it is a highly selective filter. It also explains the very first capture — a single
cash refund across 27 stores over 13 days was never the refund *count*, it was a flagged highlight.

### What this decides

**`security-events` is the primary feed.** It has the timestamps, `Manager Code Entered`, and — now
established — **completeness**. `suspicious_activity` cannot be the source of record for anything.

**Never compute a count, rate, or trend from `suspicious_activity`.** It drops 3 of 3 here. Any
"refunds per store" or "overrings per $1,000" metric built on it would be wrong by an unknowable
margin, and wrong *differently* per store. It looks like an event feed and is not one — that is
precisely the trap.

### ⚠️ Interpretation guard — absence is NOT zero

**A store returning no rows from `suspicious_activity` does not mean no events occurred.** 3708 had
three overrings and returned an empty array. Absence means "nothing met QSRSoft's threshold", never
"nothing happened". Any panel, alert, or SAGE answer that reads an empty result as a clean store is
asserting the opposite of the truth.

### Sensitivity follows directly

Everything `suspicious_activity` returns is, by construction, **QSRSoft's judgment that an event
warranted attention** — a derived judgment about named individuals under #272. Supervisor-and-above,
handling notice attached, and **store `score_id`** so the judgment stays attributable to the vendor
rather than reading as a Meridian finding.

If we ever want our own exception logic, it belongs on top of `security-events` where we can state
and defend the rule, not on top of a vendor threshold we cannot see.

 If ~2,500 events span
the window and `cash_refund` is one of ~23 categories, a single returned cash refund is still low
but less absurd than it looked against an unknown denominator. **The same-store/same-date/same-token
comparison remains the test** — it is now cheap to run with `all_events` on both endpoints.

---

The UI therefore cannot test it. Test it directly by editing the `top_contributors` body:
`{"event_token":"all_events","start_date":"…","end_date":"…"}` — cheapest possible probe, since
that endpoint is a small aggregation and we already have a known-good baseline (3 events for
`pos_overring`, store 3708, 2026-08-14) to compare against.

Also note the UI collapses the three `high_lock_out_*` variants into a single **"High Lock Out"**
entry; the sub-type is carried by the separate `lock_out_type` filter the options response returns.
So 27 API tokens map to 23 dropdown entries.

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

---

# Product Mix endpoint — captured 2026-08-14 (WASTE view; sales view still needed)

```
GET https://api.reports.myqsrsoft.com/reports/mcd/product
    ?catalogType=completedWaste          ← SWITCHABLE — the sales/mix catalog is behind this
    &nsn=3708                            ← single store; comma-list support UNTESTED
    &orgId={uuid}&enterpriseName=McDonalds
    &startDate=&endDate=&weekStart=3
    &familyGroup=BREAKFAST_DRINK,BREAKFAST_SIDE,BREAKFAST_ENTREE,REGULAR_DRINK,
                 REGULAR_ENTREE,FRIES,NON_PRODUCT,SHAKES,DESSERT
    &poo=Combined                        ← point-of-origin; "Combined" implies it SPLITS
    &timeSegment=openClose&segmentBy=summary&timeInterval=summary
    &segmentNames=open-close&segmentsSelected=open-close
    &nsd=s&dsd=s&selectCols=wasteQty     ← explicit column selection, like VOICE
```

Same host as VOICE/DAR (`api.reports.myqsrsoft.com`), so the documented Playwright in-browser auth
pattern applies. Date ranges native. `weekStart=3` (Wednesday) again. Referer is
`/reports/mcd/product/productMixDrillDown`.

`/reports/mcd/product` is a **generic product endpoint with `catalogType` selecting the view** —
not one endpoint per report. That is a better shape than expected: one client, several catalogs.

## Response — item-level, and NO ITEM NAMES

```json
{"resp":[{"menuItemNumber":5,"wasteQty":2},{"menuItemNumber":6053,"wasteQty":10}, …]}
```

27 items for one store on one day. **Keyed by `menuItemNumber` with no display name.**

**A Product Mix pull therefore needs a companion item catalog** — whatever call maps item number to
name. The UI renders names, so the lookup exists. **This is a required second capture**, and the
kind of omission that stalls a build halfway: item-level data with no way to say which item.

Design consequence: store `menuItemNumber` as the key and join names from a separately-maintained
catalog table. Never bake names into the fact rows — item numbers are stable, marketing names are
not, and #291's price work depends on tracking the *same item* across periods.

## `poo=Combined` — possibly a channel split, and that would matter

If `poo` is point-of-origin (drive-thru / front counter / delivery / kiosk), Product Mix splits by
channel. That would let a mix shift be attributed to a *channel*, not just an item — a bigger unlock
than the price question #291 was filed for, and directly relevant to the kiosk hypothesis
(POS 6–11) and to the delivery-offer asymmetry in the McValue work.

Untested. Worth one capture with `poo` set to something other than `Combined`.

## Bonus: item-level waste is finer than anything Meridian holds

`DEFAULT_TARGETS` carries waste only in aggregate (`tCompWaste`, `tRawWaste`, `tStatLoss`).
**Per-item completed waste per store per day** is a materially finer signal and feeds the food-cost
and FOB work directly. Not what #291 was filed for, but worth capturing in the same pull since it is
the same endpoint with a different `catalogType`.

## Still needed before #291 can be built

1. **Sales/mix view** — `catalogType` off waste, `selectCols` carrying quantity **and dollars**.
   That is what yields realized unit price and the whole price-detection argument.
2. **The item catalog call** — `menuItemNumber` → name.
3. **`nsn` comma-list test** — decides whether a district pull is 1 request or 27.

---

# Product Mix — the SALES view. All three gaps above are CLOSED (captured 2026-08-14)

Three further captures landed and answer 1, 2 and 3 in order. **`#291` is now buildable.**
Every number below is measured off the actual 441-row payload, not inferred.

## 1. `product-mix-bundles` — the item×price fact table

```
GET https://api.reports.myqsrsoft.com/reporting/v2/product/product-mix-bundles
    ?catalogType=productMix            ← THE value the waste capture was hiding
    &reportType=summary
    &nsn=3708&orgId={uuid}&enterpriseName=McDonalds
    &startDate=2026-08-13&endDate=2026-08-13&weekStart=3
    &familyGroup=BREAKFAST_DRINK,BREAKFAST_SIDE,BREAKFAST_ENTREE,REGULAR_DRINK,
                 REGULAR_ENTREE,FRIES,NON_PRODUCT,SHAKES,DESSERT
    &poo=Combined
    &timeSegment=openClose&segmentBy=summary&timeInterval=summary
    &segmentNames=open-close&segmentsSelected=open-close&nsd=s&dsd=s
    &selectCols=soldQty,discQty,menuItemNumber,description,familyGroup,
                bundleQty,bundleDiscAmt,price,dollarsSold,promoQty,
                totalUnitFoodCost,totalUnitPaperCost,offerAmt,unitFoodCost,unitPaperCost
```

Note this is **`/reporting/v2/product/…`**, not the `/reports/mcd/product` path the waste capture
used. Same referer page (`productMixDrillDown`); two different backends behind one screen. The
`/reporting/v2/` family is the same one `qsrsoft-ops-pull.mjs` already drives, so the existing auth,
`base()` query builder and Playwright fallback all apply unchanged.

```json
{"menuItemNumber":8932,"price":2.99,"soldQty":65,"discQty":3,
 "description":"M French Fries","familyGroup":"Fries","bundleQty":0,"bundleDiscAmt":0,
 "dollarsSold":194.35,"promoQty":28,"totalUnitFoodCost":22.555,"totalUnitPaperCost":1.8785,
 "offerAmt":86.6,"unitFoodCost":0.347,"unitPaperCost":0.0289}
```

### Grain: one row per (item, **price point**) — not per item

441 rows over **314 distinct `menuItemNumber`s** for one store on one day. **116 items appear at
more than one price.** The API has already done the price separation:

| item | price points that day |
|---|---|
| 4314 McChicken | **$1.50 ×140** · $3.69 ×5 |
| 592 McDouble | $2.59 ×113 · $3.39 ×1 |
| 334 Sausage Burrito | **$1.50 ×63** · $2.89 ×3 |
| 521 M Coke | $1.59 ×67 · $1.89 ×3 · $1.79 ×1 |
| 8932 M French Fries | $2.99 ×65 · $3.69 ×8 |

**This changes the #291 design.** The plan was to recover realized price as `dollars ÷ units`. Do
not do that — it would average $1.50 and $3.69 McChickens into a meaningless $1.57 and make a
mix shift look like a price change. **`price` is exact, per row, already.** A price *change* is a
new price value appearing in the tier set for an item; a *mix* shift is the quantity moving between
existing tiers. Those are now separable, which is strictly better than what the issue asked for.

### `dollarsSold` is gross, and Σ does NOT equal net sales

Measured on all 441 rows: `dollarsSold == price × soldQty` **exactly, 0 exceptions**. It is a
menu-price extension, carries no discount, and is therefore redundant — derivable from two columns
already present. Same for the cost pair: `totalUnitFoodCost == unitFoodCost × soldQty` exactly,
0 exceptions. **Store the primitives (`price`, `soldQty`, `unitFoodCost`, `unitPaperCost`) and
derive the extensions.** Storing both invites them to disagree.

The reconciliation against `qtr-hr-sales` for the same store/day:

```
Σ dollarsSold           10,376.61
allNetSales (qtr-hr)    10,087.69     gap +288.92  (+2.9%)
Σ offerAmt                 172.02     residual +116.90 still unexplained
Σ discQty                      264     → 116.90 / 264 = $0.44/unit, a plausible discAmt
```

**Never surface Σ `dollarsSold` as sales.** It overstates by ~3% at this store/day, and the
overstatement is exactly the promotional intensity — so it will be *largest* in the periods a
promo analysis cares about most. The residual is almost certainly a `discAmt` column we did not
select; **one capture with `discAmt` added to `selectCols` should close it**, and that is the
acceptance test for the ingest: Σ dollarsSold − Σ offerAmt − Σ discAmt == `allNetSales`.

### `promoQty` and `offerAmt` are DIFFERENT things — carry both

32 rows carry one or the other, and they do not co-occur: **15 rows have `promoQty` > 0 with
`offerAmt` = 0**, and **12 have `offerAmt` > 0 with `promoQty` = 0**. Where both appear, neither
derives the other (Hash Brown: promoQty 3 × $2.19 = $6.57, offerAmt $4.38; M Fries: 28 × $2.99 =
$83.72, offerAmt $86.60). Read them as: `promoQty` = **units given away**, `offerAmt` = **dollars of
offer applied**. A free-item program shows in `promoQty`; a dollar-off deal shows in `offerAmt`.

**This settles the outstanding FBP question directly.** M French Fries on 2026-08-13 at store 3708:
`soldQty` 65, `promoQty` **28** — 43% of medium fries given away in one day. That is the free-item
signature, visible per store per day. Pull the 2025 and 2026 series and the monthly-GMA-offer
confound stops being an assumption and becomes a measurement. That confound currently overstates
*both* FBP headline findings (it ran continuously through 2025 but only Jan–Mar 2026, so it cancels
in the pre-period and not the post-period) — this is the data that bounds it.

### `bundleQty` / `bundleDiscAmt` are zero on every row

Despite the endpoint's name. Either this store does not ring bundles, or they need a different
`reportType`. **Unverified — do not design around them** until a capture shows one non-zero.

### Volume — the one real design problem

**441 rows per store-day → ~11,900/day across 27 stores → ~4.3M rows/year.** That is an order of
magnitude past anything else in Meridian. Two measured mitigations:

- **21 rows carry `soldQty` 0** — catalog placeholders (BBQ Sauce, Surprise Toy, Kids Fry, No Sauce).
  Filter `soldQty > 0` on ingest.
- **238 rows (54%) have `soldQty` ≤ 2 and carry 11.1% of dollars.** A long-tail cutoff is available
  if needed, but it would break the price-tier history for slow items — prefer keeping them and
  partitioning, and decide only if volume actually hurts.

Roll-forward is cheap regardless: item-level daily is the atom, and every rollup Meridian wants
(weekly item mix, family-group mix, price-tier history) derives from it.

## 2. `menuitems` — the name catalog, and it takes all 27 stores in ONE call

```
GET https://api.reports.myqsrsoft.com/reporting/v2/product/menuitems
    ?nsn=3708,5183,…,43701            ← all 27 NSNs, comma-separated. WORKS.
    &orgId={uuid}&enterpriseName=McDonalds
→ {"result":[{"text":"1 - Hamburger","value":1}, …]}
```

**Answers gap 3 as well:** the `nsn` comma-list is accepted on this family, so a district pull is
per-date, not per-store — exactly the shape `qsrsoft-ops-pull.mjs` already uses.

But `product-mix-bundles` **returns `description` and `familyGroup` inline**, so the fact rows do
not need this catalog to be readable. It is still worth pulling once, because:

**Display names are many-to-one over item numbers.** Measured on the returned catalog:

```
Hamburger      -> 1, 1001, 1403, 5041, 5728
10 McNuggets   -> 5280, 8510, 25019, 25052
M French Fries -> 8932, 9891, 9899
6 McNuggets    -> 60, 1060, 25051
Cheeseburger   -> 3, 1003, 1407
```

So **never group by name.** Grouping "Hamburger" collapses five distinct POS items — likely
à-la-carte vs bundle-component vs meal-deal variants — and a price series built that way would
show phantom moves as volume rotates between them. Key on `menuItemNumber`, join names for display,
and treat the name as a label that can change while the number does not.

## 3. `qtr-hr-sales` at `segmentBy=summary` — the denominator

```
GET …/reporting/v2/sales/qtr-hr-sales?catalogType=sales&timeSegment=openClose
    &segmentBy=summary&segmentNames=open-close&segmentsSelected=open-close
    &…&selectCols=transactions,allNetSales,nonProdAmt,nonProdTax
→ {"result":[{"numberOfStores":1,"numberOfDays":1,"storeNumDate":1,"qualifiedDay":1,
              "transactions":1018,"allNetSales":10087.69,"nonProdAmt":82.39,"nonProdTax":0}]}
```

Same endpoint `qsrsoft-ops-pull.mjs` already calls with `timeSegment=peaks`; at `summary` it returns
one whole-day row. Useful for two things: the reconciliation above, and **average check** —
`10,087.69 / 1,018 = $9.909` ($9.828 ex non-product).

That average check is the denominator the McValue check-gain claim needed: **+10.4¢ on a $9.91
check is 1.05%**, so the ~1% figure in the FBP work holds against a measured base rather than a
remembered one.

Also note `numberOfStores` / `numberOfDays` / `qualifiedDay` come back inline — a built-in
completeness check for any multi-store, multi-day pull, free with every request.

## What is still unknown

1. **`discAmt`** — one capture, closes the reconciliation identity above.
2. **`poo`** — still only ever seen as `Combined`. If it is point-of-origin, product mix splits by
   channel, and that is a bigger unlock than the price question (kiosk hypothesis, delivery-offer
   asymmetry). One capture with any other value settles it.
3. **`bundleQty`** — never non-zero yet.
4. **Retention depth.** Per the standing rule, `min(dt)` is a pull artifact, not a floor — but the
   depth this endpoint actually serves is untested. Probe one week of April 2025 before scoping any
   backfill, the same way #257/#259 did.

---

# Product Mix — the UI's own filter surface + the real Excel export (2026-08-15)

Owner sent DevTools-free evidence this time: screenshots of the Product Mix report's controls, and
**two real exports of the same day** (2026-08-14) — one with QSRSoft's default columns, one with
"all available metrics" selected. Both measured, not eyeballed.

## The filter surface — what the endpoint's params actually mean

| control | values | maps to |
|---|---|---|
| **Point of Order** | Combined · **Delivery** · **Non-Delivery** | `poo` |
| Time Segment | Day · Dayparts · Peaks | `timeSegment` |
| View Segment | By Total · **By Hour** · **By Quarter Hour** | `timeInterval` |
| Family Groups | All + the 9 groups | `familyGroup` |
| item scope | Menu Items · **Watch Lists** | — |
| tabs | PMIX · **PMIX LIVE** · **MGR/EMP MEALS** | — |
| column sets | DEFAULT · PMIX · MARGIN · QCR | `selectCols` |

### ⚠️ CORRECTION — `poo` is NOT a channel split

The waste-capture note in this file speculated that `poo` might be point-of-origin
(drive-thru / front counter / delivery / kiosk) and called that "a bigger unlock than the price
question", relevant to the kiosk hypothesis. **It is not.** The dropdown has exactly three values:
Combined, Delivery, Non-Delivery. It is a delivery flag, nothing more.

Product Mix therefore **cannot** attribute a mix shift to drive-thru vs front counter vs kiosk.
The kiosk hypothesis (POS 6–11) still needs the security/register surface, not this one. Delivery
vs non-delivery *is* useful — it bears directly on the delivery-offer asymmetry in the McValue work
— but the broader channel question is closed here, negatively.

### Two capabilities worth knowing exist

- **By Quarter Hour** on item-level data. Enormous volume, but it means item mix by daypart is a
  parameter change, not a new integration.
- **Watch Lists** — QSRSoft maintains curated item groupings: `5-6-7 Meal Deals`, `All Bagels`,
  `Beverage 2026: All`, `Beverage 2026: Coffee LTOs`, `Beverage 2026: Energizers`, `Beverage Cell`,
  `Big Arch Burger`, `BOAO 2026`. That is a **ready-made taxonomy for the many-to-one item-name
  problem** — better than inventing our own groupings, and it tracks national marketing constructs
  we'd otherwise have to reverse-engineer.
- **MGR/EMP MEALS** is its own tab — the same data FOB's "Emp / Mgr Meals" component needs, which
  is manual today.

### A caveat QSRSoft states in its own UI, which must be encoded

> Wrap Combo Units Sold are based off the menu item, therefore the 2 wrap menu items will need to
> be multiplied by 2 to get total single units sold.

Any unit count over wrap items is **half** the true figure unless doubled. Not discoverable from
the data — only from this banner.

## The Excel export is HIERARCHICAL — and this breaks the existing parser

Structure of `Product_Mix_20260814.xlsx`, sheet `Product Mix 2026-08-14`, 4,539 data rows over
**535 distinct `Menu Item #`s**:

```
Menu Item #  Desc         Price            Units Sold
1            Hamburger    $1.79 - $2.59    385      ← per-item SUBTOTAL (price is a RANGE)
1            Hamburger    $1.89            134      ← price-point detail
1            Hamburger    $1.99            130
1            Hamburger    $1.79             47
1            Hamburger    $2.49             31
1            Hamburger    $2.39             28
1            Hamburger    $2.59             11
1            Hamburger    $2.29              2
1            Hamburger    $2.32              2
                                           ---
                          detail sum       385      ← equals the subtotal exactly
```

Measured: for **534 of 535 items** the first row's units equal the sum of the remaining rows. The
one exception is not an exception — it is the sheet's **grand-total row** (units 103,923,
`Desc` empty, a nonsense `$24.89` in Price), which lands inside the last item's group.

Consequences, all measured on the real file:

| naive Σ over every row | true value | inflation |
|---|---|---|
| Units Sold **311,769** | 103,923 | **×3.00** |
| Units Wasted **13,911** | 1,205 | **×11.54** |

Units Sold triples because every unit is counted at the detail level, again at the item subtotal,
and again in the grand total. Units Wasted inflates ×11.5 because **waste is an item-level figure
repeated verbatim on every price-tier row** (Hamburger shows `6` on all nine of its rows), not
allocated across them.

### `parsePMixData` does exactly the naive thing

`src/parsers/index.js:1209` keeps every row where `r[C.item] != null` and accumulates into
`byFamily`. It has no notion of subtotal rows, detail rows, or a grand total. **The Product Mix
panel's family totals are therefore roughly 3× reality, and its waste figures ~11× reality.**
Filed as its own issue.

Detecting the subtotal row: `Price` containing `' - '` catches 455 of them, but **80 items have no
ranged row at all** (single price point, e.g. 167 Chicken Pack, 219 M Fruit Punch), so a
range-only heuristic silently reclassifies those. Group by `Menu Item #` and take the first row —
and drop the grand-total row explicitly, by empty `Desc`.

## The column set is USER-SELECTABLE — and the parser's mapping silently degrades

The two exports of the *same day* have different columns:

| column | default export | "all metrics" export | `parsePMixData` looks for |
|---|---|---|---|
| `Units Sold` | ✅ | ✅ | ✅ `Units Sold`/`Units` |
| `Disc Qty` | ❌ | ✅ | ✅ `Disc Qty`/`Discount Qty` |
| `Offer Discount $` | ❌ | ✅ | ✅ `Offer Discount $` |
| `Family Group` | ❌ | ✅ | ✅ `Family Group`/`Category` |
| `$ Sold` / `Adj PMIX Sales` | ✅ | ✅ | ❌ **not mapped at all** |
| `Units Promo` / `Promo $` | ✅ | ✅ | ❌ |
| `Units Served` / `Units Wasted` / `Units Used` | ✅ | ✅ | ❌ |
| cost + margin columns | MARGIN/QCR tabs | ✅ | ❌ |

The mapping is **correct but unvalidated**. On a default export `Family Group` is absent, so every
row falls to `fam = 'Other'` and the panel's entire by-family breakdown collapses into one bucket —
silently, with no warning. Same for `disc`/`discAmt`, which become 0 rather than null.

**Two different dollar columns, and they differ.** Hamburger: `$ Sold` **777.91** vs
`Adj PMIX Sales` **762.15** (`Promo $` 9.65). Pick deliberately and document which; do not let
"dollars" mean whichever column happened to be present.

Full column list on the all-metrics export (32):
`Menu Item #, Units Sold, Disc Qty, Offer Discount $, Desc, Family Group, Bundle Units,
Bundle Discount $, Price, $ Sold, Units Promo, Units Wasted, Units Used, F&P % of Total Sales,
Units / 1K GC, Units / $1K Sales, % Total (Product Sales), % Total (Net Sales), Adj PMIX Sales,
Promo $, Units Served, Margin %, Total Margin $, Total F&P Cost, Unit F&P Cost, Avg F&P Cost %,
Unit Food Cost, Total Food Cost, Avg Food Cost %, Unit Paper Cost, Total Paper Cost,
Avg Paper Cost %`

Sheets `PMIX` / `Margin` / `QCR` are the same 4,540 rows re-cut with different columns, and they
put `Menu Item #` **only on the subtotal row** (null on details) — the opposite of sheet 1. A
parser keyed on "item# present" would read only subtotals there and only-triple-count on sheet 1.

## Why this settles the API-vs-manual question

The API returns **one flat row per (item, price point)** with no subtotals, no grand total, no
repeated waste, and an explicit `familyGroup` on every row. The Excel export requires hierarchy
detection, a grand-total exclusion, a user-dependent column check, and a wrap-combo doubling rule.

Per the auto-first standing rule the API was always going to win. This quantifies by how much:
**the manual path has four distinct ways to be silently wrong, and three of them are currently
live in the shipped panel.**

---

# ⭐ `user/settings` — a field dictionary for EVERY report in the suite (2026-08-15)

```
GET/POST https://api.sso.myqsrsoft.com/user/settings
    ?appName=reports&userId={uuid}&settingName={report}%2FdefaultColumns
```

The response returns **every** stored `*/defaultColumns` key for the user, not just the one
requested — a DynamoDB item dump. One call enumerates the canonical API field names for 13 reports.
This is the single most useful capture in this file: it removes guessing from every future pull.

**Do not re-derive field names from Excel headers again.** The Excel export renders
`priceRange` as "Price" and `adjPmixSales` as "Adj PMIX Sales"; this endpoint gives the names
`selectCols` actually wants.

## The 13 reports it enumerates

| settings key | what it unlocks |
|---|---|
| `productMixDrillDown` | 31 PMIX fields — see below |
| `dailyActivity` | 63 fields: OEPE/OEPENoPark/CTP/R2P/dtTTL, MFY1+MFY2, KVS, bev, **labor** (`totalScheduledHours`, `actualPunchedHours`, `actualHoursMinusNeeded`, `transPerPunchedHour`, `punchedLaborPct`), projections, `totalSalesMean` |
| `dailyGlimpse` | everything with an `_mtd` twin, a full Controls group, a Service group, and **`dtCars_7am-9am` / `11am-2pm` / `5pm-7pm`** |
| `operationsReport/salesLedger` | every channel group (DT/Delivery/EatIn/Kiosk/InStore/FC/MOP/Takeout/Breakfast) each with sales, trans, avgCheck **and an LY twin** |
| `operationsReport/controls` | **`overTimeHours`, `overTimeDollar`, `avgRate`, `actualVsNeeded`**, punched/crew labor, T-Reds, refunds, discounts, deposits |
| `operationsReport/fobOps` | `baseFoodPct`, `foodOverBasePct`, `compWastePct`, `rawWastePct`, `condimentPct`, `empMealDscPct`, `statVariancePct`, `unexplainedPct`, `discCouponPct`, `pnlFoodCostPct` — a 1:1 match for Meridian's `FOB_COMP` |
| `analysisSummary` | **`avgWage`, `totalPay`, `crewTimeWorked`, `salariedTimeWorked`, `projectedHours`, `hourOverUnder`, and per-position `overUnderFloor/Window/DriveThru/Grill/FryHash/Other`** |
| `threePeaksSales` | per-channel sales/trans/avgCheck/comp% at the three peaks |
| `threePeaksService` | DT timing decomposed: `dtOrderTime`, `dtLineTime`, `dtWin1Time`, `dtWin2Time`, `dtParkedCarTime`, `dtPctPullForward` |
| `mobileReport` | `mobileOrderAheadTransPct` split by **DriveThru / Curbside / FrontCounter / Table**, `scannedOfferSalesPct`, `loyaltySelfIDEarnSalesPct` |
| `mcDelivery3POReport` | `vendor`, `3POTrans`, `avgDeliveryTime`, `avgRestaurantTime`, `avgTotalTime`, **`avgCSat`** |
| `storePeoplePunches` | punch-level detail — ⚠️ **includes `ssn`**, see the PII note below |
| `dashboardRoleBaseSwitch` | a UI toggle, not data |

## The full PMIX `selectCols` vocabulary — 31 fields, no guessing left

```
soldQty  discQty  offerAmt  description  familyGroup  bundleQty  bundleDiscAmt
priceRange  dollarsSold  promoQty  unitsWaste  unitsUsed  unitsServed
foodAndPaperCostSalesPct  unitPerGrandTrans  unitPerGrandSales
pctNetProduct  pctNet  adjPmixSales  promoAmt
marginPct  totalMarginAmt
totalFoodAndPaperCost  unitFoodAndPaperCost  avgFoodAndPaperCostPct
unitFoodCost  totalFoodCost  avgFoodCostPct
unitPaperCost  totalPaperCost  avgPaperCostPct
```

### ✅ RESOLVED — there is no `discAmt`, and the reconciliation identity is different

This file previously asked the owner for "one capture with `discAmt` added to `selectCols`" as the
way to close `Σ dollarsSold − Σ offerAmt − Σ discAmt == allNetSales`. **Withdraw that request —
`discAmt` does not exist.** The discount-dollar fields are `offerAmt`, `promoAmt` and
`bundleDiscAmt`.

The real identity, verified on the export's own numbers at two levels:

```
Hamburger subtotal:  $ Sold 777.91  −  Offer Discount $ 15.76  =  Adj PMIX Sales 762.15  ✓
Hamburger @ $1.89:   $ Sold 253.26  −  Offer Discount $  5.67  =  Adj PMIX Sales 247.59  ✓

    adjPmixSales = dollarsSold − offerAmt
```

So **`adjPmixSales` is the already-netted dollar column** — select it and the subtraction is done
server-side. `discQty` is a *count* with no matching dollar field of its own; its value is carried
inside `offerAmt`.

That leaves a smaller residual against the `qtr-hr-sales` `allNetSales` than previously estimated
($116.90 on the captured store-day, ~1.2%), and the likely cause is now a definitional one rather
than a missing column: PMIX covers **product** sales while `allNetSales` does not.
`pctNetProduct` and `pctNet` being two separate fields is the tell. Select both and the
denominator question answers itself — no new capture from the owner required.

## Fields that close gaps already open elsewhere in Meridian

- **Labor Analytics shows `OT HRS / DAY` as "—" and `OT COST (PERIOD)` as `$0` across 27 stores.**
  `operationsReport/controls` carries `overTimeHours`, `overTimeDollar` **and `avgRate`** — the
  three inputs `otCostEst` needs. Same report carries `actualVsNeeded`, which is the panel's
  `ACT VS NEED +0 hrs`.
- **Per-position over/under** (`overUnderFloor/Window/DriveThru/Grill/FryHash/Other` in
  `analysisSummary`) is finer than anything Meridian holds and speaks directly to the scheduling
  work — where a store is over or under, not just by how much.
- **3PO `avgCSat` per vendor** is a customer-satisfaction signal completely absent today; SMG VOICE
  does not cover delivery platforms.
- **`dtCars_*` peak car counts** would give the Speed of Service panel a volume denominator.
- **MOP split by Curbside/Table/FC/DT** bears on the kiosk/channel question that Product Mix's
  `poo` turned out *not* to answer.

## ⚠️ PII — `storePeoplePunches` exposes `ssn`

Its default column list is `geid, dayOfWeek, badgeType, punchType, isPaidBreak, timeCardNumber,
hoursWorkedDecimal, hoursWorked, fullEmployeeName, firstName, lastName, **ssn**, jobTitleCode,
startTime, endTime, payrollID, inModified, outModified`.

If a punch-level pull is ever built: **never include `ssn` in `selectCols`, never let it reach
Supabase, and never let it into a log line.** This repo already has a standing instruction to
delete roster workbooks because they carry SSNs, DOBs and addresses. `geid` + `payrollID` identify
a person adequately for every analysis Meridian does.

---

# `nsd` / `dsd` are the store and date GRAIN switches — captured 2026-08-15

Three captures on the product family, read side by side, resolve the single question that was
holding up **#292**: *what field identifies the store in a multi-store Product Mix response?*

The answer is that the question was mis-framed. **There is no store field to find, because
`nsd=s&dsd=s` told the API to roll the stores and the dates away.**

| capture | `nsd` | `dsd` | NSNs in call | store field returned | date field returned |
|---|---|---|---|---|---|
| `product-mix-bundles` (#293, 1 store 1 day) | `s` | `s` | 1 | **none** | **none** |
| `product-mix-bundles` (owner capture, below) | `s` | `s` | many | **none** | **none** |
| `menuPriceComparison` | `d` | — | 3 | **`nsn`** ✅ | — (single day) |
| `product/outages` | `d` | `d` | **27** | **`storeNum`** ✅ | **`date`** ✅ |

Reading `s` = *summary* and `d` = *detail*, `nsd` controls the **store** dimension and `dsd` the
**date** dimension. Every capture in this file is consistent with that, and nothing contradicts it.

⚠️ **This is a hypothesis with a named test, not a measured fact.** The test is one capture:
re-run the `product-mix-bundles` call **changing only `nsd=s&dsd=s` → `nsd=d&dsd=d`**. If row count
expands to roughly *(stores × days × items×price)* and rows carry `storeNum` and `date`, it is
confirmed. Until then do not build on it.

**Why it matters more than it looks:** if confirmed, #292's district pull is **one request per day,
not 27**, and `mapRow()` reads a real field instead of guessing. If it is wrong, #292 must pull one
NSN per request and stamp `loc` and `dt` from the request parameters — never from the response.

### The response carries key columns that `selectCols` never asked for

The outage call requested `selectCols=description,familyGroup,outageTimestamp,restoredTimestamp`
and every row came back with `menuItemNumber`, `storeNum` **and** `date` as well. So `selectCols`
adds *measure* columns; the API supplies the **grain** columns on its own once `nsd`/`dsd` ask for
that grain. A missing store column is therefore evidence about grain, not about `selectCols`.

### The store field is named differently per endpoint

`nsn` on `/reports/mcd/product/menuPriceComparison`, `storeNum` on `/reporting/v2/product/outages`
and on the VOICE family (line ~373). Both are **unpadded integers** — the same zero-padding trap
recorded twice already. `mapRow()`'s existing `r.storeNum ?? r.nsn` accepts both, which is correct;
what it cannot do is invent one that was never returned.

---

# The owner's Product Mix capture is a MULTI-STORE ROLL-UP — measured, not assumed

The 2,485-row `{"result":[…]}` payload sent 2026-08-15 has **no `storeNum` and no `date`**. That it
mixes stores was proven by cross-matching it against the three store price books from
`menuPriceComparison`, not by inference:

- Dollar share sitting at a price that matches **store 3708's list price**: **23.9%**.
  Widen to the **union of all three** books and it rises to **39.2%** — a 64% relative jump from
  adding two stores. A single store's payload cannot behave that way.
- Dollars matching **exactly one** store's book, so attributable: **3708 $12,586 · 5183 $9,089 ·
  5985 $5,041**. All three stores are present simultaneously and in volume.
- **Big Mac (item 5)** appears at **12 distinct price points** (4.89 … 6.99) while the three sampled
  stores list only 4.99 / 5.09 / 5.39 — the rest belong to the other ~24 stores.
- Density: **2,485 rows / 497 items = 5.0 price points per item**, against **441 / 314 = 1.4** for
  the known single-store single-day capture.

Total product dollars in the payload: **$113,554** (excluding `Non-product`).

**Consequence for #291/#292:** this payload cannot be persisted as-is at any primary key, because
the rows it would key on do not identify a store. `(loc, date, item, price)` — already correct on
the branch — is the right PK; it just needs a response that actually carries `loc` and `date`.

---

# `menuPriceComparison` — the per-store LIST PRICE BOOK (captured 2026-08-15)

```
GET https://api.reports.myqsrsoft.com/reports/mcd/product/menuPriceComparison
    ?nsd=d                                   ← per-store detail; this is what yields `nsn`
    &nsn=3708,5183,5985                      ← comma list WORKS on this endpoint too
    &orgId={uuid}&enterpriseName=McDonalds
    &startDate=2026-08-14&endDate=2026-08-14&weekStart=3
Referer: https://v3.myqsrsoft.com/reports/mcd/product/menuPriceComparison
```
UI name: **"RFM Price Comparison"**.

```json
{"resp":[{"nsn":3708,"menuItemNumber":5,"price":5.09,"priceEatin":5.09,"priceTakeout":5.09,
          "priceDelivery":5.99,"deliveryPremium":0.1768,"description":"Big Mac",
          "familyGroup":"Regular Entree","product":"5 - Big Mac"}]}
```

**Grain: one row per `(nsn, menuItemNumber)` — 0 duplicates in 1,966 rows** across 3 stores
(679 / 626 / 661 items). Clean, unambiguous primary key. This is the *cleanest* grain of any
product endpoint captured so far.

## ⚠️ It is a price book, NOT a sales feed — it is not a shortcut for #291

It carries **no `soldQty`, no `dollarsSold`, no cost fields**. It cannot answer anything #291 was
filed for on its own. It is **complementary** to Product Mix, not a replacement:

| | `menuPriceComparison` | `product-mix-bundles` |
|---|---|---|
| price meaning | **list** price (menu board) | **realized** price (what rang) |
| per store | ✅ `nsn` | only at `nsd=d` (untested) |
| volume / dollars | ❌ none | ✅ |
| food & paper cost | ❌ none | ✅ |
| delivery price | ✅ | ❌ |

**Together they measure discount depth**, which neither does alone: `realized − list`, per item, per
store. Measured against store 3708's book, only **23.9% of product dollars** rang at that store's
list price — and most of the remainder is *other stores'* list prices (§ above), not discounting.
Do not read the gap as discount depth until the roll-up is fixed.

## `priceEatin` / `priceTakeout` — identical TODAY, but do not delete the columns

**1,966 of 1,966 rows** have `price == priceEatin == priceTakeout`, and `priceEatin != priceTakeout`
on **zero** rows. So there are **two** live channels in this data, not three: in-store and delivery.

⚠️ **This is a property of Florida and Oklahoma, not of the API** (owner, 2026-08-15):

> *"correct for FL and OK — the option exists in the POS due to some states having different taxes
> for eat in vs take out … won't affect us now, but any even marginally thin potential roll-out and
> adoption of this app should keep the door open on that one for flexibility down the road."*

**Standing instruction: persist all three columns even though two are currently redundant, and
carry this comment forward.** The split is a real POS capability that exists because some states tax
prepared food differently for eat-in versus take-out. Collapsing the schema to `price` +
`priceDelivery` would look like a tidy simplification today and would silently break the first
multi-tenant deployment into such a state — and the collapse would be invisible, because the two
columns would keep agreeing right up until they didn't. Storage is three floats per item per store.

The **derived** eat-in/take-out comparison may be suppressed in the UI while the two agree; the
**stored** columns must not be. This is the "never break working features" rule applied forward to a
feature that does not exist yet.

## `deliveryPremium` — formula confirmed, with two divide-by-zero behaviours

`deliveryPremium == priceDelivery / price − 1` holds on **1,646 / 1,646** rows where `price > 0`.
Where `price == 0` the API returns **`0`** if `priceDelivery` is also 0 (295 rows) and **`null`** if
`priceDelivery > 0` (25 rows). It is a derived column — recompute it rather than trusting it, or
store it and guard both cases.

**Sanitation, mandatory before any aggregate:**
- exclude `familyGroup === 'Non-product'` (94 rows) — `$0.01` placeholder fee items yield premiums
  of **349×** (Small Order Fee) and **298×** (Delivery Fee) and will destroy any mean;
- guard `price <= 0` (320 rows) — condiments and legacy SKUs.

On the 1,579 clean product rows: **p10 +6.7% · median +20.5% · p90 +39.3% · max +146%**.

## Two findings that are already actionable from one day of capture

1. **114 rows (7.2% of clean product rows) carry a delivery premium of exactly ZERO** — sold on
   a 3PO platform at the in-store price while the platform commission comes out of the same margin.
2. **9 rows are NEGATIVE** — delivery priced *below* in-store. One is systematic rather than a
   fat finger: **item 3655 `Sau Egg McMuff Ml-Hb` is negative at all three sampled stores**
   (−11.1% / −7.9% / −10.5%). Also `594 McDouble Ml-Lrg` (−2.0%), `7526 Egg Biscuit Ml` at two
   stores, `1231 20 McNug/2MFry Meal`, `4941`, and `25726 Bacn Caesr McCrispy` (−15.4%).

Both are **list-price configuration facts**, independent of volume, so they are true findings from
this endpoint alone and do not wait on #292. They are the first concrete Pricing-Engine output.

## Why this endpoint is worth pulling on its own schedule

`startDate`/`endDate` are native, so **price history is backfillable** — and a dated price book is
the only way to establish *when* a price action took effect. That is the missing half of the owner's
standing note that *"WE DID NOT PARTICIPATE IN THE WHOLE PRICE CHANGE STRATEGY"*: the book can
confirm or refute it per store per item, rather than from memory. A price book changes rarely, so a
daily pull is cheap and mostly no-ops.

---

# Product Outage — captured 2026-08-15, 27 stores × 14 days in ONE request

```
GET https://api.reports.myqsrsoft.com/reporting/v2/product/outages
    ?catalogType=outages&reportType=currentOutages
    &nsd=d&dsd=d                             ← per-store AND per-day detail
    &nsn=3708,5183,…,43701                   ← ALL 27 NSNs, one call
    &orgId={uuid}&enterpriseName=McDonalds
    &startDate=2026-08-01&endDate=2026-08-14&weekStart=3
    &familyGroup=BREAKFAST_DRINK,…,DESSERT
    &selectCols=description,familyGroup,outageTimestamp,restoredTimestamp
Referer: https://v3.myqsrsoft.com/reports/mcd/product/productOutage
```

```json
{"result":[{"menuItemNumber":13,"description":"Fried Apple Pie","storeNum":3708,
            "date":"2026-08-14","outageTimestamp":"2026-08-14 22:48:05",
            "familyGroup":"Dessert"}]}
```

**A full district, a full fortnight, one HTTP call.** This is the cheapest pull in the catalog and
the strongest confirmation of the comma-list pattern.

## ⚠️ `restoredTimestamp` came back on 0 of 142 rows — duration is NOT available here

It was in `selectCols` and it is absent from every row, because `reportType=currentOutages` returns
outages that are **still open**. So this capture cannot answer *how long was it out*, only *that it
went out*. **A second capture with a different `reportType` is required** before any duration,
minutes-lost or restore-SLA metric is designed — do not build one against this shape and assume the
field will appear. `reportType` values are otherwise undocumented; `productOutage`'s UI is the place
to read them off.

## What 142 rows over 12 days actually say

- **24 of the 27 stores** logged at least one outage in 14 days. Three were clean.
- **42 distinct `(storeNum, outageTimestamp)` events** produced those 142 item rows. **26 events
  flagged more than one item.**
- Family split: Regular Drink 72 · Misc/Shakes 36 · Dessert 19 · Breakfast Entree 13 ·
  Regular Entree 2.
- Most-flagged items: Big Mac Sauce Cup ×7 · Mighty Hot Sauce ×6 · Fried Apple Pie ×5 ·
  2 Fried Apple Pie ×5 · Hny Brwn Bttr Bcn Eg ×5.

## ⚠️ Never rank stores by ROW COUNT — the row is a SKU, the incident is the event

The largest single events are **12 rows at 38609** (every Caramel-Apple-Pie beverage SKU at once)
and **10 rows at 33109** (every XS drink size at once). One thing ran out; the POS flagged a dozen
menu numbers. Store 35242 tops the row count at **30 rows — from 4 events**; 33109 has 16 rows,
also from 4 events. **Ranking by row count ranks how finely a store's menu is subdivided.**

This is the same un-normalised-count trap already recorded in this file for
`security/top_contributors`, arriving from a second direction. Collapse to the event
(`storeNum` + `outageTimestamp`) before counting, and normalise by that store's own trading days.

Size SKUs inflate the family split the same way: Regular Drink is 51% of rows largely because S/M/L
of one drink are three rows.

## Primary key — do NOT repeat #292's mistake

`(storeNum, date, menuItemNumber)` has **0 duplicates on these 142 rows**, and that is exactly how
`(loc, date, item)` looked before it was measured on Product Mix and found to drop **29% of rows**.
An item can go out, be restored, and go out again the same day. Key on
**`(loc, dt, item, outage_ts)`** and let the sample be wrong rather than the schema.

`date` is redundant with `outageTimestamp` — identical on 142/142 rows — but keep it as the
partition column.

## ⚠️ An "outage" is a MANAGER'S POS ACTION, not a measured out-of-stock

This is the single most important thing to know before building anything on this feed, and it is not
inferable from the payload. Owner, 2026-08-15:

> *"it is tied to the POS in each location. When a manager puts a product on outage due to lack of
> physical product available. Should never be many on there."*

> *"there are lots of factors besides actually being out of product that can affect this. Equipment
> being down (ABS or beverage dispenser for example could cause all XS size drinks in some cases),
> cleaning (routine) of shake and sundae machine, and many more."*

So every row is **a human marking an item unavailable in the POS**, for any reason. The measured
data agrees: the largest events are whole equipment-shaped families going down together — 12
Caramel-Apple-Pie beverage SKUs at 38609, 10 XS drink sizes at 33109, 3 Chocolate Shake sizes at
29760, 6 Smoothie SKUs then 7 Frappe SKUs at 35242 an hour apart. Those read as one beverage
dispenser and one shake machine, not as running out of twelve products.

**Three consequences, all binding:**

1. **Never label this "out of stock" in the UI.** It is *item unavailable*. A supply reading is one
   hypothesis among several and the data cannot distinguish them.
2. **Do not route it to ordering or FOB as a supply signal** without a cause dimension. An earlier
   draft of this section said *"a repeated outage on one item is an ordering failure with a name"* —
   **that is wrong and is retracted.** A nightly shake-machine clean would present identically.
3. **Equipment and routine-cleaning outages are the interesting finding, not noise to strip.**
   Recurring same-time, same-family events are an equipment-reliability and a
   procedure-timing signal — the shake/sundae clean showing up in trading hours is a real
   operational question. Cluster by `(store, family, time-of-day)` before drawing any conclusion.

**"Should never be many on there"** is also a usable expectation: a store carrying a long or a
long-lived outage list is itself the exception worth surfacing.

### ✅ The KB was read (2026-08-15). It confirms the above and closes the reason-code question.

Queried `qsrsoft_kb` (208 articles) directly from the sandbox with the anon key. Three articles
mention outages; the operative definitions:

> **"The Product Outage insight shows information about Menu Items that are not being sold. This is
> often because a machine is not working or needs to be cleaned. For Menu Items to appear on this
> list, a Manager must perform the POS function called Product Outage."**
> — *Insights - Did You Know? - Dashboard Details*

> **"The Reported Product Outage report shows items that have been marked deactivated on the POS at
> the restaurant."**
> — *QSRSoft Reports - Overview Of Reports*

So the vendor's own definition leads with **machine down or needing cleaning**, and mentions supply
nowhere. The owner's read was exactly right and this is now sourced rather than inferred.

**❌ There is no reason code.** No article describes a cause, category or reason field on the record,
and none appears in the response. **Cause must be inferred from clustering, and every downstream
metric inherits that caveat permanently** — this is not a gap a better `selectCols` closes.

Two things the KB turned up that were not being looked for:

- **"DATE: Choose from Last 30 Days OR Trailing 365 Days."** A year of history is available on the
  vendor's own surface, so this stream is **backfillable to at least 365 days** — consistent with
  the standing "data depth is never the limiter" rule. Do not build it as forward-only.
- **Watch lists exist** — "select from a dropdown of all watch lists, up to 4 maximum." A store or
  org can define named menu-item watch lists. Possibly a filter parameter worth probing, and
  possibly a place the organisation has already encoded which items matter.

One phrasing worth carrying: the near-real-time Insights version *"identifies down equipment,
inventory outages, preparation opportunities and end-of-promotional events."* Those are four
distinct operational causes the vendor knows are mixed into this one feed — which is precisely why
a single "out of stock" label would be wrong.

## Why it is still worth building: it makes lost sales measurable

Outages join to Product Mix on `(store, date, menuItemNumber)`. That turns *"Fried Apple Pie was
flagged unavailable at five stores"* into *"…and here is what each of those stores normally sells in
that window."* No current Meridian panel can express an unavailable item at all, and it is a
plausible partial explanation for both unexplained sales softness and for VOICE accuracy complaints
— **whatever the cause**, the guest could not buy it. Lost sales is the one metric that is valid
without knowing why the item was off, which makes it the right first build.
