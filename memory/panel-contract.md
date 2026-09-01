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

## Standing rule: opportunistic conformance, checked and refreshed 2026-08-25

**Owner-stated 2026-08-25:** *"as we work in each panel, let's get the close (x) button
standardized... as well as the date pickers and location selectors as we have established. This
would be easy work while we are in each panel. Also, continue with the url page migration while
we are in there."* This makes the contract above (close button → `ModalShell`/`RoutePanelShell`,
date mode, `LocationSelector`, and the routing migration below) a **standing per-dispatch check,
not a one-time project** — every dispatch that touches a panel for any reason should also bring
that panel's close button, date picker, and location selector into line with this contract, and
convert it to a `route:true` entry in `panel-registry.js` if that's a natural fit, **as long as
doing so doesn't meaningfully widen that dispatch's blast radius**. This is the same "fix it
opportunistically when you're already there" model CLAUDE.md already uses for stale line-number
citations — not a mandate to go sweep all 93 panels in one pass.

**Numbers, re-measured 2026-09-01 (do not copy stale figures forward — re-measure at the source
each time, per this file's own "never copy a number from a dispatch/plan doc into a CEILING"
rule):**
- Hand-rolled-backdrop ratchet (`ratchet-modal-backdrop-bypass.test.js`) `CEILING = 77` (was 78 on
  2026-08-19 — one fewer hand-rolled backdrop exists now than when this file was first written;
  the ratchet is doing its job). Not re-measured on 2026-09-01 — only the route:true figure below
  was re-checked this pass.
- `route:true` (URL-addressable / `RoutePanelShell`) adoption: **33 of 94** registered panels in
  `panel-registry.js` (was 32 of 93 earlier the same day — the new Digital Checklists panel
  landed built `route:true` from day one, same treatment #123's `crew-schedule` got, not a
  re-measurement correction). ⚠️ The prior "13 of 101" figure was measured via `grep -c "route:\s*true"`
  against the whole file — this OVERCOUNTS (the registry's own header/inline comments discuss
  `route:true` in prose, e.g. "Removing route:true here would silently break that link") and
  underrepresents true adoption growth since. Re-measured 2026-09-01 by actually importing and
  parsing the live `PANELS` export (`panels.filter(p => p.route === true).length` vs.
  `panels.length`), not grepping — confirmed independently twice (once by a research agent, once
  directly). The other 61 are still modal-only (`ModalShell`) — this is a large, multi-year-scale
  migration by design, not a gap to close in any single dispatch. Convert a panel to `route:true`
  opportunistically per the rule above; don't treat the ratio itself as something to fix directly.
- A parallel finding, same day: `promo-roi.js`'s results table had a mobile-scroll bug of the
  same "hand-rolled instead of the shared pattern" shape (a scroll container with the horizontal
  axis left effectively `hidden`, clipping wide tables on mobile with no way to reach the rest of
  the row) — see `memory/dispatch-119.md`, which also adds a ratchet for that specific
  anti-pattern. Treat mobile horizontal-scroll on wide tables as a fourth thing worth checking
  opportunistically alongside close button / date picker / location selector / routing, even
  though (unlike those four) it doesn't yet have a dedicated shared component to convert to —
  just `overflowX:'auto'` on the actual scroll container, verified at a real mobile viewport.
- **Print/export — added 2026-08-25, owner-stated: "let's add print export options anytime we
  build something unless there truly is no need for it."** A sixth opportunistic check, same
  posture as the other five: when a dispatch already touches a panel that shows tabular/
  reportable data and has no export mechanism, add one (reuse `ExportDropdown` + the full-content
  printable-HTML pattern established across dispatches #122/#129/#134/#136 — never bare
  `window.print()` against a scrolled container, see #129's own viewport-clipping finding). Not a
  mandate to retrofit every panel in one pass. Measured 2026-08-25 (dispatch #139's sweep): only
  5/56 `src/views` panels import `ExportDropdown`; ~15 more have their own bespoke print/export
  (own `window.print()`/CSV/HTML-blob download — not gaps); **~17 panels have no print/export
  mechanism at all** despite tabular data — `at-a-glance.js`, `signals.js`, `security-panel.js`,
  `patch-heatmap.js`, and `crew-schedule-panel.js` are the highest-value gaps if a future dispatch
  wants to close specific ones deliberately, rather than opportunistically.
