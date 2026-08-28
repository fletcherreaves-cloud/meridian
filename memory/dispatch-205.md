# Dispatch #205 — URL migration batch 2: route:true for 6 more panels

## Context — continuing the standing "default to route:true" policy

Owner, 2026-08-28 (this session): *"I am a fan of own url except where it doesn't make sense... I
want to make sure we are converting pages to urls except where specified or you have a strong
opinion otherwise."* Dispatch #192 (batch 1) already converted 6 panels (`attention`,
`morning-brief`, `promo-roi`, `ranking`, `security`, `signals`). This is batch 2, sized the same
way, using the same conversion shape #192 established: swap the panel's chrome to
`RoutePanelShell`, wire `routePanel==='<id>'` in `App.js`, add `route:true` to its
`panel-registry.js` entry.

**Re-scoped fresh 2026-08-28, after this session's own #197-204 merges** — the earlier candidate
list from before those dispatches is stale (several of its entries are now retired/merged
`kind:'internal'` stubs, e.g. `eom-summary`, `channel-intel`, `record-day`, `top-bottom`,
`perf-calc`). Re-read `panel-registry.js` fresh before starting — don't trust this doc's own file
references if `main` has moved further since this was written.

## The six panels for this batch, each already its own dedicated view file

1. **`one-pager`** (Store One-Pager, `StoreOnePager` in `src/views/analytics.js`) — the direct
   per-store sibling of the already-routed `above-store`. Strongest candidate in the pool.
2. **`brief`** (Forecast Brief, `LocationBrief` in `src/views/analytics.js`) — same file as
   `one-pager`; `analytics.js` already hosts 3 route:true panels (`attention`, `fob-analysis`,
   `report`), so this file is the most RoutePanelShell-familiar in the codebase already.
3. **`visit-readiness`** (Visit Readiness, `src/views/visit-readiness.js`) — per-store PACE
   graded-visit readiness scoring.
4. **`graded-visits`** (Graded Visits, `src/views/graded-visits.js`) — natural companion to
   Visit Readiness, same "per-store visit result" shape.
5. **`operator-summary`** (Org Summary, in `src/views/labor-tools.js`) — cross-store district
   rollup report.
6. **`delivery-mix`** (3PO Delivery, `src/views/delivery-mix.js` — already absorbed Channel Intel
   under dispatch #201) — confirmed to have NO existing hand-rolled backdrop pattern (likely
   already `ModalShell`-based), so this one conversion is lower-risk than the others: swap
   `ModalShell` for `RoutePanelShell`, no backdrop-ratchet interaction.

**Deliberately left out of this batch** (different judgment calls, not oversights):
- `planning`/`events` (`PlanningHubPanel`/`EventsAndTagsPanel`) — both defined INLINE in
  `App.js` itself, not a separate view file. A materially different conversion shape (no
  standalone backdrop to swap, editing App.js's own component bodies) — a future batch, not mixed
  into this one's risk profile.
- `sage` — a persistent AI-chat side-panel overlay, not a page at all; skip.
- `about`/`data-manager`/`kb`/`metric-lineage`/`panel-manager`/`settings`/`workflow`/
  `troubleshoot`/`forms-library`/`forms-print` — admin/settings/static-reference chrome, not
  report/data-shaped; route:true doesn't add real value here.
- `my-reports`/`task-queue`/`smg-voice`/`inventory`/`loc-intel`/`news`/`dt-sos` — plausible
  future-batch candidates, held back purely for batch sizing (matching #192's precedent of 6).

## Task

1. **Convert each of the six** to `route:true`, matching #192's exact established pattern —
   read that dispatch's merged PR/commit as your template if you haven't already internalized the
   shape from other route:true conversions already in the codebase (there are 18 now).
2. **Update `src/__tests__/panel-registry.test.js`'s `ROUTE_IDS` ratchet** — this is a
   hard-coded, alphabetically-sorted array asserting the EXACT current route:true id list (18
   entries as of dispatch #204). Add all 6 new ids, keep it sorted, and extend the test's own
   running narrative comment tracking every addition by dispatch number (matching its existing
   style) — this is not optional, the test fails immediately without it.
3. **Re-measure `src/__tests__/ratchet-modal-backdrop-bypass.test.js`'s `CEILING` fresh** for
   whichever of the 5 backdrop-bearing conversions (everything except `delivery-mix`) actually
   remove a hand-rolled `position:fixed/inset:0/rgba(0,0,0...` pattern. Per this repo's standing
   "never copy a number" rule: reproduce the test's own exact scan (regex + file-walk over
   `src/views/`+`src/features/`, excluding `*.test.js`) after your changes and set `CEILING` to
   the real measured count, with a dated comment explaining the delta — not an arithmetic
   subtraction from "5 backdrops removed" (some of those files' hits may turn out to be for a
   DIFFERENT panel sharing the file, e.g. `analytics.js`'s hits are scattered across several
   components per the scoping pass — verify per-file, don't assume one hit = one panel).
4. **`shell-nav-snapshot.test.js`** shouldn't need changes for a pure route:true flip (label/
   section/kind unchanged) — but re-run it and confirm; if any of the six conversions also touches
   a label or section as a side effect, re-capture its EXPECTED array fresh from real output.

## Verification

- Each of the 6 panels opens via its own bookmarkable URL, closes back to no-route state
  correctly, and its old `showX`/`onOpenModal` entry points still work (now routing through
  `goRoute` instead of local state) — grep for every call site per panel, don't assume there's
  only one.
- `panel-registry.test.js`'s `ROUTE_IDS` ratchet passes with the 6 new ids added.
- `ratchet-modal-backdrop-bypass.test.js`'s `CEILING` freshly re-measured and passing.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- `planning`/`events` (App.js-inline panels) — a future, separately-scoped dispatch.
- Any of the admin/chrome panels named above as intentionally skipped.
- Redesigning any of the six panels' actual content.
