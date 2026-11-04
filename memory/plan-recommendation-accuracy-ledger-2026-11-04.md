# The Recommendation Accuracy Ledger — design doc (2026-11-04)

## Why this, and why now

A background competitive-research pass (2026-11-04, owner-approved strategic discussion on
differentiation) measured the restaurant-ops/BI market directly rather than guessing: PAR
Technology's "Coach AI" already does real tool-calling against live POS/inventory/labor data at
scale (~1,000 stores live, targeting 50,000 by EOY 2026) — so "AI copilot with live tool access"
is NOT a moat; that got proven table-stakes 12-18 months ago. Toast IQ and R365 AI are chasing
the same ground. What the research did NOT find anywhere in the reviewed field: a vendor that
closes the loop from **a recommendation → a tracked real-world outcome → a visible, self-graded
accuracy record** for its own AI/model output. Meridian already has the exact cultural and
technical discipline this needs — the forecast-accuracy backtesting, the Model Assignment
panel's Period-Total Scoreboard, the whole "measure it, don't reason about it" standing rule —
just not yet pointed at the app's own recommendations. This doc proposes doing that.

**The pitch, in one line:** every suggestion Meridian surfaces — a forecast number, a SAGE chat
recommendation, a risk flag — gets tracked against what actually happened, and that track record
is visible, not asserted. A competitor can copy a feature. Copying a multi-year, honest,
self-graded track record requires actually having run the thing that long.

## What already exists that this builds on (precedent, not invention)

- **`forecast_snapshots`** (Supabase table, confirmed live — `saveForecastSnapshots`/
  `loadForecastSnapshots` in `src/lib/supabase.js`): upserts `{loc, dt, source, forecast_sales,
  actual_sales, mape}` on conflict `(loc, dt, source)`. This is the ledger's closest existing
  ancestor — but narrow (sales forecast models only, one row shape) and populated by the backtest
  panel, not by every suggestion-surfacing feature in the app.
- **`smart_target_adjustments`** (Supabase table, confirmed live, `src/lib/supabase.js` ~line
  4269): per-store/metric adjustment records with the same "proposal, then what actually got
  set" shape Smart Targets already uses.
- **`backtest.js`'s `runPeriodTotalBacktest`** (Model Assignment → Period-Total Scoreboard):
  the existing engine that grades forecast models against real rolling-28-day totals, strictly
  leak-free. The ledger's grading job reuses this exact philosophy (sum real numerator/
  denominator via `metric-source.js`, never average pre-rolled daily ratios) rather than
  inventing new grading math.
- **The suggestion-badge UX pattern** (`EditableProjCell` in `src/views/analytics.js`, task #80
  Phase 1 + Phase 2): a model proposes a value, renders a clickable "Suggested X" badge, and the
  owner accepts or overrides it through the exact same save path a hand-typed value takes. This
  is already the right UX contract for a recommendation — it just isn't logged anywhere once
  rendered.
- **SAGE's `TOOLS` array** (`supabase/functions/sage-chat/index.ts`): already a live-tool-calling
  agent with per-turn tool definitions. Adding one more tool is a small, well-understood lift
  compared to parsing free-text chat transcripts after the fact.

## What the ledger actually is

One generic, cross-cutting table — not a bespoke table per feature — that captures ANY
recommendation Meridian's engines or SAGE surface, whether or not it was accepted, and whether
or not an outcome is knowable yet.

### Proposed schema (DDL — the owner's own action per this repo's standing rule; nothing here
is run by an agent session)

```sql
create table recommendation_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),   -- match whatever this repo's real tenant FK is
  loc text,                                           -- nullable: some recommendations are fleet-wide
  source text not null,         -- 'sales_forecast' | 'labor_tpph_forecast' | 'sage_chat'
                                 -- | 'visit_readiness' | 'scanner_signal' | ...
  model_version text not null,  -- e.g. 'owner-sales-forecast-v1', free text, never inferred
  recommendation_text text not null,   -- human-readable, what was actually shown/said
  recommendation_value numeric,        -- the suggested number, when there is one
  context jsonb not null default '{}', -- inputs/window that produced it (store, period, etc.)
  status text not null default 'open', -- 'open' | 'accepted' | 'overridden' | 'ignored' | 'graded'
  accepted_value numeric,              -- what the user actually set, if different from the suggestion
  decided_at timestamptz,
  outcome_due_at timestamptz,          -- when the real actual becomes knowable (e.g. period close)
  outcome_value numeric,
  outcome_error numeric,               -- recommendation_value vs outcome_value, computed at grading
  grade text,                          -- 'within_tolerance' | 'over' | 'under' | null until graded
  graded_at timestamptz,
  created_at timestamptz not null default now()
);
-- tenant_id + RLS via the same public.my_locs()/accessible_locs mechanism every other table uses.
-- Index on (source, status), (tenant_id, outcome_due_at) for the grading job's own query.
```

Deliberately ONE table, not one per source — a future fifth recommendation type needs a new
`source` value and a `context` shape, never a new table or a UI change.

### Capture points (where rows get written)

**Phase 1 — the easy, already-structured sources (build first, no SAGE redeploy needed):**
- Monthly Projections' sales/labor/TPPH suggestion badges (`salesForecastSuggestions`/
  `laborTpphSuggestions` in `analytics.js`): log once per (loc, field, period) the first time a
  suggestion renders — not on every re-render. `EditableProjCell`'s existing `onSave` path is
  where `status` moves to `accepted` (value matches the suggestion) or `overridden` (value
  differs) or stays `ignored` once the period closes with no edit at all.
- `outcome_due_at` = the end of the target month; the grading job pulls the real actual via
  `metric-source.js`'s existing `metricSumRatio`/equivalent once that date passes — never a raw
  row read, per the data-sourcing standard.

**Phase 2 — SAGE self-tagging its own advice:**
- A new tool, e.g. `log_recommendation({source:'sage_chat', recommendation_text, recommendation_value?, loc?, outcome_due_at?})`,
  added to `sage-chat/index.ts`'s `TOOLS` array and its own system prompt, instructing SAGE to
  call it whenever it gives a CONCRETE, checkable recommendation ("staff two more on Friday
  dinner," "expect OEPE to miss target this week") — never for general conversation or a plain
  factual lookup. SAGE decides what's checkable; nothing tries to NLP-parse transcripts after
  the fact, which would be fragile and unverifiable.
- Needs a `sage-chat` redeploy (`supabase functions deploy sage-chat --no-verify-jwt`) and a
  system-prompt update in `buildSystemPrompt` (`src/views/sage.js`) — both real, planned changes,
  not DDL, so an agent session CAN do this part once Phase 1 proves the pattern.

**Phase 3 — Visit Readiness + Scanner:**
- Visit Readiness: log each store's `fsFlag`/other risk flag once per period; grade against the
  next real EcoSure/visit outcome once one lands (reuses the exact `lastEcoSureByLoc`/real-signal
  preference logic the EcoSure-replaces-proxy work already built).
- Scanner: when a correlation is promoted to Signal Lab, log it as "this pattern should keep
  holding"; grade by re-measuring the same correlation on a later window and checking it didn't
  collapse (a natural extension of Scanner's own FDR-correction discipline, not new statistics).

### Grading job

A scheduled task (same mechanism as `sage-run.mjs`'s hourly Action, or folded into the new
weekly self-maintenance sweep — `memory/sweep-dimensions.md`) that:
1. Queries `recommendation_ledger` for rows where `outcome_due_at <= now()` and `outcome_value
   is null`.
2. Pulls the real actual through the SAME shared helpers the rest of the app already uses
   (`metric-source.js` for ratio/rate metrics, never a bespoke raw read) — the data-sourcing
   standard applies to the ledger exactly as it does to every panel.
3. Computes `outcome_error` and `grade` using the SAME tolerance/leak-free logic
   `runPeriodTotalBacktest` already established — never average-of-averages, never a new ad hoc
   threshold invented just for this.
4. Writes the result back, `status` → `'graded'`.

### Surfacing (the actual market-facing proof point)

A new, lightweight view — plausibly a tab on the existing Model Assignment panel (next to the
Period-Total Scoreboard it already shares grading philosophy with), or its own small panel:
- Overall recommendation accuracy, broken out by `source` (sales forecast / labor forecast /
  SAGE chat / Visit Readiness / Scanner), trended over time.
- Acceptance rate alongside accuracy — a recommendation the owner always overrides in the same
  direction is itself a finding (the model is systematically off, not just "sometimes wrong").
- This is the thing worth showing a prospective second operator: not a claim that the AI is
  good, but the actual graded history of whether it has been.

## What this deliberately does NOT do

- **No closed-loop auto-tuning.** The ledger informs; it never silently adjusts a model's
  weights or parameters based on its own grades without a human seeing the change. This protects
  the "model proposes, owner decides" contract every suggestion badge already promises — the
  moment that promise breaks, every suggestion in the app becomes something the owner has to
  double-check instead of trust.
- **No grading of pure conversation.** Only recommendations SAGE itself tags as concrete and
  checkable get a ledger row. Trying to score "chit-chat" or an informational answer with no
  real-world outcome would be noise, not signal.
- **No new DDL run automatically.** The schema above is a proposal for the owner's own Supabase
  SQL editor action, same as every other schema change this repo makes.

## Phasing / what to build first

1. **Phase 1** (smallest, highest immediate value, no SAGE change): the table (owner's DDL) +
   wiring Monthly Projections' existing sales/labor/TPPH suggestions into it + the grading job
   for just those three sources, reusing `metric-source.js`. This alone produces the first real
   graded track record within one target-month cycle of shipping it.
2. **Phase 2**: SAGE's `log_recommendation` tool + prompt update + redeploy.
3. **Phase 3**: Visit Readiness + Scanner integration + the surfacing panel.

Each phase ships independently and clears `memory/release-bar.md` on its own — this is not a
single big-bang build.

## Open questions for the owner

- Exact `tenant_id`/location-scoping FK shape to match (the sketch above assumes a `tenants`
  table and `accessible_locs`/RLS pattern consistent with every other table — verify against the
  real `schema.sql` before writing the real DDL, don't assume this doc's sketch is final).
- Naming — "Recommendation Accuracy Ledger" is descriptive, not a product name. Worth a short
  branding pass once Phase 1 is real and there's an actual track record to put a name on.
- Whether Phase 1's grading window (full target month) is the right cadence, or whether a
  shorter mid-month check (like the existing Current-Month Pace section) is also worth logging
  as an earlier, lower-confidence grade.
