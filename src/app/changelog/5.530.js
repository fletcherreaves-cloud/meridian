// @ts-nocheck
export default {version:'5.530', date:'2026-10-12', changes:[
  'Restaurant Profiles (StoreKBEditor): Store Format dropdown updated -- removed "Dessert Kiosk" ' +
  '(not a real format in this org\'s footprint); added "Gas Alliance", "Special Point of ' +
  'Distribution (SPOD)", and "Walmart" as real non-traditional formats.',
  'NEW "Layout & Equipment" section on the Profile tab -- DT Layout, Service Area Layout, ' +
  'Beverage, and Production Area Layout -- modeled directly off Store VLH Config ' +
  '(store_vlh_config), which already carries this exact physical-layout detail per store.',
  'Auto-pulled wherever Store VLH Config has a real value for that store: DT Layout <- dt_type, ' +
  'Beverage <- in_store, Production Area Layout <- kitchen, Service Area Layout <- coffee. A ' +
  '📡 "Store VLH Config" badge marks a field as auto-filled-but-not-yet-confirmed; picking a ' +
  'different option overrides it like any manual field, and the badge clears for real once Save ' +
  'is clicked (the resolved value becomes the real saved answer, not just a displayed default). ' +
  'A store with no Store VLH Config row on file degrades cleanly to plain manual selection -- no ' +
  'crash, no silently-blank field.',
  'Option labels reuse VLH_DT_TYPES/VLH_IN_STORE/VLH_KITCHEN verbatim from constants.js (same ' +
  'vocabulary as the Store VLH Config panel itself, by construction -- not duplicated and liable ' +
  'to drift); Service Area Layout restates VLH_COFFEE\'s same 4 real values under shorter ' +
  'wording (None/BDAP/McCafe/BDAP + McCafe).',
  '5 new rendered-component tests on the real StoreKBEditor (standing "verification must touch ' +
  'the call site" rule) -- caught and fixed a real gap along the way: Save was persisting the ' +
  'resolved auto-pulled value to storage correctly, but never mirrored it back into the ' +
  'on-screen draft, so the "not yet confirmed" badge stayed stuck even after a successful save.',
  'Also noted in passing, NOT fixed here (queued as a separate task): the existing Store VLH ' +
  'Config panel (Data Manager → ⚙) looks up store_vlh_config by the PADDED loc format, but the ' +
  'table itself stores loc unpadded (measured live) -- its dropdowns likely show defaults ' +
  'instead of real saved values, and saving through it risks creating duplicate rows. This ' +
  'change\'s own auto-pull reads the table correctly, via the already-normalized ' +
  'loadVlhStoreConfigs() loader -- the two are unrelated code paths.',
]};
