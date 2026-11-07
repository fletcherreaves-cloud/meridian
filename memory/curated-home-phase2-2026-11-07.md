---
name: curated-home-phase2-2026-11-07
description: "Curated Home Phase 2 — graphical redesign + drill-through links (task #106)"
metadata:
  node_type: memory
  type: project
---

# Curated Home Phase 2 (2026-11-07, task #106)

## The ask

Owner, verbatim: *"I want to expand or update the curated home to be more graphical. It needs to
be setup with instantly grabbing a users attention in mind. It should be professionally formatted
with relevant data and use of charts or graphs and tiles/mini tiles or whatever will make it
prominent and make me want to dive in and digest the data. Bonus for any clickable links back to
relevant data and findings."*

## What existed before this (Phase 1, task #92, `memory/plan-overnight-notes-72-2026-11-06.md`)

`CuratedHomePanel` (`src/views/curated-home.js`) was pure text — three format renderers
(Checklist/Bullets/Narrative), colored dots and bold text, zero charts, zero tiles, zero
clickable drill-through to the panel that actually owns the underlying data. Phase 1's real
additions were role-cascaded voice (`src/engine/curated-home.js`) and a per-user format
preference — both correct and untouched by this phase.

## What Phase 2 adds — all layered on the SAME `items`/`summary` from `buildCuratedHomeItems()`

1. **A real chart.** A severity-distribution stacked bar (`SeverityBar`) above the item feed —
   store counts by RED/AMBER/GREEN status, rendered as flex-width div segments (not SVG — this
   codebase's own inline-SVG convention, seen in `trends.js`/`signals.js`/`eom-dashboard.js`
   etc., is reserved for geometry a flex box can't express; a magnitude-by-status bar doesn't
   need it). Paired with three color-coded `StatTile`s showing the real store counts
   (`summary.red/amber/green`) — per CLAUDE.md's standing "Voice by role" rule, the exact number
   stays visible next to the graphical framing, never replaced by it.
2. **Tiles, not rows.** `ItemCard` — one shared component for both Checklist and Bullets (the
   owner's literal "tiles/mini tiles" ask, applied to both density levels, not just one):
   severity-tinted background + left accent border, icon badge, headline/detail, store-name
   chips, optional drill-through button. Narrative stays prose (that's the point of offering it
   as a third option) but gains a compact row of drill-through chips under the paragraphs, so the
   "clickable links" bonus isn't gated to one format.
3. **Real drill-through links**, not a styling flourish. `RULE_PANEL` maps every one of
   `MORNING_RULES`' 12 real rule ids (`src/features/morning-brief.js`) to a real
   `panel-registry.js` id — checked directly against both files, not guessed:

   | Rules | → Panel (registry id) |
   |---|---|
   | `DRAWER_OPENS`, `REFUND_OVERRING`, `TRED_SPIKE`, `GC_SALES_DIVERGE`, `CASH_OS` | Security (`security`) |
   | `FOOD_COST_HIGH` | Food Cost (`fob-analysis`) |
   | `STAFFED_SLOW`, `STAFFED_NO_PARK`, `TIMER_GAMING`, `KVS_USAGE_LOW`, `DAYPART_OEPE` | DT Speed of Service (`dt-sos`) |
   | `SMG_OSAT_LOW` | Guest Voice (`smg-voice`) |

   **Full coverage — all 12 rules map to a real panel, not a partial set.** The directive that
   scoped this work allowed leaving ambiguous categories unlinked rather than risk a misleading
   link; in practice every rule's category (`controls`/`service`) mapped cleanly to exactly one
   real panel, so there was nothing to leave out.
4. **Navigation mechanism reused, not reinvented.** `onNav` is the exact same prop shape At A
   Glance's own Action Checklist already uses for its "Go to Dialed-In → Run & Apply" links
   (`src/views/at-a-glance.js`) — `onNav(panelId)` → App.js's `goRoute(id)`. `App.js`'s
   `CuratedHomePanel` render call now passes `onNav:v=>goRoute(v)`, the same wiring. Fully
   optional on the panel's own side: with no `onNav` prop (e.g. in isolation, in a test), every
   drill-through button simply doesn't render — no dead buttons, no crash.

## Design process

Loaded the `dataviz` skill before writing any chart code, per this session's standing
instruction. Its "pick the form" step is why the severity view is a stacked bar (a real
magnitude-by-status read) rather than a donut or an icon wall — a chart chosen for the job the
data does, not decoration. Existing `SEV_COLOR` (`RED #ef4444`/`AMBER #f59e0b`/`GREEN #10b981`)
is a *status* palette already used throughout this app, paired with icon + label per tile (never
color alone) — kept as-is rather than re-derived, since reusing an established, already-validated
status palette is the right call over inventing a new one.

No new charting library or dependency — `CuratedHomePanel` is already `lazyPanel()`-wrapped in
`App.js`, so this phase's additions don't touch the entry/eager-payload budget at all (confirmed:
670.64 KB gzip eager total, unchanged from the pre-Phase-2 baseline).

## What did NOT change

- `src/engine/curated-home.js` (the role-voice engine, `buildCuratedHomeItems()`/
  `altitudeForRole()`) — untouched. Phase 2 is additive UI/UX work on top of its existing output
  shape, not a rewrite.
- No new data source, no new RBAC/scope logic — same `ds`/`brief` Phase 1 already computed.
- Panel contract: `CuratedHomePanel` was already wrapped in `RoutePanelShell` externally by
  `App.js` (not internally in the component) — already compliant, nothing to fix here.

## Files

- `src/views/curated-home.js` — `StatTile`, `SeverityBar`, `DrillLink`, `ItemCard`, `RULE_PANEL`/
  `RULE_PANEL_LABEL`; `ChecklistFormat`/`BulletsFormat` both render `ItemCard`; `NarrativeFormat`
  gains the drill-through chip row; `CuratedHomePanel` accepts an optional `onNav` prop.
- `src/app/App.js` — `CuratedHomePanel` render call now passes `onNav:v=>goRoute(v)`.
- `src/__tests__/curated-home-phase2-2026-11-07.test.js` — 6 new render-level tests against the
  real `CuratedHomePanel` (real stat-tile counts, real tile content in both Checklist and
  Bullets, a real drill-through click calling `onNav` with the real panel id, no dead buttons
  when `onNav` is absent, Narrative's chip row).
- `src/app/changelog/5.674.js` + regenerated `changelog-latest.js`.
