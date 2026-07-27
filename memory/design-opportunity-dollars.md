---
name: design-opportunity-dollars
description: Design note for the "Opportunity $" layer — converts every performance gap (labor, food/FOB, GC/sales) into recoverable dollars, benchmarked to best-in-class, so operators see "this gap is worth $X/month." Inspired by QSRSoft's Consulting Cashflow-Opportunity widget. All v1 data is already pulled; no new source needed. Flagship "intelligence system, not data viewer" move.
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
