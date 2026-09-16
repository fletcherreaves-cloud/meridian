---
name: finding-p2-scorecard-sage-brief-fix-2026-09-16
description: "Task #76 (P2 panel content/flow scorecard) -- two dead-by-default AI panels found and fixed by routing through the already-deployed sage-chat Edge Function"
metadata:
  node_type: memory
  type: finding
---

## Scope note, read this first

CLAUDE.md's roadmap lists "UX coherence pass + panel scorecard + hole-finding" (P2) as a
deliverable. This task started with a background research agent auditing panels against the
Voice-by-role rubric (CLAUDE.md's "say the number AND the decision" standing rule). That agent's
full panel-by-panel report was not preserved into this memory file -- the session that received it
was compacted before the writeup happened, and reconstructing the full table from memory would
violate this repo's own "measure it, don't reason about it" rule (a re-typed table is a guess
dressed as a record). **This file documents only what was independently re-verified against real
code and actually fixed** -- two panels that the agent flagged as FAIL and this session confirmed
were genuinely, unconditionally dead. A full re-sweep of all ~94 panels against the rubric is
still open work, not done here.

## The two confirmed findings

Both panels shared the exact same defect shape: gated on a personal Anthropic API key
(`localStorage.getItem('mf_anthropic_key')`) that **no user has ever set, including the owner**,
and called `https://api.anthropic.com/v1/messages` directly from the browser. With no key ever
set, both always failed before generating anything -- not a degraded experience, a **dead-by-
default** one, for the app's only two AI-generated-prose panels outside SAGE itself.

1. **GM Coaching Brief** (`src/engine/coaching.js`, `GMCoachingBrief` -> `callClaude`) --
   `if(!apiKey) throw new Error('No Anthropic API key set...')`. Model id was additionally stale
   (`claude-sonnet-4-6`).
2. **Forecast Brief** (`src/views/analytics.js`, `LocationBrief` -> `generateBrief`, exported as
   part of the Analytics module) -- `if(!apiKey){setError('Set your Anthropic API key...');return;}`
   and the empty-state UI rendered "API key required" / "🔑" instead of a generate button.

Both were verified by direct file reads (not trusting the agent's claim), confirming the exact
guard clause and the exact `fetch('https://api.anthropic.com/v1/messages', ...)` call in each.

## The fix

`sage-chat` (Deno Edge Function) has been live and deployed since 2026-07-03, keeps
`ANTHROPIC_API_KEY` server-side, and already does everything either panel needs: take
`{messages, systemPrompt}`, stream back SSE `text`/`status`/`error`/`[DONE]` frames. SAGE's own
panel (`src/views/sage.js`) already had a working client for it (`callSageStream`) -- it just
wasn't reusable by anything outside that file.

- **New `src/lib/sage-client.js`** -- `callSageStream` extracted verbatim (behavior-preserving,
  same auth/SSE-parsing logic) out of `sage.js`, plus a new `callSageOnce(messages, systemPrompt,
  signal)` convenience wrapper that just concatenates the stream into one final string, for
  callers that want a complete-or-nothing result (a letter, a brief) rather than a live stream.
- `sage.js` now imports `callSageStream` from the shared module instead of defining it locally --
  zero behavior change to the SAGE panel itself.
- `coaching.js`'s `callClaude` now calls `callSageOnce` with a coaching-voice system prompt,
  instead of the raw fetch. No more API-key guard -- the panel works for any signed-in user.
- `analytics.js`'s `LocationBrief.generateBrief` likewise calls `callSageOnce` with an
  analyst-voice system prompt. Removed the `apiKey` memo and the "API key required" empty state;
  it now always shows "Ready to generate brief."

Both routes go through `sage-chat`'s existing RBAC scoping and auth -- a restricted-role caller
gets the same access-control preamble SAGE chat already appends, rather than an ungated raw
Anthropic call. Model moves from Haiku 4.5 (Forecast Brief) / stale Sonnet 4.6 (Coaching Brief) to
whatever `sage-chat` is configured for (currently Opus 5) -- a behavior change but a strict
upgrade, and consistent with using one AI backend instead of three different ad-hoc ones.

**Not migrated this pass (separate, larger follow-up, matches the P2-scorecard agent's own
scoping):** several other call sites still read `mf_anthropic_key` and call `api.anthropic.com`
directly -- `grep -n "mf_anthropic_key" src/views/analytics.js` turns up multiple more beyond
`LocationBrief` alone (this repo's own "cite anchors, not line numbers" rule applies here --
re-grep rather than trust a cached line list). Those were deliberately left alone this pass --
larger blast radius, not confirmed dead-by-default the way these two were.

## Tests

- `src/__tests__/sage-client.test.js` (9 tests) -- the extracted `callSageStream`'s SSE-parsing
  contract (auth header, chunk/status/error frames, `[DONE]` termination, non-ok HTTP) plus
  `callSageOnce`'s concatenation and error-propagation behavior. Mocks only the network boundary
  (`supabase.auth.getSession`, `global.fetch`).
- `src/__tests__/dispatch-p2-scorecard-sage-brief-migration.test.js` (2 tests) -- renders the
  REAL `GMCoachingBrief` and `LocationBrief` components (not a description of the change) with no
  `mf_anthropic_key` anywhere and a mocked `../lib/sage-client.js`, clicks Generate, and asserts
  `callSageOnce` is what actually gets called -- so a revert of the call-site wiring (not just the
  helper module) would fail here, per this repo's "would this verification still pass if reverted"
  rule. Also asserts the Forecast Brief's empty state no longer shows "API key required."

Full suite: 526/526 files, 5028/5028 tests. `npm run build`: clean, eager payload 551.25 KB
gzip (budget 850 KB) -- unaffected, since this only touched already-loaded panel modules, no new
static imports into `App.js`.

## Not independently verified end-to-end

This session cannot exercise the app in a browser or call the live `sage-chat` function. The fix
is verified at the code level (real component render + real call-site assertion) but a live click
of "Generate" in production, by the owner, is the actual end-to-end confirmation this needs.
