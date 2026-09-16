// @ts-nocheck
// Shared client for the already-deployed `sage-chat` Edge Function -- extracted from
// src/views/sage.js's own SAGE panel so any other panel that wants an AI-generated
// brief/letter can reuse it instead of requiring its own personal Anthropic API key
// (localStorage `mf_anthropic_key`, browser-direct `api.anthropic.com` call). Keeps
// ANTHROPIC_API_KEY server-side and reuses the RBAC scoping + auth `sage-chat`
// already does for every caller.
import { supabase } from './supabase.js';

export async function callSageStream(messages, systemPrompt, onChunk, signal, onStatus) {
  const sbUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (!sbUrl) throw new Error('VITE_SUPABASE_URL not set — Supabase not configured.');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Not signed in — sign in to use SAGE.');

  const response = await fetch(`${sbUrl}/functions/v1/sage-chat`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, systemPrompt }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(err || `SAGE error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.text)   onChunk(parsed.text);
        if (parsed.status && onStatus) onStatus(parsed.status);
        if (parsed.error)  throw new Error(parsed.error);
      } catch (e) { if (e.message && !e.message.startsWith('data:')) throw e; }
    }
  }
}

// Convenience wrapper for callers that just want the final concatenated text (a
// one-shot letter/brief that renders complete or not at all), not a live stream.
export async function callSageOnce(messages, systemPrompt, signal) {
  let full = '';
  await callSageStream(messages, systemPrompt || '', (chunk) => { full += chunk; }, signal);
  return full;
}
