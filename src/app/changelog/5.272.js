// @ts-nocheck
export default {version:'5.272', date:'2026-08-30', changes:[
  'EOM Share view -- FOB chip strip restyled to match the header-chip convention already used ' +
  'elsewhere in the app (EOM Dashboard\'s own store-message draft, FobStrip in eom-dashboard.js): ' +
  'each component\'s actual % is now the bold, primary headline, the $ amount is secondary, and ' +
  'the vs-target delta (e.g. "+0.15pp (tgt 2.00%)") is shown alongside -- previously the $ amount ' +
  'was primary and there was no target comparison at all. Reuses fobComponentDeltas() ' +
  '(eom-diagnosis.js, already in this view\'s bundle via buildEomReport()) for the same actual-%/' +
  'target-%/delta-pp math the dashboard\'s own diagnosis report uses -- no second copy of that ' +
  'formula. A store with no seeded DEFAULT_TARGETS entry still shows percent/dollar, just no ' +
  'target line (graceful degradation).' +
  '\n\n' +
  'Fixed a real gap found while wiring this: the eom-share edge function\'s DEFAULT (frozen-' +
  'snapshot) response never returned `loc` at all -- only the LIVE-refresh branch did -- so a ' +
  'target lookup keyed on the store\'s loc had nothing to key on before the live refresh landed. ' +
  '`supabase/functions/eom-share/index.ts` now returns `loc` on both branches. ' +
  '**Requires a redeploy: `supabase functions deploy eom-share --no-verify-jwt`** -- not run this ' +
  'session, flagging as the one manual step still needed for the frozen-snapshot path to carry ' +
  'targets immediately on load (the live-refresh path, which fires automatically a moment after ' +
  'load, already worked without the redeploy).' +
  '\n\n' +
  'New tests: a real render of EomShareView -> FobStripLite off the frozen-snapshot path (live ' +
  'refresh mocked to fail, proving the chips work from `data.loc`, not just `live.loc`), and the ' +
  'no-target graceful-degradation case.'
]};
