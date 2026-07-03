// Meridian SAGE — Claude API proxy Edge Function
// Proxies streaming chat requests to Anthropic, filtering to text-only SSE.
// Auth: requires a valid Supabase JWT (user session token) in Authorization header.
// Deploy: supabase functions deploy sage-chat
// Secrets: supabase secrets set ANTHROPIC_API_KEY=<your-key>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY    = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('[sage-chat] ANTHROPIC_API_KEY not set');
    return new Response(JSON.stringify({ error: 'SAGE not configured — ANTHROPIC_API_KEY missing' }), {
      status: 503, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Verify user session
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (token) {
    try {
      const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const { data: { user }, error } = await sbAdmin.auth.getUser(token);
      if (error || !user) {
        console.warn('[sage-chat] Auth failed:', error?.message);
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }
    } catch (e) {
      console.warn('[sage-chat] Auth check error:', e);
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }
  } else {
    return new Response('Unauthorized — session token required', { status: 401, headers: CORS });
  }

  let body: { messages: { role: string; content: string }[]; systemPrompt: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS });
  }

  const { messages = [], systemPrompt = '' } = body;

  // Call Anthropic with streaming
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error('[sage-chat] Anthropic error:', anthropicRes.status, errText);
    return new Response(JSON.stringify({ error: errText }), {
      status: 502, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Transform Anthropic SSE → simplified text-delta-only SSE
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const transformedStream = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body!.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              // Only forward text content — skip thinking blocks
              if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta.text
              ) {
                const payload = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
                controller.enqueue(encoder.encode(payload));
              }
            } catch {
              // Malformed event — skip
            }
          }
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(transformedStream, {
    headers: {
      ...CORS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});
