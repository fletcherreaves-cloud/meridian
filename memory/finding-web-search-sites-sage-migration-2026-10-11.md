# Finding: migrated the last 3 web-search sites onto sage-chat (2026-10-11)

## Trigger

Follow-up to `memory/finding-sage-web-search-tool-2026-10-10.md` (v5.515, gave SAGE its own
`web_search_20260209` tool). That note's "what this does and doesn't do" section explicitly
left 3 legacy single-feature call sites unmigrated, since at the time `sage-chat` had no web
search and migrating them would have silently dropped real search. Owner: "Migrate the other 3
search sites to SAGE too." With `sage-chat`'s own TOOLS array now carrying `web_search_20260209`
(confirmed live, per the Duncan-weather verification in that note), the blocker is gone.

## What changed

All 3 sites dropped their own `tools:[{type:'web_search_...',name:'web_search'}]` array, their
own personal-API-key header, and (for the two that had one) their own multi-turn
tool_use/tool_result loop — they now just build a prompt and call `callSageOnce`, letting
`sage-chat`'s server-side TOOLS + round loop do the search:

1. **`src/engine/why.js`'s `lookupMissEvent`** ("🤖 AI Lookup — What happened on this date?",
   store-dash.js's reactive anomaly lookup). Was a single Anthropic call with
   `web_search_20250305` (the basic/non-dynamic-filtering variant) — no multi-turn loop needed
   since it never actually handled a `tool_use` round-trip itself (the removed code already
   just read `data.content` for text blocks, meaning the single-call version never worked
   through a real multi-round search either — it only worked when the model answered in one
   shot). Dropped the `if(!apiKey){window.open(searchUrl,'_blank'); ...}` fallback entirely —
   the `searchUrl` Google-search link stays as a manual "check it yourself" affordance in the
   UI (store-dash.js's existing "🔍 Open Web Search Instead" button), now shown alongside every
   result rather than only when no key was set.

2. **`src/features/calendar.js`'s `searchUpcomingEvents`** (proactive school-calendar/local-event
   search feeding `CalendarManagerPanel`'s pending-review queue). Same shape — removed the
   `if(!apiKey) throw` gate, kept the strict "return ONLY a JSON array" prompt + the defensive
   JSON-extraction/validation logic unchanged (that logic doesn't care how the text got
   produced).

3. **`src/views/analytics.js`'s `AIBacktestScanner`'s `callClaudeWithSearch`** — a shared helper
   with a genuine 4-round `tool_use`/`tool_result` loop (the most elaborate of the 3), used by
   both the per-row "🔍 AI" lookup (`lookupAnomaly`) and the batch "🤖 AI Batch" scan
   (`lookupAnomalyForBatch` / `runBatchAIScan`). Collapsed to a 3-line wrapper around
   `callSageOnce` — the loop itself is now `sage-chat`'s concern. Removed every `apiKey`-gated
   UI affordance in this component: the per-row "🔍 AI" button no longer requires
   `apiKey&&!isT`, just `!isT`; the "🤖 AI Batch" button is no longer `disabled:!apiKey` with an
   "Add API key in Settings" title; `runBatchAIScan`'s guard dropped the key check (keeps the
   "run scan first" check); the confirm dialog's "This uses your Anthropic API key" line is
   gone.

## Why this is safe (not a capability downgrade)

All 3 already relied on Anthropic's web search tool for correctness — they weren't plain-text
generators that happened to also claim search. Routing through `sage-chat` doesn't change what
model or search capability answers these prompts (same underlying `web_search_20260209`,
confirmed live in the SAGE chat panel the day before this migration) — it only moves where the
personal API key and the tool-loop bookkeeping live, consistent with the other 8 sites migrated
in v5.513/v5.514.

## Test fix: dispatch #72 C1's own test needed updating

`src/__tests__/dispatch-72-c1-why-lookupmissevent-loc.test.js` asserted the *old* no-key
behavior (`window.open` fallback + `"No Anthropic API key"` error text) as its proof that
`lookupMissEvent` resolves instead of rejecting on the free-`loc`-reference bug it was written
for. That behavior no longer exists. Re-pointed the test at the real current path — mocking
`callSageOnce`, asserting it's called once and the promise still resolves cleanly — which
preserves the original test's actual claim (the promise doesn't reject) rather than the
no-longer-true mechanism it used to prove that claim through.

## Verification

5 new tests (`src/__tests__/dispatch-web-search-sites-sage-migration-2026-10-11.test.js`) call
or render each real function/component and assert `callSageOnce` is what actually gets called,
`fetch` never is, and (for `AIBacktestScanner`) that the "🤖 AI Batch" button is no longer
gated on a personal key. `AIBacktestScanner`'s `results` state is seeded via
`localStorage.setItem('mf_backtest_results', ...)` before mount (same mechanism
`generateReviewPack`'s own test uses) rather than running the real backtest scan engine.

Full suite (574 files / 5392 tests) and `npm run build` both pass clean.

## Scope note

Every one of the original 11 `api.anthropic.com` call sites `memory/finding-sonnet4-retirement-
audit-2026-10-09.md` inventoried is now on `sage-chat`. There is no remaining personal-
Anthropic-key dependency anywhere in the app's client code.
