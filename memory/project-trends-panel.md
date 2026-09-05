---
name: project-trends-panel
description: Spec + implementation plan for a new "Trend Explorer" panel — owner-requested 2026-09-05. User-selectable metric (from the existing signal-registry catalog), a date range, a frequency selector (daily/weekly/monthly/yearly), a sparkline, and a diagnostic layer that surfaces day-of-week/pattern findings and cross-verifies them against other metrics (reusing Signals' existing Scanner correlation engine rather than rebuilding pattern detection). Not built yet — this is the spec, captured before starting.
sensitivity: open
metadata:
  node_type: memory
  type: project
---

# Trend Explorer — spec (owner-requested 2026-09-05)

## The ask, verbatim intent
A new panel (name TBD — working name "Trend Explorer") where the user can:
1. Pick ANY metric from a user-selectable list.
2. Pick a date range.
3. Pick a frequency/granularity: daily, weekly, monthly, yearly.
4. See the results for that metric over that range at that granularity, **with a sparkline**
   visualizing the trend.
5. **Bonus, explicitly framed as a stretch, not required for v1**: diagnose the presented data for
   opportunities — e.g. "labor is generally controlled on Mondays/Tuesdays but struggles on
   Fridays/Saturdays" — and **cross-verify the impact** of a finding like that (does the
   struggling day also show worse guest count, worse OSAT, etc.).

Owner's framing: *"we are an analysis and business intelligence platform first... let's be our
best version of that."* This is meant to be a flagship, not a utility screen — worth real design
craft (see `panel-contract.md`, `CLAUDE.md`'s Voice-by-role rule: state the decision, keep the
depth reachable).

## What already exists to build on — check before writing anything new

- **The metric catalog is already built.** `src/engine/signal-registry.js`'s `METRIC_CATEGORIES`
  (service/sales/labor/food_cost/controls/customer/... — 9+ categories, ~80 metrics) is exactly
  the shape a metric-picker needs: `{key, label, source, field, granularity, better, unit,
  aggregate}` per metric, already grouped and labeled for display. **Reuse this catalog directly
  as the selectable-metric list — do not build a second one.** Its `granularity` field today only
  ever says `['daily']`, `['monthly']`, or `['daily','monthly']` — weekly/yearly aggregation is a
  NEW capability this panel needs to add (bucket daily data up), not something already present per
  metric.
- **Auto-first metric sourcing already exists.** `src/engine/metric-source.js`'s
  `metricDaily`/`metricSeries`/`metricAvg` (and `metricSumRatio` for rate metrics with a real
  numerator/denominator, per the in-progress-day trap CLAUDE.md documents) already do the
  auto-first-then-manual-fallback sourcing this repo's standing rule requires. **Never read
  `ds.laborRows`/`ctrlRows`/etc. directly for this panel** — go through these.
  `matchedVsLY`/`autoFirstDaily`/`autoFirstTotal` in `src/engine/vs-ly.js` exist if a vs-LY
  comparison ever gets added.
- **Week-start anchoring already has one canonical helper**: `weekStartOf()` in `src/utils/date.js`
  (CLAUDE.md's Dev Rules calls out `weekStartOf()` as a helper that's been reimplemented multiple
  times already — use the one in `date.js`, don't add a fourth copy). No existing yearly-bucket
  helper was found; that part is genuinely new, but should be a small `groupBy(date => key)`
  reduction over already-fetched daily series, not a new fetch path.
- **The diagnostic "bonus" already has an engine to reuse, not rebuild.** Signals' 🔎 **Scanner**
  (`v4.495`, per CLAUDE.md) already does exactly this class of analysis: auto-correlation across
  ALL metric pairs (Pearson r + Spearman, effect-size floor + Benjamini–Hochberg FDR guardrails),
  "move together" framing, one-click promote to Signal Lab. It already includes a **Calendar
  metric group** (`v4.533`) — synthetic day-of-week flags (Weekend/Friday/Monday) generated over
  the real-data day universe — specifically built so day-of-week correlations surface through the
  same Scanner pipeline. **The "labor struggles on certain days, cross-verify the impact" ask is
  close to already-built functionality** — the likely right move is calling into (or reusing the
  same underlying correlation function as) Scanner for the metric currently shown in Trend
  Explorer, rather than writing a new pattern-detection algorithm from scratch. Needs a read of
  `src/engine/signal-registry.js`'s Scanner implementation before deciding whether to call it
  directly or extract a shared helper.
- **Panel conventions to follow** (`panel-contract.md`, `panel-registry.js`): `ModalShell`/
  `RoutePanelShell` for the close button (never hand-rolled), `LocationSelector` for the pill-style
  location filter, wide tables/charts get `overflowX:'auto'` not `hidden` for mobile, and — since
  this is a brand-new panel being built today — it should be `route:true` from day one (same
  treatment the Digital Checklists panel and Pricing Engine got, per CLAUDE.md's panel-contract
  note). Give it a real `section:` in `panel-registry.js` per the "section is truthful even in Test
  Kitchen" standing rule, whether it launches as `kind:'test-kitchen'` or straight to nav.
- **Sparkline**: check for an existing sparkline component before writing one — several panels
  already render small trend visuals (At-A-Glance tiles, others). If the `dataviz` skill's
  guidance is available when building the chart, follow it for consistent styling/theming.

## Open design questions (settle when building, not blocking the spec capture)

1. **Where does this live?** A new top-level nav item, or folded into Signals (which already owns
   Signal Lab/Scanner and the metric-correlation space)? Leans toward Signals given how much of
   the "bonus" diagnostic layer already lives there — but the core ask (single-metric trend +
   sparkline across arbitrary granularity) is also a natural fit for a standalone panel other
   panels can deep-link into. Owner said "name it whatever" — no name commitment yet
   ("Trend Explorer" is a placeholder here, not a decision).
2. **Weekly/yearly aggregation rule per metric.** A `sum`-aggregated metric (discount $, OT hours)
   buckets by summing; an average-style metric (labor %, OEPE) buckets by a proper weighted
   average, not a naive mean-of-daily-means (CLAUDE.md's own "never average averages" standing
   rule). `signal-registry.js`'s existing `aggregate: 'sum'` flag on count/dollar metrics is the
   signal to reuse for this — metrics without it should NOT be summed across a week/month/year.
3. **How far does the diagnostic bonus go in v1?** Full "cross-verify impact" (multi-metric
   causal-flavored narrative) is a stretch goal per the owner's own framing — a v1 that surfaces
   Scanner's existing day-of-week correlation for the CURRENTLY SELECTED metric (no new UI, just
   wiring an existing capability into this panel's context) is a reasonable, honest first slice;
   a from-scratch causal/opportunity-detection engine is not v1 scope.

## Status
Not built. Captured 2026-09-05, third in the agreed morning work order (after the PEAK per-visit
detail parser and the Graded Visits date-range selector) — the date/frequency selector built for
Graded Visits should be reused here rather than building a second one.
