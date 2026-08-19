# Dispatch #27 — Workstream E: routing vs modals

**Board (2026-08-19):** `main` at v5.066 (`ac2b4f9`). Workstream D dispatched (design-system
adoption); nothing merged against it yet. Workstreams A, B, C are shipped or dispatched. This is
Workstream E, next in the plan's recommended order — **sequenced after A (done) and before D's
broad panel-shell conversion**, per D's own dispatch: "converting 55 panels to a shell that's
about to change would be doing it twice." E's ratchet/contract-doc mechanics in dispatch #26 don't
wait on this; the broad shell sweep does.

---

## The architecture, confirmed unchanged in current code

`src/app/App.js` is exactly the hybrid the plan describes: a `view` state variable
(`command`/`district`/`store`/`patch`/`org`) plus a large `anyModalOpen` flag that ORs together
every modal's `show*` state (`App.js:2486-2489`). The render gate is literally
`view==='command'&&!anyModalOpen&&h(AtAGlance,...)` (`App.js:2718`) — confirmed this pattern still
gates `AtAGlance`, `StoreDash`, and both `OrgView` renders (patch/org). Opening any modal flips
`anyModalOpen` true, which unmounts the view behind it; closing the modal remounts it from scratch.

**DI Compare, Forecast Accuracy, and Projections are still implemented as modals**
(`showDICompare`, `showFcstAccuracy`, `showProj` — `App.js:681` and surrounding state), exactly as
the plan names them. "Date-Range Report" is registered (`panel-registry.js:100`,
`id:'report', kind:'nav'`) but still opens as a modal, not a route. The plan's misclassification
claim is still accurate today, unchanged.

## Correction — re-measure the 4.3s figure before using it to justify urgency

The `anyModalOpen` unmount pattern is not an accident — `App.js:2470-2485`'s own comment records
it as a **deliberate v4.212 performance fix**: `AtAGlance` was found (via a Chrome Performance
recording) to keep fully re-rendering and recomputing while completely hidden behind a modal, so
unmounting the background view while covered was the correct fix for *that* problem. The 4.3s
modal-close cost the plan cites is the **side effect** — remounting a view that was fully torn
down re-runs its entire expensive computation from zero.

**That computation is exactly what Workstream A moved off the render path.** For any store with a
full `forecast_week_cache` hit, `weekProjections`'s dominant cost (189 `forecastDay` calls) is now
a cache read, not a recompute — the specific 4.3s figure almost certainly dropped since the plan
was written, for at least some real-world remounts. **Don't cite "4.3s" as still-current without
re-measuring** — the same `_mark('compute:weekProjections', ...)` click-trace the plan's original
number came from will tell you the real current cost. This doesn't remove the case for
Workstream E (shareable URLs, working back button, one layout contract, route-level code
splitting are independent of the performance number), but the performance framing specifically
needs a fresh number, not the old one.

## A real scoping fact the plan doesn't say explicitly: there is no routing layer today

Checked directly: **zero** `history.pushState`, `window.location`, or router usage anywhere in
`App.js`. "Route" today means nothing more than a React state variable (`view`) with no URL sync
at all — refreshing the page, or sending someone a link, always lands on the same default view
regardless of what's open. The plan's "biggest win" (shareable URLs — *"here's Duncan's labor view
for last week"*) requires **new URL-sync plumbing**, not a relabeling of which panels use which
existing mechanism. Scope this as real infrastructure work, not a rename.

## Existing enforcement infra to extend, not duplicate

`src/app/panel-registry.js` + `src/__tests__/panel-registry.test.js` already track every panel's
`id`/`label`/`kind`/`section`, and the test fails the build if a panel exists in `App.js`'s modal
dispatch or `shell.js`'s nav without being registered — this is the exact discipline ("check
whether an affordance already exists") to reuse here. **None of the current `kind` values
(`nav`/`hub-tab`/`optional`/`test-kitchen`/`internal`) encode route-vs-modal** — that's a real gap,
not an oversight to route around. Add the distinction to this registry (a new field, or a new
`kind`) rather than building parallel bookkeeping; extend `panel-registry.test.js`'s existing
consistency checks to cover it, the same way it already catches an unregistered panel today.

## The rule (owner-endorsed, from the plan — unchanged)

> **Route** anything that is a *destination* — a panel you go to, work in, and might return to or
> share.
> **Modal** anything that is an *interruption* — confirm, pick, log, quick-edit.

**Test that settles almost every case: "would I ever want to send someone a link to this?"**
Yes → route.

By that rule, most current modals are correctly modals (confirm/pick/log/quick-edit) — this isn't
a mandate to route everything. DI Compare, Projections, Forecast Accuracy, and the Date-Range
Report are the four the plan specifically flags as misclassified destinations; start there rather
than re-auditing all ~55 panels from scratch.

## Tracks

None named in the plan for this workstream specifically. If you open tracking issues for the URL
plumbing or the registry extension, name them in the PR body.

## What NOT to do

- Don't rip out `anyModalOpen`'s pause-background-compute behavior wholesale — it's a correct,
  deliberate fix for genuine modals (confirm/pick/log/quick-edit) that stay modals. Converting a
  panel to a route naturally resolves the concern for that panel (a route replaces the view rather
  than overlaying it); leave the mechanism in place for what remains an interruption.
- Don't cite the plan's "4.3s" figure without re-measuring — see the correction above.
- Don't start the broad conversion for Workstream D's panel-shell sweep until this workstream's
  routing decision is settled, per D's own dispatch note. The reverse dependency doesn't hold: D's
  ratchets and two hand-conversions can proceed independently of this workstream.
- Don't invent new panel bookkeeping — extend `panel-registry.js`/`panel-registry.test.js`.
