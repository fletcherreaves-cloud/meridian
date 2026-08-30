// @ts-nocheck
export default {version:'5.267', date:'2026-08-30', changes:[
  'EOM Digest -- dispatch #224: per-store FOB+components, recount opportunities, and a new ' +
  'Operator rollup tier, in both the app (EOM Dashboard -> EOM Digest modal) and the emailed ' +
  'roll-up (District/Patch/Market/Operator).' +
  '\n\n' +
  '- Operator plumbing (src/constants.js): operatorGroups()/setLiveOperators()/operatorOf(), ' +
  'mirroring supervisorGroups()\'s flat-map half (no effective-dated timeline -- the live Supabase ' +
  'shape has no per-operator start-dating). Live-synced in App.js and scripts/eom-digest-send.mjs\'s ' +
  'bootstrapLiveOrg() from the same already-fetched org_config row supervisorGroups() already uses.' +
  '\n\n' +
  '- buildEomDigest() (src/engine/eom-digest.js) gets a 4th level, \'operator\', grouping by each ' +
  'row\'s operator field with the same UNASSIGNED_KEY never-drops-a-store contract as patch/org. ' +
  'Every per-store output also carries fobComps (promoted from fobTarget.comps -- buildStoreFobReport() ' +
  'reused, never re-derived) and recountItems (diagnoseIncompleteCount()\'s uncounted[], re-filtered ' +
  'to state !== \'stale\' here as the single authoritative gate so the exclusion holds even if a ' +
  'caller forgets to filter -- decision 3: never/early recount opportunities only, stale residuals ' +
  'stay in the separate Obsolete/Discontinued/Inactive report).' +
  '\n\n' +
  '- App (EOM Dashboard): 4th "Operator" level tab + scheduled-send checkbox; each rollup group\'s ' +
  'stores are individually expandable to the full 5-column FOB+components table (Component | Actual ' +
  '$ | Actual % | Target % | delta) and a WRIN/Description/Class/$-at-risk recount-opportunities ' +
  'list -- full detail at every level, no leaner variant for a large District group (decision 2). ' +
  'Both new tables scroll horizontally on mobile (overflowX:auto).' +
  '\n\n' +
  '- Email (scripts/lib/eom-digest-notify.mjs + eom-digest-send.mjs): the same per-store table/list ' +
  'renders inside each (level, group) email, looping over every store. fobComponentsTableHtml() was ' +
  'extracted out of resend-notify.mjs\'s fobSectionHtml() so both the single-store #213 email and ' +
  'this roll-up reuse one table renderer. eom-digest-send.mjs now also loads raw qsr_onhand rows ' +
  '+ count-date exceptions per store (net-new for this script) to compute recountItems server-side; ' +
  '\'operator\' joins district/patch/org as a real on-demand + scheduled level.' +
  '\n\n' +
  'Suite 3439/3447 passing locally (the 8 remaining failures are pre-existing, confirmed unrelated ' +
  'to this dispatch by reproducing them against the pre-dispatch commit); build clean, eager payload ' +
  '526.91 KB gzip vs 526.81 KB before (budget 850 KB) -- the bulk of this work lives in the ' +
  'already-lazy EOM Dashboard panel, so the eager entry barely moved. Live Supabase was unreachable ' +
  'from this session\'s sandbox during the build (Cloudflare 522 origin timeout, reproduced twice ' +
  'with a plain curl + the anon key, independent of any credential) -- the dispatch\'s live-data ' +
  'verification bullets (27-store operator sum, hand-verified recount items against real data) could ' +
  'not be run this session; the operator-groups math and the stale-exclusion gate are instead proven ' +
  'via unit tests (constants.js\'s own DEF_SETTINGS.operators seed, and buildEomDigest()\'s real ' +
  'engine output) and a full React render test exercising the real EOMDashboardPanel modal chain.'
]};
