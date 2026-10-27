// @ts-nocheck
// 2026-10-27 -- live SAGE bug (owner report): "Anthropic 400: messages.5.content.2.
// code_execution_tool_result... Field required" on a pause_turn resume. Root cause: the
// content_block_start handler in sage-chat/index.ts hand-picked required fields for ONE known
// server-tool-result type name (web_search_tool_result, fixed 2026-10-13 per mass-review notes
// 70) and let every other such type fall through to a bare `{type: cb.type}`, silently dropping
// its required fields (tool_use_id, content, etc). Harmless on a normal turn (the block is never
// replayed) but fatal on a pause_turn resume, which replays assistantContent verbatim as the next
// request's conversation history -- Anthropic rejects the malformed block with HTTP 400.
//
// Imports supabase/functions/sage-chat/stream-events.js directly -- the same plain-JS module
// index.ts's streamAnthropicCall() calls per SSE event. No Deno test infrastructure exists in
// this repo to boot the edge function itself, so this is the closest thing to the real call
// site: reverting the Object.assign fallback (not just its wiring into index.ts) makes the first
// describe block below fail, since it exercises that exact code. Same pattern as
// sage-paginate.test.js.
import { describe, it, expect } from 'vitest';
import { applyStreamEvent } from '../../supabase/functions/sage-chat/stream-events.js';

function newCtx() {
  return { contentByIdx: new Map(), toolUses: [], state: { stopReason: 'end_turn' } };
}

describe('stream-events -- applyStreamEvent: server-tool-result blocks (2026-10-27 bug)', () => {
  it('preserves every field of an UNANTICIPATED result type (code_execution_tool_result), not just `type`', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({
      type: 'content_block_start',
      index: 2,
      content_block: {
        type: 'code_execution_tool_result',
        tool_use_id: 'srvtoolu_abc123',
        content: { type: 'code_execution_result', stdout: 'ok', stderr: '', return_code: 0 },
      },
    }, contentByIdx, toolUses, state);

    const block = contentByIdx.get(2);
    // This is the exact shape Anthropic requires on replay -- the pre-fix code produced
    // {type: 'code_execution_tool_result'} only, losing tool_use_id and content.
    expect(block).toEqual({
      type: 'code_execution_tool_result',
      tool_use_id: 'srvtoolu_abc123',
      content: { type: 'code_execution_result', stdout: 'ok', stderr: '', return_code: 0 },
    });
  });

  it('still preserves the previously-fixed web_search_tool_result type the same generic way', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_xyz',
        content: [{ type: 'web_search_result', url: 'https://example.com', title: 'Example' }],
      },
    }, contentByIdx, toolUses, state);

    expect(contentByIdx.get(0)).toEqual({
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_xyz',
      content: [{ type: 'web_search_result', url: 'https://example.com', title: 'Example' }],
    });
  });

  it('a block missing every required field would fail Anthropic\'s schema on replay -- this is what the bug produced', () => {
    // Regression guard stated as a negative: assert the OLD behavior (bare {type}) is NOT what
    // today's code returns, so a future refactor that reintroduces type-name hand-picking fails
    // this test immediately instead of waiting for a live 400 to surface it again.
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'some_future_tool_result', tool_use_id: 'srvtoolu_new', content: 'whatever' },
    }, contentByIdx, toolUses, state);
    const block = contentByIdx.get(0);
    expect(Object.keys(block).sort()).not.toEqual(['type']);
    expect(block.tool_use_id).toBe('srvtoolu_new');
  });
});

describe('stream-events -- applyStreamEvent: tool_use / server_tool_use input accumulation', () => {
  it('keys each block by ev.index so a server tool and a client tool streaming in parallel never corrupt each other\'s input', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search' } }, contentByIdx, toolUses, state);
    applyStreamEvent({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'query_daily_activity' } }, contentByIdx, toolUses, state);

    // Interleaved partial_json deltas -- exactly what parallel streaming looks like on the wire.
    applyStreamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":' } }, contentByIdx, toolUses, state);
    applyStreamEvent({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"loc":' } }, contentByIdx, toolUses, state);
    applyStreamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"weather"}' } }, contentByIdx, toolUses, state);
    applyStreamEvent({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"0003708"}' } }, contentByIdx, toolUses, state);

    applyStreamEvent({ type: 'content_block_stop', index: 0 }, contentByIdx, toolUses, state);
    applyStreamEvent({ type: 'content_block_stop', index: 1 }, contentByIdx, toolUses, state);

    expect(contentByIdx.get(0).input).toEqual({ query: 'weather' });
    expect(contentByIdx.get(1).input).toEqual({ loc: '0003708' });
    expect(contentByIdx.get(0)._inputJson).toBeUndefined();
    expect(toolUses).toEqual([{ id: 'toolu_1', name: 'query_daily_activity' }]); // server_tool_use never enters toolUses -- it's not round-tripped through runTool
  });

  it('a malformed partial_json JSON parse falls back to an empty object rather than throwing', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'x' } }, contentByIdx, toolUses, state);
    applyStreamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{not json' } }, contentByIdx, toolUses, state);
    applyStreamEvent({ type: 'content_block_stop', index: 0 }, contentByIdx, toolUses, state);
    expect(contentByIdx.get(0).input).toEqual({});
  });
});

describe('stream-events -- applyStreamEvent: text/thinking deltas and stop_reason', () => {
  it('returns textDelta for the caller to forward to the SSE client, and accumulates it on the block', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }, contentByIdx, toolUses, state);
    const r1 = applyStreamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Night shifts ' } }, contentByIdx, toolUses, state);
    const r2 = applyStreamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'run lean.' } }, contentByIdx, toolUses, state);
    expect(r1).toEqual({ textDelta: 'Night shifts ' });
    expect(r2).toEqual({ textDelta: 'run lean.' });
    expect(contentByIdx.get(0).text).toBe('Night shifts run lean.');
  });

  it('accumulates thinking_delta without returning a textDelta (nothing forwarded to the client)', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }, contentByIdx, toolUses, state);
    const r = applyStreamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'weighing data...' } }, contentByIdx, toolUses, state);
    expect(r).toBeNull();
    expect(contentByIdx.get(0).thinking).toBe('weighing data...');
  });

  it('message_delta updates state.stopReason, including to pause_turn', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    applyStreamEvent({ type: 'message_delta', delta: { stop_reason: 'pause_turn' } }, contentByIdx, toolUses, state);
    expect(state.stopReason).toBe('pause_turn');
  });

  it('a message_delta with no stop_reason leaves state.stopReason unchanged', () => {
    const { contentByIdx, toolUses, state } = newCtx();
    state.stopReason = 'end_turn';
    applyStreamEvent({ type: 'message_delta', delta: {} }, contentByIdx, toolUses, state);
    expect(state.stopReason).toBe('end_turn');
  });
});
