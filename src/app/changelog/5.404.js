// @ts-nocheck
export default {version:'5.404', date:'2026-09-08', changes:[
  'Fixed a real, live-confirmed bug: EOM Item Journeys (and everything built on it — the Swing ' +
  'Ledger, and the "recreate missing products" shortage detector) was showing every count ' +
  'variance BACKWARDS -- shortages labeled as overages and vice versa, with the $/unit signs ' +
  'flipped to match. Root cause: QSRSoft\'s own raw_detail/{itemId} API returns its ' +
  '`variance`/`difference` fields sign-inverted relative to every other QSRSoft report of the ' +
  'same number (confirmed against qsr_variance_stat and against QSRSoft\'s own Variance ' +
  'Stat/Yields screen, for the same store/item/period) -- Meridian was passing that field ' +
  'straight through with no correction.',
  'Found by the owner comparing Meridian\'s Item Journeys panel side-by-side against QSRSoft\'s ' +
  'own report for Madill (loc 13113) and noticing every sign was flipped. Verified three ' +
  'independent ways (physical on-hand math, qsr_variance_stat, and the QSRSoft UI itself) on ' +
  'two different items before fixing it.',
  'mapRawItemHistory() (eom-parsers.js) now negates variance/difference at the single point ' +
  'every consumer reads through, so Item Journeys, the Swing Ledger, and the missing-product ' +
  'reconstructor all correct at once. 2 new regression tests using the real captured numbers ' +
  '(eom-parsers.test.js). Full suite 4634/4634, build clean.',
  'Historical qsr_raw_item_detail rows for the current period self-heal on the next daily ' +
  'variance pull (10:30 UTC) -- that table only carries the top-50 actionable WRINs per store ' +
  'for the CURRENT EOM period and is fully overwritten on every pull, so no manual backfill is ' +
  'needed.',
]};
