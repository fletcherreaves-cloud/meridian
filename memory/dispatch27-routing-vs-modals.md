# Dispatch27 — Workstream E: routing vs modals, shipped

2026-08-19. `memory/dispatch-27.md` — the four panels flagged as misclassified destinations
(DI Compare, Forecast Accuracy, Projections, Date-Range Report) are now URL-synced routes
instead of `showX`-gated modals.

## What was actually there before (confirmed, not assumed)

Zero `history.pushState`/`window.location`/router usage anywhere in `App.js` — "route" meant a
`view` React state variable with no URL sync. The four flagged panels were `showDICompare`/
`showFcstAccuracy`/`showProj`/`showReport`, opened via `onOpenModal` dispatch, rendered inside
`ModalShell` as a full-screen overlay on top of whichever view (`AtAGlance`/`StoreDash`/etc) was
already mounted underneath, unmounted when `anyModalOpen` (the v4.212 performance fix) caught
them in its OR-chain.

## Design

**One field, not parallel bookkeeping.** `panel-registry.js` gets a `route: true` boolean on
exactly the four flagged panels (`dicompare`, `fcst-accuracy`, `proj`, `report`) — everything else
stays an ordinary modal with no URL footprint, per the plan's own framing ("most current modals
ARE correctly modals — this isn't a mandate to route everything").

**New, dependency-free infrastructure** (`src/app/routing.js`) — a single `?panel=<id>` query
param, no router library:
- `parseRoute(search)` / `isRoutePanelId(id)` — fail safe to `null`/`false` for anything the
  registry doesn't mark `route:true` (a stale link, a typo, a hand-edited query string never
  resolves to an arbitrary string).
- `pushRoute(id)` — **always pushes a new history entry, both opening AND closing.** Closing a
  route panel never calls `history.back()` — that would leave the app entirely on a page that was
  reached via a deep link with no prior in-app history (a freshly opened tab on a shared URL).
  Real browser back/forward is handled exclusively by `onRouteChange`'s `popstate` listener, which
  re-derives state from `location.search` (not `event.state`, which is `null` on a page reload
  mid-route) — verified in a real browser (see below) that back-from-a-deep-link lands on the app
  root, not off the app.

**App.js integration.** `routePanel` state sits ABOVE `view`, not merged into it — opening a route
panel doesn't touch `view`/`selStore`, so closing it reveals whatever was already selected. Every
top-level view gate (`view==='command'&&!anyModalOpen&&...`, `store`, `patch`, `org`, and
`district`) gets an added `&&!routePanel` check; the four panels render via a new full-page
`RoutePanelShell` (added to `components/ModalShell.js`, same header visual language as `ModalShell`
— icon/title/subtitle/dismiss — but no backdrop/centering/maxWidth, since it fills the content
area in place of AtAGlance rather than overlaying it) instead of `ModalShell`.

**Escape** still backs a route panel out (via `goRoute(null)`, checked before the modal sweep),
consistent UX with every other panel's Escape behavior, without reaching into `showX` state that
no longer exists for these four.

## `anyModalOpen` — the "what NOT to do" item, resolved as the dispatch predicted

The dispatch's own framing: *"Converting a panel to a route naturally resolves the concern for
that panel (a route replaces the view rather than overlaying it); leave the mechanism in place for
what remains an interruption."* Confirmed correct in practice: the four panels are **removed** from
`anyModalOpen`'s OR-chain, and this is safe — not a regression of the v4.212 fix — because
`AtAGlance`/`StoreDash`/etc no longer stay mounted behind them at all (the `!routePanel` gate
unmounts them the same way `view==='store'` unmounts `AtAGlance` today). Every other modal (~80
panels) is completely untouched.

## Verified in a real browser (Playwright + the dev server, not just tests)

- **Deep link → content on load**: `?panel=dicompare`, `?panel=fcst-accuracy`, `?panel=proj`,
  `?panel=report` each render the correct panel title directly on page load — the actual
  "shareable URL" claim the plan led with, confirmed working, not just wired.
- **Back button from a fresh deep link never leaves the app** — the specific edge case the
  `pushRoute`-never-`history.back()` design exists for. Landed on the app root
  (`http://localhost:5183/`), not off-origin.
  browser back/forward correctly clears AND restores both the URL and the rendered panel (tested on
  `report`: back → root, forward → `?panel=report` with the report content actually back).
- **In-panel back button** closes the panel and clears the URL (tested on `dicompare`).

## What was NOT measured, and why (measure-don't-reason, stated plainly)

The dispatch's own correction explicitly asked to re-measure the plan's "4.3s modal-close remount"
figure using the `_mark('compute:weekProjections', ...)`/`?clicktrace=1` instrumentation rather
than assume Workstream A absorbed it. **Attempted, not obtained**: the dev server + a fresh
browser session has no authenticated Supabase session (the `localhost` hostname bypass in
`AuthGate.js` skips login entirely, so RLS-scoped reads return nothing — confirmed live via
console: `"[Meridian] No IDB data — initialized empty ds; Supabase loads will populate"`, and
`ds` never actually populates because there's no session to populate it from). A real number needs
either a real login flow (magic-link email, not automatable here) or a way to seed `ds` with real
data outside the auth path — neither was in scope to build for this pass. **This is a gap, stated
explicitly rather than filled with a guess**: the re-measurement the dispatch asked for is still
open, and should be the very next thing done with real browser + real auth access (the owner's own
session, or a future headless-auth harness), not assumed to be fine because the routing change
itself tested clean.

## Scope discipline (per the dispatch's explicit "what NOT to do")

- `anyModalOpen`'s pause-background-compute mechanism: untouched for the ~80 panels that remain
  modals.
- No new panel bookkeeping: extended `panel-registry.js`/`panel-registry.test.js`, nothing parallel.
- Workstream D's broad panel-shell conversion: not started, per D's own sequencing note that it
  waits on this workstream's routing decision (now settled).
- Did not re-audit all ~55 panels for route-vs-modal — only the four the plan specifically named.

## Tests

`src/__tests__/routing.test.js` (new, 12 tests) — pure `parseRoute`/`isRoutePanelId` fail-safe
behavior, and `pushRoute`/`onRouteChange` exercised against the real History API in
`happy-dom`: push/clear, the always-push (never `history.back()`) guarantee (asserted via
`history.length`), popstate re-deriving from `location.search` rather than `event.state`, and
unsubscribe actually stopping the listener.

`panel-registry.test.js` — updated the four `AtAGlance`/`StoreDash`/`OrgView` render-gate regexes
to include `!routePanel`; added a `route panels` describe block: exactly the four expected ids
carry `route:true` (a ratchet, not a ceiling — a fifth needs a deliberate `goRoute` wire-up to
pass, not just the field), each has a real `goRoute('id')` call site and a `routePanel==='id'`
render gate in `App.js`.

1557/1557 tests pass (12 new). Build clean; entry-chunk budget essentially unaffected (511.79 KB
gzip vs 850 KB budget, +~2 KB from the previous baseline — `routing.js`/`RoutePanelShell` are tiny
and already-bundled files, not a new lazy panel).
