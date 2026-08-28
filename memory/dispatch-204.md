# Dispatch #204 — build Food Cost and Labor & Scheduling tabs in Store Analytics' District View

## Context — owner-approved concept, real engines already exist, design reference included

Owner, live in this session: *"include a food cost and labor and scheduling tabs in the district
view store panels... show me not only really useful stuff but also display data in a manner that
would stand out and make me want to take action on it... let's make sure all of our intelligence
is wired up to cover all of the data available."* A concept mockup was built and shown to the
owner, who confirmed: *"I am a fan of the store cockpit."* **This dispatch turns that approved
concept into the real feature.**

**Design reference — read this first, before any code.** `memory/design-refs/store-cockpit-mockup.html`
is a static HTML/CSS/JS mockup (open it in a browser, or just read the file — it's plain, no
build step) showing the exact panel layout, color tokens, typography, and interaction shape the
owner approved: a tab strip toggling between "Food Cost" and "Labor & Scheduling," each built
from a hero verdict band + several supporting panels. **Match its visual language** (dark-first
McDonald's-gold accent, IBM Plex Sans/Mono, the status-pill/driver-bar/hero-number component
shapes) rather than inventing a new one — it was designed specifically for this codebase's
existing dark theme and CLAUDE.md's UI Conventions (dense, power-user, no emoji beyond nav icons —
the mockup itself avoids emoji in its actual UI chrome even though this doc's prose doesn't).
The mockup uses fabricated illustrative numbers for one example store (Atoka-Mississippi) — your
job is wiring every one of those numbers to the REAL engines below, for the REAL selected store.

**Where the two tabs live**: `src/views/store-analytics.js`'s existing District View tab strip
(the same file dispatch #200 already added an `embedded` `LocationIntelligence` tab to — read
that Task Group A's diff/pattern as your template for how a new tab integrates: content-only,
no own `ModalShell`/backdrop, rendered inside the existing `RoutePanelShell` the whole page
already has). Both new tabs are batched into this ONE dispatch, for ONE engineer, specifically
because they land in the same file — this session has repeatedly hit real merge bugs from
independent engineers editing `store-analytics.js` concurrently.

## Task Group A — Food Cost tab

Build the tab using these EXACT existing engines — do not reinvent math that already exists:

1. **Hero verdict band**: `buildStoreFobReport(loc, {name, org, patch, fob, target, monthly,
   varRows, compActual, compTarget})` (`src/engine/fob-report.js:29`) is the single-store engine
   — call it directly. It already returns `fobPct`, `overTarget`/`underTarget`, `gapPP`,
   `oppDollars`/`savingsDollars`, `trend`, `comps[]` (per-component actual/target/gap, sorted),
   `topDriver`, `masking` (bool + gross gain/loss $), `topItems` (worst 4 item-level variance),
   and `actions[]` (plain-language coaching text keyed off the worst component) — this already
   produces the "say the number AND the decision" shape CLAUDE.md's standing UI rule requires.
   Wire the `get(s)` shape exactly as `src/views/eom-dashboard.js` (around line 1883-1897)
   already does for its own FOB report call: `fob` from `fobSnapshotByStore(fobRows, period)`
   (`src/engine/eom-inventory.js:118` — **critical**: `qsr_fob` rows are MTD-CUMULATIVE
   snapshots, never sum them, only take the latest-per-period, this function already does that
   correctly), `target` from `DEFAULT_TARGETS[loc].tFOBTarget`, `compActual`/`compTarget` keyed
   `statv/comp/raw/cond/emp/unex` against `tStatLoss/tCompWaste/tRawWaste/tCondiment/tEmpFood/tUnex`.
2. **Component driver bars**: render `comps[]` from the same report, matching the mockup's
   ranked-bar shape (actual vs. target mark, status-colored).
3. **Day-by-day variance trace** — this is the flagship "new" visual, doesn't exist anywhere in
   the app today. `fobDailyTrace(fobRows, {loc, period, since})` (`src/engine/variance-trace.js:40`)
   differences consecutive MTD snapshots into real daily $ deltas per component — call it with
   zero new data needed. `biggestJumpDay(trace)` (same file) finds the single biggest day-over-day
   swing and brackets it to the nearest real physical count — surface this as the mockup's
   "jump callout." `annotateTouchpoints(trace, {sessions, eomDay})` marks which days had a real
   count if that data is available; use it if wiring is straightforward, skip with a note if not.
4. **Masking check** — `masking` field from `buildStoreFobReport` (gross gain/loss $ + offset %).
   Already computed; this dispatch is specifically about SURFACING it, since research confirmed
   it's built but never shown in any UI today.
5. **Data-discipline indicator** — `computeStoreDataDiscipline`/`computeMissingWasteDays`/
   `estimateMissingWasteImpact`/`disciplineSummary` (`src/engine/waste-discipline.js`) — the
   store's own observed waste-logging cadence vs. actual submissions, and the estimated pp impact
   on Unexplained. If wiring this cleanly takes meaningfully more effort than the rest of the tab,
   it's the first thing to defer to a follow-up — say so explicitly rather than skipping silently.
6. **Correlation strip** — `scanAllPairs(ds, {scopeLoc: loc, ...})` (`src/engine/signal-registry.js:696`)
   already accepts a single-store scope and already has a `food_cost` metric category
   (`fobPct`, `baseFoodPct`, `compWaste`, `rawWaste`, `condiment`, `empMeal`, `statVar`,
   `unexplained`, `discCoupon`, `pLFoodPct`, `pLPaperPct`) plus `weather`/`calendar`/`controls`
   groups to correlate against. Use the SAME Pearson/Spearman/FDR-guarded stats Scanner already
   uses — do not hand-roll correlation math.

## Task Group B — Labor & Scheduling tab

1. **Hero verdict band**: current Crew Labor % via `resolveLaborTarget(t, basis)`
   (`src/engine/labor-basis.js`, `DEFAULT_LABOR_BASIS='tCrewLabor'` — route through this, never
   read a target field name inline, issue #153 was exactly that mistake) vs. actual (`laborPct`
   from `src/engine/metric-source.js`'s `METRIC_SOURCES`, which already chains
   `glimpseRows→ctrlRows→laborRows` with a `laborDollar÷sales` derive fallback).
2. **The verdict framing must be the Planning-vs-Execution split, not a generic "labor is high"
   line** — this directly targets what the research flagged as the most commonly misdiagnosed
   thing in the business. `computeLaborGapSplit(rows, {asOf})` / `latestCompleteWeekByStore(splits)`
   / `laborGapSplitSummary(weekRows)` (`src/engine/labor-gap-split.js`) already splits the gap into
   Needed→Scheduled (planning) and Scheduled→Actual (execution) as two separate numbers, bucketed
   on the **Wed–Tue pay week** (`PAY_WEEK_START=3`, not the 4am business day — a third, distinct
   boundary from DAR/`qsr_labor_summary`'s 4am alignment; do not divide it against a trailing-N
   calendar-day window, per this engine's own explicit header warning). Render both gaps as the
   mockup's two-bar split, and let whichever is bigger drive the verdict line's coaching target
   (the scheduler vs. the shift manager).
3. **Rate/hours/sales decomposition** — answers *why* labor% moved, not built anywhere yet per the
   research. `avgRate`, `actHrs`, `sales` (all in `metric-source.js`'s `METRIC_SOURCES` already)
   are the three inputs; compose them into the mockup's 3-step visual (which of the three moved,
   and by how much, since the prior comparable period).
4. **Intraday deployment heat map** — the flagship visual for this tab. Hour × day-of-week grid,
   needed-vs-actual gap, colored diverging (understaffed/overstaffed) — CSS grid, no charting
   library (matches the mockup exactly, and the Patch Heatmap technique already used elsewhere in
   this codebase — zero bundle-size cost). Source from the same DAR/`qsr_daily_activity` hourly
   data `ShiftAnalysisTab` (already in this file) reads, but bucketed hour × day-of-week instead of
   just day-of-week. **Watch the in-progress-day trap** (CLAUDE.md's own standing warning):
   `qsr_daily_activity_rollup` zero-fills hours that haven't happened yet for "today" rather than
   omitting them — a rate metric built from this must exclude or down-weight an in-progress day's
   unrealized hours, not average them in at full weight.
5. **Overnight excess flag** — `overnightExcessByStore(...)`/`overnightOpenness(rows)`
   (`src/engine/labor-standard.js`) — scheduled hours over the fixed close-down/pre-open standard.
6. **Correlation strip** — same `scanAllPairs` engine, scoped to the `labor` metric category
   (`laborPct`, `tpph`, `avgRate`, `otHrs`) against `weather`/`calendar`.

## Cross-cutting

- Both tabs are content-only (no `ModalShell`/own backdrop/own close button) — they render inside
  `store-analytics.js`'s existing outer shell, matching dispatch #200 Task Group A's `embedded`
  `LocationIntelligence` pattern exactly.
- Source every number through the shared helpers (`metric-source.js`, the engines named above) —
  never filter `ds.laborRows`/`ctrlRows`/`fobRows` directly in the panel, per CLAUDE.md's standing
  "source data through the shared helpers" rule.
- If the full mockup can't reasonably land in one PR at production quality, ship the hero verdict +
  driver bars/split (the core "number and decision") plus ONE flagship visual per tab (the
  day-by-day trace for Food Cost, the intraday heat map for Labor) as the must-have slice, and
  name in the PR body exactly what's deferred (masking check, discipline indicator, correlation
  strip, rate/hours/sales decomposition, overnight flag — whichever didn't make the first slice)
  and why. A real, working first slice beats a half-wired full mockup.
- Panel-contract check (close affordance via the host page's own chrome, date picker mode,
  `LocationSelector`, mobile-scroll) as part of building these, not an afterthought.

## Verification

- Both tabs render real data for a real selected store, with the hero number, verdict line, and
  at minimum one flagship visual each genuinely wired (not placeholder/mock data).
- State plainly in the PR body which mockup panels made the first slice and which were deferred.
- A live measurement (credential + observation named, per CLAUDE.md's standing rule) confirming at
  least one real store's Food Cost and Labor numbers compute correctly end to end — not just that
  the component renders without crashing.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing — several dispatches have landed on `main` concurrently this
  session).

## Out of scope

- Redesigning any of the underlying engines (`buildStoreFobReport`, `computeLaborGapSplit`, etc.)
  — reuse as-is.
- The Product Mix pull / Pricing Engine decomposition the research flagged as a genuinely new data
  source — that's real future work, not this dispatch.
- Any panel merge or other dispatch's scope (#197-203) — this is purely additive, two new tabs.
