# Finding: Anthropic Claude Sonnet 4 retirement — audit + fix (2026-10-09)

## Trigger

Owner forwarded Anthropic's own API deprecation-notice email: `claude-sonnet-4-20250514` was
retired 2026-06-15. "Fletcher Reaves's Individual Org" sent 2 failed `not_found_error` requests
against it on 2026-10-08, from personal API key "fletcher reaves-onboarding-api-key". Anthropic
recommends migrating to `claude-sonnet-5-5`.

## Why this exists at all

Meridian's primary AI surface, SAGE, is architecturally unaffected — it routes server-side
through the `sage-chat` Supabase Edge Function on `claude-opus-5`, with no client-side model
string. But several much smaller "AI narrative/brief" buttons scattered across the app predate
that architecture: they call `https://api.anthropic.com/v1/messages` **directly from the
browser**, using a personal API key the user pastes into `localStorage.mf_anthropic_key`
(Settings → AI & Integrations), with the model id hardcoded client-side. A prior pass
(dispatch #76, v5.459, 2026-09-16) found and fixed 2 of these (GM Coaching Brief, Forecast
Brief) by routing them through `sage-chat` instead via a new shared `src/lib/sage-client.js`
(`callSageOnce`), and explicitly deferred "the other 7 files still on the legacy pattern" as
a separate follow-up. This retirement email is what triggered finishing that follow-up for the
3 sites it actually broke.

## Full measured inventory — every `api.anthropic.com` call site (11 total, across the 7
deferred files)

| File | Model used | Status |
|---|---|---|
| `src/views/analytics.js` (AIInsightsTab-style helper, line ~105) | `claude-haiku-4-5-20251001` | fine, untouched |
| `src/views/analytics.js` `DistrictLensPanel.generateNarrative` ("✨ Generate District Story") | `claude-sonnet-4-6` | **broken — never a real model id, not even a retirement casualty, always 404'd** |
| `src/views/analytics.js` (weekly district narrative, line ~2394) | `claude-haiku-4-5-20251001` | fine, untouched |
| `src/views/analytics.js` (line ~4415) | `claude-haiku-4-5-20251001` | fine, untouched |
| `src/views/at-a-glance.js` `AtAGlance.fetchAIComment` ("AI Narrative" dashboard toggle) | `claude-sonnet-4-20250514` | **broken — exact retired id from the email** |
| `src/features/location-intel.js` `liGenerateAI` ("⚡ Generate" AI mode) | `claude-sonnet-4-20250514` | **broken — exact retired id, AND never sent an `x-api-key` header at all (a second, independent bug — this call was 401'ing even before the retirement)** |
| `src/engine/why.js` (line ~89) | `claude-haiku-4-5-20251001` | fine, untouched |
| `src/features/calendar.js` (2 sites, lines ~1385, ~1827) | `claude-haiku-4-5-20251001` | fine, untouched |
| `src/views/store-dash.js` `AITabInsight` (line ~1297) | `claude-haiku-4-5-20251001` | fine, untouched |
| `src/features/projections.js` (line ~354) | `claude-haiku-4-5-20251001` | fine, untouched |

Anthropic has not retired `claude-haiku-4-5-20251001` — the 8 haiku call sites are out of
scope for this fix and were left exactly as dispatch #76 left them. They still carry the same
personal-key/direct-browser architecture and are a candidate for the same migration whenever
someone next touches one of those files, but doing all 8 in this pass would have widened the
fix well past what the email actually reported broken.

## Fix

The 3 broken sites (`analytics.js`'s `generateNarrative`, `at-a-glance.js`'s `fetchAIComment`,
`location-intel.js`'s `liGenerateAI`) were migrated onto `callSageOnce` from
`src/lib/sage-client.js` — the exact precedent dispatch #76 already proved out twice. Each
site's `localStorage.getItem('mf_anthropic_key')` gate and raw `fetch('https://api.anthropic.com/v1/messages', ...)` call were removed; the prompt text was split into a `systemPrompt` (what
the assistant is) + user `content` (the actual request), matching `callSageOnce`'s signature.
A stale "Requires API key in Settings → AI & Integrations" line in `analytics.js`'s Story tab
copy was also removed since it's no longer true.

Tests: `src/__tests__/dispatch-sonnet4-retirement-ai-narrative-migration-2026-10-09.test.js` —
renders the real `DistrictLensPanel`/`AtAGlance`/`LocationIntelligence` components, clicks the
real button, and asserts `callSageOnce` is what gets called (never `fetch`), per this repo's
"would this verification still pass if reverted" rule. `DistrictLensPanel`'s test needed real
synthetic `laborRows`/`opsRows` (12 days, one store) to get past the panel's own `hasData` gate
— the Story tab renders nothing at all otherwise.

## Scope note

This was a measured, not assumed, audit — all 11 call sites were individually read before any
were touched, per CLAUDE.md's "measure it, don't reason about it" rule (a pattern match on
"uses `claude-sonnet-4`" would have missed that one of the "broken" sites' id was never valid
in the first place, and would have wrongly swept in 8 fine haiku sites). Full suite (572 files /
5382 tests) and `npm run build` both pass clean after the fix.
