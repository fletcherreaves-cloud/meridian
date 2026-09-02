// @ts-nocheck
export default {version:'5.329', date:'2026-09-02', changes:[
  'Pricing Engine: new "🏷️ Menu Prices" tab -- the first UI consumer of qsr_menu_price_comparison ' +
  '(v5.324 shipped the pull only). Default view: average delivery premium by store, dollar-weighted ' +
  'across every item with a distinct delivery price, highest first -- answers "which stores mark up ' +
  'delivery the most" at a glance. Search an item and see its per-store price detail (in-store/ ' +
  'eat-in/takeout/delivery + delivery premium %), sorted highest price first -- a cross-store pricing ' +
  'consistency check (the same Hamburger currently ranges $1.99-$2.59 across the district).',
  'Reads a rolling 7-day window (not the panel\'s own history Range picker) since this is a ' +
  'current-state config snapshot re-pulled daily, not a metric to trend -- same treatment Storewide ' +
  'Controls got. "Latest" is taken per-store (each store\'s own most recent pull date), so one ' +
  'store\'s later-landing pull never drops another store\'s already-current snapshot.',
  'Full suite (3718 tests) and build both clean (533.09 KB / 850 KB eager budget). Smoke-tested via ' +
  'dev server + headless Chromium, zero JS errors.',
]};
