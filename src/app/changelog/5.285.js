// @ts-nocheck
export default {version:'5.285', date:'2026-08-31', changes:[
  'EOM Share/MBI report -- a third instance of the missing active/updatedAt field-mapping bug ' +
  'v5.283 fixed for the emailed-digest path, this time in the report the owner actually reads: the ' +
  'public Share-link view (supabase/functions/eom-share/index.ts\'s live-refresh onHand mapper, plus ' +
  'src/engine/eom-report-build.js\'s shapeOnHand() -- the single builder both the EOM Dashboard and ' +
  'the Share view call) was dropping both fields before diagnoseIncompleteCount() ever saw them, so ' +
  'its droppedFromCurrentPull() signal could never fire for a share-link report even after v5.283. ' +
  'Real example (owner-reported live, Ada-Country Club): Fried Apple Pie [00076-126] hasn\'t had its ' +
  'qsr_onhand row touched since 2026-08-20T13:40Z while the store\'s freshest on-hand row is ' +
  '2026-08-31T14:37Z -- an 11-day gap, live-confirmed via service-role query -- yet the Share report ' +
  'kept listing it "counted early (last 2026-08-13)" and recommending an active recount instead of ' +
  'the calm "verify & clear" framing. The in-app EOM Dashboard was unaffected (it calls ' +
  'diagnoseIncompleteCount() directly on the browser loader\'s rows, which already carried both ' +
  'fields) -- this only showed up in the shared/MBI report. Needs an eom-share redeploy.'
]};
