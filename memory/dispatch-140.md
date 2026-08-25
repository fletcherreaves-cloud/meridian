# Dispatch #140 — Move Training Retention into the Scheduling hub as a tab (not a standalone
# nav item)

**Owner (2026-08-25):** confirmed after I pointed out Training Retention shipped (dispatch #134)
as a separate sidebar item instead of living with its sibling scheduling tools — *"It could move
into the Schedule Dashboard as a logical home"* → confirmed "yes" when offered the fix.

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

## Scope — build

1. Split `ScheduleRetentionPanel` into a content-only component (keep its internal state/logic
   unchanged — `scope`, `dateRange`, `markedWeekKey`, the whole `weeks`/`narrative` computation)
   that renders WITHOUT its own `RoutePanelShell`, following exactly how the other embeddable
   `SCHED_TABS` panels handle `embedded` mode. State the name you land on (e.g.
   `ScheduleRetentionSection`, matching `TargetsEditorSection`'s naming from #135) and your
   reasoning if you deviate.
2. Add a new entry to `SCHED_TABS` in `App.js` (e.g. `{ id: 'retention', label: 'Training
   Retention', icon: '🎓', perm: 'analytics.store' }`) and wire it into `SchedulingHubPanel`'s
   tab-body ternary.
3. Flip `panel-registry.js`'s `sched-retention` entry from `kind:'nav'` to `kind:'hub-tab'`
   (matching #135's exact precedent for `targets-editor`) — same reasoning: it opens a hub and
   selects a tab, no sidebar entry of its own.
4. Handle the existing `?panel=sched-retention` deep link the same way #135 handled
   `?panel=targets-editor` — should open the Scheduling hub and land directly on the new
   Training Retention tab, not 404 or open a standalone panel. Check `App.js`'s `modal===` /
   `goRoute` handling for the exact mechanism #135 used and mirror it here (likely an
   `initialTab`/`schedTab` value threaded through, given `SchedulingHubPanel` already accepts
   `initialTab`).
5. Keep the location scoping WITHIN this tab exactly as it is today (`LocationSelector`
   `mode:'store'` scoped to a single store, per dispatch #134's original design) — the hub itself
   has no cross-tab location scope to inherit from, each `SCHED_TABS` panel manages its own scope
   independently (confirm this is true for the sibling panels before assuming it, but it's very
   likely true given `common` doesn't pass a shared scope value).

## Do NOT

- Do not change `ScheduleRetentionPanel`'s internal computation logic (`computeStoreWeeks`,
  `buildNarrative`, `splitWeeksAtMark`, the sparkline, print/export) — this is a shell/placement
  move only, same as #135.
- Do not remove the panel's print/export capability in the process of embedding it.
- Do not touch any other `SCHED_TABS` sibling panel's behavior.

## Verification bar

- Confirm Training Retention now renders as a tab inside the "Labor & Scheduling" hub (sidebar →
  Scheduling & Labor → Scheduling, tab bar now includes 🎓 Training Retention), and is no longer
  a separate top-level sidebar item.
- Confirm the old `?panel=sched-retention` deep link still lands correctly (hub open, correct tab
  selected), not a 404 or a standalone panel.
- Confirm print/export still works identically from within the tab.
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
