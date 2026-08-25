---
name: dispatch-110
description: Owner's Speed of Service panel feedback (Notes 69, src/views/dt-speedofservice.js). Four bounded items to ship now -- add an Avg-DT bar to the By-Hour table matching the existing trans bar (plus resizing Store Ranking/By Hour), convert the Weekly DT Trend chart from line to bar, swap the panel's hardcoded 30/60/90-day dropdown for the shared DateRangeControl component (full presets + custom range), and fix a real bug where the weekly trend chart goes stale on patch selection because a Chart.js redraw effect's dependency array doesn't include the actual filtered data. A fifth item -- "pick a metric, page adapts" -- is a major rearchitecture (the whole data layer is hardcoded to the DT/station schema, not routed through the app's generic metric-source.js registry) and is explicitly OUT of this dispatch's scope; noted for a future, separate effort.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #110 — Speed of Service: DT bar, bar-chart conversion, full date range, patch-selector bug fix

## Owner's ask, in full (Notes 69, verbatim)

- *"ByHour - District Avg > Let's add bar for avg dt like you have for trans. Can squeeze Store
  Ranking panel and enlarge this panel to accommodate."*
- *"Actually use the bar throughout. I like it. It is visually impactful."*
- *"Note > This panel can be a case study for displaying other metrics on our list. Maybe even
  converted or used as a dashboard"* — vision note, not an action item, see the "Not in scope"
  section below.
- *"I would like to see all date options if possible, not just 30/60/90"*
- *"Give me option at top, if we adapt this page, to select metric and dynamically populate the
  rest from that selection"* — see "Not in scope" below; this is a much bigger project than the
  rest of this batch.
- *"When selecting patches, it doesn't seem to change the chart on weekly dt trend"*

**A background investigation (not a live engineer) already found the panel and root-caused the
bug before this dispatch was written.** The panel is `src/views/dt-speedofservice.js`
(`DTSpeedOfServicePanel`, `id:'dt-sos'` in `panel-registry.js`) — the only Speed of Service
component in the repo. Read this whole dispatch; several details below correct assumptions the
owner's message implies.

## Correction to the owner's mental model: the "bar" isn't a chart

The "By Hour — District Avg" section (~lines 521-552) is an HTML `<table>`, not a Chart.js chart.
The existing "bar for trans" the owner refers to is a hand-rolled `<div>` sized by
`Math.round(r.trans / maxTrans * 60)` px, not a chart dataset. This matters for scoping item #1
below — it's a small, table-cell-level change, not chart configuration.

There are exactly two REAL Chart.js charts in this file: `DtTrendChart` (weekly DT trend, `type:
'line'`) and `DtDaypartChart` (avg DT by daypart, **already** `type: 'bar'`). Everything else —
Summary Cards, Station tiles, Store Ranking, By Hour — is plain table/div markup already, no
chart library involved, and none of it needs a "convert to bar" treatment because it isn't a bar
OR a line today — it's just numbers/manual bars in a table.

## Scope

### Item 1 — Avg-DT bar in the By-Hour table, resize Store Ranking / By Hour

Add a manual `<div>` bar to the "Avg DT" `<td>` (adjacent to where the existing trans bar lives),
sized the same way the trans bar already is (`Math.round(r.avg / maxAvg * 60)`, with a new
`maxAvg = Math.max(1, ...hourData.map(r => r.avg||0))` mirroring the existing `maxTrans`
computation). Use `dtColor(r.avg)` for the bar's color, matching the existing color-coding
convention used elsewhere in this file. Then adjust the two panels' `flex` basis values (Store
Ranking currently `flex:'2 1 400px'`, By Hour currently `flex:'1 1 220px'`) to give By Hour more
room now that it carries two bars per row instead of one — exact new ratios are an implementation
choice, but confirm both tables stay legible at the app's normal viewport widths.

### Item 2 — Convert the Weekly DT Trend chart from line to bar

`DtTrendChart` (`type:'line'`) is the one remaining non-bar chart in this panel; `DtDaypartChart`
is already a bar chart, matching the owner's "use the bar throughout" preference. Convert
`DtTrendChart` to `type:'bar'`. **This has real design complexity the owner's one-line ask doesn't
address — work through it, don't just flip the `type` string:**
- The chart has 3 modes (`avg` = single district/scope line, `store` = one series per store,
  `patch` = one series per patch) plus two dashed horizontal reference lines (200s target / 240s
  caution, via a `refLine()` helper). A bar chart needs a real design decision for how the
  multi-series `store`/`patch` modes render — grouped bars per week, or keep those two modes as a
  line/mixed chart and only convert the single-series `avg` mode to bars, since that's the one
  most directly comparable to `DtDaypartChart`'s existing single-series bar treatment. Reference
  lines translate directly to Chart.js annotation/threshold lines either way.
- **Verify the underlying weekly-average computation is unaffected by the type change** — this is
  a pure rendering change, the data pipeline (`weeks`/`series` `useMemo`) must produce identical
  numbers before and after.

### Item 3 — Full date-range options (not just 30/60/90)

Confirmed: this panel hardcodes its own `PERIODS = [30d, 60d, 90d]`, rendered as a plain
`<select>`. A shared, fuller component already exists and is already adopted by other panels this
session touched (Security, Form Completions): `DateRangeControl` in
`src/components/PanelControls.js`, backed by `DATE_RANGE_PRESETS` (7/14/28/30/60/90/180 days) plus
an `allowCustom` start/end date picker. **Reuse it, don't build a new one** — swap the local
`PERIODS`/`<select>` for `h(DateRangeControl, {...})`, matching `security-panel.js`'s or
`forms-panel.js`'s existing usage pattern. This requires adapting `loadDtHistory(days)`
(`src/lib/supabase.js`) to accept a resolved date range (`{s,e}` or equivalent) instead of a bare
day count — check both call sites and every other consumer of `loadDtHistory` before changing its
signature, so this doesn't silently break another panel that reuses the same loader.

### Item 4 — Fix the patch-selector bug on Weekly DT Trend (real, root-caused)

**Confirmed bug, not a misunderstanding.** The org/patch filter correctly flows through
`activeLocs` into `DtTrendChart`'s own `useMemo` (which correctly recomputes `weeks`/`series` on
every patch change) — the data pipeline is NOT the problem. The bug is in the shared `useChart`
hook's imperative Chart.js redraw: `useChart(ref, canvas => {...}, [weeks.join(','),
series.length, mode])`. In the default `'avg'` trend mode, `series` always has exactly one entry
regardless of scope, and `weeks.join(',')` (the set of week-start dates with any qualifying row)
usually stays identical across patch switches too — so neither dependency changes, the effect
never re-fires, and the Chart.js canvas keeps rendering the previous patch's stale line even
though the underlying `series` data genuinely changed. **Fix: add the actual filtered data (or
`activeLocs.join(',')`) to `useChart`'s dependency array** so a content change — not just a
shape change — triggers the redraw. Verify this doesn't regress the `store`/`patch` trend modes,
which happened to "work" more often only because `series.length` frequently does change in those
modes (different failure surface, same root cause — fix the dependency array once, correctly, for
all three modes).

## Not in scope for this dispatch — noted, not built

**"Give me option at top... select metric and dynamically populate the rest"** and the related
**"this panel can be a case study... converted or used as a dashboard"** note: the investigation
found this is a **major rearchitecture**, not a bounded feature. `DtTrendChart`/`DtDaypartChart`'s
rendering plumbing is reasonably generic, but the entire data layer — `loadDtHistory`'s hardcoded
Supabase column list (`dt_untilserve`/`fc_untilserve`/`mfy1_untilserve`/`mfy2_untilserve`/
`bev_untilserve` + matching `*_trans_cnt` pairs), the per-station field-name mapping, the hour/
daypart bucket definitions, and every aggregation formula — is hardcoded to this one metric
family's exact schema shape (hourly, per-station, `dt_daily_activity`-sourced). None of it routes
through the app's generic `metric-source.js` `METRIC_SOURCES` registry, which most other panels
this session already use and which already has OEPE/R2P as resolver-driven keys. A real "pick any
metric, page adapts" version needs a new hourly/station-rollup data-fetch abstraction generalized
across `METRIC_SOURCES` keys (most of which aren't even hour-slot-granular in the schema) — this
is its own dispatch-scale project, not a dropdown. **Do not attempt it here.** If a future session
picks this up, this dispatch's Item 2 (line→bar conversion) is a natural design precedent to reuse
for whatever the generalized version's chart rendering looks like.

## Verification bar

- Item 1: render the real panel, confirm the Avg DT column now shows a bar sized proportionally
  the same way the trans bar already is, and confirm Store Ranking / By Hour both remain legible
  at normal widths.
- Item 2: render the real panel, confirm the weekly trend now renders as bars (in at least the
  `avg` mode), confirm the underlying weekly averages are byte-identical to the pre-change line
  chart's values (spot-check by hand against raw data for at least one week/store), confirm
  reference lines still render.
- Item 3: render the real panel, confirm all 7 presets plus custom start/end are selectable and
  each actually changes the loaded data range; confirm no other `loadDtHistory` consumer broke.
- Item 4: render the real panel, switch patches in `avg` mode, confirm the weekly trend chart
  visibly updates (not just the data changing invisibly) — this is the exact bug report, verify
  the fix against the actual reported symptom, not just against the code diff. Also verify `store`
  and `patch` trend modes still update correctly.
- Full suite green, `npm run build` clean, before/after entry-chunk gzip numbers in the commit body.

## Do NOT

- **Do not attempt the "pick a metric, page adapts" redesign in this dispatch** — it's a
  rearchitecture, scope it separately if picked up later.
- **Do not convert anything already table/div-based** (Summary Cards, Station tiles, Store
  Ranking, By Hour) to a "bar chart" — those aren't charts, the owner's "use the bar throughout"
  ask is fully satisfied by items 1 (adds a second manual bar) and 2 (the one remaining line
  chart) once both land.
- **Do not change `loadDtHistory`'s signature without checking every existing call site** — it's
  a shared loader; a signature change ripples.

## Resolution (v5.151, 2026-08-25)

All four items shipped in `src/views/dt-speedofservice.js` (+ `src/lib/supabase.js` for item 3).
Skipped nothing in scope; the "pick a metric, page adapts" item stayed explicitly out, per this
dispatch's own scoping.

**Item 1 — By-Hour Avg-DT bar + resize.** Added a second hand-rolled `<div>` bar to the Avg DT
`<td>`, mirroring the existing Trans bar's `Math.round(v/max*60)` sizing and `dtColor()` fill
(new `maxAvg = Math.max(1, ...hourData.map(r => r.avg||0))` alongside the existing `maxTrans`).
Store Ranking / By Hour `flex` basis rebalanced from the old ~2:1 split (`'2 1 400px'` /
`'1 1 220px'`) to ~3:2 (`'3 1 380px'` / `'2 1 300px'`) so By Hour has room for two bars per row.

**Item 2 — DtTrendChart line→bar.** Worked through the design trade-off the dispatch flagged
rather than flipping the `type` string: the single-series `'avg'` mode now renders as
`type:'bar'` (matching `DtDaypartChart`'s existing treatment, per the owner's "use the bar
throughout"); the multi-series `'store'`/`'patch'` modes deliberately stay `type:'line'` —
grouped bars across the 15+ stores/patches this panel can show in scope would be unreadable at
the panel's width, and nothing in the owner's ask specifically targeted those two modes. The
`weeks`/`series` `useMemo` is completely untouched (pure rendering change); reference lines get
an explicit `type:'line'` dataset override in bar mode, since Chart.js mixed-chart rendering
requires it once the base chart type is `'bar'` (a dataset with no `type` inherits the base
chart's type, which would otherwise turn the dashed 200s/240s threshold lines into more bars).

**Item 3 — full date-range control.** Swapped the hardcoded `PERIODS=[30d,60d,90d]` `<select>`
for `h(DateRangeControl, { presets: DATE_RANGE_PRESETS, value: dateRange, onChange: setDateRange })`,
matching `security-panel.js`/`forms-panel.js`'s existing adoption pattern exactly. `loadDtHistory`
in `src/lib/supabase.js` is now dual-mode: it accepts either the original bare day count
(byte-identical behavior — `new Date(Date.now() - days*86400000)`) or a resolved `{s,e}` object
(the exact shape `DateRangeControl`'s `onChange`/`resolveDatePreset` already produce), branching
on `typeof range === 'object'`. Checked every call site before changing the signature, per the
dispatch's own instruction: the panel is the ONLY production caller (a plain grep across `src/`
confirms it), and `src/__tests__/dt-history-pagination.test.js`'s 5 calls all pass a bare number
and exercise the unchanged numeric branch — none needed editing. The upper bound (`endDt`) is
applied via `_pagedParallel`'s existing `extraFilter` hook (`q.gt('dt_trans_cnt',0).lte('dt',
endDt)`) rather than a new loader parameter, since that hook already existed for exactly this
kind of one-off additional filter. Also fixed a latent bug this change surfaced: `midDt` (the
early/late trend-split midpoint) used to be `Date.now() - (days/2)*86400000`, which silently
assumed the loaded range always ended *today* — true for every fixed preset, but not for a
custom range with an end date in the past. It now derives from the *selected* range's own
midpoint (`(new Date(s).getTime() + new Date(e).getTime()) / 2`), correct for every preset and
for custom ranges alike.

**Item 4 — the root-caused redraw bug.** Confirmed the dispatch's own root cause by reproducing
it (see Verification below) rather than trusting the write-up. Fixed by extending `useChart`'s
dependency array from `[weeks.join(','), series.length, mode]` to also include a content
signature — `series.map(s => s.key + ':' + s.data.join(',')).join('|')` — so any change to the
actual plotted values, not just the week-count or series-count, re-fires the Chart.js rebuild.
Verified against all three trend modes, not just `'avg'` (see below).

**Ratchet side-effect (item 1 + 2 together):** the two new alpha-tinted bar colors introduced by
this dispatch (`c + 'b3'` for the new avg-mode bars, `dtColor(r.avg) + '66'` for the new By-Hour
Avg-DT bar) would have pushed `src/__tests__/ratchet-color-alpha-concat.test.js`'s R4 ceiling
(93 color+hex-suffix concat sites) to 95. Routed both through `withAlpha()`
(`src/views/patch-heatmap.js`) instead, per that ratchet's own stated fix — functionally
identical for a hex-literal color (which `dtColor()` always returns here), and correct if
`dtColor()` is ever extended to return a `var()` token. This pulls in `patch-heatmap.js` as an
import for one helper function; Rollup places it in its own small shared chunk
(`patch-heatmap-*.js`, ~9.7 KB / ~3.2 KB gzip) rather than duplicating or inlining it, loaded
only when the Speed of Service panel actually opens — not an entry-chunk cost.

### Verification (measured, not asserted)

This sandbox cannot reach live Supabase for `qsr_daily_activity` (RLS-restricted, per CLAUDE.md's
standing note), so "render the real panel" here means this repo's own established pattern for
that situation (e.g. `dispatch-107-yearly-projections-panel.test.js`): `react-dom/client` +
`happy-dom`, with `loadDtHistory` mocked to synthetic rows and `chart.js/auto` mocked to CAPTURE
every `Chart` construction (happy-dom has no real canvas 2D context, so the real Chart.js library
cannot actually draw). New file: `src/__tests__/dispatch-110-sos-panel.test.js`, 6 tests, all
against the real `DTSpeedOfServicePanel` component:

- Item 3: confirms all 7 `DateRangeControl` presets (7D/14D/28D/30D/60D/90D/180D) + "Custom…"
  render, and the old "30 Days"/"60 Days"/"90 Days" labels are gone.
- Item 1: confirms every By-Hour table row carries TWO bar `<div>`s (`height:6px`), not one.
- Item 2: confirms the avg-mode chart config is `type:'bar'`, its `'Avg DT'` dataset inherits
  that type with a per-bar `backgroundColor` array (not one line color), and its two ref-line
  datasets carry an explicit `type:'line'` override. A second test confirms `'store'` mode stays
  `type:'line'` with one dataset per store in scope.
- Item 4 (the real regression test): two real store locs from two different default
  `supervisorGroups` patches — 3708 (Ardmore, "Robert Spencer") tuned to a constant 150s avg DT,
  5183 (Chickasha, "Krystiana Langford") tuned to 250s — across two IDENTICAL weeks, so a filter
  switch changes ONLY the series values while both of the old buggy dependencies stay constant
  (`series.length` is always 1 in avg mode; `weeks.join(',')` is the same two Mondays for both
  stores) — the exact shape this dispatch describes. Asserts the chart's plotted data changes from
  `[200,200]` (all-scope weighted average) to `[150,150]` (3708-only) after switching the
  store filter. A second case repeats the same switch in `'store'`/`'patch'` modes.

**Confirmed this test is not a placebo, per "would this verification still pass if reverted?"**:
temporarily reverted the dependency-array fix to the pre-fix
`[weeks.join(','), series.length, mode]` and reran the suite — only the item-4 test failed (stale
`[200,200]` instead of the correct `[150,150]`), i.e. it genuinely reproduces the reported bug and
would have caught it before this dispatch. Restored the real fix; full file green again
afterward.

Full suite: 226 test files / 2355 tests, all green (up from the pre-dispatch baseline of 225
files / 2349 tests — the +1 file / +6 tests is this dispatch's own new test). `npm run build`
clean. Entry chunk: 1,567.92 KB / 456.79 KB gzip (pre-dispatch) → 1,568.13 KB / 456.86 KB gzip
(post-dispatch) — a +0.21 KB / +0.07 KB gzip delta, effectively noise (`dt-speedofservice.js` is
already a lazy panel via `lazyPanel()`; nothing in this dispatch adds a static import to `App.js`).

### Not done / explicitly out of scope

- The "pick a metric, page adapts" rearchitecture — per this dispatch's own "Not in scope"
  section, untouched.
- Did not sweep other panels for the same `useChart`-style dependency-array shape; this fix is
  scoped to `dt-speedofservice.js`'s `DtTrendChart` only, per the dispatch's own bounded scope.
