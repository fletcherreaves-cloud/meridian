// @ts-nocheck
export default {version:'5.513', date:'2026-10-09', changes:[
  'Anthropic retired claude-sonnet-4-20250514 (2026-06-15) -- fixed the 3 AI-narrative call ' +
  'sites that were still silently broken on it: DistrictLensPanel\'s "Generate District Story" ' +
  '(analytics.js), At A Glance\'s "AI Narrative" dashboard comment, and Location Intelligence\'s ' +
  '"Generate" AI brief. A fourth, analytics.js\'s district-correlation narrative, used ' +
  '"claude-sonnet-4-6" -- never a real model id, so it always 404\'d regardless of retirement. ' +
  'Location Intelligence\'s call was doubly broken -- it never sent an API key header at all.',
  'All 3 now route through the already-deployed sage-chat Edge Function via callSageOnce ' +
  '(src/lib/sage-client.js), the same fix already proven on GM Coaching Brief and Forecast ' +
  'Brief (dispatch #76) -- no personal Anthropic API key required, no model id hardcoded ' +
  'client-side. The other 8 api.anthropic.com call sites (claude-haiku-4-5-20251001, not a ' +
  'retired model) are unaffected and untouched -- same deferred-follow-up files that migration ' +
  'already left alone.',
  '3 new tests (dispatch-sonnet4-retirement-ai-narrative-migration-2026-10-09.test.js) render ' +
  'the real DistrictLensPanel/AtAGlance/LocationIntelligence components and assert callSageOnce ' +
  'is what actually gets called, never fetch.',
]};
