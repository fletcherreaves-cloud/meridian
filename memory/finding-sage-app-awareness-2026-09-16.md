---
name: finding-sage-app-awareness-2026-09-16
description: "SAGE comprehensive app-awareness (Task #74) -- scoping + first shipped slice (query_data_health), deferred items, deploy step needed"
metadata:
  node_type: memory
  type: finding
---

## Task #74 ("SAGE: comprehensive app-awareness + troubleshooting assistant") -- scope and what shipped, 2026-09-16

The owner's own framing: *"SAGE should be able to interpret the app environment as completely
as possible including looking up data and presenting analysis, being able to assist with
general troubleshooting and answering questions while also pointing to the help available."*

### What was actually true before this pass (measured, not assumed)

CLAUDE.md's SAGE tool list was itself stale -- it said "7 tools," last corrected 2026-09-07, and
that correction never re-checked itself. The real live `TOOLS` array in
`supabase/functions/sage-chat/index.ts` already had **9** tools, not 7: the 6 query tools + 1
SMG query CLAUDE.md named, PLUS `search_qsr_kb` (vendor QSRSoft Help Center search) and
`search_project_memory` (searches `sage_memory_kb`, a curated slice of this repo's own
`memory/` notes) -- both already built, neither mentioned in CLAUDE.md's list.

Worse: the CLIENT-side system prompt (`src/views/sage.js`'s `buildSystemPrompt`) claimed "nine
tools" but only wrote up 8 -- `search_project_memory` was completely missing from the
human-readable tool guidance Claude actually reads to decide when to call something. The tool
was technically callable (its JSON schema is always sent to the API regardless of the system
prompt text) but under-used in practice, since every other tool in this file gets an explicit
"USE FOR" writeup and this one didn't.

**So "pointing to the help available" was already substantially built** (QSRSoft vendor docs +
this app's own internal memory/notes), just under-documented to SAGE itself. Fixed in this pass
(see below) -- a real, measured drift-correction, not new capability.

### The constraint this pass had to work inside

Per `memory/finding-sage-metric-resolver-not-a-small-port-2026-09-16.md` (Task #60, same week):
this session has **no way to deploy or exercise the live `sage-chat` Edge Function** -- no
`supabase` CLI, no `SUPABASE_ACCESS_TOKEN`. Every change to `index.ts` ships unverified beyond
static review until the owner runs `supabase functions deploy sage-chat --no-verify-jwt`. This
rules out a large, one-shot rebuild (per that finding's own conclusion) and argues for small,
individually-testable additions -- Path A from that finding's own menu.

### What shipped this pass

1. **Fixed the tool-count drift** in CLAUDE.md and `sage.js`'s system prompt (both corrected to
   the real, current count; `search_project_memory` now has a full "USE FOR" writeup like every
   other tool). Pure documentation-in-code, no deploy needed (ships on the next normal Vercel
   build).

2. **New tool: `query_data_health`** -- the first genuinely new capability, directly answering
   the "troubleshooting" half of the ask. Checks whether Meridian's ~21 automated data streams
   are current, reusing the EXACT same registry and thresholds as the in-app At-A-Glance
   freshness checklist (`src/engine/stream-freshness.js`'s `STREAMS`/`WARN_GRACE_DAYS`/
   `CRIT_GRACE_DAYS`, joined with `scripts/lib/scheduled-pull-registry.mjs`'s `PULL_REGISTRY` for
   the real table/column names) -- so SAGE's answer to "is my data current?" always agrees with
   what the app itself shows, the same "always agrees with the panel" bar
   `query_eom_recount_impact` already holds itself to.
   - Split the query/classify logic into a plain-JS module,
     `supabase/functions/sage-chat/data-health.js`, specifically so it's importable into the
     Vitest suite -- the only part of this addition actually verifiable this session, given the
     deploy constraint above. Same precedent `labor-summary-agg.js`/`forecast-snapshots-agg.js`
     already set. 11 tests, `src/__tests__/sage-data-health.test.js`, including the exact
     "month-keyed stream reads Infinity-stale without the right threshold" trap Task #70's own
     coverage audit found for the in-app checklist -- this tool inherits that same fix, not just
     the panel.
   - `index.ts`'s `runTool` implementation (the actual Supabase queries -- one tiny indexed
     `order+limit 1` per stream, run in parallel, same shape
     `scripts/scheduled-pull-watchdog.mjs`'s `fetchLatestDate()` already uses in production)
     is NOT independently testable this session -- static review only, per the constraint above.
   - Returns no store-level figures at all (one query per stream, no per-store breakdown), so it
     needed no RBAC scoping -- safe for any authenticated caller regardless of role.
   - System prompt updated with a standing rule: when a `query_*` tool comes back surprisingly
     low/zero/empty, check `query_data_health` before concluding something is operationally
     wrong at the stores.

### ✅ Deployed (owner-confirmed 2026-09-16) — `query_data_health` should now be live

Owner ran `supabase functions deploy sage-chat --no-verify-jwt`. **Not yet independently
verified end-to-end** — this session has no way to open a live SAGE conversation and confirm the
tool actually gets called and returns real data (same standing gap as the rest of this file's
"cannot deploy or exercise the live Edge Function" note). Re-measure before treating this as
proven: ask SAGE something like "is my data current?" and confirm it calls `query_data_health`
and returns real per-stream results, not a tool-not-found error. Until that live check happens,
"deployed" and "working" are two different claims -- this note only supports the first one.

### What's deliberately NOT attempted this pass, and why

The owner's ask was broad ("as completely as possible"). This pass shipped one well-scoped,
additive, testable slice rather than attempting the full breadth in one unverifiable pass, per
this repo's own standing "measure it, don't reason about it" rule and the Task #60 finding's
explicit warning against a large one-shot Edge Function rebuild. Real remaining gaps, ranked by
where a future pass should look first:

- **Business-domain query coverage gaps**, named by the tools' own caveats: total food cost %
  (not in Meridian's data model at all, per `query_eom_recount_impact`'s own note), Visit
  Readiness/EcoSure, Inventory/eBOS purchases beyond FOB, Smart Targets/projections, Signals
  correlations, Labor Allocation/VLH guide coverage (the real-vs-proxy gap Task #73 just
  surfaced). None of these have a SAGE tool today. Per the Task #60 finding: get the owner's
  steer on which specific missing metric matters enough to justify a new tool, rather than
  building all of them speculatively.
- **A generic "what panel should I look at" tool** (point users to the actual Meridian feature
  for their question, not just vendor docs or engineering memory) -- genuinely new, not yet
  built anywhere. Would need a curated, hand-maintained panel-to-topic map (`panel-registry.js`
  has `id`/`label`/`section` but no free-text "what this panel answers" description to search
  against) -- a real design decision, not a mechanical port.
- **Proactive, not just reactive, troubleshooting** -- the owner's phrasing ("running through
  items, then determining... whether we are good or not... automatically come up with a
  solution") describes an ongoing autonomous review loop, closer to this session's own operating
  model than a SAGE chat-tool feature. `query_data_health` gives SAGE the DATA to do this when
  asked, but nothing yet has SAGE (or anything) proactively surface a stale stream unprompted --
  that's already At-A-Glance's job today (the freshness checklist), so a second, SAGE-side
  proactive surface risks being redundant rather than additive. Flagging as an open design
  question, not a build item, until the owner weighs in.
