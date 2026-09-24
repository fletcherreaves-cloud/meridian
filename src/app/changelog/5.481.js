// @ts-nocheck
export default {version:'5.481', date:'2026-09-24', changes:[
  'Startup: batched 4 redundant Supabase org_config reads into 1. Same shape as v5.479\'s ' +
  'user_settings batching -- App.js fired 4 separate org_config reads in the same instant ' +
  '(app_settings/store_registry/contact_registry/app_user_targets), each its own ' +
  '`.eq(\'key\',X).maybeSingle()` round trip. org_config is app-wide (no user_id column, RLS is ' +
  '"authenticated read"), so this is even simpler than the user_settings version -- no ' +
  'auth.getUser() call needed at all.',
  'New loadOrgConfigs(keys) (src/lib/supabase.js) does ONE `.in(\'key\',keys)` select for all 4, ' +
  'returning a { key: data } map. App.js\'s 4 startup .then() chains now read from the one shared ' +
  'batch instead of firing their own query. Other org_config readers (loadEomDigestConfig, ' +
  'gm_identity_reveal_enabled) are untouched -- they don\'t fire in the same instant as these 4.',
  '8 new tests (dispatch-load-org-configs-batch-2026-09-24.test.js): 5 against the real exported ' +
  'loadOrgConfigs (mocked Supabase client) covering call-count batching, the returned map shape, ' +
  'a no-saved-row key staying absent, and fail-soft behavior; 3 source-inspection tests ' +
  'confirming App.js actually routes the 4 keys through the batch. 7 of 8 confirmed to fail ' +
  'against the pre-fix code. Full suite 543/543 files, 5111/5111 tests. Build clean, eager ' +
  'payload 552.44 KB gzip (budget 850 KB).',
]};
