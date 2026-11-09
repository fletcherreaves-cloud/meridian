// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
  '**🐛 Curated Home — the Huddle no longer leaks a district-wide note into a View-As-Role store '+
  'simulation (owner bug report, 2026-11-09).** Simulating Durant via View-As-Role showed a '+
  '"Huddle" note naming OTHER OK stores (Duncan-Hwy 81, Ada-Country Club, Mossy Head). Root cause: '+
  'the Huddle\'s cache key (`huddleScopeKey`) checked `operatorGroup` BEFORE a store/patch-altitude '+
  'View-As-Role simulation — operatorGroup is a STICKY cross-session setting any district-altitude '+
  'viewer (including an Owner who clicked the operator picker once) can leave set, so simulating a '+
  'single store still resolved to the SAME cache key a prior district-altitude session had already '+
  'generated and cached a real multi-store note under. Fixed at the source: an explicit, in-the-'+
  'moment View-As-Role simulation now always wins its own cache slot over a leftover operatorGroup '+
  'setting; operatorGroup still applies normally at real (non-simulated) district altitude, '+
  'unchanged. The facts fed to the model get the same precedence, defense in depth for the patch-'+
  'altitude case.',
]};
