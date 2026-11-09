// @ts-nocheck
export default {version:'5.703', date:'2026-11-08', changes:[
  '**Shift Scoreboard — the new SM/AM/DM-selectable store format (task #122, owner-confirmed '+
  'metric list 2026-11-08: "Agree with your response. Go ahead").** Selectable from the Game '+
  'Plan/Checklist/Bullets/Narrative format picker at store altitude. Live "today so far" tiles '+
  '(OEPE, R2P, KVS Time, Healthy Use of KVS/Side 2, Labor %, TPPH, Act vs Sched hrs, Act vs '+
  'Needed hrs, T-Red Before/After %, POS-Over $, Cash O/S $), each against the store\'s own real '+
  'DEFAULT_TARGETS value — never a generic threshold. Sales/guest-count pace vs plan (reusing '+
  'the same QSRSoft projSales/projGC Signals\' LiveOps Tracking-to-Plan already reads) surfaces '+
  'two divergence signals as badges, not tiles: a traffic-vs-sales direction mismatch, and a '+
  'binary T-Red spike flag (2x the store\'s own target). **⚙ Customize** lets a user toggle which '+
  'metrics show, persisted the same local-first/cloud-confirm way the format/operator-group '+
  'prefs already are. FOB and count-cycle completion are deliberately NOT live tiles here '+
  '(owner-confirmed — both move at EOM/weekly cadence, not shift cadence); a standing reminder '+
  'strip for count-cycle overdue status is a follow-on, not built in this pass. New: '+
  'src/engine/shift-scoreboard.js (pure, tested), src/views/shift-scoreboard-view.js.',
]};
