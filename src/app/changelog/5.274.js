// @ts-nocheck
export default {version:'5.274', date:'2026-08-30', changes:[
  'Dispatch #226 -- SAGE tool `query_eom_recount_impact`: answers "how did stores that recounted ' +
  'their EOM items impact their final FOB and food cost" -- the exact question SAGE previously ' +
  'answered by wrongly claiming this data doesn\'t exist. It does: `src/engine/eom-ledger-' +
  'baseline.js` already implements the honest methodology (same-store, same-item, session-count ' +
  'vs final-count within the EOM close window -- never a between-store comparison, which would be ' +
  'confounded by self-selection). The new tool reuses that engine verbatim via a real cross-' +
  'boundary Deno import from supabase/functions/sage-chat/index.ts into src/engine/ -- the first ' +
  'edge function in this repo confirmed able to do that (verified with a real Deno 2.2.7 binary, ' +
  'not assumed), so SAGE and the in-app EOM Dashboard Change Monitor can never drift on this data. ' +
  'RBAC-scoped via the existing applyScope pattern. Ships with an explicit, always-stated caveat: ' +
  'this measures FOB (inventory variance) impact only -- total food cost % / "Base Food %" is not ' +
  'present anywhere in Meridian\'s data model, and the tool says so rather than implying coverage.' +
  '\n\n' +
  'Also added (Task 4, optional): `formatRecountReport()` in eom-ledger-baseline.js -- a pure ' +
  'formatter of the SAME ledgerScopeDiff() output the Change Monitor panel and this SAGE tool both ' +
  'already compute, wired to a new "📋 Copy report" button on the Change Monitor\'s ledger-diff view.' +
  '\n\n' +
  'Verified against LIVE data: qsr_raw_item_detail for 2026-07 (695 rows, confirmed via service-' +
  'role read), run through the real tool logic under Deno -- 27 stores, 6 improving / 2 worsened / ' +
  '1 mixed / 18 no-action, $7,584 moved toward zero, $3,904 away, net +$3,679. RBAC check with a ' +
  'restricted accessible_locs correctly returned only that store\'s row with district totals still ' +
  'full-scope. Full suite 3465/3465 passing (fresh npm ci -- no missing-package artifacts). Build ' +
  'clean, 527.29 KB gzip eager (budget 850 KB, unchanged from v5.273 -- backend-only addition).' +
  '\n\n' +
  '**Requires a manual redeploy, not run this session:** `supabase functions deploy sage-chat ' +
  '--no-verify-jwt`.'
]};
