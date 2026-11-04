// @ts-nocheck
export default {version:'5.622', date:'2026-11-04', changes:[
  '**Recommendation Accuracy Ledger -- Phase 1 (owner-approved, "you can start phase 1").** ' +
  'Monthly Projections\' sales/labor/TPPH "Suggested X" badges (task #80 Phase 1+2) now log ' +
  'every suggestion the owner forecast models actually produce, and whether it was accepted or ' +
  'overridden -- the first step toward a track record for the app\'s own recommendations, not ' +
  'just a claim that the AI/models are good. New engine module ' +
  '(src/engine/recommendation-ledger.js: dedupeKeyFor/outcomeDueAtForMonth/gradeOutcome, the ' +
  'latter reusing backtest.js\'s own percentage-error grading philosophy) + 4 new ' +
  'src/lib/supabase.js functions (saveRecommendation/updateRecommendationOutcome/' +
  'loadOpenRecommendations/loadDueForGrading, all fail-soft until the table exists) + a ' +
  'standalone grading script (scripts/grade-recommendations.mjs, not yet scheduled). Zero UI ' +
  'change -- the suggestion badges render exactly as before; this only adds logging/transition ' +
  'side effects on the existing render and save paths. New table ' +
  '(supabase/schema-recommendation-ledger.sql) is a deliverable for the owner\'s own Supabase ' +
  'SQL editor action, per this repo\'s standing DDL rule -- nothing here was run against live ' +
  'Supabase. Design: memory/plan-recommendation-accuracy-ledger-2026-11-04.md. 11 new tests ' +
  '(src/__tests__/dispatch-recommendation-ledger-phase1-2026-11-04.test.js), including an ' +
  'integration test against the real Monthly Projections panel.',
]};
