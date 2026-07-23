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

---

## Self-instrumenting + prompt library (v4.487, 2026-07-23)

**Feature A — "Log this issue" from a SAGE answer.** Every assistant message's
action bar (Copy/Email/PDF/Excel) now has a **🐞 Log** button →
`LogIssueModal` (`src/views/sage.js`):
- Captures the preceding user question + SAGE's answer.
- `detectSource()` maps keywords → the likely edge tool + table
  (`query_daily_activity`/`qsr_daily_activity`, `query_lifelenz_labor`/
  `lifelenz_schedule`, `query_forecast_snapshots`/`forecast_snapshots`).
- `looksLikeFailure()` (regex on the answer) auto-suggests destination:
  failure language → **Task Queue** (bug, `saveTask`, tier 2, source `sage`);
  otherwise → **Feature Request** (`saveFeatureRequest`, category `Data`). User flips.
- `buildTroubleshootPrompt()` drafts a paste-ready prompt for Claude Code (repro
  steps, 1000-row cap + loc-padding checks, freshness, the edge tool) into the
  ticket notes/dev_notes.

**Feature B (Phase 1) — saved-prompt library.** Header **📚 Prompts** →
`PromptLibraryModal`. Table `sage_prompts` (id, title, prompt_text, tags,
created_by). Loaders `loadSagePrompts`/`saveSagePrompt`/`deleteSagePrompt` in
supabase.js (fail soft if table missing). Save current input; Use (load into
box) / Run (send now) / Delete. `send` refactored to `sendMessage(text)` so a
prompt can run without touching the input box.

## Phase 2 — auto-schedule prompts ✅ SHIPPED (v4.488, GH Action + service account)

Built exactly as spec'd below. `scripts/sage-run.mjs` + `.github/workflows/sage-run.yml`
(hourly cron + workflow_dispatch with `force`/`debug`). `sage_prompts` gained
`schedule_enabled/schedule_hour/schedule_freq/schedule_dow/last_run_at`; new
`sage_prompt_runs` table. Library modal has an **⏰ Schedule** inline editor
(daily/weekly · UTC hour · dow) → `updateSagePromptSchedule`. `SageRunsTile` is the
first At-A-Glance tile (`loadSagePromptRuns(6)`). **To go live:** create a runner
Supabase user + set GH secrets `SAGE_RUNNER_EMAIL`/`SAGE_RUNNER_PASSWORD`/
`VITE_SUPABASE_ANON_KEY`. Original spec kept for reference:

### Original spec

- **Auth blocker:** `sage-chat` validates a real user JWT (`sbAdmin.auth.getUser`),
  so a cron job can't call it with the service-role key alone. Plan: a
  **service-account user** — new secrets `SAGE_RUNNER_EMAIL` / `SAGE_RUNNER_PASSWORD`
  → `signInWithPassword` to mint an access token → POST `{messages, systemPrompt}`
  to `/functions/v1/sage-chat`, read the SSE stream to concatenate `text` deltas.
- **Build:** `scripts/sage-run.mjs` + `.github/workflows/sage-run.yml` (cron, matches
  the existing daily pulls). New tables: `sage_scheduled_prompts`
  (prompt_id, cron/schedule, enabled, last_run, next_run) + `sage_prompt_runs`
  (prompt_id, ran_at, result_md, ok). A prompt row in `sage_prompts` gets a
  "schedule" toggle in `PromptLibraryModal`.
- **At-A-Glance tile:** add `{id:'sage',…}` as the FIRST entry of `DEF_SECS`
  (`src/views/analytics.js:~6361`) AND insert a `secs.find(s=>s.id==='sage'&&s.on)&&(()=>{…})()`
  block as the first child of the tile grid (`~:7504`, before the Intelligence
  block) — render order is source order, so both edits are needed. Tile shows the
  latest scheduled-prompt runs (what fired, when, a result snippet, link into SAGE).

## RBAC awareness ✅ SHIPPED (v4.494, edge-only — needs redeploy)

Owner chose **hard-filter tools** + **allow district aggregates**. All in
`supabase/functions/sage-chat/index.ts` (client unchanged):
- After `getUser`, the fn loads the caller's `profiles.role/accessible_locs/name`
  server-side (never trusted from the client). `accessible_locs` null/empty →
  full access; array → restricted `Set` (normalized via `normLoc` = String(parseInt)).
- `runTool(name, input, allowed)`: each tool queries ALL stores (for district
  context) then `applyScope()` returns per-store detail ONLY for the caller's
  stores, adding each one's `rank`/`of_stores`; district totals/averages stay.
  Restricted callers' model-supplied `locs` filter is ignored (query-all-then-scope),
  so it can't be used to probe other stores. Payload gains `access:'restricted'`,
  `hidden_stores`, `scope_note`.
- An authoritative **ACCESS CONTROL preamble** is appended to the system prompt
  server-side (defense-in-depth + role tone: manager=tactical / supervisor=patch /
  admin=district). The tools are the real enforcement.
- **Owner (accessible_locs null) = unchanged full access.** RBAC only bites for
  restricted beta operators. **Deploy:** `supabase functions deploy sage-chat --no-verify-jwt`.
