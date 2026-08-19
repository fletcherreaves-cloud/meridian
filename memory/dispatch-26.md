# Dispatch #26 — Workstream D: adopt the design system that already exists

**Board (2026-08-19):** `main` at v5.066 (`24b374d`). Workstream C dispatch (pipeline contract)
handed off, nothing merged against it yet. Workstreams A and B are both shipped and verified end
to end (render-path precompute + event scope/recurrence, including the RLS fix independently
confirmed against live `pg_policies`). This is Workstream D, next in the plan's recommended order
— sequenced **before the broad panel conversion, after Workstream E (routing vs modals)** per the
plan's own ordering, so read `memory/plan-normalization-2026-08-17.md`'s Workstream E section
before starting a sweep here. Nothing below is blocked on E; only *whether to convert 55 panels'
shells* is — the adoption mechanics (ratchets, the two hand conversions, the contract doc) can
start now.

---

## Re-verified against current code, not just the plan doc

**The core finding still holds exactly, unchanged since 2026-08-17** — measured fresh against
`main` today: `DateRangeControl` **0/55**, `LocationSelector`/`ActionMenus` **1/55**
(`eom-dashboard.js` only), `ModalShell` **9/55**, panels accepting a `dateRange` prop **8/55**
(55 = every file in `src/views/` + `src/features/`, counted directly). Despite three workstreams'
worth of PRs touching `at-a-glance.js` and `calendar.js` since the plan was written, **adoption
hasn't moved at all** — nobody has been reaching for these components, which is Workstream D's
whole premise.

**The bypass-volume counts (inline styles, hardcoded px sizes, bespoke date inputs, "Last N"
literals, "no data" strings) do NOT re-measure to the plan's exact numbers** — every pattern I
tried landed in the same order of magnitude but not the same digit (e.g. inline `style:{` objects:
~5,200–5,500 depending on scope, vs the plan's stated 7,163). This isn't a correction to record —
it's a flag that **the plan's exact figures were never meant to be load-bearing, and shouldn't be
copied into a ratchet ceiling unverified.** This repo already has the right instruction for exactly
this situation, written down in `src/__tests__/ratchet-raw-metric-rows.test.js`'s own header:
*"Measured fresh against `main`... main has moved since the dispatch's estimate."* **Do the same
here** — before writing any ratchet's `CEILING` constant, re-run whatever exact regex that ratchet
will enforce and use the number it actually returns, not a number carried over from this dispatch
or the plan doc. Record the exact pattern used in the ratchet file's own header, same as R1 does.

## The component library already exists and is correct — read it before building anything

`src/components/PanelControls.js`: `DateRangeControl({ presets, value, onChange, allowCustom })`,
`DATE_RANGE_PRESETS`, `isValidCustomRange`, `resolveDatePreset`, `LocationSelector`,
`buildLocationHierarchy`, `locationSelectorLocs`, `ActionMenu`/`ActionMenus`,
`nonEmptyActionGroups`. Per the plan: its own comment records that trailing ranges end on the
last **closed business day**, never a naive "yesterday," calling the shared `lastClosedBusinessDay()`
helper because *"this bug has already recurred five separate times from hand-copies."* Every panel
that rolled its own date logic is a candidate for a bug this component already solved.

`src/components/ModalShell.js` is the fourth piece (already at 9/55 — some prior adoption exists,
unlike the other three). Standardizes the close-button/header pattern.

## How to land it — the plan's own sequencing, don't skip steps

1. **Make the compliant path cheapest first.** If adopting `DateRangeControl` takes an afternoon
   per panel, it loses again. If the component is missing something a real panel needs, fix the
   component before converting more panels around the gap.
2. **Convert two panels by hand first** — one simple, one awkward. The awkward one is the one that
   reveals what the component is missing; fix the component, not the panel, when that happens.
   `eom-dashboard.js` already adopted `LocationSelector`/`ActionMenus` — read it as the one working
   example before picking the other two.
3. **Ratchet the bypass, not the adoption.** Seed each ratchet at today's *actually-measured* count
   (see above), only allow it to fall. Same mechanism as `ratchet-raw-metric-rows.test.js`,
   `ratchet-week-day-arithmetic.test.js`, `ratchet-color-alpha-concat.test.js` — three working
   examples of this exact pattern already in the repo, bidirectional (fails if the count rises
   OR if a stale ceiling sits above the real count).
4. **Convert opportunistically, never as a sweep.** Any panel already open for a bug in a future PR
   gets converted in that same PR. Don't open a 55-panel PR.
5. **Write the panel contract down.** Every panel declares date mode, scope mode, actions,
   empty-state reason — the plan's own three-way date-mode rule (below) is the first piece of that
   contract; extend it with whatever the two hand-conversions in step 2 reveal is also needed.

## Date-mode rule — the rule matters more than the component

| Mode | Use when |
|---|---|
| **Presets only** | The window is part of the method; changing it invalidates the comparison (backtests, trailing diagnostics) |
| **Presets + custom** | Default is a preset but an arbitrary window is legitimate (most analysis panels, EOM exports) |
| **Period-anchored** | The unit is a business period, not N days (EOM, Projections, monthly targets) |

Today the mode is an accident of who wrote the panel. It should be a stated property of what the
panel is for — decide this for each of the two hand-converted panels explicitly, don't default to
whichever mode is easiest to wire up.

## Tracks

None named in the plan for this workstream specifically — it's process (ratchets + two
conversions + the contract doc), not a numbered issue. If you open tracking issues for the two
hand conversions or the contract doc, name them in the PR body.

## What NOT to do

- Don't copy any bypass-volume number from this dispatch or the plan doc into a ratchet ceiling —
  re-measure with the exact pattern the ratchet will run, every time, per the precedent above.
- Don't do a 55-panel sweep. Two hand conversions, then opportunistic, then the ratchet keeps the
  rest from getting worse in the meantime.
- Don't start the broad panel-shell conversion before reading Workstream E's routing-vs-modals
  section — converting 55 panels to a shell that's about to change would be doing it twice, per
  the plan's own sequencing note.
