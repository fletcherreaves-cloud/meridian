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
- `route:true` (URL-addressable / `RoutePanelShell`) adoption: **34 of 94** registered panels in
  `panel-registry.js` (was 32 of 93, then 33 of 94, earlier the same day — the new Digital
  Checklists panel landed built `route:true` from day one, same treatment #123's
  `crew-schedule` got; Pricing Engine was then promoted out of Test Kitchen the same day too,
  owner: "make it a URL page for starters" — neither is a re-measurement correction). ⚠️ The
  prior "13 of 101" figure was measured via `grep -c "route:\s*true"`
  against the whole file — this OVERCOUNTS (the registry's own header/inline comments discuss
  `route:true` in prose, e.g. "Removing route:true here would silently break that link") and
  underrepresents true adoption growth since. Re-measured 2026-09-01 by actually importing and
  parsing the live `PANELS` export (`panels.filter(p => p.route === true).length` vs.
  `panels.length`), not grepping — confirmed independently twice (once by a research agent, once
  directly). The other 60 are still modal-only (`ModalShell`) — this is a large, multi-year-scale
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
  **Update 2026-11-01 — the same overflow bug hit a CONTROL ROW, not a table, and now has a
  shared fix for that shape too.** Owner, from a phone screenshot of Inventory Control: band 3
  (the Reports/Scans/Monitor/Pulls action menus + the view tabs) ran wider than the viewport and
  simply extended off the right edge, uncontrollable — on a `flex` row, `overflowX:'auto'` alone
  is a no-op unless the flex item also gets `minWidth: 0` (a flex item defaults to
  `min-width: auto`, which refuses to shrink below its own content width and is exactly what let
  the row blow out instead of clipping-and-scrolling). `src/components/PanelChrome.js`'s band 3 now
  carries this fix (`overflowX:'auto'` + `minWidth:0` + `WebkitOverflowScrolling:'touch'` on each
  of the `actions`/`tabs` wrapper divs, scrolling independently so one group doesn't steal scroll
  room from the other) — **this is the pattern to reach for first**, for any other panel's
  overflowing control row, same as `ExportDropdown`/`RoutePanelShell`/`LocationSelector` are
  reached for first rather than hand-rolled. Only 2 panels (`eom-dashboard.js`, `eom-supervisor.js`)
  use `PanelChrome` as of this fix — most panels still hand-roll their own control-row markup, so
  this fix alone doesn't reach them; migrating a panel onto `PanelChrome` is itself one of the
  opportunistic things worth doing when already touching that panel's chrome.
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

## 2026-11-02 — LocationSelector `variant:'dropdown'` rollout + two correction

**Owner ask ("the QSRSoft approach"), app-wide sweep, not a one-panel opportunistic touch.**
Measured adoption first rather than assuming: 37 panels already use the shared `LocationSelector`
component, but only **1** (`equipment-layout.js`) had ever set `variant:'dropdown'` (the compact
single-`<select>` rendering, owner-requested 2026-10-17 per `PanelControls.js`'s own comment) —
everything else defaulted to the flat pill-wall render. Of those 37, most (`events-panel.js`,
`crew-schedule-panel.js`, `eom-dashboard.js`, `smg-voice.js`, `store-assessments.js`,
`schedule-retention.js`, `targets-editor.js`, `top-bottom-performers.js`, `event-impact.js`,
`customer-complaints.js`, `record-day.js`, `news-panel.js`, `analytics.js`'s District Priority
Brief, `security-panel.js`, `calendar.js`) already use `mode:'progressive'` — the cascading
tier-by-tier reveal (dispatch #104) — which the component deliberately keeps on pill rendering
regardless of `variant` (progressive IS the "not everything flat at once" answer for those
panels already; it is not a dropdown-conversion candidate).

**⚠️ Corrects this file's own earlier claim** ("`report-subscriptions.js`'s... Converting its
hand-rolled... to `LocationSelector`" under §3 above) which a prior reader could misread as
"already on the dropdown variant" — it was converted to the shared component with PILL
rendering, never `variant:'dropdown'`; re-verified directly against the live file before writing
this entry, not copied forward.

**13 real candidates found and converted** (`mode:'full'`/`'store'`/unspecified-defaults-to-
'full', each a one-line `variant:'dropdown'` add to an existing call — the component's
`value`/`onChange` contract is identical across variants, so this changes rendering only, never
filtering behavior): `forms-panel.js`, `forms-reviews-panel.js`, `count-timing-report.js`,
`weekly-count-status-report.js`, `missed-count-report.js`, `opportunity-dollars.js`, `trends.js`,
`trend-report.js`, `pricing-engine.js`, `checklist-fill.js`, `visit-readiness.js`,
`above-store-onepager.js`, `report-subscriptions.js`.

**Real latent bug found and fixed in the same pass**: the `variant:'dropdown' && mode:'full'`
branch predates `customGroups` (the saved-location-groups 6th tier, 2026-11-01) and never got a
matching `<optgroup>` — the pill-mode render already includes a group pill, so a panel on the
dropdown variant that also passed `customGroups` would have silently lost group access with no
error. None of today's 13 conversions pass `customGroups`, so nothing regressed live, but this
was caught and fixed in `PanelControls.js` itself (now renders a "Groups" `<optgroup>`,
`group:<id>` option values, round-tripping through the existing
`locationSelectorOptionValue`/`parseLocationSelectorOptionValue` pair unchanged) before any
future panel could combine the two and hit it. Covered by 3 new tests in
`dispatch-location-selector-custom-groups-2026-11-01.test.js`.

**Not touched, by design**: `analytics.js`'s Food Cost panel hand-rolled `<select>` (documented
2026-08 reason: 'all'|'ok'|'fl'|storeId shape with market shortcuts, a real translation-layer
conversion out of scope for a mechanical variant flip) and every `mode:'progressive'` call site
above — converting either is a real design decision, not today's mechanical sweep.

**Open backlog, not executed today (judgment-heavy, not a safe blind batch)**: 9 panels have a
genuinely hand-rolled location/store `<select>` that never went through `LocationSelector` at
all — `dt-speedofservice.js` (`orgFilter`: `'all'|'fl'|'ok'`), `graded-visits.js` (`selLoc`:
`'all'|'fl'|...`), `inventory.js` (`selLoc`: plain loc string, defaults to first store),
`performance-calculator.js` (`selLoc`: plain loc string), `skills-matrix.js` (`store`: `'all'|
loc`), `labor-tools.js` (`selLoc`: plain loc string), `labor-analysis.js` (`scope`, shape not yet
read), `scheduling.js` (shape not yet read), `signals.js` (`selLoc`: nullable loc string, a
click-to-select drill-down, not obviously a top-level scope filter at all). Each needs its own
`{level,id}` translation layer verified against that panel's real filtering logic before
converting — exactly the `scopeToSelectorValue`/`selectorValueToScope` pattern §3 above already
established, not a risk worth taking across 9 panels in one unverified pass while the owner was
unreachable. Convert one at a time, next time that panel is touched for something else, per this
file's own standing rule — or as its own dedicated pass if the owner wants it swept sooner.

**Separately, same day — the panel-contract.md-documented mobile horizontal-scroll gap is now
closed.** `ratchet-mobile-table-horizontal-scroll.test.js`'s `CEILING` had sat at 2 since
2026-08-25, explicitly pointing at `dt-speedofservice.js`'s Store Ranking and By Hour tables as
"left for opportunistic fixing next time that panel is touched" — today's app-wide scroll-UX ask
was that occasion. Fixed both (added `overflowX:'auto'` alongside the existing
`overflow:'hidden'`, table `width` changed from `'100%'` to `'max-content'` + `minWidth:'100%'`,
the identical reference fix `promo-roi.js` already used) and lowered `CEILING` to **0** — the
whole src/views + src/features tree now has zero tables with the horizontal axis left
effectively `hidden`. The sibling ratchet (`scroll-table-width.test.js`, the *other* half of this
anti-pattern — `width:'100%'` with no `minWidth`, which makes an `overflowX:'auto'` wrapper a
no-op) was already enforced at zero tolerance app-wide before today; nothing to do there.

### Follow-up, same day — the 9-panel backlog above is now cleared (8 converted, 1 flagged)

Owner approved ("Yes, please") converting the 9-panel backlog listed above. Went panel by panel —
read the real value shape and every consumer first, wrote the minimal `{level,id}` translation
inline (never migrated the panel's persisted state shape), then ran that panel's own tests before
moving on, same discipline as the original 13-panel batch.

**8 converted to `mode:'full'`/`'store'`, `variant:'dropdown'`** (each a translation layer over
the existing `'all'|'fl'|'ok'|'__patch__'+name|loc` or plain-loc shape, same pattern as §3's
`scopeToSelectorValue`/`selectorValueToScope`): `inventory.js` (`selLoc`, plain loc, `mode:'store'`
— no prior "All" option even though the filter already supported it), `performance-calculator.js`
(`selLoc`, plain loc, `mode:'store'` — single-store what-if calculator, "All Locations" is new but
harmless since the hook falls back to its own 140/22%/$10.50 defaults), `labor-tools.js` (THREE
independent `selLoc` state variables in one file — `DARDaypartPanel` and `LaborAnalyticsPanel`
converted, `mode:'store'`/`'full'` respectively; `StoreKBEditor`'s is a search+clickable-list UI,
not a `<select>` at all — left alone, see exception below), `skills-matrix.js` (`store`,
`mode:'full'` — incidentally fixes this panel's Patch tier reading the stale `supervisorGroups()`
fallback, since `LocationSelector`'s own Patch tier resolves live via `supervisorOf()`),
`dt-speedofservice.js` (`orgFilter`, `mode:'full'`), `graded-visits.js` (`selLoc`, `mode:'full'`
— its separate `typeFilter` select left untouched, not a location control), `labor-analysis.js`
(`scope`, `mode:'full'`), `signals.js`'s `CorrelationsTab` (`selLoc`, `mode:'store'` — picking
"All Locations" falls back to the first store rather than an empty/undefined selection, since a
per-store correlation series has no sane "all" reading).

**2 extenuating circumstances found and left alone, as asked**:
- **`StoreKBEditor`** (inside `labor-tools.js`) uses a search box + clickable store-list sidebar,
  not a `<select>` — arguably better UX for a store-profile-editing context than a dropdown would
  be. Not a gap; a different, legitimate pattern.
- **`scheduling.js`**'s Scope selector has a genuinely different taxonomy than every other
  converted panel: it groups by **Operator** (`settings.operators`) in addition to Supervisor/
  Patch (`settings.supervisorGroups`), both read from `settings`, not from `invOrgCoords`/
  `supervisorOf()`. `LocationSelector`'s `mode:'full'` has no Operator tier — converting would
  silently drop that whole grouping, a real functionality loss, not a cosmetic swap. Left as its
  own hand-rolled select; would need `LocationSelector` itself extended with a 5th tier to convert
  safely, which is a bigger, separate change.
- **`signals.js`**'s OTHER `selLoc` (inside the Signal Lab results-table component, ~line 1446) is
  nullable and set only by clicking a result row (`setSelLoc(selLoc === r.loc ? null : r.loc)`) —
  a drill-down, not a `<select>` and not a top-level scope filter. Not a conversion candidate,
  same reasoning as `StoreKBEditor`.

Test fallout was the same shape as the 13-panel batch: a handful of tests located the location
`<select>` by a bare loc value (`o.value === '3708'`) or set `.value` to a bare loc directly —
broken by the dropdown's `store:<loc>` prefix (`locationSelectorOptionValue`). Fixed in place
(`dispatch-110-sos-panel.test.js`, `signals-correlations-tab-auto-first.test.js`); no test existed
at all for `skills-matrix.js`, `labor-analysis.js`, `graded-visits.js`'s location select — nothing
to fix there, syntax-check + the panel's other real tests were the verification.

Full suite re-run clean after all 8 conversions: 690 test files / 6404 tests passed. Build clean,
582.33 KB gzipped eager payload (unchanged — no new static imports, `LocationSelector` was already
reachable from every touched panel's existing bundle via `PanelControls.js`).

**LocationSelector dropdown-variant rollout is now complete across every panel with a genuine
scope-filter `<select>`** — the only remaining hand-rolled location selects in the codebase are
the 2 flagged exceptions above (`scheduling.js`'s Operator/Patch dual-taxonomy, and `analytics.js`'s
Food Cost panel market-shortcut select from the prior pass) plus `mode:'progressive'` call sites,
which keep pill rendering by design.

### Same day, follow-up — `multi:true`: arbitrary multi-store selection (owner ask)

**Owner ask, verbatim:** "Remember also, where applicable, I want to be able to multi-select any
combination of locations for reporting and viewing." The existing `{level,id}` value shape is
inherently single-pick — even `'state'`/`'patch'`/`'group'` only ever resolve to ONE pre-defined
group's locs, never an arbitrary hand-picked combination that crosses state/patch lines (e.g.
"just Ardmore + Chipley + Duncan"). This adds that as a new, orthogonal capability rather than a
replacement for the single-pick modes — most panels (drill-downs, single-store calculators,
single-store correlation views) have no use for it and keep their existing single-pick value
shape untouched.

**New prop: `multi:true`** on `LocationSelector` (`src/components/PanelControls.js`), independent
of `mode`/`variant`. When set, it overrides rendering before either is consulted:
- **value shape**: `{level:'all', id:null}` (unchanged meaning) or `{level:'multi', ids:[...]}` —
  an EXPLICIT array of loc strings, length 0 included. **Deliberately never collapses an empty
  `ids` back to `'all'`** (a report scoped to "nothing" and one scoped to "everything" are not the
  same thing for a caller filtering rows by it) **and never auto-infers `'all'` just because every
  individual store happens to be checked** (same reasoning, the other direction — the caller
  decides what either edge case means for its own filtering).
- **`locationSelectorLocs`** gained a matching `'multi'` branch — `value.ids` filtered against
  `tree.locs` so a stale id (a removed/renamed store lingering in saved state) can't leak through,
  same defensiveness `'group'` already has. Any caller that was already deriving its filtered loc
  set via `locationSelectorLocs` (not reimplementing the switch itself) gets `multi` support for
  free — no change needed on that side at all.
- **pills variant**: "All Locations" / "None" toggle between the two levels; individual store
  pills TOGGLE membership (click adds/removes, doesn't replace); State/Patch/Group pills become
  bulk toggles — click adds every loc in that group not yet selected, or removes the whole group
  if every one of its locs is already selected. One shared `toggleLocs()` so "is this group fully
  selected" (the pill's active state) and "what clicking it does" can never drift apart.
- **dropdown variant**: a native `<select multiple>` of individual stores (grouped by state via
  `<optgroup>` unless `mode:'store'`), plus "All"/"Clear" buttons. **Also a "+ Add group…" quick-
  add `<select>`** beside it (State/Patch/Group options, same encoding as the single-pick dropdown's
  options) that bulk-toggles a whole group through the same `toggleLocs()` then resets itself — an
  action, not a persisted selection. Without this second control, the dropdown variant would have
  silently LOST the one-click whole-state/whole-patch pick the single-pick dropdown already has
  (every tier flattened into one `<select>`) — caught before wiring any real panel to it, not after
  (the first draft shipped without it, found reviewing the diff against the single-select
  dropdown's own options before writing the first real consumer).
- 16 tests, `src/__tests__/dispatch-location-selector-multi-2026-11-02.test.js` — `locationSelectorLocs`'s
  new branch, every pill interaction above (including the state-pill bulk-add-then-bulk-remove
  round trip), the native multi-select's grouped options + onChange shape, and the quick-add
  select's own bulk-toggle + its `mode:'store'` omission.

**First-wave wiring (3 panels, chosen as "genuine reporting/comparison" candidates, not a blind
sweep)** — each a `multi:true` add to an existing `LocationSelector` call plus, where the panel's
scope derivation goes through an intermediate string (`'all'|'ok'|'fl'|'grp:'+name`) rather than
`locationSelectorLocs` directly, one new `if (locValue.level === 'multi') return ids...` branch
ahead of that translation (the arbitrary combination has no single token to encode it as, so it
bypasses the string entirely rather than extending it):
- **`pricing-engine.js`**'s Cross-Store Compare tab — the flagship case. Its own empty-state copy
  *already* told the owner to "pick a district, patch, or state" to compare item pricing across
  stores; `scopedLocs` was already generic (computed via `locationSelectorLocs(scope, tree)`), so
  this was a true one-line `multi:true` add with zero other code changes beyond a `scopeLabel`
  case and the empty-state copy now also mentioning "any custom combination of stores."
- **`count-timing-report.js`** and **`missed-count-report.js`** (both Reports▾ hub items,
  `eom-dashboard.js`) — identical `locValue`→`scope` string→`locs` pattern in both files; added the
  same `multi` bypass branch to each, plus a `scopeLabel` case. Fixed 2 tests that asserted the old
  single-select's literal option text ("All Locations") or found a store option by a bare `state:`
  value on what is now the quick-add select, not the main control — both still pass unchanged logic,
  just updated to match the new control's actual text/shape.

**Not wired today, deliberately — the rest of the backlog for whoever picks this up next:** every
other panel using `LocationSelector` keeps its existing single-pick behavior. Genuine candidates
worth auditing next, in rough priority order: the other Reports▾ hub items in `eom-dashboard.js`
(`weekly-count-status-report.js`, `opportunity-dollars.js`, `trends.js`, `trend-report.js` — same
`locValue`/`scope` pattern likely recurs), `analytics.js`'s District rollup/comparison views, and
`visit-readiness.js`/`checklist-fill.js`'s own reporting surfaces. Per this file's own standing
rule, convert opportunistically next time one of these is touched for something else, or as its
own dedicated pass — not a mechanical sweep of all 94 panels in one go, which is exactly the risk
the 2026-11-01/02 dropdown-variant work already found reason to avoid (test-interaction breakage,
plus at least one real exception per sweep so far).

Full suite re-run after this addition: 691 test files / 6420 tests passed. Build clean, 582.83 KB
gzipped eager payload (+0.5 KB over the 9-panel-conversion commit's 582.33 KB, well within the
850 KB budget — the new multi-select branch lives inside `PanelControls.js`, already in every
touched panel's existing bundle).
