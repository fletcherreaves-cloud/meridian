// @ts-nocheck
export default {version:'5.469', date:'2026-09-18', changes:[
  'My Reports: SMG VOICE joins Calendar and Visit Readiness (PACE) as a saveable, pre-scoped ' +
  'report. Previously SMGVoicePanel had no way to open pre-scoped at all -- a saved SMG VOICE ' +
  'subscription would always land unscoped ("All stores"), silently dropping the whole point of ' +
  'saving one.',
  'New initialScope prop on SMGVoicePanel (App.js\'s smgVoiceInit state, wired the same way as ' +
  'visitReadyInit) follows the app-standard \'all\'|\'ok\'|\'fl\'|\'grp:X\'|loc scope-string ' +
  'convention every other routed panel\'s initialX prop already reads -- converts straight onto ' +
  'the panel\'s own orgFilter/storeSel state via lazy useState initializers.',
  '5 new tests against the real exported SMGVoicePanel/REPORTS (unscoped-default unchanged, FL-' +
  'only, OK-only, single-store scope, and the REPORTS registry entry) -- would fail on a ' +
  'revert, since SMGVoicePanel previously ignored an initialScope prop entirely. Full suite ' +
  '532/532 files, 5056/5056 tests. Build clean, eager payload 551.61 KB gzip (budget 850 KB).',
]};
