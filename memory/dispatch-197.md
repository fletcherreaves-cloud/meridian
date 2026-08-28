# Dispatch #197 — merge Crew Schedule and Time Punches into one page

## Context — owner-requested 2026-08-28, and the two panels were already built as companions

Owner, live in this session: *"Crew Schedule and Time punches can be merged to same page also.
It makes sense."*

Verified before writing this: the two panels aren't just similar, they were **explicitly built as
a matched pair**. `src/views/time-punches-panel.js`'s own file header says it plainly: *"Built as a
companion to `src/views/crew-schedule-panel.js` (dispatch #123/#125's template, per this
dispatch's own instruction) — same RoutePanelShell/DateRangeControl/LocationSelector shape, same
un-tokenized-name convention... same ordinary panel RBAC."* Concretely, both:

- `perm:'analytics.store'`, `kind:'nav'`, `section:'people'`, `route:true` (registry entries sit
  back-to-back in `panel-registry.js`, both un-tokenized by the same owner directive — dispatch
  #125 for Crew Schedule, #126 for Time Punches — "no reason to hide names for scheduling and
  punch times").
- Same shell/control shape: `RoutePanelShell` + `DateRangeControl` + `LocationSelector` +
  `buildLocationHierarchy`/`locationSelectorLocs`.
- Same underlying subject — an employee — just two different data sources about them: Crew
  Schedule reads `lifelenz_schedule`/shift assignments (**what's planned**), Time Punches reads
  `qsr_punch_times` (**what actually happened**, shift+meal pairing). Looking up one is the
  natural next question after looking up the other — a real workflow fit, not just an
  aesthetic parallel.

Files (verify current shape before touching anything — same drift caveat as every merge dispatch
this session):

- `src/views/crew-schedule-panel.js` (241 lines) — registry id `crew-schedule`.
- `src/views/time-punches-panel.js` (307 lines) — registry id `time-punches`.
- Both lazy-imported in `App.js` (`CrewSchedulePanel`/`TimePunchesPanel`), both rendered via
  `routePanel==='crew-schedule'`/`routePanel==='time-punches'` checks alongside each other.

## Task

1. **Read both panels in full before writing anything.** Confirm the employee-lookup UX in each
   (how a name/employee is searched/selected, whether one already has a shared "pick an employee"
   control the other could reuse) rather than assuming from the file headers alone.
2. **Merge into one page, two tabs** (Schedule / Punches), matching this session's established
   "harvest into a survivor, tabs not two full standalone flows" pattern from #189 (Count Cycle →
   Inventory Control tab) and #195 (Correlations → Signals tab). Pick which registry id survives —
   default to `crew-schedule` surviving (it's the earlier/more-established of the two, dispatch
   #123 vs #138) unless you find a reason `time-punches` is the better anchor; state your choice.
3. **Share the employee/date/location selection state across both tabs** if the two panels'
   search/filter controls are compatible enough — the whole point of merging is "look up this
   person, see both their schedule and their punches without re-searching," not just two
   independent panels living under one tab strip. If the underlying selection models are
   genuinely incompatible (e.g. one searches by name text, the other by a picked geid, and
   reconciling them is a real design question rather than a mechanical one), say so explicitly
   and ship the tabs with independent selection rather than forcing a bad shared model — but
   check this for real before concluding it, since both already share `LocationSelector`/
   `DateRangeControl`.
4. **Retire the losing registry entry** (harvest-then-remove, standing pattern this whole batch):
   `kind:'internal'`, keep its `id` so `panel-registry.test.js`'s dispatch↔registry pairing check
   still passes and any `onOpenModal('<retired-id>')`/`?panel=<retired-id>` deep link redirects
   into the merged page's matching tab instead of dying. Both are `route:true` today — decide
   whether the retired one's URL should redirect (e.g. `/time-punches` → `/crew-schedule?tab=punches`)
   or simply stop being a distinct route; state which and why.
5. **Opportunistic panel-contract check** while you're in both (close button, date picker mode,
   `LocationSelector`, mobile-scroll) if it doesn't meaningfully widen scope — both already look
   compliant from the file headers, so this is likely a no-op confirmation, not new work.

## Verification

- Merged page renders both Schedule and Punches content, tab-switchable, for the same
  selected/filtered scope.
- Old registry id (whichever retires) still resolves via its former deep-link call site(s) —
  grep `App.js`/`shell.js` for all of them, don't assume there are only the ones named above.
- `panel-registry.test.js` and `shell-nav-snapshot.test.js` updated and passing (re-capture the
  nav-text snapshot fresh, per this session's established pattern — comment the exact change).
- Standard suite + build. Version bump (check `origin/main`'s current version first — this
  session has been landing several dispatches in parallel, so re-check immediately before
  claiming a number).

## Out of scope

- Any change to the underlying data sources (`lifelenz_schedule`/`qsr_punch_times`) or their pull
  scripts — this is a presentation-layer merge only.
- Re-opening the un-tokenized-names RBAC decision (#125/#126) — both panels already carry the
  same settled reasoning; carry it forward unchanged into the merged page.
