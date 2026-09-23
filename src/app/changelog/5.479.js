// @ts-nocheck
export default {version:'5.479', date:'2026-09-23', changes:[
  'Startup: batched 5 redundant Supabase user_settings reads into 1. loadUserSetting(key) paid ' +
  'its own auth.getUser() round trip + its own single-row select PER CALL, and App.js\'s ' +
  'startup T2 tier called it 5 times in the same instant (locked_projections/ae_params/' +
  'model_assignments/dialed_in/recurring_rules) -- all 5 already ran concurrently, so this ' +
  'wasn\'t a serial waterfall, but it was still 5 redundant auth revalidations + 5 separate ' +
  'queries for the same signed-in user.',
  'New loadUserSettings(keys) (src/lib/supabase.js) batches all 5 into ONE auth.getUser() + ONE ' +
  '`.in(\'key\',keys)` select, returning a { key: value } map. App.js\'s 5 startup stages now ' +
  'read from the one shared batch instead of calling loadUserSetting individually. ' +
  'loadUserSetting (singular) is untouched and still used by its other, non-startup callers ' +
  '(swing acks, at-a-glance KPI section order, session Dialed-In hydration, blob-sync).',
  '9 new tests (dispatch-load-user-settings-batch-2026-09-23.test.js): 6 against the real ' +
  'exported loadUserSettings (mocked Supabase client, matches email-digest-subscriptions-ui.' +
  'test.js\'s own precedent) covering call-count batching, the returned map shape, a ' +
  'no-saved-row key staying absent, and fail-soft behavior; 3 source-inspection tests confirming ' +
  'App.js actually routes the 5 keys through the batch (not just that the function exists) -- 8 ' +
  'of 9 confirmed to fail against the pre-fix code. Full suite 541/541 files, 5096/5096 tests. ' +
  'Build clean, eager payload 552.26 KB gzip (budget 850 KB).',
]};
