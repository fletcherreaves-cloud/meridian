---
name: project-sage
description: SAGE AI assistant built into Meridian — Claude Opus 4.8-powered chat, deployed and working as of v4.284
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

SAGE (Strategic Analytics & Guidance Engine) is the Claude API-backed AI advisor built into Meridian BI at v4.281. **Fully deployed and working as of 2026-07-03.**

**Architecture:**
- `supabase/functions/sage-chat/index.ts` — Deno Edge Function that proxies Claude API calls (keeps ANTHROPIC_API_KEY server-side). Verifies Supabase JWT before forwarding. Streams text-delta-only SSE back to client (filters out thinking blocks).
- `src/views/sage.js` — React chat panel. Builds a system prompt from the current `ds` object (store count, data date ranges, confirmed/plausible signals). Streams responses via ReadableStream SSE parsing. Quick-start prompt chips when empty. Stop button during streaming.
- Wired into App.js (`showSage` state, `onOpenModal('sage')`, full-screen overlay like Signals).
- Nav item: 🧠 SAGE in the sidebar.

**Model:** `claude-opus-4-8` with `thinking: {type: "adaptive"}`, `max_tokens: 8000`, streaming.

**Auth:** User's Supabase session token is sent in Authorization header. Edge Function verifies with service role.

**Deployment (completed):**
```
supabase functions deploy sage-chat --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```
`--no-verify-jwt` is required — without it, Supabase's gateway rejects OPTIONS preflight with 401, causing CORS failure. The function handles JWT verification internally.

**Known issues resolved:**
- CORS failure → fixed with `--no-verify-jwt` on deploy
- React error #520 on app load → fixed in v4.284 (window.onerror ignoring React 19 re-reported errors)

**Enhancement ideas (deferred):**
- More data context in system prompt (FOB variance, target gaps, store rankings)
- Tool use so SAGE can query Supabase directly for precise numbers
- Conversation memory across sessions

**Why `thinking: {type: "adaptive"}`:** `budget_tokens` is deprecated on Opus 4.8, rejected with 400. Use `{type: "adaptive"}` only.

**System prompt** includes: store count, orgs (MCDOK/Emerald Arches), data date ranges, row counts for all data types, confirmed and plausible signals from the correlation engine.
