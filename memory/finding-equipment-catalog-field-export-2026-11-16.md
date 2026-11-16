---
name: finding-equipment-catalog-field-export-2026-11-16
description: Owner forwarded a real multi-store equipment export (Equipment.xlsx, QSRSoft maintenance module, 26 stores, 408 rows) -- used it to independently confirm/correct equipment_catalog entries that were previously only web-researched or owner-recollection-based. 7 existing rows got real field-confirmation notes added (one, Frymaster fry dispenser, got real CONTRARY evidence, not deleted). 2 "(Unconfirmed)" walk-in cooler/freezer placeholders got resolved to Norlake. 3 new rows added (Franke fry dispenser, Traulsen + H&K refrigeration) -- all still flagged:true pending owner confirmation of exact model numbers, which the export does not carry for almost any row. Also surfaces real model-number mismatches on 3 items and a list of equipment types seen in the export that are NOT yet in Meridian's equipment_catalog at all (Marinator, Coffee/Tea Brewer, Hot Water Tank, Heated Landing Zone, Outdoor Digital Menuboard, Oil Tanks/Pump) -- flagged as an open product decision, not added unilaterally.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Equipment catalog refinement from a real multi-store field export (2026-11-16)

## What this is

Owner forwarded `Equipment.xlsx` — a QSRSoft maintenance-module export covering **26 stores,
408 real installed-equipment rows** (columns: Model [=equipment type name], Supplier
[=manufacturer], Model Number, Location [=store #], Equipment Type [all "Maintenance"], Name,
Serial Number, + ticket counts). This is genuinely independent ground truth — not a web search,
not a recollection — for every `equipment_catalog` entry added on 2026-11-16 as web-researched or
crew-added (see `src/app/changelog/5.802.js`, PRs #1951–#1953) and still carrying `flagged: true`
pending confirmation.

## What got updated (live Supabase writes, same posture as the original flagged entries)

**Field-confirmed manufacturer, notes updated in place (model number still not on file anywhere
in the export, so these stay `flagged: true`):**

| Type | Manufacturer | Evidence |
|---|---|---|
| `qing_oven` (both candidate rows) | Amana | On file at **all 26 sampled stores**, several with 2–3 units — matches the owner's own "usually 2-3 models" note exactly |
| `fcb` | Cornelius | On file at **all 26 sampled stores** (near-universal) — "Viper" specifically is still unconfirmed, the export carries no model string |
| `pie_merchandiser` (Prince Castle row) | Prince Castle | On file at 2 sampled stores (29760, 35242); no Carter-Hoffmann seen in that sample (that row is untouched, not disproven) |
| `fry_dispenser` (Automated Equipment row) | Automated Equipment | On file at store 35242 |
| `refrigeration` (Beverage-Air row) | Beverage-Air | On file at store 29760 ("BDAP Fridge"/"Prep Fridge"/"Nugget Freezer") — but that same store also runs Traulsen + H&K (see below), so this is one of ≥3 real brands, not the sole one |

**Real CONTRARY evidence, not deleted — flagged for owner to weigh:**

| Type | Manufacturer | What happened |
|---|---|---|
| `fry_dispenser` | Frymaster (SinBaD) | Zero-for-two in the real sample — the 2 stores with a Frozen Fry Dispenser on file show Franke and Automated Equipment, not Frymaster. Doesn't prove Frymaster is wrong fleet-wide, but it's real evidence against this specific guess; noted in the row, not removed. |

**Resolved from "(Unconfirmed)" placeholder to a real manufacturer:**

| Type | Before | After |
|---|---|---|
| `walk_in_cooler` | `manufacturer: "(Unconfirmed)"` — web search for Kolpak/Master-Bilt/Bally found no McDonald's tie | `Norlake` — real units on file at stores 29760, 35242 |
| `walk_in_freezer` | same placeholder | `Norlake` — same 2 stores |

**New rows added** (`source: 'field-survey'`, `flagged: true` — manufacturer is real, model is not on
file in the export for any of these):

- `fry_dispenser` / **Franke** (store 29760 — "Franke Frozen Fry Dispenser 1"). Franke already
  exists in this catalog as an `espresso_1step` manufacturer (SB1200/FM850), so a Franke fry-
  dispenser line for the same parent brand is plausible, not a new unrelated vendor.
- `refrigeration` / **Traulsen** (store 29760 — "Traulsen Fry Freezer").
- `refrigeration` / **H&K** (store 29760 — 5 real units: 2× "2 Drawer Cooler", "2 Drawer
  Fridge/Freezer", 2× "Wall Freezer" L/R, plus a "Chilled Rail" tagged manufacturer "H&K Dallas" —
  read as the same parent brand's regional/product-line label, not a 4th separate manufacturer).

So this fleet's real reach-in refrigeration runs **at least 3 brands** (Beverage-Air, Traulsen,
H&K) — the catalog started with only one, web-researched, unconfirmed.

## Real model-number variants observed (3 rows had a non-blank "Model Number" column — everything
else in the 408-row export left it blank)

Worth a look next time the owner is reconciling the catalog's model-level detail, not acted on
here (the existing catalog rows these are closest to may be genuinely different SKUs, not typos —
didn't want to silently "fix" either side without the real nameplate in hand):

| Real export (store 29760) | Real Model Number | Closest existing catalog entry |
|---|---|---|
| Sureshot Cream Dispenser (IntelliShot 2.0) | `AC116-V2PCL-1-D2` | `sweetener_creamer_dispenser` \| SureShot \| `AC110-V2PCC-1-D2` — close but not identical (110 vs 116, PCC vs PCL) |
| Satellite Brewers & Dispensers → "Orange Juice Machine" | `JDF-2S` | `juice_dispenser` \| BUNN \| `JDF-2` — likely the same family, `-S` suffix unconfirmed |
| Universal Rapid Toaster → "Muffin Toaster" | `RT-SB-NA-3PS` | `toaster` \| Prince Castle (Marmon) \| `IRT-MCD (... IRT-SB-NA-3PS)` — real tag drops the leading `I`, unconfirmed whether that's a meaningful distinction |

## Equipment types seen in the real export that are NOT in `CATALOG_TYPE_GROUPS` at all

Not added — adding a new TYPE means a `equipment-layout.js` code change (new icon/group) as well
as catalog rows, which is more of a product-scope call than a data-fill, and the owner's own
"I just want to be smart about this" framing on a related thread today reads as wanting to narrow
scope right now, not widen it. Listed here for when/if he wants to expand the catalog further:

| Type (as named in the export) | Manufacturer seen | Note |
|---|---|---|
| Marinator | Wells | Universal at the one store checked in detail — likely uses a chemical/marinade product, so could fit this catalog's consumable-gating purpose if added |
| Coffee Brewer | Bunn | Drip coffee — distinct from the already-cataloged McCafé espresso machines |
| Next Generation ITCB Tea Brewer | Bunn | |
| Satellite Brewers & Dispensers | Bunn | Same family as the Coffee Brewer row above, broader category name in the export |
| Hot Water Tank | State | Facilities-adjacent, not really a consumable-gated item |
| Heated Landing Zone (HLZ) | Frymaster | Post-fryer heated holding — could arguably fold into the existing `fryer` or `uhc` type rather than being its own |
| Outdoor Digital Menuboard | Coates | Technology-adjacent, no chemical/consumable angle |
| Oil Tanks/Pump | RTI | Relates to the separate VITO AG oil-filtration pilot (task #59) — different workstream, not equipment_catalog's WRIN-gating purpose |

Also present but clearly out of this catalog's scope (no manufacturer tracked at all in the real
export — doors, lights, menu-board controllers/monitors, KVS/HOTG/Kiosk components, POS terminals,
signage, parking-lot condition items): confirms these are facilities/IT checklist items, not
branded consumable-gated equipment, consistent with why `register`/`printer` (this catalog's own
Technology group) only ever had owner-stated brands, never anything from this kind of export.

## Scope note

`Equipment.xlsx` is a real per-store **physical inventory** (which unit sits in which store,
`equipment_survey_entries`' domain), not a **type×manufacturer×model reference list**
(`equipment_catalog`'s actual purpose, stated in its own schema header: gating consumable/WRIN
ordering). Used it here only to extract real manufacturer ground truth for catalog rows — did not
attempt to load it as survey data, since that would need per-store/per-unit placement decisions
this file doesn't carry (no coordinates, no `instance_id` concept) and is a separate, bigger
question already named as out of scope in `equipment-layout.js`'s own header comment.
