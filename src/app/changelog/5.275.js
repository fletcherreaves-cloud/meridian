// @ts-nocheck
export default {version:'5.275', date:'2026-08-31', changes:[
  'FOB target chips (EOM Dashboard\'s FobStrip + the EOM Share view\'s FobStripLite) were reading ' +
  '`DEFAULT_TARGETS` (src/constants.js) alone -- a hardcoded snapshot baked into the JS bundle at ' +
  'build time that never reflects a fresh Monthly Targets workbook upload. Found live 2026-08-30: ' +
  'Tishomingo\'s real August FOB target (uploaded 2026-08-26, monthly_targets table) is 3.95%; the ' +
  'chips were showing a stale 4.00% seed, and 5 of 7 FOB fields differed the same way. The only ' +
  'place that already resolved this correctly was the server-side EOM Digest email pipeline ' +
  '(resolveFobTargets() in qsrsoft-onhand-pull.mjs) -- nothing client-side did.' +
  '\n\n' +
  'Fixed both surfaces, same monthly_targets-only scope resolveFobTargets() already uses (not the ' +
  'full 4-tier company/state/patch/store cascade review-engine.js\'s mergedTargetsForLocMonth ' +
  'resolves -- that tier isn\'t what a mid-month workbook upload edits, and pulling that heavier ' +
  'transitive graph into either surface was already judged out of scope once before, #213/v5.255):' +
  '\n' +
  '- EOM Dashboard\'s FobStrip: EOMDashboardPanel now loads monthly_targets for the selected period ' +
  '(loadMonthlyTargets(), already tXxx-shaped) and spreads it over DEFAULT_TARGETS[loc].' +
  '\n' +
  '- EOM Share view\'s FobStripLite: this is a public no-login page with no Supabase session, so ' +
  'the override is resolved SERVER-SIDE -- the eom-share edge function\'s new ' +
  'fetchMonthlyTargetOverride() (service-role read, mirrors resolveFobTargets()\'s exact field ' +
  'list) now returns `monthlyOverride` alongside both the frozen-snapshot and live-refresh ' +
  'responses; the client spreads it over DEFAULT_TARGETS the same way.' +
  '\n\n' +
  '**Requires a redeploy: `supabase functions deploy eom-share --no-verify-jwt`.**' +
  '\n\n' +
  'New test proves the override wins over the hardcoded seed for both the FOB tile and a component ' +
  'tile (would fail if reverted to reading DEFAULT_TARGETS alone).'
]};
