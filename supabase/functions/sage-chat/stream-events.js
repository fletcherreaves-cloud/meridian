// @ts-nocheck
// Pure, Deno/Node-agnostic reducer for one Anthropic SSE event, factored out of
// streamAnthropicCall() in index.ts. Imported directly by index.ts (Deno, at runtime) and by
// its Vitest test in src/__tests__/ (Node), so the SAME code that runs in production is what
// the test exercises -- not a re-implementation of it. Same pattern as paginate.js. Plain JS,
// no TypeScript, per repo convention.
//
// Mutates contentByIdx/toolUses/state in place (matching the original inline code) and returns
// { textDelta } when the caller should forward a chunk to the SSE client, else null.
export function applyStreamEvent(ev, contentByIdx, toolUses, state) {
  if (ev.type === 'content_block_start') {
    const cb = ev.content_block || {};
    const block = { type: cb.type };
    if (cb.type === 'text') {
      block.text = '';
    } else if (cb.type === 'thinking') {
      block.thinking = '';
    } else if (cb.type === 'tool_use' || cb.type === 'server_tool_use') {
      // tool_use (client-run, round-tripped through runTool) AND server_tool_use
      // (web_search -- runs on Anthropic's infrastructure, resolves within this same
      // streamed response) both stream their input as input_json_delta events.
      // Accumulate each on ITS OWN content-block object, keyed by ev.index -- not a
      // single shared "last tool_use pushed" array, which silently corrupted one
      // tool's input with another's partial_json bytes the moment a server tool and a
      // client tool streamed in parallel in one turn.
      block.id = cb.id;
      block.name = cb.name;
      block.input = {};
      block._inputJson = '';
    } else {
      // Every other block type is a server-tool RESULT block (web_search_tool_result,
      // code_execution_tool_result, and whatever type Anthropic adds next) -- it
      // arrives WHOLE in this one content_block_start event, never streamed via
      // input_json_delta. The 2026-10-13 fix (mass-review notes 70) hand-picked
      // tool_use_id/content for the one type name known at the time
      // (web_search_tool_result); that missed code_execution_tool_result, which fell
      // through to the generic `{type: cb.type}` default and lost its required fields
      // the exact same way -- confirmed live 2026-10-27 (owner report, "messages.N.
      // content.M.code_execution_tool_result... Field required"). Harmless on a normal
      // turn (this block is never replayed), but fatal on a pause_turn resume: the
      // caller replays assistantContent verbatim as the next request's conversation
      // history, and Anthropic rejects any such block missing its required fields with
      // HTTP 400 invalid_request_error. Copying every field verbatim (not hand-picking
      // by type name) closes this whole class of bug instead of patching one type at a
      // time as Anthropic adds more server tools.
      Object.assign(block, cb);
    }
    if (cb.type === 'tool_use') toolUses.push({ id: cb.id, name: cb.name });
    contentByIdx.set(ev.index, block);
    return null;
  }

  if (ev.type === 'content_block_delta') {
    const block = contentByIdx.get(ev.index);
    const delta = ev.delta || {};
    if (delta.type === 'text_delta' && delta.text) {
      if (block) block.text = (block.text || '') + delta.text;
      return { textDelta: delta.text };
    }
    if (delta.type === 'thinking_delta' && block) {
      block.thinking = (block.thinking || '') + (delta.thinking || '');
    }
    if (delta.type === 'input_json_delta' && block) {
      block._inputJson = (block._inputJson || '') + (delta.partial_json || '');
    }
    return null;
  }

  if (ev.type === 'content_block_stop') {
    const block = contentByIdx.get(ev.index);
    if ((block?.type === 'tool_use' || block?.type === 'server_tool_use') && block._inputJson != null) {
      try { block.input = JSON.parse(block._inputJson); } catch { block.input = {}; }
      delete block._inputJson;
    }
    return null;
  }

  if (ev.type === 'message_delta') {
    if (ev.delta?.stop_reason) state.stopReason = ev.delta.stop_reason;
    return null;
  }

  return null;
}
