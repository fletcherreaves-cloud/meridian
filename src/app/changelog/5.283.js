// @ts-nocheck
export default {version:'5.283', date:'2026-08-31', changes:[
  'EOM Recount Impact -- new "Cross-Store Inconsistency" section (Recount Impact report + SAGE\'s ' +
  'query_eom_recount_impact tool): flags an item that was recounted at multiple stores THIS period ' +
  'with SOME recounts moving it toward zero and OTHERS moving it away. Same item, same period, ' +
  'inconsistent outcomes across stores is the signature of a crew-technique or unit-of-measure gap ' +
  'at specific stores, not independent counting error -- real example that motivated this: Chicken ' +
  'McNuggets, July close window, four stores recounted it and it got worse (Defuniak/Bonifay/' +
  'Tecumseh/Atoka, $1,649 combined), two stores recounted the identical item and it helped ' +
  '(Ardmore-Broadway/Ardmore-Cooper). New engine function crossStoreRecountConsistency() ' +
  '(eom-ledger-baseline.js) re-groups the SAME flat recounted-items list both consumers already ' +
  'build -- no second grading, no new pull. Scoped to the caller\'s own visible stores (SAGE\'s ' +
  'per-user restriction included), so a restricted user never sees another store\'s figures leak in.',
  'EOM Inventory -- a second, deeper fix for the "same recount items keep showing up" family of ' +
  'reports: qsr_onhand is upsert-only (never deleted), so when QSRSoft stops returning a WRIN in a ' +
  'store\'s On-Hand Report response (deactivated / dropped from the roster), that item\'s row just ' +
  'stops getting refreshed while every other item in the same pull keeps updating -- no deactivation ' +
  'text ever arrives, so the earlier descr-based fix (v5.280) can\'t catch it. Real example (owner- ' +
  'reported live): Durant\'s Fried Apple Pie / Honey Brown Butter Sce Nat Flv sat 15+ days stale with ' +
  'no deactivation marker at all, while the rest of the store refreshed same-day. diagnoseIncompleteCount() ' +
  'now compares each item\'s own updatedAt against the STORE\'s own freshest pull (same period) -- an ' +
  'item that falls materially behind its own store\'s current pull reads as likely-dropped, routing to ' +
  'the calm "verify & clear" bucket instead of "recount now." Live-calibrated (3 stores, 2026-08-31): ' +
  '90-96% of a store\'s items refresh within 1 day of each other; the stale tail is overwhelmingly ' +
  'already-deactivated items. Relative to the store\'s OWN pull, so a store-wide pull outage (everything ' +
  'stale together) never false-triggers this.',
  'Also fixed: scripts/qsrsoft-onhand-pull.mjs\'s toEngineRows() -- shared by the emailed EOM digest ' +
  'and the on-demand notification-resend script -- was silently dropping both `active` and `updated_at` ' +
  'on the DB-row-to-engine-row mapping, which made EVERY deactivation signal (this one and the earlier ' +
  'descr-text one) inert for those two server-side paths even though the in-app dashboard already had ' +
  'both. Brought in line with the browser-side loader (src/lib/supabase.js\'s loadQsrOnHand()).'
]};
