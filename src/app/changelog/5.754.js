// @ts-nocheck
export default {version:'5.754', date:'2026-11-13', changes:[
  '**Why Engine: contextual help links (Notes 73 #4, part 3 of 3 — closes this item).** Every ' +
  'miss cause now carries a "learn more" row: the existing in-app KB article for that cause ' +
  'type (InfoIcon, reused — no new articles written) plus an "🧠 Ask SAGE" button that seeds a ' +
  'cause-specific question into SAGE via the same window.__MF_SAGE_SEED__/"mf:open-sage" ' +
  'convention the EOM dashboard\'s own "Ask SAGE" buttons already use. SAGE then decides which ' +
  'of its 12 live tools actually answers it — search_qsr_kb (the real external QSRSoft Help ' +
  'Center), search_project_memory, query_labor_summary, query_forecast_snapshots, or web_search ' +
  '— so "even external" context-lookup (the owner\'s own phrasing) comes from SAGE\'s live tools ' +
  'rather than a static link that would rot. New shared `CauseLinks` component in why.js, ' +
  'rendered identically in Store Dashboard\'s Biggest Miss card and Analytics\' Why Engine miss ' +
  'list — same pattern the v5.752 remedy field already established. All three Notes 73 #4 ' +
  'sub-items are now shipped: cause-to-remedy coaching (v5.752), win celebration (v5.753), and ' +
  'this. 9 new tests, full suite (7955 tests) and build pass clean (700.21 KB eager, budget 850 ' +
  'KB).',
]};
