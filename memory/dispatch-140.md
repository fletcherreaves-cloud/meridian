# Dispatch #140 — Training Retention: move into the Scheduling hub, drop the internal coaching
# note from view, week-anchored range picker, broaden the location selector

**Owner (2026-08-25), two rounds:**
1. Confirmed after I pointed out Training Retention shipped (dispatch #134) as a separate sidebar
   item instead of living with its sibling scheduling tools — *"It could move into the Schedule
   Dashboard as a logical home"* → confirmed "yes" when offered the fix.
2. Follow-up, same panel: *"let's drop the worth a coaching visit comment on this page, or at
   least on the printed form (I don't want to have a store see that comment directly) > also
   needs the location selector and ability to set start timeframe and end time frame (weekly
   basis)."* (The owner's separate rollup-report ask from the same message is its own dispatch —
   see `dispatch-141.md` — a materially new build, not a fix to this panel.)
3. Confirmed week-anchored, not calendar-day: *"let's do weeks."*
4. Same reply, more scope: *"while back in there I like the labor trend chart, do one for Sched
   vs Forecast hours and TPMH > Honestly I wouldn't mind seeing all of the fields with a small
   chart. That is really helpful. Maybe make the findings box shorter and spread the text out and
   free up some room and then stack the charts for effect."*

Five items, all on the same file, bundled into one dispatch for one engineer.

## Same shape as dispatch #135's Targets Editor move — follow that precedent exactly

This is architecturally identical to what #135 just did for the Targets Editor (standalone
`route:true` panel → content-only section rendered inside an existing hub's tab bar). Read that
PR's diff first (`git log --oneline --all | grep -i targets-editor`, or just re-read
`src/views/targets-editor.js`'s current `TargetsEditorSection` shape) before starting — same
pattern, don't reinvent it.

## What's actually there today, confirmed by reading the code

- `src/app/App.js:378-408` — `SchedulingHubPanel`, the "Labor & Scheduling" hub. Its tabs are a
  **hand-maintained array**, `SCHED_TABS` (`App.js:378-386`) — NOT registry-driven, unlike Test
  Kitchen's promotion mechanism (CLAUDE.md's `kind:` note). Sibling panels (`LaborAnalyticsPanel`,
  `SchedulingPanel`, `ScheduleSummaryPanel`, `LaborAnalysisPanel`, `LaborAllocationPanel`,
  `SkillsMatrixPanel`) are all rendered via `h(<Panel>, common)` where
  `common = { ds, stores, settings, onClose, embedded: true }` — each of those panels handles
  `embedded` itself to skip rendering its own outer shell chrome (verify this by reading one, e.g.
  `LaborAnalysisPanel`, before assuming the exact mechanism — don't guess the prop name/shape).
- `src/views/schedule-retention.js:173` — `ScheduleRetentionPanel({ds, stores, onClose})` — takes
  NO `embedded`/`settings` prop today, and unconditionally wraps its whole body in its own
  `RoutePanelShell` (`schedule-retention.js:353`). Plugged into the hub as-is, this would
  double-wrap chrome (hub's own `RoutePanelShell` + this panel's own, nested) — the exact defect
  class dispatch #135 fixed for Targets Editor's `ModalShell`.
- `src/app/panel-registry.js:183` — `sched-retention` entry, currently `kind:'nav', section:
  'scheduling', route:true`. This is the field that needs to flip.
- `src/views/schedule-retention.js:110` — `buildNarrative()`'s regression branch ends
  `"...— worth a follow-up coaching visit."` This is the language the owner wants gone. His
  parenthetical ("I don't want to have a store see that comment directly") means the printed
  output is the hard requirement, but the phrasing "drop... on this page, or at least" reads as a
  preference to drop it everywhere — remove it from the narrative string itself (both on-screen
  and print read from the same `buildNarrative()` output), not just from the print template.
- `src/views/schedule-retention.js:264` — `LocationSelector` is `mode:'store'` (a flat All/store
  picker, no State/Patch tier — confirmed by reading `PanelControls.js`'s `mode==='store'` render
  branch). The owner wants a fuller selector.
- `src/views/schedule-retention.js:267` — `DateRangeControl` with `allowCustom:true` — a
  calendar-day picker. The owner wants week-level start/end selection instead, matching how the
  report's own data is actually bucketed (`WEEK_START_DOW`/`weekStartOf()`,
  `schedule-summary.js` — Wednesday-anchored LifeLenz business weeks).
- `src/views/schedule-retention.js:225-244` — the `sparkline` is a single, hardcoded inline SVG
  tied specifically to `laborPct` (`vals = weeks.map(w => w.laborPct)`) — not a reusable
  component. The owner wants one per metric row.

## Scope — build

1. **Hub move.** Split `ScheduleRetentionPanel` into a content-only component (keep its internal
   state/logic unchanged — `scope`, `dateRange`, `markedWeekKey`, the whole `weeks`/`narrative`
   computation) that renders WITHOUT its own `RoutePanelShell`, following exactly how the other
   embeddable `SCHED_TABS` panels handle `embedded` mode. State the name you land on (e.g.
   `ScheduleRetentionSection`, matching `TargetsEditorSection`'s naming from #135) and your
   reasoning if you deviate. Add a new entry to `SCHED_TABS` in `App.js` (e.g. `{ id: 'retention',
   label: 'Training Retention', icon: '🎓', perm: 'analytics.store' }`), wire it into
   `SchedulingHubPanel`'s tab-body ternary, flip `panel-registry.js`'s `sched-retention` entry
   from `kind:'nav'` to `kind:'hub-tab'` (matching #135's exact precedent), and handle the
   existing `?panel=sched-retention` deep link the same way #135 handled `?panel=targets-editor`
   (open the hub, land on this tab — not a 404, not a standalone panel).
2. **Drop the coaching-visit language.** Remove `"— worth a follow-up coaching visit."` from
   `buildNarrative()`'s regression branch. Keep the factual magnitude/direction statement (e.g.
   "Labor % worsened Xpp since the workshop (A% → B%)") — only the editorial tail goes. This
   applies to the narrative wherever it's consumed (on-screen AND `buildPrintHTML()`, since both
   read the same `buildNarrative()` output) — confirm there isn't a SEPARATE hardcoded copy of
   this phrase inside `buildPrintHTML()` itself before assuming one fix covers both.
3. **Week-anchored range picker.** Replace (or add alongside, your call) `DateRangeControl` with
   a picker keyed to actual LifeLenz business weeks — "start week" / "end week" rather than raw
   calendar dates. Reuse `weekStartOf()`/`WEEK_START_DOW` (`schedule-summary.js`) for the week
   boundaries; do not re-derive the anchor. A reasonable shape: two `<select>`s populated from the
   distinct weeks actually present in `ds.schedRows` for the selected store (or scope, once #4
   below is in), sorted, each showing e.g. "Wk of 7/22" — state your exact UI choice.
4. **Broaden the location selector.** Change `LocationSelector` from `mode:'store'` to
   `mode:'progressive'` (the same All→State→Patch→Store hierarchy this session's other panels
   use) so a Patch/State/All scope is selectable, not just one store at a time. **Read dispatch
   #139 first** (`memory/dispatch-139.md`, merged this session, fix likely in flight/landed by
   the time you start) — `LocationSelector`'s Patch tier had a stale-data bug (a hardcoded
   supervisor map disagreeing with the live, Settings-editable one). Confirm #139's fix is
   already in `main` before you build on `LocationSelector` here; if it isn't yet, do NOT
   re-introduce or work around the stale source yourself — flag it and proceed once it lands,
   since this panel would inherit that bug directly otherwise.
   - When scope narrows to a single store (`level:'store'`), keep today's per-store detail view
     exactly as it is.
   - When scope is broader (All/State/Patch), this panel's existing per-store view doesn't apply
     directly — dispatch #141 (`memory/dispatch-141.md`) is the aggregate rollup report for that
     case. **Coordinate scope shapes with #141 if both are in flight, so the same
     `LocationSelector` value shape works for both** — check whether #141 has already landed or
     is in progress before deciding how to handle a broader-than-store scope here (e.g. show a
     "select a store to see its detail" empty state, or link into #141's rollup, your call —
     state your reasoning).
5. **A small sparkline per metric row, plus a layout pass.** Generalize the existing `laborPct`-
   only `sparkline` into a small reusable function parameterized by a metric accessor (e.g.
   `sparklineFor(weeks, w => w.laborPct)`), and render one next to (or above/below, your call for
   what reads best at this width) every metric row currently in the table — at minimum Labor %
   (already exists), Sched Hours, Fcst Hours, Hours ± Fcst, TPMH (owner named these two
   explicitly), and if it fits cleanly, Fixed %/Floor %/Combined Fixed+Floor % too (owner: "all of
   the fields"). Each sparkline keeps the existing pre/post-workshop dot coloring
   (`preSet.has(weeks[i].weekKey)`) — that visual language is proven, don't drop it.
   **Layout**: the owner explicitly asked to shrink/compact the findings (narrative) box and
   spread its text out to free vertical room, then stack the per-metric charts underneath "for
   effect" — a vertically-stacked small-multiples layout, not side-by-side crammed in. Your call
   on the exact spacing/typography, but the narrative box should read as a compact summary strip,
   not the dominant visual element it is today, once the charts are added.

## Do NOT

- Do not change `computeStoreWeeks`/`aggregateSpan`/`splitWeeksAtMark`'s underlying math — this
  dispatch is UI/copy/scope changes only, not a metrics change.
- Do not remove the panel's print/export capability in the process of embedding it.
- Do not touch any other `SCHED_TABS` sibling panel's behavior.
- Do not silently drop the FACTUAL content of the regression narrative sentence — only the
  editorial "worth a follow-up coaching visit" tail goes; the pp-change and before/after numbers
  stay, on-screen and in print.

## Verification bar

- Confirm Training Retention now renders as a tab inside the "Labor & Scheduling" hub, no longer
  a separate top-level sidebar item; old `?panel=sched-retention` deep link still lands correctly.
- Grep the shipped diff for "coaching visit" — zero matches anywhere in `schedule-retention.js`,
  on-screen render path or print HTML.
- Confirm a week-start/week-end selection actually bounds the shown weeks to that range (test
  with a real multi-month `schedRows` fixture, not just a 2-week one).
- Confirm the location selector now shows State/Patch tiers (not just All+flat store list), and
  that a real store under a real live-assigned patch (post dispatch #139) resolves correctly.
- Confirm print/export still works identically from within the tab, minus the coaching-visit line.
- Confirm a small sparkline renders for Labor %, Sched Hours, Fcst Hours, and TPMH at minimum
  (the two the owner explicitly named plus the one that already existed), each still showing the
  pre/post-workshop dot coloring; confirm the narrative box is visually more compact than before
  and the charts read as a stacked, not crowded, layout — a screenshot in the PR body is the
  clearest way to show this, not just a description.
- Full `npx vitest run` suite passing at the same or higher count as `main` (update
  `shell-nav-snapshot.test.js`'s hardcoded nav snapshot the same way #135 did, if it references
  the old standalone entry). `npm run build` clean; report before/after entry-chunk size.

## PM note — unrelated, answered directly, no dispatch needed

The owner also asked about a "holiday selector in Event Impact." Investigated: dispatch #122
already shipped a working holiday sub-filter, but in **`src/views/store-dash.js`'s
`EventCalendar`** ("Events & Tags" panel) — a DIFFERENTLY-NAMED, unrelated panel from
`src/views/event-impact.js` ("Event Impact Registry"), which dispatch #122 explicitly scoped
itself away from ("Do NOT touch event-impact.js — different panel, not in scope"). Confirmed the
selector code is live (`store-dash.js:3254` `holidayFilter` state, `:3467` the second `<select>`).
No bug, no missing feature — just two similarly-named panels. Not part of this dispatch.
