// @ts-nocheck
import * as React from 'react';
import { supabase } from '../lib/supabase.js';

const h = React.createElement;
const { useState: uSt, useRef: uRef, useEffect: uEf, useCallback: uCb } = React;

const amber = '#f59e0b';
const muted = '#6b7280';
const grn   = '#10b981';

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(ds, signals) {
  const today = new Date().toISOString().slice(0, 10);
  const storeCount = ds?.storeIds?.length || 0;
  const laborCount = ds?.laborRows?.length || 0;

  const laborTs = (ds?.laborRows || []).map(r => {
    const d = r.date instanceof Date ? r.date : new Date(r.date + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d.getTime();
  }).filter(Boolean);
  const fromDate = laborTs.length ? new Date(Math.min(...laborTs)).toISOString().slice(0, 10) : '–';
  const toDate   = laborTs.length ? new Date(Math.max(...laborTs)).toISOString().slice(0, 10) : '–';

  const confirmedSigs = (signals || [])
    .filter(s => s.confirmed)
    .map(s => `  • ${s.name}: r=${s.r?.toFixed(2)}, n=${s.n} data points`)
    .join('\n');

  const plausibleSigs = (signals || [])
    .filter(s => !s.confirmed && Math.abs(s.r || 0) >= 0.30)
    .map(s => `  • ${s.name}: r=${s.r?.toFixed(2)}`)
    .join('\n');

  return `You are SAGE — Strategic Analytics & Guidance Engine for Meridian BI.
You advise Fletcher Reaves, a McDonald's operator managing ${storeCount} locations:
  - MCDOK (McDonald's of Oklahoma) — Oklahoma stores
  - Emerald Arches — Florida stores

Today: ${today}

DATA CURRENTLY LOADED IN MERIDIAN:
  Labor/Operations: ${laborCount} daily rows (${fromDate} → ${toDate})
  Operations Report: ${ds?.opsRows?.length || 0} service/OEPE rows
  FOB / Food Cost:  ${ds?.fobRows?.length || 0} records
  LifeLenz Schedule: ${ds?.schedRows?.length || 0} rows
  SMG FullScale:    ${ds?.smgFullscale?.length || 0} store-period records
  SMG Voice Perf:   ${ds?.smgVoicePerf?.length || 0} rows
  Controls:         ${ds?.ctrlRows?.length || 0} rows
${confirmedSigs ? `\nCONFIRMED SIGNALS (statistically meaningful correlations):\n${confirmedSigs}` : ''}
${plausibleSigs ? `\nPLAUSIBLE SIGNALS (emerging patterns, need more data):\n${plausibleSigs}` : ''}

GUIDELINES:
- Use McDonald's operator terminology: OEPE, TPPH, Labor%, FOB, Base Food%, OSAT, DT%, MOP, Kiosk, 3PO, etc.
- When referencing stores, use store numbers or names. Oklahoma stores include Elgin, Sulphur, Chickasha, etc.; Florida stores are Emerald Arches locations.
- Be direct and operational — tell Fletcher what to DO, not just what the data shows.
- Keep answers concise but complete. No unnecessary preamble.
- If you don't have data on something, say so rather than speculating.
- This is a private tool for one operator. Be candid, specific, and direct.`;
}

// ── Edge Function call with SSE streaming ─────────────────────────────────────
async function callSageStream(messages, systemPrompt, onChunk, signal) {
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
        const { text } = JSON.parse(data);
        if (text) onChunk(text);
      } catch { /* skip malformed */ }
    }
  }
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MsgBubble({ msg, streaming }) {
  const isUser = msg.role === 'user';
  return h('div', {
    style: { display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 16 }
  },
    h('div', {
      style: {
        maxWidth: '82%',
        padding: '10px 14px',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isUser ? 'rgba(245,158,11,.12)' : 'rgba(255,255,255,.05)',
        border: `1px solid ${isUser ? 'rgba(245,158,11,.22)' : 'rgba(255,255,255,.09)'}`,
        fontSize: '13px',
        lineHeight: 1.65,
        color: 'var(--text, #f1f5f9)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }
    }, msg.content),
    h('div', { style: { fontSize: '10px', color: muted, marginTop: 3, paddingLeft: isUser ? 0 : 6, paddingRight: isUser ? 6 : 0 } },
      isUser ? 'You' : (streaming ? 'SAGE · typing…' : 'SAGE'),
    ),
  );
}

// ── Thinking dots ─────────────────────────────────────────────────────────────
function ThinkingDots() {
  const [n, setN] = uSt(1);
  uEf(() => {
    const iv = setInterval(() => setN(p => p >= 3 ? 1 : p + 1), 400);
    return () => clearInterval(iv);
  }, []);
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', color: muted, fontSize: '12px' } },
    h('div', { style: { display: 'flex', gap: 4 } },
      ...[0, 1, 2].map(i => h('div', {
        key: i,
        style: {
          width: 6, height: 6, borderRadius: '50%',
          background: i < n ? amber : 'rgba(245,158,11,.2)',
          transition: 'background .15s',
        }
      }))
    ),
    'SAGE is thinking…',
  );
}

// ── Quick-start prompt chips ──────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'Which stores need my attention this week?',
  'Where are my biggest labor opportunities?',
  'Summarize my district performance.',
  'What do the Signals tell me to act on?',
];

// ── Main panel ────────────────────────────────────────────────────────────────
export function SagePanel({ ds, signals }) {
  const [messages, setMessages] = uSt([]);
  const [input, setInput]       = uSt('');
  const [streaming, setStreaming] = uSt(false);
  const [streamText, setStreamText] = uSt('');
  const [error, setError]       = uSt(null);
  const threadRef = uRef(null);
  const abortRef  = uRef(null);

  uEf(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  const send = uCb(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setError(null);
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStreaming(true);
    setStreamText('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const systemPrompt = buildSystemPrompt(ds, signals);
    let full = '';

    try {
      await callSageStream(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt,
        (chunk) => { full += chunk; setStreamText(full); },
        ctrl.signal,
      );
      if (full) setMessages(prev => [...prev, { role: 'assistant', content: full }]);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'SAGE is unavailable.');
      }
    } finally {
      setStreaming(false);
      setStreamText('');
      abortRef.current = null;
    }
  }, [input, messages, streaming, ds, signals]);

  const stop = () => { abortRef.current?.abort(); };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const hasData = (ds?.laborRows?.length || 0) > 0;
  const sbConfigured = !!import.meta.env.VITE_SUPABASE_URL;

  return h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' } },

    // ── Header ──────────────────────────────────────────────────────────────
    h('div', { style: { padding: '16px 20px 14px', borderBottom: '1px solid rgba(255,255,255,.08)', flexShrink: 0 } },
      h('div', { style: { fontSize: '10px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: amber, marginBottom: 4 } }, 'AI Assistant'),
      h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: '24px', fontWeight: 900, letterSpacing: '-.04em', color: 'var(--text, #f1f5f9)', lineHeight: 1 } }, 'SAGE'),
      h('div', { style: { fontSize: '11px', color: muted, marginTop: 4 } }, 'Strategic Analytics & Guidance Engine · Claude Opus'),
    ),

    // ── Thread ───────────────────────────────────────────────────────────────
    h('div', { ref: threadRef, style: { flex: 1, overflowY: 'auto', padding: '16px 20px' } },

      // Empty state
      messages.length === 0 && !streaming && h('div', { style: { textAlign: 'center', padding: '40px 16px', color: muted } },
        h('div', { style: { fontSize: '36px', marginBottom: 14 } }, '🧠'),
        h('div', { style: { fontSize: '15px', fontWeight: 700, color: 'var(--text, #f1f5f9)', marginBottom: 8 } }, 'Ask SAGE anything'),
        h('div', { style: { fontSize: '12px', lineHeight: 1.7, maxWidth: 380, margin: '0 auto' } },
          hasData
            ? 'SAGE has access to all data loaded in Meridian — labor, food cost, OEPE, schedule gaps, and correlation signals. Ask about specific stores, trends, or what to focus on next.'
            : 'Load your Operations Reports, Labor Analysis, and FOB files first. SAGE uses your real data to give specific, actionable recommendations.',
        ),
        !sbConfigured && h('div', { style: { marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', fontSize: '11px', color: '#ef4444', maxWidth: 380, margin: '16px auto 0', textAlign: 'left', lineHeight: 1.6 } },
          '⚠ Supabase not configured. Deploy the sage-chat Edge Function and set ANTHROPIC_API_KEY. SAGE requires an active Supabase connection.',
        ),
        hasData && sbConfigured && h('div', { style: { marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400, margin: '24px auto 0' } },
          QUICK_PROMPTS.map(p => h('button', {
            key: p,
            onClick: () => setInput(p),
            style: {
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 8, padding: '9px 14px', cursor: 'pointer',
              fontSize: '12px', color: 'var(--text, #f1f5f9)', textAlign: 'left',
            },
            onMouseEnter: e => { e.currentTarget.style.background = 'rgba(245,158,11,.07)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,.2)'; },
            onMouseLeave: e => { e.currentTarget.style.background = 'rgba(255,255,255,.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; },
          }, '→  ' + p))
        ),
      ),

      // Messages
      messages.map((msg, i) => h(MsgBubble, { key: i, msg, streaming: false })),

      // Streaming assistant message
      streaming && streamText && h(MsgBubble, { key: 'stream', msg: { role: 'assistant', content: streamText + '▌' }, streaming: true }),

      // Thinking indicator (before first token)
      streaming && !streamText && h(ThinkingDots, { key: 'think' }),

      // Error
      error && h('div', { style: { marginTop: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)', color: '#ef4444', fontSize: '12px', lineHeight: 1.5 } },
        '⚠ ' + error,
      ),
    ),

    // ── Input area ────────────────────────────────────────────────────────────
    h('div', {
      style: {
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,.08)',
        flexShrink: 0,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
        background: 'var(--surf, #1e293b)',
      }
    },
      h('textarea', {
        value: input,
        onChange: e => setInput(e.target.value),
        onKeyDown: onKey,
        placeholder: 'Ask about your district, stores, or performance… (Enter to send)',
        disabled: streaming,
        rows: 2,
        style: {
          flex: 1,
          background: 'rgba(255,255,255,.05)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 8,
          padding: '10px 12px',
          color: 'var(--text, #f1f5f9)',
          fontSize: '13px',
          lineHeight: 1.5,
          resize: 'none',
          outline: 'none',
          fontFamily: 'inherit',
        },
        onFocus: e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,.4)'; },
        onBlur:  e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; },
      }),
      streaming
        ? h('button', {
            onClick: stop,
            style: {
              background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
              color: '#ef4444', fontWeight: 700, fontSize: '12px', flexShrink: 0,
            }
          }, '■ Stop')
        : h('button', {
            onClick: send,
            disabled: !input.trim(),
            style: {
              background: input.trim() ? amber : 'rgba(245,158,11,.15)',
              border: 'none', borderRadius: 8,
              padding: '10px 18px', cursor: input.trim() ? 'pointer' : 'not-allowed',
              color: input.trim() ? '#000' : 'rgba(245,158,11,.4)',
              fontWeight: 700, fontSize: '13px', flexShrink: 0, transition: 'all .15s',
            }
          }, '→'),
    ),

    // Footer note
    h('div', { style: { padding: '6px 16px 10px', fontSize: '9px', color: muted, flexShrink: 0 } },
      'Powered by Claude Opus 4.8 with adaptive thinking · Messages are sent to Anthropic via Supabase Edge Function',
    ),
  );
}
