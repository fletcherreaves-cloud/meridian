// @ts-nocheck
export default {version:'5.300', date:'2026-09-01', changes:[
  'Third piece of today\'s weekly-count automation (owner req): "I would like to see the share ' +
  'link expanded to work with weekly counts." The Count Cycle tab (Inventory Control) gets a ' +
  '"🔗 Share" button on every store card -- creates a read-only, no-login link to that store\'s ' +
  'compliance status (open exceptions, session history, active-item-universe coverage), same UX ' +
  'as the existing EOM share button.',
  'Reuses the EXISTING eom_share_links table and eom-share Supabase Edge Function verbatim -- no ' +
  'schema change, no redeploy (this session has no SUPABASE_ACCESS_TOKEN, so deploying an edge ' +
  'function isn\'t even possible from here; the design was chosen specifically to not need one). ' +
  'The one thing that tells a Count Cycle link apart from an EOM link is its `period` shape: ' +
  'count-cycle-panel.js\'s new createWeeklyShare() stores `wk:YYYY-MM-DD`, which can never match ' +
  'the `/^\\d{4}-\\d{2}$/` a real EOM period always has. eom-share-view.js (the public viewer page) ' +
  'checks that shape and skips the EOM-only "refresh" action for a Count Cycle link -- that action ' +
  'queries qsr_fob/qsr_onhand by a MONTHLY date range, which would be meaningless (and untested) ' +
  'against a non-monthly period string. A Count Cycle link shows a plain static snapshot instead, ' +
  'with its own "Count Cycle · view-only" badge in place of "EOM report · view-only".',
  'New formatWeeklyComplianceReport() (src/engine/count-cycle.js) renders one store\'s ' +
  'cycleCompliance() row to markdown -- status, exceptions, session-by-session evidence, and the ' +
  'active-item-universe coverage table -- reusing the exact same wording StoreCard already shows ' +
  'on screen so the shared link can never disagree with the in-app card.',
]};
