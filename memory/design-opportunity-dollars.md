---
name: design-opportunity-dollars
description: Design note for the "Opportunity $" layer — converts every performance gap (labor, food/FOB, GC/sales) into recoverable dollars, benchmarked to best-in-class, so operators see "this gap is worth $X/month." Inspired by QSRSoft's Consulting Cashflow-Opportunity widget. All v1 data is already pulled; no new source needed. Flagship "intelligence system, not data viewer" move.
sensitivity: open
metadata:
  node_type: memory
  type: design
---

# Opportunity $ layer — design note (2026-07-27)

**Origin:** the single most vision-aligned idea from the QSRSoft walkthrough — their
Consulting "Cashflow Opportunity" widget quantifies gaps as dollars (Excessive Crew Labor
~$41K/store/6mo, Food Opportunity ~$20K/store vs best-in-class, GC gap $). See
`memory/qsrsoft-report-catalog.md` (⭐ inspiration #1).

## The idea (one line)
Every deficit becomes recoverable **dollars**, benchmarked to best-in-class, ranked biggest-$
first. Meridian already shows the *number* (FOB 4.62% vs 4.10% target); this shows
**"that gap ≈ $X/month of recoverable margin."** Turns a data viewer into a prioritizer.

## Three pillars (v1) — all data already pulled
| Pillar | Formula (per store, per period) | Sources (in Meridian today) |
|---|---|---|
| **Labor** | (Actual Labor% − Target/BIC Labor%) × Net Sales | Glimpse labor%, DAR sales, DEFAULT_TARGETS |
| **Food / FOB** | (Actual FOB% − Target/BIC FOB%) × Product Sales; cross-check vs Σ controllable overage (waste+statVar+unexplained) | `qsr_fob` components, monthly_targets |
| **GC / Sales** | (BIC GC/day − Actual GC/day) × Avg Check × days | DAR GC + avg check |

- **BIC = best-in-class**, computed **internally** from our own stores (e.g. top-decile
  FOB%/Labor%/GC-per-day within the org) — this also delivers the **BU/Org benchmarking**
  idea (inspiration #2). Fall back to DEFAULT_TARGETS where a peer benchmark is thin.
- Report both **MTD** and **annualized / trailing-6-mo** (QSRSoft frames $/store/6mo).

## Guardrails (Meridian standing rules — correct math, show your work, self-audit)
- **Don't double-count** overlapping drivers; keep pillars additive & disjoint.
- Separate **controllable** overage from structural (only count what an operator can move).
- **Dollar-weight** aggregates (Σ$ ÷ Σbase), never average averages.
- **Transparent methodology** surfaced in-UI (formula + benchmark shown), like the FOB tile.
- Floor at $0 (a store beating BIC = $0 opportunity, not negative "credit" by default).

## UX
- **Headline**: an "Opportunity $" tile on At-A-Glance / Attention Now — "$X recoverable this
  period," drill to by-driver (Labor/Food/GC) and **by-store ranking (biggest $ first)**.
- Feeds **Attention Now** (already ranks by $ at stake — this makes the $ real and cross-domain).
- Optional **SAGE tool** ("where's my biggest $ opportunity?") in v2.

## Reuse (no new subsystems)
`src/engine/metric-source.js` (metricSeries/metricAvg), `src/engine/vs-ly.js`,
`constants.js` DEFAULT_TARGETS, `monthly_targets`, `src/engine/attention-feed.js` ($ ranking),
At-A-Glance FOB math (Σ$/Σsales, dollar-weighted).

## Phasing
- **v1** — Food + Labor + GC three-pillar, internal BIC benchmark, per-store + district,
  MTD + annualized, headline tile + by-driver/by-store drill. Pure engine + one panel; no pull.
- **v2** — add Waste / Speed / Controls pillars; external best-in-class if a source appears;
  SAGE "biggest opportunity" tool; wire into Projections as "target = close $X of the gap."

## Why it's the right next flagship
High leverage, on-brand ("intelligence system"), and sits entirely on data we already pull —
so it's an engine + UI build, not a data project. Related: `memory/vision-and-roadmap.md`,
`memory/qsrsoft-report-catalog.md`.

---

## Resolution (2026-08-23)

**Measured before building, and it changed the scope of the work:** the pure 3-pillar engine
this design note describes already existed. `src/engine/opportunity.js` (`computeOpportunity`,
`bestInClass`, `annualize`, `rankByOpportunity`) was built and shipped between v4.549 and v4.581
for the Leadership One-Pager, fully unit-tested (`src/__tests__/opportunity.test.js`), and its
ds-adapter (`buildOnePagerInputs`, `src/engine/one-pager-data.js`) turned out to already be
generic over ANY `locs`/`range` despite its One-Pager-specific name — not week-anchored. So this
build was "wire a district-wide adapter + headline tile + drill-down + Attention Now feed onto an
already-tested engine," not a from-scratch build. Confirmed via `git log -- src/engine/
opportunity.js` before writing anything, rather than assuming the design doc described unbuilt
work.

### What shipped (v1)

1. **`src/engine/opportunity-district.js`** — `mtdRange()`/`trailing6moRange()` (deterministic,
   accept an injectable `today` for testing) and `districtOpportunity(ds, fobRows, locs, range)`,
   which wires `buildOnePagerInputs -> computeOpportunity({mode:'target'}) -> rankByOpportunity`
   into one call. Reused One-Pager's adapter directly rather than writing a second one — confirmed
   it was safe to reuse (not week-specific) by reading its actual signature before assuming.
2. **At-A-Glance headline tile** (`OpportunityTile` in `at-a-glance.js`) — "$X recoverable this
   month," MTD, all stores, click opens the drill-down. Modeled on the existing
   `EOMScoreboardTile`/`SageRunsTile` pattern (async-safe card, no new tile framework).
3. **Drill-down panel** (`src/views/opportunity-dollars.js`, `OpportunityDollars`) — MTD /
   trailing-6mo toggle, headline + by-driver (Labor/Food/GC) breakdown, by-store ranking biggest-$
   first, the same pill-style `LocationSelector` every other panel uses for scope. Registered in
   `panel-registry.js` as `kind:'test-kitchen', section:'analytics'` — promotion is a `kind:` flip
   only (dispatch #61), confirmed live by reading `shell.js`'s `renderTestKitchen()` directly.
   Wired into `App.js` via the standard `lazyPanel`/`useState`/`onOpenModal` triple, matching
   Top/Bottom Performers' precedent exactly.
4. **`opportunityAlerts`** (`src/engine/attention-feed.js`) — one CROSS-DOMAIN item per store
   combining all 3 pillars into a single $ figure for Attention Now, `nav:'opportunity-dollars'`.
   Deliberately kept separate from the existing `fobOutliers`/`fobOverTarget` detectors (both
   FOB-only, different comparison bases) rather than folding food $ into a "replacement" — the two
   answer different questions (single-metric alert vs. combined biggest-opportunity view) and both
   surviving in the feed together is intentional, not an uncaught duplicate.

### Guardrails, and where they actually live

- **Floor at $0**: enforced inside `opportunity.js`'s `storePillars()` (`pos0()`), not
  re-implemented at the UI layer — a store beating its target renders as a real `$0` row, never
  hidden or shown as a negative credit.
- **Dollar-weighted, never average-of-averages**: `computeOpportunity`'s district rollup is a
  straight `Σ$` reduce (labor$/food$/gc$/total$ summed across stores) — correct by construction
  since it's summing dollars, not percentages.
- **Transparent methodology**: stated on the panel's own surface ("Each store benchmarked vs its
  OWN target... Floored at $0...") rather than only in a tooltip or this doc.
- **Targets source**: v1 uses `DEFAULT_TARGETS` only (via `resolveLaborTarget`), matching
  One-Pager's existing, working precedent — NOT `monthly_targets` (the period-specific override
  table). This is a deliberate v1 simplification, not an oversight: adding a `monthly_targets`
  lookup would have meant either duplicating One-Pager's target-resolution path or refactoring it,
  neither of which this dispatch's scope called for. Worth a v1.5 follow-up if period-specific
  targets turn out to matter for the headline figure in practice.

### A known v1 wrinkle, disclosed rather than silently shipped

`buildOnePagerInputs` returns one entry per scoped `loc` regardless of whether that store has ANY
data in the given window — so a store with zero MTD data (not yet synced, brand new) renders as a
`$0` row, indistinguishable from a store that genuinely beat every target. Top/Bottom Performers
solves the analogous problem with an explicit "thin data, excluded from ranking" bucket
(dispatch #77); Opportunity $ v1 does not replicate that machinery, matching this quieter behavior
to One-Pager's own existing, shipped precedent rather than scope-creeping into a new thin-data
detector for a first pass. Caught by writing the drill-down's own render test (which initially
assumed the opposite — that a no-data window would show an empty list — and had to be corrected
once the real behavior was measured against the actual component, not assumed).

### Verification

`src/__tests__/opportunity-district.test.js` (window math + wiring, using a REAL `DEFAULT_TARGETS`
store so the target-resolution path is actually exercised, not left null), `opportunityAlerts`
tests added to `attention-feed.test.js`, and a render test
(`src/__tests__/opportunity-dollars-panel.test.js`) against the actual `OpportunityDollars`
component — confirmed revert-sensitive by temporarily hardcoding the window toggle to a no-op and
watching the "switching to Trailing 6 Months" test fail, then reverting. The Test Kitchen census
ratchet (`shell-nav-snapshot.test.js`) was bumped 12 → 13 for the new panel, the same deliberate
census-change pattern dispatch #77 established for Top/Bottom Performers. 2129/2129 tests passing,
build clean, no entry-chunk impact (the panel and its At-A-Glance tile both live in already-lazy
chunks).

### Explicitly not done this pass (v2, per the design doc's own phasing)

Waste/Speed/Controls pillars, external best-in-class, a SAGE "biggest opportunity" tool, and
wiring into Projections as "target = close $X of the gap" are all v2 per the design doc's own
phasing table above — untouched here.
