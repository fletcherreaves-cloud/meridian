# Finding: gave SAGE real web search (2026-10-10)

## Trigger

Follow-up to `memory/finding-remaining-ai-sites-sage-migration-2026-10-10.md`, which flagged 3
options for the 3 call sites left on the legacy personal-API-key pattern (`why.js`'s
`lookupMissEvent`, `calendar.js`'s `searchUpcomingEvents`, `analytics.js`'s
`AIBacktestScanner.callClaudeWithSearch`) — all 3 use Anthropic's server-side web search tool,
which `sage-chat`'s fixed `TOOLS` array didn't proxy. Owner picked option 2: "Give Sage
web-search support please."

## What this does and doesn't do

**Scope, as asked:** gives SAGE (the chat assistant) its own web search capability. It does
**not** migrate the 3 legacy call sites onto `callSageOnce` — those are separate, narrower
features (reactive anomaly lookup, proactive school-calendar search) with their own prompts and
output shapes (one wants prose, one wants a strict JSON array), not a drop-in fit for SAGE's
general chat tool. Left as a follow-up decision, not done silently.

## Changes (`supabase/functions/sage-chat/index.ts`)

1. **Added `web_search_20260209` to `TOOLS`** (`{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }`).
   Dynamic-filtering variant — supported on `claude-opus-5` (the model this function already
   uses), so no model change needed. No `input_schema` — server tools don't take one.

2. **Fixed a latent correctness bug the new server tool would have exposed.** The streaming
   parser accumulated each tool call's `input_json_delta` bytes onto a single shared
   `toolUses[toolUses.length - 1]` ("whichever tool_use was pushed most recently") instead of
   per content-block index. That was safe only because every existing tool was client-run and
   (in practice) never interleaved. `web_search` streams its own `server_tool_use` block
   alongside any client `tool_use` block the model also calls in the same turn (parallel tool
   use is default-on) — with the old code, one tool's partial JSON would silently corrupt the
   other's. Fixed by accumulating `_inputJson` directly on each block object, keyed by
   `ev.index`, for both `tool_use` and `server_tool_use` block types.

3. **Added `pause_turn` handling to the round loop.** Per Anthropic's docs
   (`shared/tool-use-concepts.md` in the `claude-api` skill): a server tool's own internal
   search loop can hit its iteration cap and return `stop_reason: 'pause_turn'` instead of
   finishing. The fix is to resend the conversation with the paused assistant turn appended —
   no `tool_result`, no synthetic "Continue" message, the API detects the trailing
   `server_tool_use` block and resumes on its own. Added as a branch before the existing
   `tool_use` check, stripping thinking blocks the same way the `tool_use` branch already does
   (thinking blocks need a `signature` to replay and can't just be echoed back).

## System prompt (`src/views/sage.js`)

Added tool 12 (`web_search`) to `buildSystemPrompt`'s tool list, with a CAVEAT steering SAGE to
tools 1–11 first for anything Meridian's own data already answers — web search is for genuinely
external information (local news/weather/events explaining an anomaly, school calendars,
general knowledge SAGE isn't confident about), not a shortcut around the data tools. Updated
the tool count from "eleven" to "twelve".

## CLAUDE.md correction (opportunistic, same pass)

While updating the SAGE tools list, re-measured it against `index.ts`'s actual `TOOLS` array
(per CLAUDE.md's own standing warning that this exact paragraph has drifted before) and found
it was **already stale before this change** — missing `query_forms` (shipped v5.474, #1309).
Fixed both gaps (`query_forms` + `web_search`) in the same edit rather than leaving one found-stale
claim half-corrected.

## ⚠️ NOT DEPLOYED — needs the owner to run the deploy command

This session has no Supabase CLI access token. Confirmed directly: `npx supabase functions
deploy sage-chat --no-verify-jwt` fails with `AccessTokenRequiredError` (no `SUPABASE_ACCESS_TOKEN`
set, and `supabase login` isn't possible from here). The code is correct and committed, but
**SAGE will not actually have web search until someone runs**:

```
supabase functions deploy sage-chat --no-verify-jwt
```

Per CLAUDE.md's SAGE deploy convention. Do not report this as live before that command has
actually been run and the function version has been confirmed to have bumped (same pattern as
the past "SAGE RBAC redeploy" / "SAGE auto-scheduling" pending-action entries in CLAUDE.md's Top
Priorities section — verify via `supabase functions list`, don't assume a push to `main` alone
redeploys an Edge Function).

## Not independently verified end-to-end

No Deno runtime in this sandbox, so `sage-chat/index.ts` could not be run or type-checked
directly here — same gap CLAUDE.md's Task #74 comment already notes for this file. ESLint does
cover `.ts` files globally in this repo and was run against the diff: 2 pre-existing errors
(unrelated to this change, confirmed present on `origin/main` before this edit) plus one
`@typescript-eslint/no-explicit-any` matching a pattern already present in the adjacent
pre-existing code (the `(b: any) => b.type !== 'thinking'` filter) — no new category of lint
error introduced. `npm run build`'s `tsc -b` does not cover `supabase/functions/` (no
`deno.json`/`tsconfig` scopes it), so this file is also not caught by the app's own build gate,
same as before this change.
