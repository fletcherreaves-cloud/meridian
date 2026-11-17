# Equipment Catalog: HVAC / Remote Condenser / Exhaust Fan types (2026-11-17)

Owner attached a photographed table listing manufacturers for 5 equipment types and asked for
additional manufacturers/models to be researched and pre-loaded:

| Equipment Type | Owner's photographed manufacturers |
|---|---|
| HVAC | Lennox, Rheem, Trane |
| MAC (Walk In Cooler and Freezer) | Norlake |
| Remote Condenser (Rooftop) | Cornelius, Multiplex (Pentair Commercial Ice), Manitowoc, Scotsman |
| Exhaust Fan (Grills/Fryers) | Accurex |
| Restroom Exhaust Fan | *(blank — nothing listed)* |

## What shipped

- `src/views/equipment-layout.js`'s `CATALOG_TYPE_GROUPS`: 4 new catalog types (34 real types +
  the 2026-11-17 `other` catch-all = 35 -> 39). "MAC" maps onto the two EXISTING types
  `walk_in_cooler`/`walk_in_freezer` rather than a new type — no new type needed there, just new
  manufacturers.
  - `hvac` (Facilities group) — rooftop packaged HVAC unit.
  - `remote_condenser` (Refrigeration group, right after `ice_machine`) — the rooftop condensing
    unit for a split/remote ice machine; a physically separate, separately-serviced component
    from the ice-machine head itself.
  - `exhaust_fan_cooking` (Facilities group) — the rooftop fan that pulls air through the cooking
    line's exhaust hood; distinct equipment from the hood/canopy (`exhaust_hood`, pre-existing).
  - `exhaust_fan_restroom` (Facilities group) — a restroom's own small ceiling exhaust fan;
    distinct from the kitchen fan (different size class, different manufacturers entirely).
- `scripts/data/equipment-catalog-seed-mechanical.json` — 31 new `equipment_catalog` rows across
  these types, `source: 'official'` (via `seed-equipment-catalog.mjs`'s default), flagged:false.
  Run `node scripts/seed-equipment-catalog.mjs equipment-catalog-seed-mechanical.json` once the
  owner has reviewed this list, same as every other seed file in that directory.
- `src/__tests__/equipment-catalog-seed-mechanical.test.js` — structural validation, same
  convention as `equipment-catalog-seed-fryers.test.js`.
- `src/__tests__/equipment-layout.test.js` — type-count ratchet updated 35 -> 39.

## Provenance note — this seed is NOT from a single internal reference PDF

Every other `equipment-catalog-seed-*.json` file (fryers, UHC, combi ovens, etc.) was
hand-transcribed from a real manufacturer reference PDF already on file in
`data/equipment-survey/Help Files/`. No such PDF exists for HVAC/remote-condenser/exhaust-fan
equipment. This seed's manufacturer/model-line names instead came from the owner's own
photographed table (for the 4 manufacturers it names) plus live web research for everything else,
run via 5 parallel research passes, one per equipment type, each required to find REAL
manufacturer-published model/series names rather than invent any. `item.sourceDoc` on every row
says which (owner table vs. web research) and names the general research basis; this file is the
place to look up the specific citations below if that's ever needed.

### HVAC (Lennox / Rheem / Trane confirmed by owner photo; Carrier added)
- Lennox: Raider, Landmark, Energence (light-commercial rooftop lines) — Lennox product pages +
  trade-press coverage. Model L/LGM/LCM and Enlight also turned up in research but were not
  carried into the seed file (kept the list to verified, clearly-named lines).
- Rheem: Commercial Classic (RACCZR/RGECZR/RHPCZR), Commercial Prestige (RACCZT/RGECZT/RHPCZT) —
  Rheem commercial packaged rooftop product line.
- Trane: Precedent, Voyager (light/standard commercial rooftop lines) — Trane product pages.
  Foundation and Impack also surfaced in research but weren't carried into the seed (same reason).
- Carrier (added, not on owner's photo): WeatherMaker 48/50FC(Q), WeatherExpert 48/50LC — Carrier
  commercial rooftop product line. Note: naming across Carrier press releases vs. current product
  pages (48/50LC vs 48LC/50LCH) wasn't fully reconciled — treat as directionally correct series
  names, not verified exact current SKUs.

### MAC / Walk-In Cooler & Freezer (Norlake confirmed by owner photo; Kolpak, Master-Bilt added)
- Norlake: Kold Locker walk-in panel system — Norlake product line.
- Kolpak: Quick Ship walk-in panel system (P7-Series) — Kolpak product line.
- Master-Bilt: Quick Ship walk-in cooler/freezer — Master-Bilt product line.
- Checked but NOT added: Bally Refrigerated Boxes has no documented named model line (just
  generic "modular foamed-in-place panel" branding) — nothing concrete to seed. American Panel
  and Imperial were not researched this pass; a follow-up search would be needed to add them.

### Remote Condenser / Rooftop (Cornelius / Multiplex / Manitowoc / Scotsman confirmed by owner photo; Ice-O-Matic added)
- Cornelius: RCN Series remote condenser (RCN1061/RCN2061/RCN3061) — Cornelius/distributor
  product pages (webstaurantstore.com, restaurantsupply.com).
- Multiplex (Pentair Commercial Ice): IceCore remote chiller/remote condenser — a real Multiplex
  product (kitchenrestock.com). Could not independently confirm a Pentair↔Multiplex corporate
  relationship via search — the "(Pentair Commercial Ice)" qualifier is the owner's own sourced
  annotation from his photo, not independently re-verified.
- Manitowoc: QuietQube/RCUF remote condensing unit, Indigo NXT remote-cooled line —
  howdybrewer.com, icemachinesplus.com.
- Scotsman: Prodigy Plus C-Series remote condenser models, ECC/ERC remote condensing unit —
  restaurantstore.me, scotsman-ice.com spec sheet.
- Ice-O-Matic (added, not on owner's photo): RC-series remote condenser for -R model ice-machine
  heads — chefsdeal.com.
- Hoshizaki kept appearing in remote-condenser contexts across searches but no specific model line
  was pulled — worth a follow-up if Hoshizaki should be added too.

### Exhaust Fan — Grills/Fryers (Accurex confirmed by owner photo; Greenheck/CaptiveAire/Loren Cook/PennBarry added)
- Accurex: XCUE roof upblast/sidewall centrifugal fan, XRUD Vari-Green direct-drive upblast fan —
  Accurex product line.
- Greenheck: CUBE/CUBE-HP/CUBE-XP centrifugal upblast series — Greenheck product line.
- CaptiveAire: DU direct-drive upblast exhaust fan — CaptiveAire product line (only "DU" was
  confirmed via a catalog URL; worth a direct catalog check for more precision if needed).
- Loren Cook (added, not carried into seed beyond this note): ACRU upblast exhaust fan, VCR
  UL-listed restaurant exhaust fan.
- PennBarry/Twin City Fan (added, not carried into seed beyond this note): BCRUR centrifugal
  upblast kitchen roof exhauster.

### Restroom Exhaust Fan (blank on owner's photo — researched from scratch)
- Broan: LoSone Select high-capacity ceiling exhaust fan (L100/L150E/L200/L250E/L300) —
  broan-nutone.com product pages.
- NuTone: LoSone Select L300 high-capacity ceiling exhaust ventilator — steinerelectric.com.
- Greenheck: SP-B series bathroom exhaust fan (SP-B80-QD/SP-B200-QD) — greenheck.com.
- Fantech: COM200-300-400-500 commercial bath fan — supplyhouse.com.
- Checked but NOT added: Panasonic's WhisperCeiling/WhisperGreen Select/WhisperValue lines came
  up as primarily residential-grade in search results — no distinct commercial restroom series
  was found, so left off rather than guess a commercial line that isn't documented.

## Open follow-ups (not blocking, not done this pass)
- American Panel, Imperial (walk-in panel manufacturers) — not researched.
- Hoshizaki remote condenser model line — mentioned repeatedly but no specific line pulled.
- Loren Cook / PennBarry — researched but not carried into the actual seed file (Accurex,
  Greenheck, CaptiveAire judged sufficient initial coverage); add later if the owner wants more
  exhaust-fan manufacturer options.
