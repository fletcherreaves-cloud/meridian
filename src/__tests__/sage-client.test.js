// @ts-nocheck
// src/lib/sage-client.js — extracted from src/views/sage.js's own SAGE panel (Task #76,
// P2 panel scorecard) so coaching.js's GM Coaching Brief and analytics.js's LocationBrief
// (Forecast Brief) can call the already-deployed sage-chat Edge Function instead of each
// requiring its own personal Anthropic API key. callSageStream itself is a straight
// extraction (behavior-preserving) — these tests cover the SSE parsing contract it
// depends on, plus the new callSageOnce convenience wrapper.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { supabase } from '../lib/supabase.js';
import { callSageStream, callSageOnce } from '../lib/sage-client.js';

function sseBody(events) {
  const text = events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    getReader: () => ({
      read: async () => {
        if (sent) return { done: true, value: undefined };
        sent = true;
        return { done: false, value: bytes };
      },
    }),
  };
}

describe('callSageStream', () => {
  let originalEnv;
  beforeEach(() => {
    vi.restoreAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    originalEnv = import.meta.env.VITE_SUPABASE_URL;
    import.meta.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  });

  it('throws if VITE_SUPABASE_URL is not set', async () => {
    import.meta.env.VITE_SUPABASE_URL = '';
    await expect(callSageStream([], '', () => {})).rejects.toThrow(/VITE_SUPABASE_URL/);
  });

  it('throws if there is no active session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    global.fetch = vi.fn();
    await expect(callSageStream([], '', () => {})).rejects.toThrow(/Not signed in/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs messages+systemPrompt with a bearer token to sage-chat', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      body: sseBody([{ text: 'hi' }, '[DONE]']),
    }));
    await callSageStream([{ role: 'user', content: 'hello' }], 'sys prompt', () => {});
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://test.supabase.co/functions/v1/sage-chat');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(opts.body)).toEqual({ messages: [{ role: 'user', content: 'hello' }], systemPrompt: 'sys prompt' });
  });

  it('streams text-delta chunks to onChunk and stops at [DONE]', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      body: sseBody([{ text: 'Hello ' }, { text: 'world' }, '[DONE]']),
    }));
    let full = '';
    await callSageStream([], '', (chunk) => { full += chunk; });
    expect(full).toBe('Hello world');
  });

  it('forwards status events to onStatus', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      body: sseBody([{ status: 'Querying sales data…' }, { text: 'done' }, '[DONE]']),
    }));
    const statuses = [];
    await callSageStream([], '', () => {}, undefined, (s) => statuses.push(s));
    expect(statuses).toEqual(['Querying sales data…']);
  });

  it('throws on a non-ok HTTP response', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('boom') }));
    await expect(callSageStream([], '', () => {})).rejects.toThrow(/boom/);
  });

  it('throws when the stream carries an error frame', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      body: sseBody([{ error: 'tool failed' }]),
    }));
    await expect(callSageStream([], '', () => {})).rejects.toThrow(/tool failed/);
  });
});

describe('callSageOnce', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } });
    import.meta.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  });

  it('concatenates streamed chunks into one final string', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      body: sseBody([{ text: '[WIN] ' }, { text: 'Great week.' }, '[DONE]']),
    }));
    const text = await callSageOnce([{ role: 'user', content: 'write a brief' }], 'you are a coach');
    expect(text).toBe('[WIN] Great week.');
  });

  it('propagates a stream error to the caller', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') }));
    await expect(callSageOnce([], '')).rejects.toThrow(/Unauthorized/);
  });
});
