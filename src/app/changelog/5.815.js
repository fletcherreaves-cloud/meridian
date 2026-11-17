// @ts-nocheck
export default {version:'5.815', date:'2026-11-17', changes:[
  '**Equipment catalog: 4 new mechanical equipment types + manufacturer/model pre-loads ' +
  '(owner request).** Owner attached a photographed table of manufacturers for HVAC, MAC (Walk ' +
  'In Cooler/Freezer), Remote Condenser (Rooftop), and Exhaust Fan (Grills/Fryers), plus asked ' +
  'for research into additional manufacturers/models and a Restroom Exhaust Fan option that had ' +
  'no manufacturer listed at all. Added 4 new `CATALOG_TYPE_GROUPS` entries to the Layout ' +
  'Planner/equipment survey (34 real types + the `other` catch-all = 35 -> 39): `hvac`, ' +
  '`remote_condenser` (the rooftop condensing unit for a split ice machine — a separate, ' +
  'separately-serviced component from the ice-machine head), `exhaust_fan_cooking` (the ' +
  'rooftop fan pulling air through the cooking-line hood — distinct from the hood/canopy ' +
  'itself), and `exhaust_fan_restroom` (a restroom\'s own small ceiling fan — distinct ' +
  'equipment entirely from the kitchen fan). "MAC" needed no new type — it maps onto the ' +
  'existing `walk_in_cooler`/`walk_in_freezer` types, just new manufacturers. Pre-loaded 31 ' +
  'real manufacturer/model-line rows (`equipment-catalog-seed-mechanical.json`) covering every ' +
  'manufacturer from the owner\'s photo plus researched additions (Carrier, Kolpak, ' +
  'Master-Bilt, Ice-O-Matic, Greenheck, CaptiveAire, Loren Cook, Broan, NuTone, Fantech) — real ' +
  'manufacturer-published model/series names verified via web research since no internal ' +
  'reference PDF exists for these equipment categories (unlike the grill/fryer/UHC/etc. seeds). ' +
  'Full per-manufacturer source notes: memory/finding-equipment-catalog-mechanical-types-' +
  '2026-11-17.md. Run `node scripts/seed-equipment-catalog.mjs equipment-catalog-seed-' +
  'mechanical.json` to load these rows once reviewed.',
]};
