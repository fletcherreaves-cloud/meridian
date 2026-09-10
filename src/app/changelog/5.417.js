// @ts-nocheck
export default {version:'5.417', date:'2026-09-10', changes:[
  'GH #194 (follow-up to #176) asked for tJuneProj/tOperatorProj/tQSRSoftProj/tJuneTpph -- four ' +
  'fields riding applyProjectionsToTargets\'s runtime mutation of the shared DEFAULT_TARGETS ' +
  'constant -- to each be audited and classified: retire, route through a resolver, or stay. ' +
  'Ran the repo-wide grep the issue itself specified for every field. tJuneProj/tOperatorProj/ ' +
  'tJuneTpph all have live readers in morning-brief.js and stay untouched. tQSRSoftProj has ZERO ' +
  'readers anywhere in src/ -- confirming the issue\'s own guess ("the cheapest to confirm and ' +
  'probably the first to retire"). Retired: applyProjectionsToTargets no longer writes it.',
  'r.qsr (the raw parsed value) is untouched -- still parsed by parseProjectionsFile, still ' +
  'preserved in ds.projRows via pipeline.js for any future consumer. The static tQSRSoftProj ' +
  'seed values in constants.js are also untouched -- not a mutation hazard, just data; only the ' +
  'pointless runtime rewrite of an unread field is gone.',
  '2 new tests (dispatch-194-tqsrsoftproj-retired.test.js) against the real exported ' +
  'applyProjectionsToTargets -- confirmed to fail against the pre-fix code (reverted parsers/' +
  'index.js, re-ran) before landing. Full suite 4687/4687, build clean, 538.59 KB / 850 KB ' +
  'budget.',
]};
