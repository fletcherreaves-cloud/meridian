// @ts-nocheck
export default {version:'5.186', date:'2026-08-26', changes:[
  'Fix: `store-dash.js`\'s "By Patch" tab (Store Management -> Patch/Org view) still read '
  + '`settings.supervisorGroups` — the same stale save-time snapshot dispatch #139 fixed '
  + 'everywhere else, flagged but not fixed by dispatch #144\'s own PR body as an "adjacent finding, '
  + 'not in scope." Swapped for the live `supervisorGroups()` (constants.js, effective-dated via '
  + 'whoRan/orgAssignments) — a store reassigned in Settings now shows under its current patch '
  + 'here too, matching every other #139-fixed panel. New test '
  + '(`store-dash-orgview-by-patch-live-source.test.js`) reproduces the same '
  + '`setLiveAssignments`-based reassignment repro dispatch #139\'s own tests use, reassigning a '
  + 'real store and asserting the tab reflects it — no existing test rendered this tab\'s populated '
  + 'state at all.\n\n'
  + 'Full suite 2663/2663 (251 files, +1); build clean, entry/eager payload flat.',
]};
