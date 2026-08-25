# Dispatch #118 — Visit Readiness: Days-Since-Last-Visit column + real column headers

**Owner's ask, verbatim (2026-08-25):** *"Visit Readiness > add a column as well for Days since
last visit. And, if easily doable, let's put the column headers over the actual columns. It will
make it easier to read."*

## Where, confirmed by reading the actual component

`src/views/visit-readiness.js`. Two distinct lists in this panel have the same problem — neither
renders a real header row positioned over its data columns:

1. **`StoreRow`** (the main per-store readiness list, `res.stores.map(s => h(StoreRow, ...))` —
   no header row at all above it). Each row's Speed/Accuracy/Quality/Leadership mini-bars carry
   their OWN inline label to the left of each bar (the `sub(label, sc)` helper,
   `h('span',{style:{width:62,textAlign:'right'}}, label)`), repeated on every single row instead
   of stated once above the list. `s.lastVisit` (from `computeVisitReadiness()` in
   `src/engine/visit-readiness.js`, already carries `{ms, score, pass, type, dateISO}`) is shown
   as a small caption (`last ${type} ${score}%`, line ~152) with no days-since-last-visit figure
   at all here.
2. **`VisitPatterns`' "Frequency by store" block** (same file, inside the collapsible Visit
   Patterns section). This one's engine output (`analyzeGradedVisits()`'s `freq` array,
   `src/engine/visit-readiness.js:643-659`) **already computes `daysSinceLast`** per store — it's
   rendered today (line ~433-435), just not under a real header: the "columns" are named once in
   a plain-text caption above the block (`'Frequency by store (visits · avg days between · days
   since last · pass)'`, line 421) rather than as header cells aligned over each value column.

## Scope

- **Add "Days since last visit" to the main `StoreRow` list** (item 1). The data already exists
  one property away — `s.lastVisit.ms` is already on every store object from
  `computeVisitReadiness()`; a days-since figure is `Math.round((Date.now() - s.lastVisit.ms) /
  864e5)`, matching the exact computation `analyzeGradedVisits()` already uses for `daysSinceLast`
  a few hundred lines away in the same engine file — reuse that arithmetic, don't reinvent it, and
  consider hoisting it into a small shared helper if that's cheap, since two call sites doing the
  identical thing is already the case CLAUDE.md's "check whether a helper exists before writing
  one" rule warns about becoming three.
- **Give both lists (`StoreRow` and the Frequency-by-store block) a real header row**, aligned
  over their actual columns via the same fixed widths the data rows already use (`sub()`'s
  `width:62`/bar `w:54`/number `width:26` for `StoreRow`; the `width:24`/`42`/`42`/`40` spans for
  Frequency-by-store) — the widths already exist per-row, the header row just needs to reuse them
  once instead of the current inline-per-row labels / plain-text caption. For `StoreRow`, this
  likely means: state Speed/Accuracy/Quality/Leadership once in a header, drop (or shrink) the
  per-row repeated labels since the header now carries that meaning.
- This is presentation-only — do not change `computeVisitReadiness()`'s or
  `analyzeGradedVisits()`'s actual scoring/aggregation math, only what's displayed and how it's
  labeled.

## Verification bar

- Render the panel with real/synthetic data covering multiple stores and confirm: a header row
  appears once above each list, its cells sit directly above the matching data column (not
  drifted — check at both desktop and mobile widths, including where rows wrap via `flexWrap`),
  and every store row shows a Days-Since-Last-Visit figure (or an explicit "—" when
  `s.lastVisit` is null, matching how the rest of this panel already handles missing data rather
  than blank space).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean.

## Do NOT

- Do not touch `computeVisitReadiness()`/`analyzeGradedVisits()`'s scoring, weighting, or
  aggregation logic — header/column and one new derived display field only.
- Do not touch `CoverageGaps`, `StoreAudit`, or the printable `storeReportHTML()` — those are
  separate, already-tabular (real `<table>`/`<th>`) sections not in scope here.
