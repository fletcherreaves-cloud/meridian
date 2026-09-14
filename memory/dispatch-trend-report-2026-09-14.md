# Performance Trends panel (2026-09-14)

Owner request: *"Format 1st section is Current MTD (Completed days only)... 2nd section is
Last complete month... 3rd is 2 months back... List in one table All locations combined, Then
give me breakouts for OK and FL locations specifically. Allow me to sort by top 25%, Top 50%...
I want this available for Labor, FOB and all other primary metrics... it needs a home inside
MBI to use as needed."* Followed immediately by: *"For the first project, I also send this out
in the same email"* — a screenshot of a Combined(OK/FL)/Oklahoma/Florida Month x
[Sales/GC/Labor/FOB] scorecard, the owner's own real email table.

## Design decision: reuse metric-source.js, don't build a 4th metric registry

Research before writing any code found three existing metric registries
(`engine/metric-source.js`'s `METRIC_SOURCES`, `engine/signal-registry.js`'s `METRIC_FLAT`,
`views/smart-targets.js`'s `METRICS`) and confirmed dispatch #229 is already unifying the
second toward the first, not the reverse. `engine/trend-report.js`'s `TREND_REPORT_METRICS` is
a thin display-only layer (label/unit/agg) over `METRIC_SOURCES`'s own `direction` — never
re-guesses "higher/lower is better," and reuses `metricRate`/`metricSeries` (the same primitives
Trend Explorer, Signals and At-A-Glance already read) for every value.

## Two views, one panel

**Store Detail** (the literal 3-section spec): `trendReportPeriods(asOf)` returns
`[mtd, lastMonth, twoBack]` anchored on `lastClosedBusinessDay()` — MTD's end is the anchor
date itself, "completed days only," never the calendar month end. `computeTrendReport(ds,
metric, locs, periods)` computes, per period: a combined value across every loc in scope (true
Σ÷Σ for a ratio metric via `metricRate`, a true sum for a volume metric like sales/gc — never a
flat average), plus a per-store ranked table (`withRanks`, 1=best, `pct` 0-100 with 100=best
regardless of whether higher or lower is good for that metric). A store/period with no data is
simply absent — never a fabricated 0, matching the Smart Targets backtest's own standing
pattern. `rankFilterRows` implements Top 25%/Top 50%/Bottom 50%/Bottom 25%/All via the `pct`
percentile, so "top"/"bottom" always means "best"/"worst" regardless of metric direction.
Scope (All/OK/FL/patch/store) uses the shared `LocationSelector` (`components/PanelControls.js`)
in its default `'full'` mode — never a hand-rolled OK/FL toggle, per the panel-contract standing
rule.

**Email Summary** (the owner's actual reference table, added as a same-panel second mode after
the screenshot arrived): fixed Combined/Oklahoma/Florida scopes, each a Month x
[Sales/GC/Labor/FOB] table over `scopeSummaryPeriods()` — 3 trailing complete calendar months
(`trailingCompleteMonths(3)`) plus `currentMtdPeriod()` (labeled `"Sep (MTD - 13 Days)"`,
matching the reference's own label style exactly). **Sales and GC are matched-day vs-LY comps,
not raw totals** — computed via `engine/vs-ly.js`'s `matchedVsLY` (the standing shared
auto-first + matched-day helper CLAUDE.md's "source data through the shared helpers" rule
requires), never a hand-rolled comp calculation. Labor %/FOB % reuse the exact same
`periodValue`/`metricRate` path as Store Detail, so the two modes can never silently disagree on
what a period's Labor % or FOB % means.

Two different period shapes were deliberate, not an inconsistency to reconcile: Store Detail
follows the owner's literal "1st/2nd/3rd section" spec (this month + 2 back); Email Summary
reproduces his actual, already-in-use reference table exactly (3 back months + this month). Both
live in the same panel/URL, selected by a "Store Detail / 📧 Email Summary" pill pair in the
header, since the owner asked for a single "home inside MBI."

## Panel registration

`id:'trend-report'`, `kind:'test-kitchen'` with its real eventual `section:'analytics'` set from
day one (the standing promotion rule — kind is lifecycle, section is placement), `route:true`
(a real page worth linking to), `perm:'analytics.district'` (cross-store rollup, same tier as
Top/Bottom Performers/Org Summary). `tkOrder:15`, last in Test Kitchen. Wired into `App.js`'s
`onOpenModal` chain (`if(modal==='trend-report') perm(...)&&goRoute('trend-report')`) and render
list (`routePanel==='trend-report'&&h(TrendReportPanel,...)`) per the standard route-panel
pattern — panel-registry.test.js's deep-link contract test caught the first version, which was
missing the `goRoute` call site (routing.js derives valid route ids from `route:true` generically,
but the modal->route wiring in App.js is still per-panel and easy to forget).

Four pinned/ratchet tests needed updating for the new panel (all mechanical, not drift):
`shell-nav-snapshot.test.js`'s two Test Kitchen census ratchets (12->13), its exact nav-text
snapshot (`'📊','Performance Trends'` after `'🗒️','Store Assessments'`), its `HIDDEN_WHEN_DENIED`
map for `analytics.district` (label added, icon NOT added since `lfz-gap` already shares `📊`
under an unrelated perm), and `panel-registry.test.js`'s `ROUTE_IDS` sorted list.

## Bonus fix: scripts/refresh-projections-workbook.py

While using this session to also refresh the owner's October Projections workbook (a separate,
unrelated ask handled in parallel), reproduced a real bug in the script's documented default
usage: omitting `--output` (which overwrites `--input`) opened the output zip for writing while
`patch_workbook` was still lazily reading other parts from the same path via the open `zin`
handle, truncating the file mid-read (`zipfile.BadZipFile: Truncated file header`). This is
almost certainly the failure the owner hit running the exact documented command, not a usage
mistake on his part. Fixed by reading every zip part into memory before opening the output
path for writing at all — which also fixes `verify_roundtrip`, which previously re-read
`input_path` from disk AFTER the in-place overwrite and would have silently compared the new
file to itself, proving nothing, for the exact "no `--output`" case the docstring documents as
the default. Not part of the deployed app; no version bump of its own, folded into this
dispatch's changelog entry.

## Tests

`src/__tests__/dispatch-trend-report-2026-09-14.test.js` — 24 cases: period-boundary math
(mid-month anchor, January year-rollover), ratio-metric Σ/Σ vs a naive flat average (own fixture
caught a real bug on first write — see below), rank/percentile assignment, absence-is-honest
guards, all 5 `RANK_MODES` filter behaviors, the vs-LY comp math, `trailingCompleteMonths`/
`currentMtdPeriod`/`scopeSummaryPeriods` boundary cases, and 4 real `TrendReportPanel` renders
(default render, metric switch, rank-mode click, Email Summary toggle).

**Caught before shipping**: the first "combined = weighted (sum/sum)" test fixtured
`laborDollar`/`sales` fields directly on `glimpseRows` rows — but `metric-source.js`'s
`laborPct` derive reads `laborDollar` from `opsLaborRows` and `sales` from `qsrActSummaryRows`
specifically, not from `glimpseRows`. The test got 0.24 (the flat naive average) instead of the
expected weighted 0.1909, immediately revealing the fixture was silently falling back to
`metricAvg` rather than exercising `metricSumRatio` at all — fixed by fixturing the derive's
real source tables. Worth noting as another "measure it" case study: the wrong fixture would
have shipped a test that passed for the wrong reason (testing the fallback path, not the
sum/sum path it claimed to test).

Full suite 514/514 files, 4926/4926 tests. Build clean, eager payload 547.50 KB / 850 KB budget
(trend-report.js lazy-chunked).
