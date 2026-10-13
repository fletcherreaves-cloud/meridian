// @ts-nocheck
export default {version:'5.540', date:'2026-10-13', changes:[
  'SAGE -- fixed a real, owner-reported bug: a multi-search web_search query (e.g. "whats the ' +
  'weather for the Oklahoma market this week") failed with "Anthropic 400: invalid_request_error ' +
  '... web_search_tool_result... Field required". Root cause: sage-chat/index.ts\'s SSE parser ' +
  'only populated tool_use/server_tool_use blocks\' id/name/input from content_block_start -- the ' +
  'web_search_tool_result block Anthropic emits right after a web_search call (carrying the ' +
  'actual search hits) fell through to a generic {type} placeholder with no tool_use_id/content ' +
  'captured, since unlike tool_use it arrives whole in one event rather than streamed via ' +
  'input_json_delta. Harmless on a single-round answer (never replayed), but fatal whenever that ' +
  'turn needed to continue -- either web_search\'s own internal search loop pausing ' +
  '(stop_reason:\'pause_turn\') or a mixed server+client tool turn -- both paths resend ' +
  '`assistantContent` verbatim as the next request\'s conversation history, and Anthropic ' +
  'rejects the incomplete block outright. Fixed by capturing tool_use_id/content directly from ' +
  'the content_block_start event for this block type, same as every other content block that ' +
  'arrives whole.',
  '⚠️ Code fix only -- Edge Functions are not part of the Vercel/GitHub Actions auto-deploy ' +
  'pipeline (CLAUDE.md\'s own deploy command: `supabase functions deploy sage-chat ' +
  '--no-verify-jwt`). This sandbox has no Supabase CLI, so merging this PR does NOT make the ' +
  'fix live -- someone with Supabase CLI access needs to run that deploy command afterward.',
]};
