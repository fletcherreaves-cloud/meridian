// @ts-nocheck
export default {version:'5.516', date:'2026-10-11', changes:[
  'Migrated the last 3 personal-Anthropic-key call sites onto sage-chat, now that SAGE itself '+
  'has real web search (v5.515). All 11 of the original api.anthropic.com call sites are now '+
  'on sage-chat -- no feature in the app still depends on a personal Anthropic API key.',
  'why.js\'s lookupMissEvent (store-dash.js "🤖 AI Lookup — What happened on this date?"), '+
  'calendar.js\'s searchUpcomingEvents (proactive school-calendar/local-event search feeding '+
  'the Calendar Manager pending-review queue), and analytics.js\'s AIBacktestScanner\'s shared '+
  'callClaudeWithSearch helper (used by both the per-row "🔍 AI" lookup and the "🤖 AI Batch" '+
  'scan in the Anomaly Scanner) all now call callSageOnce instead of hand-rolling their own '+
  'tools array + multi-turn tool_use/tool_result loop against api.anthropic.com directly. '+
  'sage-chat\'s own TOOLS array (web_search_20260209, added in v5.515) and round loop do the '+
  'search server-side -- these 3 call sites are now just prompts.',
  'Dropped every "Add API key in Settings" gate these 3 carried (AIBacktestScanner\'s per-row '+
  '"🔍 AI" button, "🤖 AI Batch" button + confirm text, and runBatchAIScan\'s guard).',
  '5 new tests (dispatch-web-search-sites-sage-migration-2026-10-11.test.js) call/render the '+
  'real functions and assert callSageOnce is what actually gets called, never fetch. One '+
  'existing test (dispatch-72-c1-why-lookupmissevent-loc.test.js) asserted the old no-key '+
  'window.open fallback that no longer exists -- re-pointed at the real current behavior while '+
  'keeping its original intent (lookupMissEvent resolves rather than rejecting on dispatch #72 '+
  'C1\'s free `loc` reference bug).',
]};
