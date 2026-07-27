---
name: qsrsoft-report-catalog
description: Living catalog of every report available in QSRSoft (to be populated from owner screenshots), tagged by whether Meridian already pulls it / partially / not yet, with a candidate use for each. Doubles as a STANDING evaluation habit — consult this note whenever we open/enhance a panel to ask "is there a QSRSoft report that would enrich this?"
metadata:
  node_type: memory
  type: project
---

# QSRSoft Report Catalog → Meridian insight backlog (framework, 2026-07-27)

**Purpose (owner-requested):** the QSRSoft report library is a map of every data stream
QSRSoft exposes. Cataloging the report *names + categories (+ columns/params where easy)*
lets us spot: (a) streams we don't pull yet → automation candidates, (b) columns we're
missing inside streams we do pull, (c) untapped correlations for Signals/Scanner, (d) new
panel ideas. Names give *hypotheses*; names + columns give near-certainty.

## Preferred capture method (better than screenshots)
Mirror the forms flow: instead of screenshotting each report, grab the **one network
request** that lists the report catalog (DevTools → Network, open the Reports / Report
Builder section → the reports-list/menu API call, likely on `api.reports.myqsrsoft.com`
or `v3.myqsrsoft.com`) and paste that JSON. It's complete, structured (names/categories/
ids/params), and re-pullable — and it directly sets up automation (any report we want
becomes a pull via the same pattern as `scripts/qsrsoft-forms-pull.mjs`). **Complement**
with a few screenshots of the reports whose *columns/output* matter (the list gives the
menu; per-report column detail needs the report's own metadata, like forms-list vs
forms-questions). Agent can't hit the API from here (egress blocked) → owner grabs it.

## STANDING HABIT (do not forget)
When we open, build, or enhance **any panel**, consult this catalog first and ask:
"Is there a QSRSoft report that would feed or enrich this area?" Cross off / link reports
to panels as we go, so the value compounds instead of being a one-time dump.
→ Re-surface this note when diving into a new panel/area.

## Status legend
- ✅ **pulled** — already automated into Supabase (name the table).
- 🟡 **partial** — some of it lands (or manual-only / missing columns).
- ⬜ **untapped** — not in Meridian yet → candidate pull/panel.

## What we already pull (baseline, for cross-referencing)
- **DAR / Daily Activity** → `qsr_daily_activity` (sales, DT, service timing, proj_*, mean_*).
- **eBOS Purchases** → `qsr_ebos_daily`. **FOB / food cost** → `qsr_fob`.
- **On-Hand inventory** → `qsr_onhand` (EOM count progress). **Variance Stat / Waste /
  Transfers / Raw-item detail** → `qsr_variance*` / `qsr_waste` / `qsr_transfers` / raw detail.
- **Emailed reports** → `sales_ledger_daily` / `daily_glimpse_daily` / `cash_sheet_daily`
  (channel mix, 3PO, OEPE, KVS, controls).
- **LifeLenz** (labor/scheduling) → `lifelenz_*`. **SMG VOICE** (CSAT) → `smg_*`.
- **Forms library** (Pre-Shift/Travel Path templates) → `public/forms/*` (this session).

## BEST catalog request: "Report Finder"
The Reports nav has a top **Report Finder** — a search over the whole report catalog.
Grab its Network request (Fetch/XHR, likely `api.reports.myqsrsoft.com`, path with
`report`/`finder`/`catalog`/`list`/`definitions`) → the full report list in one JSON
(names/categories/ids/params). Fallback: the Reports menu/config load (the nav tree of
all categories + children appears preloaded — expanding "Cash" showed 12 instantly).

## Catalog (from screenshots 2026-07-27; still need Payroll/Sales/Service/Shift/C&I children)
Reports categories (left-nav): **Business Unit, Cash, Food, Labor, Digital, Product,
People, Payroll, Sales, Service, Shift** (+ top-level **C&I**). Children below captured for
Business Unit, Cash, Food, Labor, Digital, Product, People. Remaining categories TBD.

| Category | Report name | Status | Maps to / candidate Meridian use |
|---|---|---|---|
| Business Unit | BU Consolidated Sales | 🟡 | district rollups (have via DAR/ledger) — confirm cols |
| Business Unit | Voice Rankings | 🟡 | SMG VOICE ranks — have smg_*; confirm ranking parity |
| Cash | Cash Sheet | ✅ | `cash_sheet_daily` (emailed pull) |
| Cash | Cash Statistics | 🟡 | cash trends — confirm columns vs cash_sheet |
| Cash | Deposits | ⬜ | deposit reconciliation / cash-handling loss-prevention |
| Cash | Tax Details | ⬜ | tax breakdown — possible finance panel |
| Cash | Tax Exempt | ⬜ | tax-exempt tracking (fraud/audit angle) |
| Cash | Other Receipts | ⬜ | misc receipts — controls |
| Cash | Register Audit | 🟡 | `src/utils/register-audit.js` exists — confirm coverage |
| Cash | Gift Card Summary | ⬜ | gift-card liability/activity |
| Cash | Cashless | 🟡 | glimpse controls has cashless refunds — confirm |
| Cash | Adyen | ⬜ | payment-processor detail (Adyen) — settlement/chargebacks |
| Cash | Billable Sales | ⬜ | billable vs gross sales |
| Cash | Safe Counts | ⬜ | safe count compliance — cash controls / EOM |
| Food | Inventory | ✅ | `qsr_onhand` / physical inventory |
| Food | Transfers & Purchases | ✅ | `qsr_transfers` + `qsr_ebos_daily` |
| Food | Food Over Base | ✅ | `qsr_fob` (FOB) |
| Food | Raw Item Counts | ✅ | `qsr_onhand` raw items (EOM count progress) |
| Food | Raw Waste | ✅ | `qsr_waste` (raw) |
| Food | Comp Waste | ✅ | `qsr_waste` (completed/assembled) — **Food category ~fully covered** |
| Labor | All Hours | 🟡 | LifeLenz hours — confirm parity |
| Labor | Labor Statistics | 🟡 | labor trend — confirm cols |
| Labor | Labor Schedules | ✅ | `lifelenz_schedule` |
| Labor | Labor Analysis | ✅ | Labor Analysis view (VLH band) |
| Labor | Schedule Analysis Summary | 🟡 | schedule quality — confirm |
| Labor | Schedule Variance | ⬜ | scheduled vs actual hours variance — labor-tools panel |
| Labor | VLH Over/Under | 🟡 | we derive VLH gap — confirm this is the source |
| Digital | At A Glance | 🟡 | digital summary |
| Digital | Digital App | ⬜ | app orders/engagement |
| Digital | Digital Usage | ⬜ | digital adoption trend |
| Digital | Mobile Offer List | ⬜ | **offers/promos → ties to Promo/Discount ROI panel** |
| Digital | Mobile P&L Detail | ⬜ | digital-channel P&L (3PO/MOP economics) |
| Digital | GMA Delivery | ⬜ | delivery (McDelivery) detail |
| Digital | National Employee Discount (NED) | ⬜ | employee-discount tracking — controls/loss-prevention |
| Product | RFM Price Comparison | ⬜ | **pricing** (menu-file price compare) — Pricing Engine |
| Product | Product Mix | ⬜ | **⭐ PMIX — Pricing Engine + Filet-O-Fish-Friday correlation (Notes 25/28)** |
| Product | PMIX Discount | ⬜ | discount by product |
| Product | Product Mix Trend | ⬜ | PMIX over time — demand shifts |
| Product | Kitchen Capacity | ⬜ | **capacity vs demand — throughput/labor deploy; big** |
| Product | Delivery Price Index | ⬜ | delivery pricing markup |
| Product | Reported Product Outage | ⬜ | outage tracking (matches the "Product Outage" alert card) |
| People | At A Glance | 🟡 | people summary |
| People | Employee Roster | 🟡 | roster — cf. LifeLenz people/skills |
| People | Birthdays and Anniversaries | ⬜ | recognition/engagement nudges |
| People | Roster Statistics | ⬜ | staffing composition |
| People | Turnover | ⬜ | **retention/turnover — major people KPI, no Meridian panel** |
| People | Store Time Punches | ⬜ | punch detail — labor integrity |
| People | Time Punch Export | ⬜ | payroll export |
| People | Labor Exceptions | ⬜ | **OT/violations/exceptions — loss-prevention + compliance** |
| People | Time and Attendance | ⬜ | attendance |
| People | Emp Hours This Week | 🟡 | current-week hours |
| People | Shift | ⬜ | shift-level people |
| People | Rewards | ⬜ | Round-Up rewards / recognition |
| Payroll | Employee Time Punches | ⬜ | punch detail — labor integrity |
| Payroll | New Hires | ⬜ | onboarding/hiring lifecycle (pairs w/ Turnover) |
| Payroll | Pay Period Activity | ⬜ | payroll activity |
| Payroll | Pay Cycle Status | ⬜ | payroll ops status |
| Payroll | Payroll Ledger | ⬜ | payroll detail (PII — RBAC-sensitive) |
| Payroll | Emp Pay Details | ⬜ | wage detail (PII — RBAC-sensitive) |
| Payroll | Overtime Audit | ⬜ | **OT audit — labor cost + compliance / loss-prevention** |
| Payroll | Emp Hours Look Back | ⬜ | historical hours |
| Payroll | Student Permit Status Check | ⬜ | **⚠️ minor-labor-law compliance — legal-risk alert** |
| Sales | McDelivery | ⬜ | delivery channel |
| Sales | Kiosk | 🟡 | kiosk channel mix (glimpse has channel) |
| Sales | Sales Ledger | ✅ | `sales_ledger_daily` (emailed pull) |
| Sales | Consolidated Sales | 🟡 | rollup — confirm vs our totals |
| Sales | Sales - Point Of Order | ⬜ | order-origination (POO) channel split |
| Sales | Sales Ledger Summary | 🟡 | summary of ledger |
| Sales | Where Served | ⬜ | where-served (DT/FC/dine-in/curbside) mix |
| Sales | Open Late Close Early | ⬜ | matches the alert card — ops compliance |
| Sales | Store Hours | ⬜ | operating hours adherence |
| Service | Service Times Statistics | 🟡 | DAR service timing — confirm parity |
| Service | MOP Service Times | ⬜ | **Mobile-Order-Pay / curbside timing (OEPE)** |
| Service | YYNN | ⬜ | **DT hospitality metric (Yes-Yes-No-No)** |
| Service | VOICE | 🟡 | SMG VOICE (have smg_*) |
| Service | DT Timer | 🟡 | DT times — have via DAR; confirm source |
| Shift | 3D Trend | ⬜ | multi-dim trend |
| Shift | Trends | ⬜ | shift trends |
| Shift | Rank | ⬜ | shift ranking |
| Shift | 3 Peaks | ⬜ | **peak-period analysis (throughput planning)** |
| Shift | Daily Activity Report | ✅ | `qsr_daily_activity` (DAR) |
| Shift | Focus On Service | ⬜ | service focus |
| Shift | Operations Report | 🟡 | have Ops Report (manual upload) — confirm |
| Shift | Shift Manager Summary | ⬜ | per-shift-manager rollup |
| Shift | Peak Target and Tracking | ⬜ | **peak targeting (labor deploy vs demand)** |
| Shift | Find My Peak | ⬜ | peak identification |
| Shift | Time Slice Summary | ⬜ | **intraday time-slice throughput** |
| Shift | Daily Glimpse | ✅ | `daily_glimpse_daily` (emailed pull) |
| Shift | Punched Summary | ⬜ | punch summary |
| Shift | Records | ⬜ | records |
| C&I (top-level) | _(not expanded)_ | ⬜ | Cash & Inventory section — screenshot if useful |

Separate top-level nav sections (not under Reports): **Forms** (done — printable forms),
**C&I**, **Inventory**, **Workforce**.

## Reports → Forms sub-category (audit trail, not templates)
- **Form Completion Report** ⬜ — who-completed-which-form compliance (Pre-Shift/Travel Path
  completion rates by store/shift → ties to our new Printable Forms + a compliance panel).
- **Public Survey Report** ⬜.

## Other top-level sections (not "Reports" — management/config + a few data-rich ones)
- **Inventory** (data-rich, mostly ✅ via our pulls): Audit, Donation Supplies, Food Over
  Base ✅, Inventory Analysis, Inventory Usage, Manual Vendors, **Menu Items** ⬜ (product/
  pricing master — feeds a Pricing Engine), On Hand Inventory ✅, Physical Inventory ✅,
  Purchases ✅, Raw Items ✅, Transfers ✅, Variance Stat/Yields ✅, Waste ✅, **WRIN
  Management** ⬜ (item master).
- **Workforce**: HR, Scheduling, Employee Portal, Payroll — the operational modules behind
  the People/Payroll/Labor reports (LifeLenz-adjacent).
- **Operations**: Forms, Equipment ⬜ (asset/maintenance — new domain), Customer Feedback,
  Training ⬜ (crew certification — ties to skills matrix / perf reviews).
- **Engagement**: Manage Rewards, Rewards, Surveys, **Recruiting** ⬜ (hiring funnel → pairs
  with New Hires + Turnover), Manage Feedback.
- **Communication**: TV, Resource Library. **Administration**: Users/Roles/Locations/Org/
  Subscriptions/Business Unit (RBAC + org config — reference for our own RBAC/org_config).
- **Security (loss-prevention — high value):** **Security Events**, **Suspicious Activity**,
  **Any Transaction** ⬜ (register-level transaction search — powerful for controls/fraud),
  **Store Rankings**, Camera Settings.

## Home dashboard — KPI vocabulary & widgets (what QSRSoft leads with)
Confirms Meridian already has analogs for much of this; use as a coverage/vocab check.
- **Scorecards** (configurable, Actual / Avg Goal / Diff, Comp=Trading, period=MTD):
  *Scorecard-KPIs* (OEPE, R2P, KVS Time Per GC, Total Labor%), *DFO Scorecard* (**Crew
  3-Month Turnover 64.29%, Shift TTM Turnover 62.5%**, Overall Sat%, DT Acc Sat%),
  *First Friday Scorecard* (STW GCRD, Overall Sat%, OEPE W/O Parked, Digital Order Pts %
  of Total Sales), generic *Scorecard* (Overall Sat%, DT Acc%, OEPE W/O Parked, Digital
  Usage). → mirrors Meridian Projections/Scorecards; DFO/First-Friday are named scorecard
  templates (cf. our smart-targets/scorecard UX + the perf-review template work).
- **Today**: Sales / Avg Check / GC's / DT Sales; OEPE W/O Park, R2P, Healthy Usage, KVS
  Time/GC; Actual-vs-Needed, Actual-vs-Scheduled, Avg Rate, Punch Labor%.
- **Snapshot** (Yest/WTD/MTD/LW/LM/YTD/TTM/T365): Labor (Crew Labor%, Avg Rate, **TPPH
  4.84**, Total Labor%), Cash (**Over Ring, Red Before, Red After, Over Short** — controls),
  PMIX (top items: units sold/used/promo), **Drive Thru HME** (OEPE W/O Park, %OEPE ≤120s,
  Total Cars, Lane 1/2 Cars).
- **Digital Snapshot**: Digital Hero KPIs (Digital App % of Sales, **Loyalty 90-Day Active
  Customers**, GC/R/D, New Digital App Customers, McDelivery % of Sales), Digital Order Pts
  by channel (Digital/Kiosk/MOP/McDelivery/GMA), **MOP Fulfillment** mix (Curb/Table/FC/DT).
- **Day Parts / Peaks / Point of Order** tabs; **Round Up** donations (MTD/goal); **VOICE**
  (Overall/Be Nice/Be Fast/Quality/Clean/Accuracy). Note **TPPH** is here → our backlog
  "TPPH auto-target calc" has a source.

## Standout untapped candidates (early read)
- **Product Mix / PMIX Discount / RFM Price Comparison** → Pricing Engine + product-level
  demand (long-flagged; the catalog confirms the source reports exist).
- **Kitchen Capacity** → throughput vs demand; pairs with labor deploy + speed of service.
- **Turnover + Labor Exceptions + Store Time Punches** → a real People/retention panel +
  labor-integrity signals (OT, modified punches, exceptions) — loss-prevention theme.
- **Schedule Variance** → scheduled-vs-actual labor for Labor Tools.
- **Mobile Offer List / Mobile P&L Detail** → feed Promo/Discount ROI + digital economics.
- **Cash cluster** (Deposits, Safe Counts, Tax Exempt, NED) → cash-integrity / controls.

### Other high-value surfaces seen on the QSRSoft home (inspiration, not reports per se)
- **"Did you know?" alert cards** (tabs Default/Prod-Inv/People/Shift/Security/C&I):
  Product Outage, Open Late/Close Early, Suspicious Activity, Potential OT, Modified
  Punches. → mirrors Meridian's **Attention Now / Signals** — good idea bank for new
  detectors (esp. Suspicious Activity = loss-prevention, Modified Punches = labor integrity).
- **Leaderboard "Goal-den Momentum"** (Overall Rank vs 340 restaurants, Vs-Last-Week,
  FIFA UPT+/-, GC/Day+/-, OEPE+/-, RMHC% GC, Upsized%), **Round Up** by POS area,
  **Voice Rankings** → ranking/gamification patterns for our leaderboards.
- **CoachQ** = QSRSoft's AI assistant (cf. our SAGE).

## ⭐ Dashboard & Advanced-Analytics INSPIRATIONS (vision-level, from home + shift dashboards)
These are concepts worth adopting, beyond raw pulls:
1. **"Cashflow Opportunity" $-quantifier** (QSRSoft Consulting widget): translates gaps into
   dollars — Excessive Crew Labor ($41K/store/6mo), Food Opportunity ($20K/store vs
   best-in-class), GC Opportunity (Comp GC gap to BU). **⭐ Biggest idea:** a Meridian
   "Opportunity $" layer that converts every deficit (labor, FOB, GC gap) into $ upside,
   benchmarked to best-in-class. Squarely the "intelligence system" north star.
2. **Comp = BU / Org / FO benchmarking** (every metric shown BU vs Org vs "Org vs BU"):
   systematic peer/benchmark comparison, not just vs-LY/vs-target. → a benchmarking layer
   for Meridian (store vs district vs best-in-class); revisits the peer-blend idea.
3. **Base Food Analysis attribution** (Drivers: **PMIX / Pricing / Raw Cost / Interaction**):
   a food-cost *bridge* decomposing base-food shift into drivers. → upgrade EOM/FOB from
   "what" to "why" with an attribution waterfall. (Snapshot-Month Food = FOB%/Base Food%/
   Stat Var%/Unexplained% Actual/Target/Diff — **confirms our EOM FOB diagnosis mirrors QSRSoft**.)
4. **Product-level margin** (National cards: % of Total GC, Units/1K GC, Avg Check, **Avg
   Margin Amt, Margin %** per item — FIFA Meals, Pies, Caesar Chicken, 2.0 deals, EVM $5/$8,
   5%/15%): PMIX + margin = the Pricing Engine's raw material. **Units/1K GC** is their
   normalization unit throughout.
5. **Security Drill-Down Events** (Total Promo / POS Overring / Other Promo / Cash Refund,
   ranked by $ and **$/1k GC, #/1k GC**): normalized loss-prevention event ranking → feeds
   Signals/controls + Attention Now.
6. **Shift Dashboard** (role-based): **Shift Runner Scorecard** grades Shift Prep = **Pre
   Shift Checklist % + Travel Path %** (→ directly ties our new Printable Forms to a shift
   score via Form Completion Report) alongside OEPE/R2P/KVS vs goal; **CoachQ** AI shift
   narrative (SAGE analog); hourly DAR (STW GC vs Proj, Act Hrs vs Need, OEPE, KVS, R2P);
   Working-Today + Employee Roster (per-employee score); Workflow (forms due by time).
7. **Shared Links**: AtMcD, **PACE** (the graded-visit system Meridian's Visit Readiness
   targets), MBSync, **RFM** (menu/price file), **Price Portal** — the external McD systems.

## PRIORITIZED opportunity ranking (post-full-walkthrough)
Tier 1 (high value, distinctive):
- **Opportunity-$ quantifier** (labor/FOB/GC gap → dollars, benchmarked) — flagship.
- **Product Mix + margin → Pricing Engine** (Product Mix/PMIX/RFM/Menu Items/National cards).
- **Food-cost attribution bridge** (PMIX/Pricing/Raw/Interaction) on top of EOM/FOB.
- **BU/Org benchmarking layer** (vs peer/best-in-class, not just LY/target).
Tier 2 (clear gaps, well-scoped):
- **People/retention panel** (Turnover Crew-3mo/Shift-TTM, New Hires, Recruiting) + **labor
  integrity** (Overtime Audit, Modified Punches, Store Time Punches, Student Permit).
- **Peak/throughput cluster** (3 Peaks, Peak Target & Tracking, Time Slice, Kitchen Capacity).
- **Form Completion compliance** (Pre-Shift/Travel Path completion → Shift score; uses our forms).
- **Security/controls** (Suspicious Activity, Any Transaction, Security events per-1k-GC).
Tier 3 (enrichers):
- Digital depth (MOP fulfillment mix, Loyalty 90-day active, Mobile Offer List → Promo ROI).
- Schedule Variance (scheduled vs actual) for Labor Tools; Where-Served/Point-of-Order channel.

## Handling notes
- Screenshots of report **structure** (names/columns/params) are the value — not row data.
  Never persist tokens/credentials; row values aren't needed here.
- After populating, promote the highest-value ⬜ rows into concrete backlog items and, where
  they fit an existing area, link them from that panel's work.
