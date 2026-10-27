// @ts-nocheck
export default {version:'5.589', date:'2026-10-27', changes:[
  '**Fixed a live SAGE 400 error (owner report, "messages.N.content.M.code_execution_tool_result ' +
  '... Field required").** The 2026-10-13 fix for this same bug class only hand-picked required ' +
  'fields for one known server-tool-result type name (web_search_tool_result) -- any OTHER such ' +
  'type (confirmed: code_execution_tool_result, and any future Anthropic server tool) fell through ' +
  'to a bare `{type}` and lost its required fields the same way. Harmless on a normal turn, but ' +
  'fatal on a pause_turn resume, which replays the conversation verbatim and gets rejected by ' +
  'Anthropic. Generalized sage-chat/index.ts\'s content_block_start handler to copy every field of ' +
  'any unrecognized block type (not just known type names), closing the whole bug class.',
  'Extracted the per-SSE-event reducer into supabase/functions/sage-chat/stream-events.js (same ' +
  'pattern as paginate.js) so it is directly testable from Vitest despite this repo having no Deno ' +
  'test runner -- src/__tests__/sage-stream-events.test.js reproduces the exact ' +
  'code_execution_tool_result scenario plus tool_use/server_tool_use parallel-input accumulation, ' +
  'text/thinking deltas, and stop_reason propagation (12 new tests).',
  'Full suite 664/664 files, 6170/6170 tests green. Build clean, unchanged (supabase/functions/ only).',
]};
