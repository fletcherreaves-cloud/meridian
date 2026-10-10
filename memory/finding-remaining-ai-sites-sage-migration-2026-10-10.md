# Finding: migrated the remaining personal-API-key AI sites off `api.anthropic.com` (2026-10-10)

## Trigger

Follow-up to `memory/finding-sonnet4-retirement-audit-2026-10-09.md` (v5.513). The owner asked:
"So all the apis are routed through the sage method now?" — answer was no, only 5 of 11 were.
Owner then asked to finish the remaining 6 files (8 call sites). This note records what
actually happened, which differs from the plan in one respect (see below).

## What got migrated (5 of the 8 remaining sites)

All plain text generation, no tools — straightforward swap onto `callSageOnce`
(`src/lib/sage-client.js`), same pattern as v5.513's 3 fixes and the original dispatch #76
pair:

- `src/views/store-dash.js`'s `AITabInsight` — a reusable "💡 AI Analysis" button used by
  several tabs. Previously `if(!apiKey) return null` — **silently hid its own button** for
  every user with no key set, including the owner. Now always renders.
- `src/views/analytics.js`'s `AIInsightsTab` — "⚡ Generate Insights" (store-level AI
  performance insights).
- `src/views/analytics.js`'s `DistrictPriorityBrief` — "✍ Weekly Narrative" (inline handler,
  not a named function).
- `src/features/calendar.js`'s `generateReviewPack` — batch per-anomaly AI suggestion text
  ("📤 Pack" button in analytics.js's Anomaly Scanner). Dropped the `apiKey` parameter
  entirely from its signature (was threaded in from the one caller, `analytics.js:5347`).
- `src/features/projections.js`'s `PreForecastBrief` — "Generate Summary".

Each site's `localStorage.getItem('mf_anthropic_key')` read, the `if(!apiKey)` gate, and the
raw `fetch('https://api.anthropic.com/v1/messages', ...)` call were removed. Stale "Add API
key in Settings" UI copy was removed alongside each one.

## What was deliberately NOT migrated — and why this isn't just "the same pattern"

**3 of the 8 remaining sites use Anthropic's server-side `web_search_20250305` tool for real
web search**, discovered only by reading each site individually (not assumed from the
"haiku = safe to migrate" pattern the v5.513 audit used — that pattern was about model
retirement risk, not about what each call actually does):

- `src/engine/why.js`'s `lookupMissEvent` — "AI Lookup" button on a detected sales anomaly;
  searches for local news/weather/events on that date.
- `src/features/calendar.js`'s `searchUpcomingEvents` — proactive school-calendar/local-event
  search, feeds the Calendar Manager's pending-review queue.
- `src/views/analytics.js`'s `AIBacktestScanner`'s `callClaudeWithSearch` helper (a shared
  multi-turn tool-use loop, used by 2 call sites within that one component) — same reactive
  anomaly-lookup pattern as `why.js`, implemented separately for the Anomaly Scanner panel.

**`sage-chat`'s `TOOLS` array (`supabase/functions/sage-chat/index.ts`) is SAGE's own fixed
data-query toolset (`query_daily_activity`, `query_lifelenz_labor`, etc.) — it does not accept
or proxy an arbitrary caller-supplied tool like `web_search`.** Swapping these 3 sites onto
`callSageOnce` the same mechanical way as the other 8 would silently drop real web search and
risk the model hallucinating "what probably happened" from training data instead of an actual
search result — materially worse than leaving them on the legacy pattern. This was flagged to
the owner rather than acted on unilaterally, since it's a product-behavior tradeoff (CLAUDE.md:
"stop and ask... a change whose scope... is a judgment call"), not an execution detail.

Three options if the owner wants these closed out too:
1. Leave them on the personal-key pattern (status quo — they're not broken, just not migrated).
2. Add `web_search_20250305` to `sage-chat`'s `TOOLS` array so these can route through it too —
   a backend change to the shared Edge Function, bigger than this session's pass, and worth
   considering whether SAGE itself should gain general web-search ability as a side effect.
3. Migrate them to `callSageOnce` anyway and accept the loss of live search (model answers from
   training-data knowledge only) — not recommended; degrades a working feature.

## Verification

5 new tests (`src/__tests__/dispatch-remaining-ai-sites-sage-migration-2026-10-10.test.js`)
render each real component, click the real button, and assert `callSageOnce` is called and
`fetch` never is — same verification bar as v5.513. Full suite (573 files / 5387 tests) and
`npm run build` both pass clean.

## Current state of the 11 `api.anthropic.com` call sites v5.513's audit inventoried

(This count is of the 7 deferred files from dispatch #76; GM Coaching Brief and Forecast Brief
were already fixed before that audit and aren't part of the 11.)

- **8 of 11 migrated to `sage-chat`**: District Lens story / At A Glance narrative / Location
  Intelligence brief (v5.513, 3 sites) + AITabInsight / AIInsightsTab / DistrictPriorityBrief /
  generateReviewPack / PreForecastBrief (this pass, 5 sites).
- **3 of 11 remain on the personal-key pattern**, all for a real reason (live web search):
  `why.js`'s `lookupMissEvent`, `calendar.js`'s `searchUpcomingEvents`,
  `analytics.js`'s `AIBacktestScanner.callClaudeWithSearch`.

**Every mechanical migration is done.** What's left isn't a to-do list item, it's an open
product decision — see the three options above.
