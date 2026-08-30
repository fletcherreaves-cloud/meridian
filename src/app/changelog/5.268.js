// @ts-nocheck
export default {version:'5.268', date:'2026-08-30', changes:[
  'EOM Diagnosis -- stopped flagging deactivated/zeroed WRINs as needing a recount. ' +
  'diagnoseIncompleteCount() classified an item purely by its last-counted date, with no notion ' +
  'of whether it is genuinely deactivated -- a WRIN counted this period but before the final ' +
  'window lands in state \'early\' regardless of substance, so a deactivated item with $0 on hand ' +
  'and 0 units still surfaced as "counted early, needs a recount." Real case: store 43380, WRIN ' +
  '02373-015 (APPLES/DICED) -- deactivated + zeroed in QSRSoft, last counted before the window, ' +
  'flagged at $0 value-at-risk with nothing to physically recount. Never/early items with $0 ' +
  'on-hand AND 0 units are now dropped from the uncounted/action set. `stale` is unaffected -- ' +
  'that is the Obsolete/Discontinued/Inactive "verify & clear" bucket, which exists specifically ' +
  'to catch a zeroed residual so the store can go deactivate it in QSRSoft.' +
  '\n\n' +
  'Suite 3407/3415 passing (the 8 failures are a pre-existing, unrelated Supabase-outage ' +
  'timeout -- HTTP 522 -- reproduced identically on unmodified main), build clean ' +
  '(526.84 KB gzip eager, within 850 KB budget).'
]};
