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
