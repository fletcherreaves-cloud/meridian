// @ts-nocheck
export default {version:'5.338', date:'2026-09-03', changes:[
  'Cleanup: removed 5 dead functions from src/features/projections.js -- ' +
  'loadLockedProjections, saveLockedProjections, getLockedAmount, lockProjectionWeek, and the ' +
  'weekKey helper only they called. Zero callers anywhere in the codebase; App.js\'s own comment ' +
  'already documented these as dead imports, shadowed since dispatch #232 by a local ' +
  'lockedProjections useState + its own local saveLockedProjections callback using the same ' +
  '\'mf_locked_projections\' localStorage key. loadProjectionLog and the projection-lock history ' +
  'it feeds are untouched -- still live, still called from ProjectionWorkflow.',
  'Lowered the R3 .getDay() ratchet ceiling (src/__tests__/ratchet-week-day-arithmetic.test.js) ' +
  'from 63 to 62 -- weekKey\'s own inline day-of-week arithmetic was one of the counted sites, ' +
  'but it was unreachable dead code, not a live boundary bug.',
  'Full suite (3846 tests) and build both clean (533.29 KB / 850 KB eager budget, no shift). ' +
  'Smoke-tested via dev server + headless Chromium, zero JS errors.',
]};
