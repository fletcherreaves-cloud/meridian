// @ts-nocheck
export default {version:'5.786', date:'2026-11-14', changes:[
  '**Location Dossier Phase 3 (task #79): Layout/Equipment reference, Personnel summary, and ' +
  'broadened Important Findings.** Phase 1/1.5 already shipped demographics + Store KB notes — ' +
  'the plan doc\'s own §2C text was stale on that point; the genuinely unbuilt pieces were ' +
  'layout/equipment/employee-tenure/skills-matrix/graded-visits/EcoSure, confirmed by grep (zero ' +
  'references in either dossier file). **🧰 Equipment & Layout** reuses equipment-survey.js\'s own ' +
  'cross-store rollup math (`buildEquipmentStoreSummary`) and current-state resolver ' +
  '(`latestEntriesByInstance`) verbatim against this one store\'s own equipment_survey_entries ' +
  'rows (the SAME per-store loader the real Layout Planner editor uses) — a read-only reference/ ' +
  'summary (item count, PQRG-reviewed count, last activity, zone counts), never a duplicate of ' +
  'the floor-plan editor. **👥 Personnel** is headcount-by-role (GM/AM/DM/SM/crew), reusing tenure-' +
  'roles.js\'s own classifyRosterAssignment — never names: qsr_employee_tenure\'s own select list ' +
  '(lib/supabase.js) carries `geid`, never a name column, so there is no name-resolution path for ' +
  'it at all (unlike Security findings\' crew_token/mgr_token) — a data-availability fact, not a ' +
  'PII decision. Skills Matrix coverage (same "proficient means ≥3" threshold skills-matrix.js\'s ' +
  'own coverage column already uses) sits alongside it. Pay rate changes are the one genuinely ' +
  'wage-sensitive slice, kept in a deliberately SEPARATE function and gated behind `payroll.view` ' +
  '— the exact permission pay-rate-history.js\'s own nav entry already requires (CLAUDE.md\'s ' +
  '2026-11-11 resolved PII rule: names/figures follow this app\'s EXISTING role/scope gates, never ' +
  'a stricter rule invented just for a report). **🎯 Top Findings** now also draws from Visit ' +
  'Readiness/EcoSure and Guest Voice — finding-rules.js\'s own output never covered those (grep-' +
  'confirmed). Reuses attention-now.js\'s existing detectors (`visitRisk`/`csatOpportunityAlerts`, ' +
  'attention-feed.js) as-is, scoped to one store, normalized onto the same {t,m} shape the strip ' +
  'already renders — one ranked list, not a second UI section. A new **🎓 Last Graded Visit** card ' +
  'reads the same per-store computeVisitReadiness() fields the Visit Readiness panel itself shows ' +
  '(score/pass/type/date, EcoSure-sourced food-safety flag) directly, so it can never disagree ' +
  'with that panel. Security-panel findings (`storeHealthList`) are deliberately NOT included — ' +
  'that function needs rulesById/driftContributions/persistenceContributions pre-built elsewhere ' +
  'in security-panel.js\'s own large pipeline; flagged as a follow-on in the plan doc, not ' +
  'silently dropped. Phase 4 (patch/operator/state rollup views) remains not built. ' +
  '16 new engine tests (`location-dossier-phase3-2026-11-14.test.js`). ' +
  'memory/plan-location-dossier-report-2026-11-04.md updated (Phase 3 SHIPPED).',
]};
