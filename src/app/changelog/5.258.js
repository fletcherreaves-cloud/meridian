// @ts-nocheck
export default {version:'5.258', date:'2026-08-29', changes:[
  'Dispatch #217 -- EOM digest settings: configurable levels + send time. #215 shipped the EOM ' +
  'roll-up digest with two things hardcoded and explicitly flagged as the next slice: which ' +
  'roll-up levels the DAILY scheduled email includes (district+patch always, Market/org was ' +
  'on-demand-only) and what hour it sends (fixed 6pm CT / 23:00 UTC). Both are now configurable ' +
  'from the same EOM Digest modal, stored in Supabase (org_config, key eom_digest_config) rather ' +
  'than a new table -- an app-wide setting, matching how supervisorGroups/orgAssignments already ' +
  'live under org_config key app_settings.' +
  '\n\n' +
  'src/lib/supabase.js: loadEomDigestConfig()/saveEomDigestConfig({levels, sendHourUtc}), same ' +
  'shape as the existing loadUserSetting/saveUserSetting pair just above them but org-wide ' +
  '(org_config) rather than per-user (user_settings). Defaults to {levels:[district,patch], ' +
  'sendHourUtc:23} -- todays hardcoded behavior -- when no row exists yet, so a fresh install is ' +
  'unaffected until someone actually changes it.' +
  '\n\n' +
  'That default now lives in exactly ONE place -- DEFAULT_EOM_DIGEST_CONFIG, added to ' +
  'src/engine/eom-digest.js (the pure engine BOTH consumers already import) -- rather than as a ' +
  'hand-typed literal duplicated in the browser bundle and the Node script; supabase.js cannot ' +
  'import a Vite-only module (it reads import.meta.env), so a shared constant in the existing ' +
  'engine file was the reuse-over-duplication call, per the "check whether a helper exists" ' +
  'standing rule -- covered by loadEomDigestConfig\'s own tests asserting the returned default ' +
  'equals that one constant, so the two readers cannot silently drift apart.' +
  '\n\n' +
  'scripts/eom-digest-send.mjs: new loadDigestConfig() mirrors bootstrapLiveOrg()\'s own ' +
  'org_config read (same file, same query shape, key eom_digest_config instead of app_settings). ' +
  'levelsToRun(config) now sources its default from the loaded config instead of a hardcoded ' +
  '[district,patch] literal -- DIGEST_LEVEL, when explicitly set, still wins unconditionally, so ' +
  'the on-demand "Generate Report" panel Email button (which always passes an explicit level via ' +
  'trigger-dar-sync\'s digest workflow entry) is completely unaffected. New hourGatePasses ' +
  '(sendHourUtc, now, force) -- proceeds only when the current UTC hour matches the configured ' +
  'send hour, unless DIGEST_FORCE=1 (already used by the on-demand path), which bypasses this ' +
  'exactly like it already bypasses inCountWindow(). Workflow cron (.github/workflows/' +
  'eom-digest-send.yml) changed from a fixed daily 0 23 * * * to hourly (0 * * * *) -- the SCRIPT ' +
  'now does the real filtering via the hour gate, same "cron is just a landing point" pattern ' +
  'qsrsoft-onhand-pull.mjs already uses for its own count-window self-gating; 23 of 24 hourly ' +
  'runs simply no-op.' +
  '\n\n' +
  'src/views/eom-dashboard.js: new "⚙️ Scheduled send" row inline in the existing EOM Digest ' +
  'modal (search digestOpen) -- checkboxes for District/Patch/Market (which levels the DAILY auto ' +
  'email includes) and an hour <select> labeled in CT for readability (e.g. "6:00 PM CT", via ' +
  'today\'s date + Intl DateTimeFormat America/Chicago so the label tracks whichever of CDT/CST is ' +
  'currently in effect) but stored as a plain UTC hour, no DST-aware precision beyond what the ' +
  'dropdown implies. Deliberately independent of the level TABS already in that modal (those pick ' +
  'what the viewer is looking at right now; the new row picks what goes out automatically every ' +
  'day) -- never conflated. Loads the real stored config fresh every time the modal opens, never ' +
  'silently resetting to the default while a real row exists. Save is disabled with a "Pick at ' +
  'least one level" hint when every checkbox is off, so a save can never persist zero levels.' +
  '\n\n' +
  'Out of scope, unchanged from #215: real per-role recipient delivery (still blocked on Resend ' +
  'domain verification + no per-user contact model), per-level recipient overrides, sub-hour ' +
  'cadence granularity, and buildEomDigest()/sendDigestEmail()\'s own roll-up math and email ' +
  'content (reused exactly as-is).' +
  '\n\n' +
  '19 new tests: eom-digest-config.test.js (loadEomDigestConfig/saveEomDigestConfig against a ' +
  'mocked Supabase client -- default-when-no-row, full round-trip, per-field fallback, error ' +
  'path); dispatch-217-eom-digest-schedule.test.js (levelsToRun(config) config-sourced default vs ' +
  'DIGEST_LEVEL override proven unaffected across district/org/all/unrecognized cases, plus ' +
  'hourGatePasses with real Date fixtures at exact hour boundaries and the force bypass); ' +
  'dispatch-217-eom-digest-settings-ui.test.js renders the REAL EOMDashboardPanel end to end -- ' +
  'clicks Reports▾ -> 📧 Generate Report -> asserts the settings row\'s checkboxes/hour-select ' +
  'reflect the real loaded config (not a silent default), that the level tabs and the schedule ' +
  'checkboxes stay independent, and that Save calls saveEomDigestConfig with the right payload. ' +
  'Full suite 3356/3356 (up from 3351 baseline + 5 new files), build clean. Eager entry payload ' +
  '524.67 -> 526.43 KB gzip (+1.76 KB -- DEFAULT_EOM_DIGEST_CONFIG\'s shared import pulls ' +
  'eom-digest.js, previously lazy-only, into the eager graph via supabase.js; still 323.57 KB ' +
  'under the 850 KB budget).',
]};
