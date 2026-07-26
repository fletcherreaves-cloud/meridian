---
name: project-eom-diagnosis-flow
description: OWNER'S authoritative EOM / FOB food-cost troubleshooting decision tree (Notes 29 follow-up, 2026-07-26). The order he checks things, the thresholds, the data each step needs, the manager-history overlay, and the design goal that this flow be EDITABLE/expandable. This is the spec for the EOM diagnosis engine + report/action-item generator.
metadata:
  node_type: memory
  type: project
---

# EOM / FOB Troubleshooting — the owner's diagnosis flow (authoritative, 2026-07-26)

> Owner's own words, structured. This is THE decision tree the diagnosis engine encodes.
> **Design directive:** the logic flow must be **editable / expandable** ("map this logic flow
> somehow so it becomes editable or something useful so we can expound upon it"). Build it
> **declarative / config-driven**, not hard-coded. Owner also wants us to invent NEW diagnostic
> techniques over time and find **repeatable patterns that explain how to improve FOB** → model elsewhere.
> Gut-feel + "one thing leads to another" is part of it → surface links between findings, don't silo them.

## The flow (in order)

### 0. ALWAYS start with Food Over Base (FOB)
- Analyze the components vs target; flag anything **excessively out of range**.
- **Even if nothing is way off, still deep-dive Variance Stat/Yields AND Condiments first.** (These
  two are always worth a look regardless — they're where the story usually starts.)

### 1. Variance Stat / Yields
- **ALWAYS review at minimum the top 5 items by $ Difference** (the report's default sort order).
- **Yields** = a separate **tab** on the same page. It does NOT show additional lost dollars, BUT points
  to a **cause**: procedural issues, equipment calibration, etc. (Reviewing the page teaches how to read it.)
- **Rule of thumb: troubleshoot any item with a variance of ± $50 or more.**

### 2. Raw Items (the register) — the next logical check after a flagged variance item
- The **register of each raw item** for the selected period. THE key forensic view.
- For a flagged item, look at: **when the count was entered**, **does the entered number make sense**,
  and **what the variance was AT THE TIME OF COUNT.**
- ⭐ **Critical insight:** variance isn't necessarily created on the current/last count — it can accrue
  **throughout the month**. You must find **when** it happened to decide whether recounting *now* is even
  useful. (A mistake early in the period has consequences all month.)
- **Theoretical inventory** is believed to live/serve from here; a **real-world count overrides theoretical.**
  So a bad count has cascading consequences.
- Need to **review ALL register data** to ascertain the **life of the product** for the period and draw
  factual conclusions.
- **Long-term:** proactively monitor this **weekly (minimum) + on-demand.**

### 3. Waste — always spot-check
- Look for **pencil-whipping patterns** and **specific managers entering excessive amounts.**
- Report lists all waste for the period in **collapsible rows** for **Completed** and **Raw** waste; opening
  a row shows entries **rolled up by date, with the manager who entered it and the $ amount**; each entry has
  a **clickable detail link** (opens a popup — cross that bridge later).
- **Raw waste** = waste of raw (purchased) items. **Completed waste** = waste of finished menu items
  (Big Mac, Cheeseburger, Med Choc Shake, etc.).
- Value: what managers enter, is it consistent, does it make sense, excessive-waste patterns.

### 4. Purchases — verify
- Already captured (eBOS ledger, `qsr_ebos_daily`). **Verify all invoices are POSTED and nothing is PENDING.**
- Unposted/pending invoices cause easy-to-fix swings. Rare, but must be verified every time.

### 5. Transfers — include (new data pull needed)
- Should be part of the picture. Another data pull to set up.

### 6. WRIN Management + Menu Items — research (owner wants help assessing viability)
- The only two untouched areas. Research whether to include.

## Cross-cutting overlays
- **Manager-history scrutiny:** when a manager has previously manipulated counts/waste/anything, scrutinize
  their data more closely for patterns ("past performance predicts future results"). → a **per-manager risk
  weight** that raises the sensitivity of Waste/Raw-Items checks on their entries. Doesn't always pan out,
  but always warranted.
- **Full context + gut feel:** one finding leads to another. The engine should **link related findings**
  (e.g. a Variance flag → its Raw-Items count-timing → the manager who entered it → that manager's waste pattern).

## New data pulls needed (beyond On-Hand — capture endpoints on prod.ebos.qsrsoft.com)
| Report | Why | Status |
|---|---|---|
| **Variance Stat / Yields** | top-5 by $, ±$50 rule; Yields tab = cause (procedure/calibration) | ⏳ need endpoint capture (2 tabs: Variance + Yields) |
| **Raw Items register** | count timing, variance-at-count, theoretical vs actual, product life | ⏳ need endpoint capture (THE key one) |
| **Waste** | manager/date/$ rollup, raw vs completed, pencil-whipping | ⏳ need endpoint capture (+ detail popup later) |
| **Transfers** | swings from transfers | ⏳ need endpoint capture |
| **Purchases** | verify posted / not pending | ✅ have `qsr_ebos_daily`; add posted/pending status check |
| **Condiments on-hand** | always-review item | partly in On-Hand (class=Condiment) |

## New per-location SETTINGS to add (owner will supply the data)
- **Weekly count days** per location → so we can proactively monitor Raw-Items variance weekly.
- **Delivery days** per location → tie into analysis (usage/product-life vs delivery cadence).
→ Add an **EOM config** (per-loc: countDays[], deliveryDays[]) editable in settings, owner-supplied values.

## Engine design implications (for the build)
- **Declarative check registry:** each diagnostic step = a config object {id, label, order, dataSource,
  threshold(s), severity, producesFindings()}. Editable/reorderable → satisfies "make the logic flow editable."
- **Findings are linked**, not siloed (variance ↔ raw-item timing ↔ manager ↔ waste).
- **Output:** a per-store **detailed diagnosis report** + a **summarized action-item list** to send
  (owner downloads/attaches to email to start; automate in-app later).
- **Manager-risk overlay** as a tunable weight.
- Owner explicitly wants to **add new techniques over time** + find **repeatable FOB-improvement patterns**
  → keep the registry open and log discovered patterns back here.
