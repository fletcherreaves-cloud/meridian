// @ts-nocheck
export default {version:'5.770', date:'2026-11-14', changes:[
  '**Task #152 (app-wide metric/formula reconciliation) — first substantive pass.** Fixed two ' +
  'real bugs in the GM Daily Review\'s Service daypart breakdown (engine/daily-review.js\'s ' +
  'DAYPART_FIELDS, already diagnosed but deliberately left unfixed in ' +
  'memory/finding-signals-liveops-mislabels-2026-11-13.md #2): R2P\'s `fc_untilcloseddrawer` ' +
  '(two-d typo) corrected to the real column `fc_untilclosedrawer`, which was also missing ' +
  'from loadDtHistory\'s select list entirely (added — additive-only, dt-speedofservice.js\'s ' +
  'own FC/R2P reading is unaffected and unchanged); KVS time\'s bare `mfy_time`/`mfy_trans_cnt` ' +
  '(not real columns) corrected to the real side-suffixed `mfy1_*`/`mfy2_*` pair, summed. Both ' +
  'bugs silently returned ZERO dayparts for every store/day, indistinguishable from "no data" — ' +
  'new test (`daily-review.test.js`) proves real rows now resolve correctly. Also added 6 new ' +
  'hand-curated Metric Lineage entries (engine/metric-provenance.js) for displayed numbers ' +
  'composed from multiple already-resolved metric-source.js values, which the auto-generator ' +
  'can\'t see on its own: the 4 Visit Readiness sub-scores (Speed/Accuracy/Quality/Leadership) ' +
  'and the GM Daily Review\'s 2 sumMs lines (Refund $, Empl/Mgr Meal $). Confirmed Location ' +
  'Dossier needs no new entries — all 9 of its metrics already resolve through the existing ' +
  'registry. No speculative renames — every label checked was traced to its real formula and ' +
  'found accurate. Full status + what\'s explicitly deferred (forecast.js\'s named models are ' +
  'next, deliberately not rushed given how heavily user-facing and CLAUDE.md-protected they ' +
  'are): memory/plan-metric-reconciliation-2026-11-14.md. 8035 tests passing, build clean ' +
  '(703.54 KB eager, budget 850 KB).',
]};
