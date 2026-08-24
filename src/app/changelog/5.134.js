// @ts-nocheck
export default {version:'5.134', date:'2026-08-24', changes:[
  'Fix a review finding on #633 caught after merge: _pagedParallel\'s partial-failure banner '
  + 'hardcoded "newest-first keeps the recent days" -- true for every pre-existing caller (all '
  + 'pass ascending:false) but backwards for loadDtHistory, the first ascending:true caller. Under '
  + 'ascending order the LATER pages -- more exposed to a partial failure -- hold the NEWEST rows, '
  + 'so the old message told whoever was diagnosing a DT History truncation that recent days were '
  + 'safe when they were actually the ones at risk. Message is now direction-aware; every other '
  + 'caller\'s wording is byte-identical to before (they all take the ascending:false branch). '
  + 'Regression test pins the corrected wording for loadDtHistory\'s failure path.\n\n'
  + 'Suite 2219/2219, build clean, 518.40 KB gzip eager payload.',
]};
