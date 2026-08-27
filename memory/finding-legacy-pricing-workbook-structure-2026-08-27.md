# Finding: legacy "Menu Management" pricing workbook — structure, and what a modern rebuild needs

**Source**: `Menu_Management__071917.xlsm`, owner-supplied 2026-08-27, for the Pricing Engine
backlog item (Notes 25 #1, "🔷 BIG own workstream," blocked on "owner will supply an old used
spreadsheet as the foundation"). **Confirmed authentic**: the workbook's own Instructions sheet
names the author as `freaves@gmail.com`, version-dated 2008-01-10 through 2017-01-08 — this is the
owner's own hand-built tool, not a template. **All data in it is 8-10 years old and NOT to be used
as current pricing/cost/mix data** — this finding is about STRUCTURE only: what the tool modeled,
what inputs it needed, and what a rebuild on Meridian's current cloud data would still be missing.

## What the workbook actually does

27 sheets; the "Active" ones (per the workbook's own Instructions tab, as of the 2017 version) form
one pipeline:

1. **Setup** — per-store (National Store Number) menu item price list: item code → product name →
   menu-type tag (EVM-SM/MD/LG, ALA CARTE, combo variants) → one price column PER STORE. Confirms
   **per-store price variation on the identical item code was core to the model** (e.g. a small
   Coke priced $0.59 at one store, $0.69 at five others in the same pull).
2. **Core Description List** — canonical Menu Item (MI#) master: sort order, MI#, "MI Number
   Type" (Primary/etc.), **Xref** (cross-reference — the mechanism for handling an item that gets
   renamed/relaunched under a new POS code over time), Core Status, Core Category, four levels of
   description (20-char/long/POS/short), a 3-level search hierarchy (e.g. Regular Menu → Burger →
   Hamburger). ~3400 rows — this is a real, maintained item dictionary, not a one-off list.
3. **MB Price List** — a literal Martin Brower (the McDonald's-system food distributor) monthly
   invoice-price export: WRIN# (distributor SKU), description, case pack, units/case, case price,
   inner-pack price, single-unit price. This is the RAW ingredient cost input.
4. **Serving Factors** — ties an MB Price List WRIN# to a "servings per case" and derives a
   **per-serving cost** (case cost ÷ servings/case) for every inventory item, keyed by ISP#
   (Ingredient/Stock/Product number, presumably).
5. **QCR** ("recipe" sheet, per Instructions: "Menu Item Recipes for Products") — the actual
   bill-of-materials: for each Menu Item (by MI#), lists every ingredient it uses (by ISP#), each
   ingredient's Serving Factor and Serving Cost from sheet 4, rolling up to **Food & Paper Cost %
   and $ per menu item** at its current menu price. This is the piece with no current Meridian
   analog at all (see gaps below).
6. **PMIX - 1 through PMIX - 4** — four trailing product-mix snapshots (rolling periods, most
   likely quarters or months) per item: Menu Price, Units Served, Units Sold, Dollars Sold, % of
   Product Net, % of All Net, Units per 1,000 Transactions, Units per $1,000, Promo count,
   **Wasted units**, Total Used. Richer than a plain "units sold" figure — several derived rate
   metrics live in the source report itself, not computed downstream.
7. **BRK PRICING IMPACT / REG PRICING IMPACT** (separate sheets for Breakfast vs. Regular/All-Day
   menus, since the two dayparts don't share items) — **the actual price-elasticity/what-if
   simulator**, the closest thing in the workbook to "Pricing Engine." For each entrée, pulls in
   all four PMIX periods' unit counts, its current EVM (combo) food cost, lets the user enter a
   **PRICE CHANGE** delta, and recomputes: adjusted food cost %, ala-carte-vs-EVM cost delta, and
   a **total gain-or-loss dollar figure** — i.e., "if I raise this item $0.20, my food-cost % moves
   from X to Y and my modeled profit moves by $Z," using the trailing PMIX volume as the demand
   basis (a static-elasticity assumption — volume held constant at trailing levels rather than a
   fitted demand curve — worth naming explicitly if Meridian's rebuild wants to do better).
8. **Import / Reformat for Import** — the CSV ingestion path: RFM (presumably "Restaurant/
   Franchise Menu"?) price-list exports get pasted in and reshaped into the Setup sheet's per-item,
   per-store price grid. All manual, all `.csv`-file-based — no API in 2017.
9. **HD UHC Layout** — tray/holding-cabinet placement, a kitchen-ops tool, unrelated to pricing.
   Not relevant to the Pricing Engine effort.

Several sheets are marked "Inactive/Removed" in the workbook's own Instructions tab as of 2017
(Calculators, Impact on Profit, Quick QCR, old UHC/Yields/Waste sheets) — superseded by the active
pipeline above; not worth mining for structure.

## What Meridian already has that maps to this

| Legacy sheet | Meridian equivalent | Gap |
|---|---|---|
| PMIX-1..4 | `qsr_product_mix` (live, twice-daily auto-pull) | Has `soldQty`/`discQty`/`promoQty`/`price` per (loc,date,item) — **no "Units Served" (served vs. sold — e.g. a comped/redo item), no %-of-net-sales, no Units/1K-Trans rate, no per-item "Wasted" quantity.** These are all derivable from soldQty + a sales/transaction denominator except Wasted, which needs its own field (see gaps below). |
| Setup (per-store item price) | `qsr_product_mix.price` per (loc, date, item) | Already covered — the live pull already carries per-store, per-date pricing, arguably a strict improvement (daily granularity, not a manual periodic re-paste). |
| Core Description List (MI# master + Xref) | `qsr_product_mix.item`/`desc`/`familyGroup` | Unclear whether item codes stay stable across a menu relaunch/rename the way the legacy Xref field handled — not yet confirmed either way, listed as an open question below, not assumed to be a gap. |
| MB Price List (distributor cost) | **nothing** | Real gap — see below. |
| Serving Factors + QCR (recipe/BOM + per-item food cost) | **nothing** | Real gap — see below. |
| BRK/REG PRICING IMPACT (elasticity simulator) | **nothing** (this IS the Pricing Engine ask) | The actual deliverable Notes 25 #1 wants built. |

## Additional data pulls needed to build a modern equivalent (the user's explicit ask)

1. **Distributor ingredient cost (Martin Brower or equivalent) — the single biggest real gap.**
   Without a live or periodic feed of case costs per WRIN#/ISP#, there is no way to compute
   per-item food cost the way QCR did — Meridian's current food-cost signal (`qsr_fob`) is a
   store-day aggregate $/%, not tied to any specific menu item or ingredient. Notes 25 #1 itself
   already names this as a needed new source ("Martin Brower (Sync)") — worth checking directly
   with Martin Brower/the McDonald's system whether a Sync API or scheduled export exists before
   assuming this has to stay a manual monthly CSV upload like the legacy sheet.
2. **Recipe / bill-of-materials data (which ingredients, in what quantity, go into each menu
   item).** No current Meridian source at all. This is what QCR's ingredient list is used for; it
   might be obtainable from QSRSoft (if the reporting platform exposes a recipe/BOM report the
   pull scripts haven't touched yet — worth a source-recon pass) or might need re-entry from the
   legacy QCR sheet's structure as a one-time seed, since recipes change far less often than
   prices.
3. **Per-item waste quantity.** `qsr_product_mix` doesn't carry a "Wasted" field the way the
   legacy PMIX sheets did. Worth checking whether QSRSoft's underlying product-mix API response
   actually includes a waste column that the current pull script simply doesn't map yet (a cheap
   fix if so) before treating this as a new external source.
4. **Combo/EVM composition (which items make up which value meal, and how a component's price
   change cascades to the combo's price/cost).** No current Meridian model of combo structure at
   all. Likely low-churn reference data (value-meal composition doesn't change often) — a
   candidate for a small, manually-seeded config table rather than a live pull, similar to how
   `constants.js`'s `operators`/`supervisorGroups` are hand-maintained seed data today.
5. **Confirm item-code stability across renames** (the Core Description List's Xref field
   existed for exactly this reason) — check whether `qsr_product_mix.item` for a given real-world
   product stays constant over the pull's history, or whether a menu relaunch fragments it into a
   new code. This determines whether correlation/trend work (including dispatch #169's product-mix
   Signal Lab work, currently in flight) needs an item-identity-reconciliation step.

## Not a dispatch yet

This is a structural finding, not an implementation spec — the Pricing Engine itself stays queued
behind the source-recon questions above (particularly #1, the distributor cost feed, since without
it there's no real per-item margin to model, only per-item revenue). Once the owner has a read on
Martin Brower/data-source access, this file is the starting point for that dispatch's design.
