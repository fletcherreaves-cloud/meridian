// @ts-nocheck
export default {version:'5.758', date:'2026-11-13', changes:[
  '**KB cleanup (task #75 follow-up to batch 20): deleted 2 redundant/stale in-app help ' +
  'articles, wired the real one.** `dialed_in` and `dialed_in_calibration` turned out to be ' +
  'two descriptions of the same Dialed-In grid-search mechanism — `dialed_in` undercounted the ' +
  'parameter list (4 vs the correct 5) and was missing the "DI Skip" section, and the ' +
  'already-wired `di_calibration_panel` article itself names "Dialed-In Calibration — Grid ' +
  'Search" (the real title of `dialed_in_calibration`) as its companion reference — confirming ' +
  'which one was meant to stay. Added a second InfoIcon (`dialed_in_calibration`) next to the ' +
  'existing one on the Dialed-In panel\'s subtitle and deleted the redundant `dialed_in` entry. ' +
  '`file_import_guide` was never a duplicate of `data_manager_guide` as suspected — it\'s a ' +
  'stale article describing a pre-cloud, re-upload-every-session architecture that contradicts ' +
  'the app\'s actual cloud-first Supabase model. It was never wired to any InfoIcon (so always ' +
  'invisible), so it\'s deleted outright rather than wired or merged. No test asserts a KB_ARTICLES ' +
  'count, so neither deletion breaks a ratchet. Full suite (7964 tests) and build pass clean ' +
  '(698.91 KB eager, budget 850 KB).',
]};
