---
name: finding-kb-batch22-no-new-wiring-2026-11-14
description: "Task #75 (KB expansion), batch 22 pass — re-measured the unwired-key gap fresh, found no new wireable keys, and re-confirmed condiment_pct/count_cycle_guide remain genuinely unresolvable, now with one additional check each."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# KB coverage, batch 22 (2026-11-14) — nothing new shipped, re-confirmed with deeper evidence

## Fresh re-measurement

Re-ran batch 21's own whitespace-tolerant `articleKey:\s*['"]<key>['"]` grep across all of
`src/` (excluding `__tests__`) against `KB_ARTICLES`'s real key list in `src/engine/forecast.js`
(that file also hosts the KB registry + `InfoIcon` component, not just forecasting — confirmed
by reading it directly rather than assuming a separate KB file exists).

**119 distinct keys, 22 unwired** — identical count to batch 21's own post-batch state (119
keys, 25 unwired before batch 21, batch 21 resolved 3 → 22 remaining). No code changed the key
set or wiring between batch 21 and this pass, so an unchanged count is the expected, confirmed
result, not a sign the re-measurement was skipped.

Of the 22: 20 are the same deliberately-permanent exceptions every batch since ~16 has
documented (18 Forecast Engine internals — `oepe`/`tpph`/`labor_pct`/`forecast_formula`/
`model_types`/`adaptive_di`/`adaptive_ensemble`/`confidence_interval`/`daypart_engine`/
`event_registry`/`ewma_model`/`gc_crosscheck`/`mape_drift`/`model_health_scoring`/
`new_store_ramp`/`plus_up`/`r2p`/`t_red`/`weather_adjustment`, plus `panel_index`). The
remaining 2 are the same `condiment_pct` and `count_cycle_guide` batch 21 left open.

## condiment_pct — re-confirmed, now with a THIRD independent check

Batches 20 and 21 each checked one file and found Condiment rendering only as one row inside a
generic, unlabeled `.map()` over 6 sibling waste components (`store-cockpit.js`'s chart legend;
`at-a-glance.js`'s "FOB COMPONENTS" grid at `at-a-glance.js:3247`) — singling out one of six
visually-identical siblings for an icon would read as arbitrary, not a real fix.

This pass found and checked a **third** occurrence: `analytics.js`'s `buildSection()` (the
Monthly Targets print/export report, ~line 8514), which has a `METRICS` array with a real
per-row `label:'Condiment %'`. At first glance this looked like a better candidate — each row
*does* have its own distinct label, unlike the FOB grid's generic tiles. But reading the actual
render code (`analytics.js:8520-8528`) shows every row is built as a **raw HTML string template**
(`` `<tr>...<td>${m.label}</td>...` ``), not a React element tree — this is a print/export output,
never mounted through React at all. `InfoIcon` is a React component with its own `useState`/
`onClick` handling; it categorically cannot be inserted into a string template that gets
rendered via `innerHTML` or a print window, regardless of how well-labeled the row is. Confirmed
by reading the surrounding `buildSection` function directly, not inferred from the variable name.

**Conclusion: still correctly unresolvable.** Three independent occurrences checked across three
different files and three different rendering shapes (chart legend, unlabeled tile grid, raw-HTML
print table) — none offers a real, non-arbitrary standalone label to attach an InfoIcon to.

## count_cycle_guide — re-confirmed (6th time), with the exact current render path traced

Re-confirmed `CountCycleSection` — note it actually **lives in `src/views/count-cycle-panel.js`**,
not `eom-dashboard.js` as earlier batch notes said (that file only *imports and renders* it;
worth correcting since a future batch citing "eom-dashboard.js" would look in the wrong file).
`eom-dashboard.js`'s own comment confirms why: Count Cycle (`mode==='compliance'`) is explicitly
excluded from the shared `PanelChrome`/tab-header machinery and "renders its OWN compact summary
line inline" instead.

Read that inline summary line directly (`count-cycle-panel.js:248-250`): it's a dynamic stats
string — `` `${sum.stores} stores · ${sum.crit} critical · ${sum.warn} watch · ${sum.ok} on
cycle` `` — with no title text at all, not even "Count Cycle." There is nothing resembling a
header to attach an InfoIcon next to; the icon would float next to a bare number string with no
semantic anchor, which is a worse version of the same "attaching to something that isn't really
a header" problem every prior batch already ruled out here.

**Conclusion: still correctly unresolvable**, same standard as the 5 prior checks (batches
16-20), confirmed against the actual current file/line rather than trusting the old citation.

## Why no new test file or commit

Every prior KB batch that resolved zero new keys (there is no `batch20` test file in
`src/__tests__/` — it only exists as a note inside later batches' own comments) did not create
an empty placeholder test file either. Writing a `batch22.test.js` with no new InfoIcon-click
assertions would be synthetic coverage for a change that didn't happen. This memory file is the
batch's own record instead, so a future pass doesn't re-spend the same investigation — the real
work product of this pass is confirmed-negative evidence, not code.

No files changed; no version bump; full suite not run (nothing to verify — no code touched).
