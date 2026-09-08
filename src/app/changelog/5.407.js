// @ts-nocheck
export default {version:'5.407', date:'2026-09-08', changes:[
  'qsr_raw_item_detail now MERGES new pulls into what\'s already stored instead of blindly ' +
  'replacing it. Owner: "the data in raw item detail persists on my end in QSRSoft. No reason ' +
  'we can\'t keep this data in check as new pulls come in. Only overwrite what\'s changed -- in ' +
  'the event of an edit to an inventory count."',
  'The gap: raw_detail is only re-fetched for that day\'s top-50 actionable (|$|>=50) WRINs per ' +
  'store. An item that drops out of the top-50 for a few days and re-enters used to have its ' +
  'whole stored history overwritten by whatever a single day\'s fetch returned, with no trace ' +
  'that anything happened while it was excluded.',
  'mergeRawItemHistory() (eom-parsers.js) unions the existing stored history with the freshly-' +
  'mapped incoming one, keyed per-event (sourceId+source+dt+tm -- QSRSoft reuses one sourceId ' +
  'across a count and its paired auto pos_sales adjustment, confirmed on a live capture, so ' +
  'sourceId alone would collide two different events). An existing event the new fetch doesn\'t ' +
  'include is kept; an incoming event sharing a key still wins, so a QSRSoft-side edit to a ' +
  'historical count is picked up.',
  'qsrsoft-variance-pull.mjs now does one batched existing-history read per store (not per item) ' +
  'before the upsert, merges each item\'s history through mergeRawItemHistory(), and writes the ' +
  'union. 5 new regression tests (eom-parsers.test.js). Full suite 4648/4648, build clean, ' +
  '538.02 KB / 850 KB budget.',
]};
