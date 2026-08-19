# Panel contract — shared shell + control adoption (Workstream D)

Dispatch #26 (2026-08-19) named this deliverable ("write the panel contract down... the plan's
own three-way date-mode rule is the first piece of that contract; extend it with whatever the
two hand-conversions reveal") and dispatch #30 (2026-08-19, same day) supplied the two hand
conversions that ground it. This is that document — not a plan, a record of what a panel in this
codebase should declare, checked against two real conversions rather than written speculatively.

## 1. Shell — name both, don't unify them

Dispatch #26 expected Workstream D to fold every panel into one shell. Workstream E (routing vs
modals, PR #426) shipped first and split the shell in two, on purpose — `src/components/
ModalShell.js` now exports:

- **`ModalShell`** — for anything that overlays the current view (backdrop, centered card,
  `maxWidth` cap, closes back to what was underneath). This is a **modal**.
- **`RoutePanelShell`** — for anything with a `route:true` entry in `panel-registry.js` (a
  `?panel=` URL). No backdrop, no `maxWidth` cap, no centering — a route *replaces* the view
  instead of interrupting it, so it only needs a header + body (`memory/dispatch-27.md`'s rule).

**The rule: modal → `ModalShell`. Route (`panel-registry.js`'s `route:true`) → `RoutePanelShell`.
Nothing else rolls its own backdrop, card, or close button.** Confirmed a live example of the
alternative failing on contact: `src/views/labor-allocation.js` — written and merged the SAME
session dispatch #26's re-measurement ran — had a complete hand-rolled `!embedded` modal branch
(fixed backdrop, hardcoded `zIndex: 460` instead of the shared `Z.modal` tier, its own close
button) that dispatch #30 converted to `ModalShell`. The compliant path losing to convenience in
code written *during* the workstream that flagged the problem is the strongest evidence dispatch
#26 asked for that "the compliant path is still not the cheapest one."

## 2. Date mode — pick one of three, state which, don't default to whichever is easiest

| Mode | Use when | Example (verified) |
|---|---|---|
| **Presets only** | The window is part of the method; changing it invalidates the comparison | backtests, trailing diagnostics |
| **Presets + custom** (`DateRangeControl`) | Default is a preset but an arbitrary window is legitimate | most analysis panels |
| **Period-anchored** | The unit is a business period (MTD/last week/last month), not a day-count | `report-subscriptions.js`'s period picker (`mtd`/`lastweek`/`lastmonth`) — deliberately **not** converted to `DateRangeControl` in dispatch #30's hand-conversion, because a day-count preset would misrepresent what "Month-to-date" means. This is the rule's own table working as intended, not a gap. |

`labor-allocation.js`'s 90-day window (`DAYS_BACK = 90`, matching the proven analysis it wires)
is arguably a fourth case — a fixed diagnostic window with no user control at all — left
unconverted in dispatch #30 (no `DateRangeControl` added) because widening it to a
presets-or-custom picker wasn't asked for by that dispatch and risked scope creep into a panel
whose whole point is reproducing one specific proven analysis window; flagged here as an open
question for a future pass, not silently decided.

## 3. Scope/location — `LocationSelector`, translated at the edges when the panel persists a
   different shape

`report-subscriptions.js` (dispatch #30's "simple" hand conversion) persists `scope` as a plain
string (`'all'|'ok'|'fl'|'grp:X'|storeId` — the shape already live in `report_subscriptions`
rows). Converting its hand-rolled All/OK/FL toggle + two `<select>`s to `LocationSelector` did
**not** mean changing the persisted shape — that would break every existing saved subscription.
Instead: two small pure translation functions (`scopeToSelectorValue`/`selectorValueToScope`)
convert between `LocationSelector`'s `{level,id}` value and the panel's own string at the UI
boundary only. **The contract: `LocationSelector` owns the UI and the interaction; a panel with
an existing persisted scope shape keeps that shape and translates, rather than migrating stored
data to match the component.**

## 4. Actions — `ActionMenu`/`ActionMenus` for 3+ grouped actions

Not exercised by either of dispatch #30's two hand conversions (neither panel has enough
distinct action groups to need it) — still 1/56 adoption (`eom-dashboard.js` only). Left as
dispatch #26 stated: opportunistic, next time a panel with a real button-sprawl problem is
touched for something else.

## 5. Empty-state reason

Not a new finding from dispatch #30's conversions — both panels already stated a reason for
their empty state before conversion (`labor-allocation.js`: "No hourly activity data loaded for
this window."; `report-subscriptions.js`: "No saved reports yet. Build one below.") and neither
needed to change it. Recorded here as confirmation the existing panels already mostly satisfy
this piece of the contract, not as a gap to close.

## Bypass ratchet

`src/__tests__/ratchet-modal-backdrop-bypass.test.js` (R7) — hand-rolled `position:'fixed',
inset:0, background:'rgba(0,0,0...'` backdrops in `src/views/` + `src/features/`, the exact
pattern `ModalShell` replaces. Seeded at **78**, measured fresh on this dispatch's own branch
*after* both hand conversions (per the standing rule: never copy a number from a dispatch/plan
doc into a `CEILING` — see `ratchet-raw-metric-rows.test.js`'s own header). Bidirectional: fails
if the count rises (a new hand-rolled backdrop) or falls without the ceiling being lowered (a
stale ceiling that stopped protecting anything).

`DateRangeControl` (0→0/56) and `LocationSelector`/`ActionMenus` adoption (1→2/56, this
dispatch's `report-subscriptions.js` conversion) aren't separately ratcheted yet — dispatch #26's
own instruction was two hand conversions + a ratchet on the *bypass*, not the adoption count
itself, and one ratchet per convention is enough surface for now. A future dispatch converting a
`DateRangeControl` candidate should consider whether a parallel ratchet earns its keep once
there's a real bypass pattern to point it at (a hand-rolled day-count preset row is a plausible
one; none of dispatch #30's two conversions produced a clean regex for it).
