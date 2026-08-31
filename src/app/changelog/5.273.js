// @ts-nocheck
export default {version:'5.273', date:'2026-08-30', changes:[
  'EOM Share edge function -- fixed a real live-refresh bug found while verifying v5.272\'s FOB ' +
  'chip restyle. All 7 tables the "🔄 Refresh" action reads (qsr_fob, qsr_onhand, ' +
  'qsr_variance_stat, qsr_raw_item_detail, qsr_waste, qsr_transfers, eom_count_exceptions) store ' +
  '`loc` zero-padded to the 7-char QSRSoft NSN convention (e.g. "0043380"), but ' +
  '`eom_share_links.loc` is stored unpadded ("43380") and the refresh action queried every one of ' +
  'those tables with the unpadded value -- silently matching ZERO rows, every time, for every ' +
  'share link. So the live-refresh banner never flipped from "As-sent snapshot" to "Live" for ' +
  'anyone; it always silently fell back to the frozen snapshot with no visible error. ' +
  '`supabase/functions/eom-share/index.ts` now pads `loc` before querying, matching the same ' +
  '`String(loc).padStart(7,\'0\')` convention already used client-side (src/lib/supabase.js).' +
  '\n\n' +
  'Verified against LIVE production data (not mocked): before the fix, a real curl to the ' +
  'refresh action for a real share token returned 0 rows on all 7 tables; querying qsr_fob ' +
  'directly with the padded loc returned 30 real August rows whose prod_sales_amt ($169,900.54) ' +
  'exactly matches the frozen snapshot already shown on that same link -- confirming the padded ' +
  'query pulls the correct store\'s real data, not a coincidental match.' +
  '\n\n' +
  '**Requires a redeploy: `supabase functions deploy eom-share --no-verify-jwt`** (the third for ' +
  'this function today -- v5.272\'s redeploy fixed the frozen-snapshot `loc` gap; this fixes the ' +
  'separate live-refresh loc-padding bug found immediately after, verifying that fix in production).'
]};
