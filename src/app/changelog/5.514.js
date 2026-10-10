// @ts-nocheck
export default {version:'5.514', date:'2026-10-10', changes:[
  'Finished migrating the remaining personal-Anthropic-key AI call sites off api.anthropic.com '+
  'onto the already-deployed sage-chat Edge Function (callSageOnce) -- follow-up to v5.513\'s '+
  'Sonnet-4-retirement fix, owner-requested. 5 sites migrated: store-dash.js\'s AITabInsight '+
  '(reusable "💡 AI Analysis" button, several tabs), analytics.js\'s AIInsightsTab ("⚡ Generate '+
  'Insights"), analytics.js\'s DistrictPriorityBrief ("✍ Weekly Narrative"), calendar.js\'s '+
  'generateReviewPack (batch per-anomaly suggestions, "📤 Pack"), and projections.js\'s '+
  'PreForecastBrief ("Generate Summary"). None of these require a personal API key anymore -- '+
  'AITabInsight in particular used to silently hide its own button when no key was set.',
  '3 sites deliberately left untouched: why.js\'s lookupMissEvent (AI Lookup), calendar.js\'s '+
  'searchUpcomingEvents, and analytics.js\'s AIBacktestScanner callClaudeWithSearch helper all '+
  'use Anthropic\'s server-side web_search_20250305 tool for real web search -- sage-chat\'s '+
  'TOOLS array is its own fixed SAGE data-query toolset and does not proxy an arbitrary '+
  'caller-supplied tool, so migrating these would silently drop real search capability. Flagged '+
  'to the owner as a separate decision rather than silently degraded or left half-migrated.',
  '5 new tests (dispatch-remaining-ai-sites-sage-migration-2026-10-10.test.js) render the real '+
  'components, click the real button, and assert callSageOnce is called and fetch never is.',
]};
