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
| Payroll | _(children TBD)_ | ⬜ | screenshot pending |
| Sales | _(children TBD)_ | ⬜ | screenshot pending |
| Service | _(children TBD)_ | ⬜ | screenshot pending |
| Shift | _(children TBD)_ | ⬜ | screenshot pending |
| C&I | _(children TBD)_ | ⬜ | screenshot pending |

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

## Handling notes
- Screenshots of report **structure** (names/columns/params) are the value — not row data.
  Never persist tokens/credentials; row values aren't needed here.
- After populating, promote the highest-value ⬜ rows into concrete backlog items and, where
  they fit an existing area, link them from that panel's work.
