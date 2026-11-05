# Design: Year-over-Year Trend Dashboard (task #90, 2026-11-05)

## The ask

Owner (task #90, queued earlier, picked up 2026-11-05): a dashboard that shows **year-over-year
progress/trend across all metrics** — not a single "+12% vs LY" number, but a trended view of how
this year's trajectory compares to last year's (and ideally prior years), for any metric, scoped
to a store/patch/operator/state/district.

## What already exists — measured before designing anything new

This repo has a strong "check whether a helper exists before writing one" culture (CLAUDE.md Dev
Rules) and already carries several trend-adjacent panels. Audited all of them before proposing
anything new, specifically to answer: **does ANY existing panel already show a multi-period
year-over-year line, or does every YoY read collapse to one point-in-time percentage?**

| Panel / engine | What it actually does | YoY? |
|---|---|---|
| **Performance Trends** (`src/views/trend-report.js`, `src/engine/trend-report.js`) | Current MTD vs Last Complete Month vs Two Months Back — **sequential-period**, not year-over-year. One partial exception: its email "Scope Summary" table computes a real calendar-YoY % via `shiftYearBack`/`periodRealComp` (Sales/GC only, 4-period trailing) — deliberately NOT built on `vs-ly.js`'s `matchedVsLY`, because day-shadow matching is wrong for calendar-month comparison (an owner-caught bug fixed 2026-09-14). This calendar-accurate pattern is worth reusing. | Partial, narrow |
| **`src/engine/vs-ly.js`** (`matchedVsLY`/`autoFirstDaily`/`autoFirstTotal`/`lyQuality`) | The one shared "current vs LY" engine, used in 25+ files. Every consumer found uses it for **one aggregate number**, never a multi-point trend line. `lyQuality` flags a store under ~24mo old whose vs-LY reflects its own grand-opening ramp, not real YoY — any dashboard that rolls multiple stores into one line must respect this or it will mislead (the exact Tishomingo trap CLAUDE.md documents). | Single number only |
| **Trend Explorer** (`src/engine/trend-explorer.js`, `src/views/trends.js`, route `trends`) | Pick any metric + one store + date range + daily/weekly/monthly/yearly bucketing, hand-rolled SVG sparkline. **Single-store only by explicit v1 scope note** (multi-store rate-metric rollup needs volume-weighting the registry doesn't generically expose yet). Yearly bucketing exists but produces one point per calendar year — not a matched-month YoY overlay. | No |
| `src/engine/review-engine.js`'s `yearlyTrendFor` | A named employee's Performance Review score across years — different domain (HR, not metrics). Not relevant here. | N/A |
| `DistrictLensPanel`/`WhyEnginePanel`/`store-analytics.js`/`patch-heatmap.js` | Searched for "vs LY"/"year-over-year"/"YoY" — no existing multi-period YoY trend line found. | No |

**Confirmed gap:** nothing in the app today shows a trended, multi-month, year-over-year line for
a chosen metric across stores or district-wide. This is genuinely new, not a re-skin.

## Proposed design

**New panel: "📈 YoY Trends"** — `kind:'test-kitchen'`, `section:'analytics'` from day one (the
standing promotion rule), `route:true` (a destination worth linking to, matching Trend Explorer's
own treatment).

**Scope control:** `LocationSelector` (All → State → Patch/Operator → Store), same component
every other panel already uses — no new picker.

**Metric picker:** recommend standardizing on **`PERFORMER_METRICS`**
(`engine/top-bottom-performers.js`) rather than `TREND_REPORT_METRICS` or inventing a third list —
it's already the canonical "any metric, pick from a dropdown, never free-typed" registry this
session's Targets Editor Tier 2 and Leaderboards' Top/Bottom mode both standardized on. Using it a
third time here keeps exactly one place to add a metric going forward. *(Open question — flagged
below — since `TREND_REPORT_METRICS` covers a few fields `PERFORMER_METRICS` doesn't and vice
versa; picking one means accepting that gap rather than merging the two registries, which is a
larger, separate refactor.)*

**Granularity: monthly, not daily.** A year-over-year comparison is a monthly-rhythm question (it
mirrors how Monthly/Yearly Targets already think about the business), and daily-level YoY is both
noisy and already covered elsewhere (Trend Explorer). Each month's value is compared to the
**same calendar month last year** via `trend-report.js`'s proven `shiftYearBack`-style exact
calendar match — not `vs-ly.js`'s weekday-shadow matching, which is right for a trading-day
comparison but wrong here for the same reason it was wrong in Performance Trends' own Scope
Summary table.

**Multi-year overlay:** support a trailing 2–4 year window (ties directly to the onboarding
backfill guidance in task #99 — "2-4 years of history" is the same number the owner already
named for a different purpose). Current year renders as the solid/emphasized line; prior years
render fainter/dashed, oldest-faintest — a standard multi-series line chart.

**Rollup math — never average-of-averages:** when scope is wider than one store, use the same
dollar-weighted / ratio-of-sums pattern `metric-source.js`/`utils/stats.js` already establish
(never a plain mean of each store's own percentage). Respect `lyQuality`: a store inside its
honeymoon-ramp window either gets excluded from a rolled-up line or carries a visible flag — the
Tishomingo case must not silently distort a district-wide YoY line the way it distorted the
Rankings GC-vs-LY column before that was caught.

**Rendering:** Chart.js (`chart.js/auto`), matching the house convention `store-dash.js` already
uses — not hand-rolled SVG (Trend Explorer's SVG sparkline was a deliberate lightweight choice for
a single small chart, not the house style for a multi-year overlay chart with a legend).

**Supporting table:** month-by-month actual / LY actual / Δ% underneath the chart, exportable via
the existing `ExportDropdown` + `printHtml` pattern every other data-heavy panel already uses.

**Findability — this is the part the owner explicitly flagged as a risk** ("this app is and will
be a new experience for everyone... ere on caution as to making sure information... is easy to
find and consistent"). Three genuinely different panels now answer three genuinely different
trend questions (Performance Trends = sequential period-over-period; Trend Explorer = one store,
any window, exploratory; YoY Trends = district-wide, multi-year, year-over-year). Rather than
merge them (which would blur three real distinctions into one confusing mega-panel — the opposite
of CLAUDE.md's "normalization" standing rule), **cross-link them with the same ⓘ info-icon pattern
just shipped on Leaderboards**: each panel's info icon names the other two and says, in one line
each, which question each answers.

## Build phasing

1. New KB article + the panel skeleton (scope/metric pickers, empty chart) — cheap, reviewable.
2. Wire the monthly-bucketed, calendar-accurate current-vs-LY series computation (the real engine
   work — likely a new small function in `vs-ly.js` or a sibling module, not a rewrite of it).
3. Chart.js rendering + the supporting table + export.
4. Cross-link info icons on all three trend panels (Performance Trends, Trend Explorer, YoY
   Trends) once the new one exists to link to.

## Open questions for the owner

1. **Metric registry:** OK to standardize this new panel on `PERFORMER_METRICS` (same list
   Leaderboards/Targets-Tier-2 use), accepting it won't 1:1 match `TREND_REPORT_METRICS`'s own
   field list? Or would you rather this draw from a merged superset (bigger, separate refactor)?
2. **Trailing window default:** 3 years as the default overlay (current + 2 prior), adjustable?
   Matches the 2-4yr range you already named for onboarding backfill.
3. Any specific metrics you'd want front-and-center as the panel's default selection (e.g. Sales,
   Labor %, TPPH) rather than defaulting to the first item in the registry?
