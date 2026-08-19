# Dispatch #30 — Workstream D follow-up: two hand conversions + the panel contract

2026-08-19. `memory/dispatch-30.md` — dispatch #26 (Workstream D) was blocked on Workstream E's
routing-vs-modals decision; E shipped in PR #426, but into **two** shell shapes
(`ModalShell`/`RoutePanelShell`), not the one dispatch #26 expected. Re-measured fresh against
`main`: adoption hadn't moved at all (`ModalShell` 9/56, `LocationSelector`/`ActionMenus` 1/56,
`DateRangeControl` 0/56 — same digits as dispatch #26, just one more panel file in the
denominator), and `labor-allocation.js` — merged the SAME session as the re-measurement — proved
why: a complete hand-rolled modal branch instead of `ModalShell`.

## What shipped

**Two hand conversions**, per dispatch #26's step 2 and dispatch #30's own instruction to make
one of them `labor-allocation.js` specifically:

1. **`src/views/labor-allocation.js`** (the "awkward" one — multi-tab, custom shell). Its
   `!embedded` standalone-modal branch (dead code today — `App.js`'s `SchedulingHubPanel` always
   passes `embedded:true` — but real, reachable code, not a hypothetical) hand-rolled a backdrop,
   card, and close button duplicating `ModalShell` exactly, down to a hardcoded `zIndex: 460`
   instead of the shared `Z.modal` tier. Replaced with `ModalShell`, reusing the tab bar as
   `headerExtra` and the existing footnote as `footer` — `body`/`tabBar`/`footerNote` are now
   shared variables between the embedded and modal render paths instead of duplicated JSX, which
   is itself a simplification independent of the ModalShell adoption. Embedded mode (the only path
   actually exercised in production today) is visually unchanged.
2. **`src/views/report-subscriptions.js`** (the "simple" one — single view, single scope
   selector, no tabs). Two conversions: its hand-rolled backdrop/card/header (identical shape to
   `ModalShell`'s own, `rgba(0,0,0,.82)` + `zIndex: 462`) → `ModalShell`; its hand-rolled
   All/OK/FL toggle + patch/store `<select>`s → `LocationSelector` (`mode:'full'`). The panel's
   persisted `scope` shape (a plain string, already live in `report_subscriptions` rows) was
   **not** changed — two small pure functions (`scopeToSelectorValue`/`selectorValueToScope`)
   translate at the UI boundary only, so existing saved subscriptions keep working unmodified.
   Its period picker (`mtd`/`lastweek`/`lastmonth`) was deliberately **not** converted to
   `DateRangeControl` — it's period-anchored (dispatch #26's own third date-mode row), and a
   day-count preset would misrepresent "Month-to-date." Recorded as the date-mode rule working
   as intended, not a missed conversion.

**The panel contract** (`memory/panel-contract.md`) — dispatch #26's step 5 deliverable, written
against the two real shells that exist today (not the single hypothetical shell dispatch #26
expected) and grounded in what the two conversions above actually revealed, not written
speculatively. Covers: shell (name both, don't unify), date mode (the three-way table plus the
period-anchored example now real), scope (translate at the edges when a panel has its own
persisted shape), actions (still opportunistic, 1/56, untouched this pass), empty-state (already
mostly satisfied, confirmed not changed).

**Ratchet R7** (`src/__tests__/ratchet-modal-backdrop-bypass.test.js`) — hand-rolled
`position:'fixed', inset:0, background:'rgba(0,0,0...'` backdrops, the exact pattern `ModalShell`
replaces, in `src/views/` + `src/features/`. **Seeded at 78, measured fresh on this branch AFTER
both conversions** (not copied from dispatch #26/#30's own text, per the standing rule those
dispatches both state) — confirmed neither `labor-allocation.js` nor `report-subscriptions.js`
appear in the hit list any more. Bidirectional (fails on rise or on a stale-high ceiling), same
shape as R1–R4.

## What NOT done (matches dispatch #26/#30's own scope discipline)

- No 56-panel sweep — exactly two hand conversions, same as instructed.
- `DateRangeControl`/`LocationSelector` adoption counts are not separately ratcheted — only the
  bypass (R7) is. One ratchet per convention is enough surface for now; `panel-contract.md` names
  this as an open question for whichever dispatch converts the first real `DateRangeControl`
  candidate.
- Did not widen `labor-allocation.js`'s fixed 90-day window into a `DateRangeControl` — that
  wasn't asked for by this dispatch and risks scope creep into a panel whose point is reproducing
  one specific proven analysis window; flagged in `panel-contract.md` as an open question, not
  silently decided either way.
- Did not touch `ActionMenu`/`ActionMenus` adoption (still 1/56) — neither converted panel has
  enough action groups to need it; stays opportunistic per dispatch #26's step 4.

## Verified

- New `src/__tests__/ratchet-modal-backdrop-bypass.test.js` (2 tests, R7) passes with the
  freshly-measured ceiling of 78.
- Full suite + build run together with dispatch #31's changes on this same branch — see that
  dispatch's own writeup for the combined test/build numbers (both landed in the same session,
  same PR).
- Did not get real-browser verification of either converted panel's rendered output (same
  sandbox limitation dispatch #27/#29/#31 already documented — this session's in-browser
  `fetch` to Supabase fails). `report-subscriptions.js`'s conversion is lower-risk to verify
  structurally (pure JS translation functions, easy to reason about); `labor-allocation.js`'s
  converted branch is currently unreachable in production (`embedded:true` always), so its
  ModalShell path specifically has never been exercised by any caller, converted or not — noted
  here rather than claimed as tested.
