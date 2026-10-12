// @ts-nocheck
export default {version:'5.518', date:'2026-10-12', changes:[
  'EOM Dashboard Scoreboard: new Monthly/Weekly/Daily toggle (owner req). Monthly is the '+
  'existing EOM review/comms-sent checklist, completely unchanged -- that workflow is '+
  'inherently once-a-month. Weekly/Daily swap in a separate, simpler GranularityScoreboard '+
  'view instead: a per-store FOB% trend sparkline (fobDailyTrace, engine/variance-trace.js, '+
  'dollar-weighted per week) plus a plain counted-satisfactorily-or-not read -- Weekly reuses '+
  'cycleCompliance (the same basis the Weekly Count Status report uses, so the two can never '+
  'disagree); Daily just reports whether a count happened today at all (and what kind), never '+
  'inventing a "daily requirement" the owner\'s actual rules don\'t have.',
  'New home-screen tile: "Count & FOB Pulse" (at-a-glance.js) -- a separate, always-on tile '+
  '(not month-end-gated like the existing EOM Scoreboard tile) with its own Day/Week toggle, '+
  'same engines as the Scoreboard\'s new view.',
  'Fixed a real ratchet violation this surfaced: the weekly bucketing re-derived ISO-Monday '+
  'week-start arithmetic inline instead of calling the shared weekStartOf() helper (src/utils/'+
  'date.js) -- exactly the ratchet-week-day-arithmetic.test.js/week-start.test.js bug class. '+
  'Switched to weekStartOf()/dKey(), which also makes the week bucket follow the app\'s '+
  'configured week-start day instead of a hardcoded Monday.',
  '8 new tests (dispatch-scoreboard-granularity-2026-10-12.test.js, at-a-glance-count-fob-'+
  'pulse-tile.test.js) rendering the real EOMDashboardPanel/AtAGlance call sites. Full suite '+
  '(578 files / 5425 tests) and npm run build both pass clean.',
]};
