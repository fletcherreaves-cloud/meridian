// @ts-nocheck
export default {version:'5.416', date:'2026-09-10', changes:[
  'Fixed GH #177: every Smart Targets metric\'s "Official" column read DEFAULT_TARGETS ' +
  'directly, bypassing the monthly-approved target, Targets-panel overrides, and v2 monthly ' +
  'overrides App.js\'s mergedTargets memo already resolves and passes down as settings.targets ' +
  '-- so the column literally labeled "Official" showed the hardcoded constant instead of the ' +
  'actually-approved number. Measured (2026-08-11, cited in the issue): 20 of 27 stores\' ' +
  'August approved crew_labor_pct differed from constants.js, up to 2.00pp (Ponce de Leon ' +
  '43701: constant 26.00%, approved 24.00%). Filed separately from GH #164 (closed today, ' +
  'v5.415) because it\'s a sourcing bug, not the tLabor-vs-tCrewLabor basis question -- same ' +
  'root shape as #153\'s original defect, a consumer reading past the merge chain.',
  'All 7 METRICS entries had it, not just labor (the issue\'s own "check its siblings" note) -- ' +
  'laborpct, oepe, fob, tpph, r2p, avgcheck, promopct. Fixed with one shared mergedTarget(loc, ' +
  'settings) helper, matching the SAME precedence labor-tools.js\'s own tgt construction already ' +
  'uses: settings.targets[loc]||DEFAULT_TARGETS[loc] -- settings.targets[loc] IS App.js\'s ' +
  'already-fully-merged mergedTargets object (DEFAULT_TARGETS < yearly targets < monthly ' +
  'approved < user flat override < v2 monthly override), not a separate override-only table, ' +
  'so this reuses the real merge rather than re-deriving one. sales (the one metric with no ' +
  'officialVal, reading ds.monthlyTargets directly) was independently re-verified correct in an ' +
  'earlier pass and left untouched.',
  '6 new tests (dispatch-177-smart-targets-official-merged-chain.test.js) against the real ' +
  'exported METRICS/mergedTarget, using the issue\'s own Ponce de Leon fixture -- confirmed to ' +
  'fail against the pre-fix code (reverted smart-targets.js, re-ran) before landing. Full suite ' +
  '4685/4685, build clean, 538.59 KB / 850 KB budget.',
]};
