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

#### ✅ Variance Stat endpoints — CONFIRMED (3 of them, auth = eBOS `x-auth-token`)
| View | Endpoint | Use |
|---|---|---|
| **Monthly** | `GET /api/inv/{nsn}/stat_variance/monthly/{YYYY-MM-01}` | period variance table |
| **Daily / range** | `GET /api/inv/{nsn}/stat_variance/daily?start_date=&end_date=` | same shape, arbitrary window (weekly monitoring) |
| **Yields** | `GET /api/inv/{nsn}/stat_variance/yields?start_date=&end_date=` | yield-range config per group |

**Variance row schema (monthly/daily)** — array of raw items, TWO shapes by `class`:
- **Food / Paper (`ri: 1`, class F/P):** carries the **dollar** figures →
  `dollar_variance` ($ over/under — THE top-5 / ±$50 sort key), `variance` (units),
  `expected_usage`, `actual_usage`, `loose_unit_cost`, `percentage` (of sales), `yield`,
  `raw_waste`, `comp_waste`, `wrin`, `long_desc`, `class`, `store_rawitem_id`.
- **Condiment (`ri: 0`, class C):** unit-only → `variance` (units), `starting_inv`, `ending_inv`,
  `changes`, `expected_usage`, `actual_usage`, `mid_range_yield`, `uom`. **NO `dollar_variance`.**
  ⚠️ Condiments are a FOB class but this endpoint gives them **no $** — their $ impact must come from the
  Inventory-Summary / FOB report, not here. So "top-5 by $" and "±$50" run on **Food/Paper**; condiments
  get the **always-review** treatment via unit-variance + yield-range flags instead.
- `store_rawitem_id` = the id to pass to the Raw-Item DETAIL forensic endpoint (§2 below) to see WHEN it happened.
- Real store-3708 Jul signal: `00005-086 100% PURE BEEF` **−$868** dollar_variance (biggest food loss),
  `Chicken McNuggets` −$441, `BUN/REG BB 3.1` −$327, `BACON/THICK CUT` −$251 → these are the top-5 the owner reads first.

**Yields schema** — array of `{ groupName, description ("Y Range: lo - hi"), items: [wrin-prefix,…] }`.
Not dollars — the **acceptable yield band** per concept group (e.g. "Fries 84.9–93.9", "Big Mac Sauce 35–37").
Cross-reference a flagged item's actual `yield` (from the variance row) against its group band here → a
yield OUTSIDE the band = the procedural/calibration cause the owner looks for (over/under-portioning, cook
loss, calibration drift). This is how the Yields tab "points to a cause" without adding lost $.

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

#### ✅ Raw Item DETAIL endpoint — CONFIRMED (the forensic register)
`GET https://prod.ebos.qsrsoft.com/api/inv/{nsn}/raw_detail/{itemId}?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
(auth = eBOS `x-auth-token`, same token family as On-Hand / eBOS ledger). Reached via **View** on the
Variance Stat/Yields page, or directly with a raw-item id. Response:
```
{ full_wrin, long_desc, uom_desc, recipe_item, item_class,
  history: [ { store_busn_dt, store_busn_tm, display_dt_tm, date_created,
              qty_change, source, source2, invoice_identifier, pos_close,
              source_id, variance, difference, eID, count_source, store_busn_dt_raw } ] }
```
- `source` ∈ **invoice, pos_open, pos_sales, waste, comp_waste, transfer, inventory**. This is the
  transaction-by-transaction **life of the product** for the period — exactly the register the owner reads.
- **Count events** = `source == 'inventory'`. These carry the forensic fields:
  - `variance` (units off at that count), `difference` ($ impact of that count),
  - `eID` = **the manager who entered it** (e.g. `"Cinthya a - e9755633"`) → feeds the manager-risk overlay,
  - `count_source` (e.g. `"MobileApp"`).
- **This answers "WHEN did the variance occur":** walk the history in date order; the count event whose
  `variance`/`difference` is large is where it happened. A big variance on an *early*-period count means
  recounting *now* won't help (the error already cascaded all month) — a *late* count variance is
  recount-worthy. This is the attribution the owner defined.
  - Real example (store 3708, item 1385962 = 00005-086 100% PURE BEEF, Jul): a **−4608** count on
    07/21 08:59 (**−$1947.88**) immediately followed by a **+4654** correction at 08:23 → a mis-count and
    same-day fix, NOT a real loss. Without the register this reads as ~$1.9k variance; with it, it's noise.
- **Catalog** (the item master, to know *which* itemIds/WRINs exist + class/countable/active) =
  `GET /api/inv/{nsn}/raw_detail/rawitem?show_all=1`. Requires a raw-item selection to display in the UI
  unless deep-linked from Variance Stat's View.
- ⇒ Wire `raw-items-timing` check to pull DETAIL for each flagged variance WRIN, classify count vs
  non-count events, attribute the variance to its count date, and set severity/recount-recommendation by
  **how late in the period** the variance-bearing count landed.

### 3. Waste — always spot-check
- Look for **pencil-whipping patterns** and **specific managers entering excessive amounts.**
- Report lists all waste for the period in **collapsible rows** for **Completed** and **Raw** waste; opening
  a row shows entries **rolled up by date, with the manager who entered it and the $ amount**; each entry has
  a **clickable detail link** (opens a popup — cross that bridge later).
- **Raw waste** = waste of raw (purchased) items. **Completed waste** = waste of finished menu items
  (Big Mac, Cheeseburger, Med Choc Shake, etc.).
- Value: what managers enter, is it consistent, does it make sense, excessive-waste patterns.

#### ✅ Waste endpoint — CONFIRMED
`GET /api/inv/{nsn}/raw_waste_promo?start_date=&end_date=` (auth = eBOS `x-auth-token`). Flat array of
waste EVENTS (one per entry, the day-rollup the UI shows is client-side):
```
{ store_busn_dt, store_busn_tm, type: "waste"|"comp_waste", amount ($),
  eID ("James T - e8483035" = MANAGER), date_created, date_created_sec,
  source: "BOS"|"MobileApp", reason (usually null), edited (0/1) }
```
- `type == "waste"` = **Raw** waste; `type == "comp_waste"` = **Completed** waste (matches the two collapsible sections).
- `amount` is the **$ value** of that waste entry.
- `eID` = the manager who entered it → **directly feeds the manager-risk overlay**; group by eID to find
  who enters the most / largest / at odd times.
- `source` = **BOS** (back-office terminal) vs **MobileApp** — an entry pattern signal (e.g. all one manager's
  waste keyed at end-of-shift on BOS in one batch = possible pencil-whipping).
- `edited` = **1 if the entry was changed after creation** → a manipulation flag worth surfacing.
- `store_busn_tm` uses **>24h clock for after-midnight business-day hours** (e.g. "25:50:47" = 1:50am on the
  next calendar day still belonging to that business date) — normalize when charting time-of-day.
- ⇒ Wire `waste-patterns` check: per-manager $ totals + entry counts, flag managers whose share of period
  waste $ is disproportionate, any `edited==1`, and batch/odd-hour entry clusters. Cross-link a manager's
  waste pattern to their Raw-Item count `eID` (§2) and their Variance flags.

### 4. Purchases — verify
- Already captured (eBOS ledger, `qsr_ebos_daily`). **Verify all invoices are POSTED and nothing is PENDING.**
- Unposted/pending invoices cause easy-to-fix swings. Rare, but must be verified every time.

### 5. Transfers — include
- Should be part of the picture. **Transfers move product between stores** → they shift expected usage, so a
  missing/rejected transfer that physically happened shows up as variance.

#### ✅ Transfers endpoint — CONFIRMED
`GET /api/inv/{nsn}/transfers?start_date=&end_date=` (auth = eBOS `x-auth-token`). Flat array, ONE ROW PER
LINE ITEM; rows of the same transfer share `id` + `header_total_amt`:
```
{ id (transfer id), type: "In"|"Out", trans_nsn (the OTHER store's NSN),
  store_busn_dt, store_cal_tm, approved_rejected_dt_tm, status: "approved"|"rejected",
  total_amt ($ line), header_total_amt ($ whole transfer), source, eID (manager), auto_post,
  store_rawitem_id, wrin, long_desc, invty_class_cd (F/C/P/S/…), units_count, case/inner_pack/loose_count }
```
- **`type`**: `Out` = product LEFT this store (raises expected on-hand / can look like a shortage if unposted);
  `In` = product arrived. `trans_nsn` = the counterparty store.
- Group by `id` for whole-transfer totals; `status != "approved"` = didn't post → a variance culprit to verify.
- `eID` = manager who initiated → same manager-attribution overlay.
- ⇒ Wire `transfers` check: net In/Out $ by class, list large/`rejected`/unposted transfers, and cross-link a
  transferred WRIN to its Variance flag (a big "Out" explains an apparent usage spike).

### 6. WRIN Management + Menu Items — research (owner wants help assessing viability)
- The only two untouched areas. Research whether to include.

## Cross-cutting overlays
- **Manager-history scrutiny:** when a manager has previously manipulated counts/waste/anything, scrutinize
  their data more closely for patterns ("past performance predicts future results"). → a **per-manager risk
  weight** that raises the sensitivity of Waste/Raw-Items checks on their entries. Doesn't always pan out,
  but always warranted.
- **Full context + gut feel:** one finding leads to another. The engine should **link related findings**
  (e.g. a Variance flag → its Raw-Items count-timing → the manager who entered it → that manager's waste pattern).

## ✅ eBOS AUTH — SOLVED (2026-07-26): headless Playwright Amplify login mints per-request
The `prod.ebos.qsrsoft.com/api/inv/...` calls need an **eBOS token** (HS256) that is **minted
per-request from a live browser session** — there is NO stored token or single mint endpoint to
replicate, and eBOS tokens die in ~minutes. What we learned the hard way:
- **`api.sso.myqsrsoft.com`** authenticates with the **Cognito ID token** (RS256, `iss=cognito-idp.us-east-1`,
  `token_use=id`, ~1h TTL) in `x-auth-token` — NOT the `api.reports` reporting token.
- But the `/token/ebosByOrg` exchange returns **403 "explicit deny in an identity-based policy"** — wrong/denied
  route. Do NOT keep chasing the SSO exchange; it was a dead end.
- **WORKING PATH = Playwright headless login.** `getEbosTokenViaPlaywright()` in `scripts/qsrsoft-variance-pull.mjs`:
  - v3.myqsrsoft.com login is an **AWS Amplify** form (`input[name=username]` "Email", `input[name=password]`,
    buttons: "Sign in" / "Forgot password" / "Sign in with McD eID" / "Sign in with Email Link").
  - **Must type creds char-by-char via a Locator's `pressSequentially`** (NOT `page.fill`, NOT ElementHandle —
    Amplify's React inputs need real onChange) and click the **exact** `getByRole('button',{name:'Sign in',exact:true})`.
  - After submit the SPA logs in **asynchronously** — `stillOnLogin` reads true right after, but navigating the
    inventory routes fires a `prod.ebos` request ~20s later whose `x-auth-token` header IS the eBOS token → capture it.
  - Auth reached via QSRSOFT_USERNAME/PASSWORD secrets. **Confirmed 2026-07-26: 1/1 store → 220 variance · 111 waste ·
    15 transfer rows.** No manual token needed; mints fresh every run.
- **TODO (task #60):** mirror this working Playwright login into `qsrsoft-onhand-pull.mjs` + `qsrsoft-ebos-pull.mjs`
  (they still use the dead SSO-first ladder). Drop the QSRSOFT_EBOS_TOKEN / QSRSOFT_COGNITO_TOKEN rungs (both dead ends).
  - ✅ **on-hand DONE (2026-07-29):** ported variance's `getEbosTokenViaPlaywright` verbatim into
    `qsrsoft-onhand-pull.mjs` (it had the OLD broken login: `page.fill` leaves Amplify empty + generic
    Sign-in selector + no async settle → every EOM run failed with "no eBOS token"). `resolveEbosToken`
    now goes straight to Playwright (static override only). Confirmed run: **6958 item-rows / 27 stores,
    2 stores crossed 90%.** Hotfixed to BOTH main + the feature branch (workflows run from main).
  - ⏳ **`qsrsoft-ebos-pull.mjs` still on the old ladder** — apply the same port if it starts failing.

## New data pulls needed (beyond On-Hand — capture endpoints on prod.ebos.qsrsoft.com)
| Report | Why | Status |
|---|---|---|
| **Variance Stat / Yields** | top-5 by $, ±$50 rule; Yields tab = cause (procedure/calibration) | ✅ CONFIRMED — 3 endpoints (monthly / daily / yields), see §1 above |
| **Raw Items register** | count timing, variance-at-count, theoretical vs actual, product life | ✅ CONFIRMED — catalog + DETAIL forensic history, see §2 above |
| **Waste** | manager/date/$ rollup, raw vs completed, pencil-whipping | ⏳ need endpoint capture (+ detail popup later) — NOTE variance rows already carry per-item `raw_waste`/`comp_waste` units |
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
