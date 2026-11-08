---
name: plan-huddle-narrative-2026-11-08
description: The Huddle Phase 1 — a click-to-generate, role-voiced AI narrative line embedded on Curated Home, reusing the existing SAGE pipeline (callSageOnce) with no new DDL. Owner-requested "before anything else" 2026-11-08, same night as the concept pitch (The Huddle Artifact) that proposed it.
metadata:
  type: project
---

# The Huddle — Phase 1 (2026-11-08)

## Why, and what this is Phase 1 of

Same-night follow-up to a creative pitch (private Artifact, "The Huddle") that proposed turning
Meridian's own standing voice-by-role rule — *"the default surface of any panel states what to
do, in one line, in restaurant words"* (CLAUDE.md) — into something generated per store/patch/
district rather than hand-written per panel. Owner's reply: *"Phase 1 that first, before anything
else."* This is that build.

## What shipped

**`src/engine/huddle-narrative.js`** — pure, testable logic, no rendering:
- `huddleScopeKey(altitude, viewAsScope, operatorGroup)` — a stable cache-scope string.
  Precedence: a real `operatorGroup` identity beats any `viewAsScope` simulation beats a bare
  altitude. Mirrors the same precedence The Ledger's own default-format logic already gives
  operator identity over altitude.
- `buildHuddleFacts(stores, altitude)` — red/amber/green counts + the top 3 most-severe flagged
  stores (2 flags each), built straight from the same `{loc,name,severity,flags}` shape every
  Curated Home format already renders from (`summarizeStores`'s own input). Deliberately NOT
  built from `buildCuratedHomeItems`'s role-grouped "pattern items" — those vary shape by role and
  could make a claim the raw per-store flags don't actually support. Ground truth in, ground
  truth out.
- `huddleSystemPrompt(altitude)` — the three role voices from the pitch: `store` (GM/manager,
  shift-lead coach), `patch` (Area Supervisor, leads with a win before a fix), `district` (DO,
  framed around leading through supervisors, never a store-level fix list). Falls back to the
  store voice for an unrecognized altitude rather than throwing.
- `huddleUserMessage(facts)` / `huddleStorageKey(scopeKey, dateKey)`.

**`src/views/curated-home.js`** — `HuddleNarrative` component, rendered as the first child in
all four render branches (gameplan / patch / ledger / the generic checklist-bullets-narrative
shell), so it shows identically regardless of which format the viewer picked:
- **Click-to-generate, not auto-fired on mount.** An AI call costs real money; there's no reason
  to spend one on a page view that's just checking a number. Matches the existing
  `at-a-glance.js` `fetchAIComment` pattern (same codebase, same restraint) rather than inventing
  a new convention.
- **Cached per (scope, business day) in `user_settings`** — `loadUserSetting`/`saveUserSetting`,
  the exact existing table and pattern every other per-user cache in this file already uses. No
  new DDL. One click a day pays for the AI call; every other view of the same scope that day
  reads the cache.
- Calls `callSageOnce` (`src/lib/sage-client.js`) — the SAME already-deployed `sage-chat` Edge
  Function every other one-shot AI feature in this app already uses (At A Glance's AI comment,
  Store Dashboard/Analytics briefs). No redeploy, no new auth, no new infrastructure.
- Operator scope (`operatorGroup` set, viewing The Ledger) feeds facts from `operatorStores()`
  (`src/engine/operator-ledger.js`) — the operator's own stores, not the whole district the
  owner/admin's unrestricted `ds` would otherwise expose. Every other altitude feeds facts from
  `scopedBrief.stores`, which is already correctly narrowed (by real RLS for a real GM/DO/AS, or
  by `viewAsScope` under the View As Role sandbox — see `plan-view-as-scope-2026-11-08.md`).
- Fails soft: an AI error renders as a plain error line, never breaks the panel.

Tests: `src/__tests__/huddle-narrative-2026-11-08.test.js` — the pure engine functions directly,
plus render-level tests on the real `CuratedHomePanel` (per this repo's "would this still pass if
reverted" bar): the button doesn't fire an AI call on mount alone, clicking it calls `callSageOnce`
with the right role voice and real facts, the result caches to `user_settings` with the right key,
a cached value loads without a second AI call, and a role change (gm → area_supervisor) changes
the voice.

## What this deliberately is NOT (yet)

- **Not scheduled/auto-generated.** A future Phase (per the pitch's own build order) could
  pre-generate this nightly the way `scripts/sage-run.mjs` already runs scheduled SAGE prompts —
  not needed to prove whether the voice lands right first.
- **Tied to the Recommendation Accuracy Ledger — and it was already live the whole time.**
  Investigated before building this: task #84's "Recommendation Accuracy Ledger Phase 1" is
  fully code-wired (`saveRecommendation`/`updateRecommendationOutcome`/`loadOpenRecommendations`/
  `loadDueForGrading` in `src/lib/supabase.js`, dedupe-keyed, called from Monthly Projections'
  suggestion badges in `analytics.js`). **This plan originally claimed it was "NOT yet live only
  because the owner hasn't run `supabase/schema-recommendation-ledger.sql` against production
  Supabase yet" — that claim was wrong, and was never actually measured against live Supabase
  before being written down.** ✅ CORRECTED 2026-11-08, same night, after the owner ran the three
  scripts anyway: a direct service-role query shows `recommendation_ledger` has held real data
  since **2026-11-04** — 240 rows, all `sales_forecast`/`labor_tpph_forecast`, `created_at`
  between 21:11 and 23:09 UTC that day (the same day task #84 shipped). The owner's own DDL run
  that evening was real; this plan's assumption four days later that it still hadn't happened was
  not. None of the 240 rows are graded yet, but that's expected, not a gap — `outcome_due_at` is
  the end of the target month (Nov 2026), which hasn't closed; `scripts/grade-recommendations.mjs`
  exists and is correct, just not due to run anything yet. This is exactly the "closed-loop
  learning" infrastructure the owner asked for the same night this Phase 1 shipped (*"build a
  table to track the results of the results ongoing as conditions changed"*) — and it has already
  been quietly collecting real data for four days. The natural next step is a `source: 'huddle'`
  row type: log each generated huddle note as a checkable recommendation (closest analog: "for
  the pattern this note identified, did the pattern hold / improve next period") and let the SAME
  grading job that's already designed for forecasts grade huddle notes too — not a new system,
  the ledger is deliberately generic across sources for exactly this reason.

## Owner's same-night follow-on ideas (not built yet, logged here so they aren't lost)

- **QSRSoft Forms deep-linking** for the pre-shift checklist / travel path card: open the real
  QSRSoft form directly from the Huddle note rather than re-building checklist UI in Meridian.
  Not yet investigated against the real QSRSoft Forms endpoints/URL shape — next step before
  building Phase 3 of the original pitch.
- **Food Safety** — owner wants to explore whether the same QSRSoft-forms-deep-link approach
  covers it too, instead of (or before) wiring it through the Forms *pull* data Meridian already
  has (`query_forms`, v5.474).
- **Crew-level recognition** — owner: *"I think between the two of us we can figure this out."*
  Still blocked on an attribution data source (DAR/labor data is store-level, not per-crew-member);
  the original pitch's suggestion to audit the LifeLenz Employee Performance pull first (rather
  than assume a new source is needed) still stands as the next step.
- **Temporal/comparative framing** — owner: huddle notes should be able to reference *"how
  previous shifts ran or previous same days of the week"*, not just the current snapshot, and
  "we should always learn from the past." `buildHuddleFacts` doesn't do this yet (today's facts
  only) — the natural extension is feeding it a small trailing window (e.g. the same weekday's
  last 4 occurrences) alongside today's numbers, reusing `vs-ly.js`'s matched-day comparison
  logic rather than inventing new date math.

## Status

Phase 1 shipped. Build clean (679.20 KB eager, unchanged from baseline — new code lands in
curated-home's existing lazy chunk). Full suite passing (see PR for the exact count at merge).
