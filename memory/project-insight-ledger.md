---
name: project-insight-ledger
description: "Design for the Insight Ledger — giving Meridian's findings a memory. Preserves the AIInsightsLog idea (an AI writer + human triage journal) that was built as UI-only in 2026 and never wired to a producer. Reframed: the producers now exist and throw their output away."
metadata:
  node_type: memory
  type: project
---

# Insight Ledger — giving findings a memory

**Status:** design, not built. Owner directive (2026-08-10): *"I remember this and want to not
lose it. It is a great idea that needs consideration for proper implementation."*

## Where this came from

`AIInsightsLog` (`src/views/store-analytics.js:2365`) was built as a journal of AI findings +
manual notes: category taxonomy, star/done/dismiss triage, search, filters. Its empty state
promises **"AI findings and manual notes appear here."** Its `add()` carries a `source` field.

Measured 2026-08-10 (`grep`, not recollection):

- `setShowInsights(true)` **is never called anywhere in the codebase.** The panel is rendered
  at `App.js:3684` behind `showInsights`, whose only setter is the `onClose` handler. There is
  no nav item and no modal-router case. **It has never been openable.**
- `mf_insights` (localStorage) has exactly three touchpoints, all inside that one function:
  `loadInsights`, `saveInsights`, and the `add()` the Save button calls with a hard-coded
  `source:'manual'`. **Nothing has ever written an AI insight.** No SAGE path, no Edge Function,
  no script, no engine module.

So the `source` field was designed for a writer that was never built. The reason is not
neglect — **in 2026 there was nothing generating findings to write.** That is no longer true,
and that is the whole reason this is worth building now rather than deleting.

## The reframe

This is not "build an AI that writes insights." Four producers already generate findings on
every load and **throw them away**:

| Producer | Where | What it produces | What persists today |
|---|---|---|---|
| Attention feed | `buildAttentionFeed` (`engine/attention-feed.js:263`) | 10 detectors → ranked items, each with a stable `id` | nothing (acks only, `attention_acks`) |
| Swing detector | `engine/swing-feed.js` | per-store week-over-week swings | nothing (acks only, `swing_acks`) |
| SAGE scheduled runs | `scripts/sage-run.mjs` → `sage_prompt_runs` | AI-authored analysis, hourly | the raw answer, surfaced as an At-A-Glance tile |
| Scanner | Signals → 🔎 Scanner | correlations that clear FDR guardrails | only if promoted to Signal Lab |

Today **nothing in Meridian remembers that it told you something.** Every detector recomputes
from scratch on every load. You cannot answer: *did this fire before? for how long? did we act
on it? did the fix work?*

That last question is the one worth building for, and Meridian is unusually well positioned to
answer it: every finding is keyed to a `(loc, metric, date)`, and the app already holds the
historical series via `metricSeries`. **Mark an insight done → snapshot the metric → check back
in N days → report whether it actually moved.** Nothing else in the app closes that loop.

## Design

### Storage — Supabase, not localStorage

New table `insights` (standing rule: every persistent data type goes to Supabase). `tenant_id`
+ RLS on `accessible_locs`, matching the Phase-2 pattern. The old `mf_insights` blob needs no
migration path — the panel was never openable, so no user has data in it.

Sketch (worker to finalize):

```
id, tenant_id, loc (null = district-wide), cat, severity,
source ('attention'|'swing'|'sage'|'scanner'|'manual'), source_ref (detector id / run id),
situation_key (dedup — see below), title, body, metric,
first_fired_at, last_fired_at, fire_count,
status ('new'|'ack'|'acting'|'done'|'dismissed'), starred,
resolved_at, baseline_value, outcome_value, outcome_checked_at
```

### The dedup key is the crux

10 detectors × 27 stores × daily = a firehose. A detector firing 40 days running must be **one
row with `fire_count:40` and `first_fired_at`**, not 40 rows. That single decision is the
difference between a ledger and noise.

**Do not invent a second keying scheme.** `swing-feed.js` already has the machinery
(`ackKey`/`partitionAcked`/`acknowledge`/`pruneAcks`, generalized with an optional `keyFn`),
and its rule is already the right one: *key to the SITUATION, not the store*, so an escalation
from warn to crit is a new situation rather than something an old ack suppresses. Reuse it.

### Write at the existing seam, once

`buildAttentionFeed` is where all 10 detectors converge, and every item already carries a
stable `id` (`finding-${loc}-${rule}`, `fob-${loc}`, …). Writing there covers all ten in one
place. Same for swing. SAGE runs write from the Action that already exists.

### Auto-write threshold

`crit` + `warn` only. `findingsToFeedItems` already drops `info`/`ok`/`fc` — inherit that,
don't widen it. An insight ledger that logs strength notes is a log nobody reads.

### The loop-closing bit (the actual point)

On `status → done`, snapshot the relevant metric via `metricSeries`. N days later, recompute
and store the delta. Surface three outcomes: **moved / didn't move / got worse.** Over time
this also grades the detectors themselves — a rule whose "done" items never move is a rule
worth retuning or retiring, which feeds directly into the scoring-system revisit.

### Harvest from AIInsightsLog before it goes

Two things are worth keeping and nothing else is:

1. **The category taxonomy** — ops / controls / labor / sales / weather / anomaly / other, each
   with a color. TaskQueuePanel has no equivalent.
2. **The triage verbs** — star / done / dismiss, plus the pending/starred/done filter set.

## Decisions (owner, 2026-08-10) — both settled, both revisitable

1. **Standalone panel.** Owner chose (a) over the Task-Queue-tab option I leaned toward.
   Reasoning to respect when building: an insight and a task are genuinely different objects —
   a task is work you decided to do, an insight is something the system noticed and may never
   become work. Folding them into one panel would have forced one status vocabulary onto both.
   **Cost accepted:** one more panel during a phase whose whole point is reducing panel count.
   That is a deliberate trade, not an oversight. It should still *graduate* a row into a Task
   Queue task via the existing `saveTask`, so the two stay connected without being merged.
2. **Structured findings only for v1.** SAGE prose stays in `sage_prompt_runs` and does not
   write ledger rows. Prose is hard to dedup and impossible to close the loop on — there is no
   metric to snapshot. **Flagged for reassessment:** once the structured ledger has run long
   enough to show whether the outcome loop actually works, revisit whether SAGE should emit
   *structured* findings (a `{loc, metric, claim}` triple) alongside its prose answer. That is
   the natural v2, and it is the version worth wanting — but it is worth nothing until the
   dedup and outcome machinery is proven on detectors that already produce structured output.

Both decisions are marked revisit-later at the owner's direction. Neither should be quietly
re-opened by a future session without saying so.

## Sequencing — do not let this derail Spine 1

1. **Measure first** (cheap, no UI): instrument `buildAttentionFeed` for a week and count real
   fire volume per detector per store, and how much collapses under the situation key. If it
   does not collapse hard, the design changes before any UI is built. *Measure it, don't reason
   about it.*
2. Table + writers + dedup. No UI.
3. Outcome measurement.
4. UI — a standalone panel, per decision (1), lazy-loaded like every other secondary panel
   (`lazyPanel()`), with a "graduate to task" action wired to `saveTask`.

Step 1 is the gate. Nothing after it is worth starting until the volume numbers are in hand.

### Step 1 shipped (2026-08-10, issue #143, v4.963) — instrumentation only, no numbers yet

`src/engine/insight-ledger-measure.js` + one call site (`attention-now.js`'s `useAttentionFeed`,
wiring `buildAttentionFeed`'s new optional `onFireVolume` callback). Observation only, verified
byte-identical to the pre-instrumentation return value by a dedicated test — the ledger question
gets answered without risking anything about what the panel currently renders.

**What it records**, day-bucketed (one snapshot per calendar day, not one row per page load —
opening the app 20 times today overwrites the same bucket, doesn't append 20 rows): total items,
per-detector counts, and the set of situation keys that fired, each keyed on the item's own `.id`
— the exact key `analytics.js`'s `feedKeyFn` already acks attention items on, not a new scheme.
Persisted to Supabase `user_settings` under `insight_ledger_fire_volume` via `blob-sync.js`'s
existing `pushBlob`/`hydrateBlob` pattern; local mirror in `localStorage['mf_ledger_fire_volume']`.

**How to read it back once a week of usage has accumulated** — this is the step that was
deliberately NOT done as part of #143 (there's no data yet):
```js
import { hydrateFireVolume, summarizeFireVolume } from './src/engine/insight-ledger-measure.js';
hydrateFireVolume(blob => console.log(summarizeFireVolume(blob)));
```
`summarizeFireVolume` returns `{ daysMeasured, totalFires, distinctKeys, collapseRatio,
byDetectorTotal, anyCapped, keyInfo }` — `collapseRatio` (`totalFires / distinctKeys`) is the
headline number this whole exercise exists to produce. `anyCapped` flags whether any day's real
fire volume exceeded `rankAttention`'s cap, so a capped day is never silently under-counted (the
snapshot is built from the pre-rank/pre-cap per-detector arrays, so the count itself can't be
capped — this flag is just honesty about what the RENDERED panel would have shown that day).

**Removable in one commit**, per the issue's own instruction: delete
`engine/insight-ledger-measure.js`, the `onFireVolume` param + its one call in
`attention-feed.js`'s `buildAttentionFeed`, and the one import + wired call in
`attention-now.js`. Nothing else references it.

**Still gating everything after step 1**: the actual numbers. This needs roughly a week of real
multi-device usage (the owner opening Needs Attention across desktop/mobile) before
`summarizeFireVolume` has anything meaningful to say. Do not start step 2 (table + writers) until
someone has actually run the read-side snippet above and reported real numbers.
