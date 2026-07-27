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

## Catalog (POPULATE from owner screenshots)
> Awaiting screenshots of the QSRSoft reports menu (names grouped by category; columns/
> date-params where visible). Fill the table below, one row per report, then tag + note a
> candidate Meridian use. Known-early untapped leads from prior notes:
> **Product Mix** (→ Pricing Engine + Filet-O-Fish-Friday correlation), pricing, deposits.

| Category | Report name | Status | Maps to / candidate Meridian use |
|---|---|---|---|
| _tbd_ | _tbd_ | ⬜ | _tbd_ |

## Handling notes
- Screenshots of report **structure** (names/columns/params) are the value — not row data.
  Never persist tokens/credentials; row values aren't needed here.
- After populating, promote the highest-value ⬜ rows into concrete backlog items and, where
  they fit an existing area, link them from that panel's work.
