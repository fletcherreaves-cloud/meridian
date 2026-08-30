# Dispatch #225 — Inventory Control: shared LocationSelector + a real month picker across every tab

**Owner ask (verbatim):** *"For all of the reports in Inventory Control can we please add the
location picker with all usual groupings. And, if possible add a date picker. Could be month
only and do eom results, or you could let it be a range and let me pick what range to see."*

**PM decision on the open choice (range vs. month-only):** going with **month-only**, matching
"do eom results." The whole panel's engine (`eom-inventory.js`/`eom-diagnosis.js`/`fob-report.js`)
is keyed on `period` (`'YYYY-MM'`, a business month) — every report here is inherently a snapshot
of one EOM close, not a day-range query. A `DateRangeControl`-style day range doesn't map onto
that model (there's no "days 14–22 of the EOM close" concept), and `memory/panel-contract.md`
itself calls this out as its own mode ("Period-anchored") specifically so it's *not* force-fit into
the day-range component. The owner explicitly offered month-only as acceptable, so this doesn't
need a round-trip — but the current month picker is also badly limited (see Task 4), so "add a
date picker" really means **fix and generalize the one that already half-exists**, not bolt on a
second, unrelated range control.

## What "Inventory Control" is

One nav panel, not several report files: `panel-registry.js` → `{id:'eom-dashboard',
label:'Inventory Control', kind:'nav', section:'inventory-food-cost', route:true}`. Component:
`EOMDashboardPanel` (`src/views/eom-dashboard.js`, ~3,900 lines), a tab-strip hub with 5 modes:
Scoreboard, EOM Count, Cadence (`progress`), Count Cycle (`compliance`), and Supervisor Rollup
(`supervisor` — actually a separate component, `EOMSupervisorPanel` in `src/views/eom-supervisor.js`,
mounted as this tab).

**Today's filtering, all bespoke, no shared component:**
- Scoreboard/EOM Count/Cadence/Count Cycle share one `locationSlot` (state pills `all`/`OK`/`FL` +
  a patch `<select>` fed by `supervisorGroups()` + a store `<select>`) and one `dateControlSlot`
  (`period`, a plain `<select>` over `recentPeriods(4)` — **hardcoded to the last 4 calendar
  months, not the months that actually have data**). Cadence additionally has its own `lookback`
  (an integer "how many months of trend," a genuinely different control — see Task 4).
- Supervisor Rollup (`EOMSupervisorPanel`) is entirely separate: its own `groupType`
  (`supervisor`|`operator`|`all`) toggle + group `<select>`, and its own `selYear`/`selMonth`
  state — doesn't share anything with the hub around it.

## Task 1 — Verify the LocationSelector blocker before touching anything (gates Task 2)

`eom-dashboard.js` carries a comment (right above `locationSlot`) explaining why it deliberately
does **not** use the shared `LocationSelector`: it claims `LocationSelector`'s patch tier reads
the *static* `INV_ORG_COORDS[loc].sup` seed, while this panel's own patch filter reads the *live*
`supervisorGroups()`/`orgAssignments()` override, and swapping without confirming they agree
risks silently mis-grouping a store on a financially-scoped filter.

**That comment is very likely stale.** Read `src/components/PanelControls.js`'s
`buildLocationHierarchy()` right now: its Patch tier is built via `supervisorOf(l, meta.sup)` —
NOT a raw `invOrgCoords[l].sup` read — and its own header comment says this was fixed under
**dispatch #139** specifically because a raw static read was wrong. `supervisorOf()` and
`supervisorGroups()` (what the bespoke patch `<select>` reads) both resolve from the same live
`_liveAssignments`/`orgAssignments()` source today, so they should already agree.

**"Should" is not "measured" (this repo's own standing rule) — prove it before relying on it:**
write a small script/test that, for every real store, compares (a) which patch
`supervisorGroups()` lists it under, against (b) which patch `buildLocationHierarchy()`'s tree
puts it under (i.e. `supervisorOf(loc, INV_ORG_COORDS[loc].sup)`). If all 27 stores agree, Task 2
proceeds and this old comment gets deleted (dispatch #139 already fixed the thing it was warning
about — leaving a stale warning after the fact is exactly the `#61`/panel-registry class of bug
CLAUDE.md warns about). If ANY store disagrees, stop, do not swap that store's patch source
silently — report the exact mismatch instead of proceeding with Task 2 as scoped.

## Task 2 — Shared `LocationSelector` across the 4 hub tabs

Lift the location filter to the top of `EOMDashboardPanel`, above the tab strip, as ONE
`LocationSelector` (`mode:'progressive'` — matches `memory/feedback-selector-ui-standard.md`'s
pill standard, same component/mode used in crew-schedule-panel.js, top-bottom-performers.js,
etc.), replacing the bespoke `scope`/`patch`/`oneStore` pills+selects. Its resolved value (via
`locationSelectorLocs()`) becomes the SAME filtered-loc list every existing consumer inside the
4 tabs already reads (`rows`, `pickerStores`, etc.) — this is a UI swap, not a re-derivation of
which stores are in scope; read `locationSlot`'s current consumers before changing anything
downstream of it, and keep every one of them fed by the new value instead of duplicating logic.

`LocationSelector` needs `stores`, `invOrgCoords` (=`INV_ORG_COORDS`), `storeNames`
(=`STORE_NAMES`) — all already imported/available in this file. Keep the "N shown" count next to
it (owner-visible, already exists — don't drop it).

## Task 3 — Supervisor Rollup gets the same LocationSelector too, alongside its own groupType

`EOMSupervisorPanel`'s `groupType` (supervisor/operator/all) is a different axis than a location
filter — it picks WHICH rollup grouping to view, analogous to (and should stay next to) the
Operator tier dispatch #224 just added to the EOM Digest. That control stays. What's missing to
match "all of the reports" is a **location narrower** on top of it, same as the other 4 tabs: add
the SAME `LocationSelector` here too, scoping `allLocs`/`selGroup`'s candidate set before
`groupType`'s own rollup grouping applies on top. Don't collapse `groupType` into
`LocationSelector` — they answer different questions (which axis to roll up by, vs. which stores
are in scope at all).

## Task 4 — A real month picker, shared by all 5 tabs

Replace `recentPeriods(4)`'s hardcoded 4-month window with a period list actually driven by data
availability — every month that has ANY `eom_count_status`/`qsr_onhand` row for at least one
store in scope, newest first, with no arbitrary cap (the owner should be able to go back to any
EOM close Meridian has ever recorded, per this repo's own "data depth is never the limiter"
standing rule — a hardcoded 4 is exactly the kind of self-imposed limiter that rule exists to
kill). Keep it a simple picker (a `<select>` is fine — this doesn't need a new shared component,
just a better-sourced list); it does NOT need to become `DateRangeControl` (see the PM decision
above for why a day-range doesn't fit this data model).

Lift this `period` state to the top of `EOMDashboardPanel` too (it's already shared by
Scoreboard/EOM Count/Count Cycle — just needs its source list fixed and Cadence/Supervisor Rollup
folded in). Cadence's own `lookback` (trend-window depth, months-back-from-`period`) is a
DIFFERENT, additional control — keep it, don't remove it, just make sure it now trails from the
shared `period` as its anchor instead of implicitly from "now." Supervisor Rollup's separate
`selYear`/`selMonth` state gets replaced by the same shared `period` — translate at the component
boundary (`period` → `{selYear, selMonth}`) rather than rewriting its internal computations.

## Task 5 — Panel-contract pass (opportunistic, per the standing rule — don't widen scope beyond this)

This panel is already `route:true` (`RoutePanelShell`) — confirm the new top-of-panel controls
render inside that shell correctly (no backdrop/maxWidth assumptions bleeding in from `ModalShell`
patterns). Confirm any table that scrolls under the new filters still has `overflowX:'auto'` on
mobile. Do not do a broader panel-contract sweep here — just don't regress what's already
compliant while restructuring the top of this panel.

## Verification (required — do not claim this fixed without measuring it)

1. **Task 1's live-vs-static agreement check** — the actual per-store comparison, not an assumption. Record the result (agree / disagree + which stores) in the PR body.
2. A render test driving the REAL `EOMDashboardPanel` component chain (per this repo's "would
   this verification still pass if the change were reverted" rule): pick a State in the new
   `LocationSelector`, confirm the visible row set actually narrows — not just that the control
   renders. Same for picking a month in the new picker: confirm `rows`/the visible report data
   changes to match, not just that the `<select>` shows the right options.
3. Confirm Supervisor Rollup's `groupType` still works AND now also respects the shared location
   scope (a location narrower `+` a groupType rollup composing correctly, not one silently
   overriding the other).
4. Full suite (`npx vitest run`) and `npm run build`, both in a FRESH worktree off current `main`
   — this repo's Supabase project was mid-incident earlier today (resized Nano→Micro after a
   statement-timeout storm); if it's still not fully caught up when you run this, note that
   plainly rather than treating an empty/slow read as a code result.
5. Changelog entry + version bump, per the standing rule.

## Explicitly out of scope for this dispatch

- Converting `DateRangeControl` to support a month/period preset generically — Task 4's list is
  local to this panel; don't build a new shared component for one caller.
- Touching any panel other than `EOMDashboardPanel`/`EOMSupervisorPanel`.
- Re-litigating dispatch #224's Operator tier — this dispatch's Task 3 only ADDS a location
  narrower next to the existing groupType toggle, it doesn't change what groupType does.
