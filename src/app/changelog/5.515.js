// @ts-nocheck
export default {version:'5.515', date:'2026-10-10', changes:[
  'SAGE gains real web search (owner-requested, follow-up to v5.513/v5.514\'s personal-API-key '+
  'migration audit) -- added Anthropic\'s server-side web_search_20260209 tool to sage-chat\'s '+
  'TOOLS array (supabase/functions/sage-chat/index.ts). SAGE now decides on its own when a '+
  'question needs live web information (local news/weather/events, school calendars) outside '+
  'Meridian\'s own data, instead of that capability being locked to the 3 single-feature legacy '+
  'call sites (why.js AI Lookup, calendar.js proactive event search, analytics.js Anomaly '+
  'Scanner) that each carry their own personal-Anthropic-key copy of it.',
  'Two correctness fixes required by adding a server-side tool: (1) input_json_delta streaming '+
  'was accumulated on a single shared "last tool_use pushed" array, which would silently '+
  'corrupt one tool call\'s JSON with another\'s bytes the moment a server tool (web_search) and '+
  'a client tool streamed in the same turn -- now accumulated per content-block index, where it '+
  'belongs. (2) web_search\'s own internal search loop can return stop_reason "pause_turn" if it '+
  'runs long -- the round loop now resumes it per Anthropic\'s documented pattern (resend the '+
  'conversation with the paused assistant turn appended, no synthetic message).',
  'System prompt (src/views/sage.js) documents the new tool (now 12) so SAGE calls it '+
  'proactively, with a CAVEAT steering it to the other 11 tools first for anything Meridian\'s '+
  'own data already answers. CLAUDE.md\'s SAGE tools list corrected in the same pass -- it had '+
  'drifted again, missing query_forms (v5.474) even before this change.',
  '⚠️ NOT YET LIVE -- this session has no Supabase CLI access token, so sage-chat could not be '+
  'deployed from here (confirmed: `supabase functions deploy` fails with AccessTokenRequiredError). '+
  'Run `supabase functions deploy sage-chat --no-verify-jwt` to ship this.',
]};
