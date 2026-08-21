---
name: dispatch-54
description: PM pass on Notes 67's IA/URL workstream, verified against current code. Two surprises - the routing infrastructure already exists and is deliberately scoped to 4 of 57 panels, and the registry's SECTIONS/panelsForSection() are dead code that nothing renders, so the nav is hand-built in shell.js. Sequenced so the section regrouping and the overlay-to-page conversion are separate, independently shippable jobs.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #54 — the IA / URL-view conversion, scoped against real code

`notes-67-queue.md` §1 says of this workstream: *"none of this has been scoped or verified against
current code yet — it needs a PM pass before becoming a dispatch."* This is that pass, run
2026-08-21.

## Two findings that change the shape of the work

**1. The routing infrastructure already exists, and is deliberately narrow.**
`src/app/routing.js` does `history.pushState` + `searchParams.set` — dependency-free, no router
library. But it is scoped, on purpose, to panels the registry marks **`route:true`**, and that is
**4 of 57** today: `dicompare`, `fcst-accuracy`, `proj`, `report`.

Separately, `App.js` carries an **82-key `modal===` dispatch chain** so almost any panel can be
*arrived at* by URL. **Deep-linkable on load ≠ routed.** Opening a panel does not change the URL for
53 of 57. So this is not "build routing" — it is "extend an existing, working mechanism," which is a
much smaller and safer job.

**2. ⚠️ The registry's section metadata is DEAD CODE. Verify this before trusting any plan built on
it — including an earlier draft of this one.**
`panel-registry.js` exports `SECTIONS` (13 labelled sections) and `panelsForSection()`, and every
panel carries a `section:` value. **Nothing consumes either.** The only `SECTIONS` reference outside
the registry is an unrelated local constant in `store-analytics.js`.

The nav is **hand-built in `shell.js`** — literal `navLabel('ADMIN')` headers with one hardcoded
`pi(...)` call per panel.

**This nearly produced a wrong dispatch.** Reading `section:` values suggests the owner's regrouping
is ~60% done (Org Summary and Rankings already `section:'reports'`, Calendar/Events/Event Impact
already `section:'planning'`, a `forecasting` section already exists). **None of that is true in the
UI**, because nothing renders from those values. Anyone planning from the registry alone will
conclude work is finished that has not started.

## The work, as three independently shippable jobs

### Job A — make the registry drive the nav (do this first)

Until `shell.js` renders from `SECTIONS` + `panelsForSection()`, every regrouping is a hand-edit in
a 300-line hardcoded list, and the registry keeps drifting from reality.

Wire `shell.js` to the registry. **Pure refactor: the nav must look identical afterwards.** Where
today's hand-built order disagrees with a panel's `section:` value, **today's UI wins** — fix the
registry to match, do not silently move a panel in front of the owner. List every disagreement found;
those are the real starting state for Job B.

**Verification must render** — a test asserting the registry's shape would pass with `shell.js` still
hardcoded. Snapshot the nav before and after and diff it.

### Job B — the regrouping (only after A)

Once the registry drives the nav, each of the owner's changes is a `section:` edit:

- **Inventory and Food Cost** (new): Food Cost, End of Month, Inventory Control, Count Cycle
  (+ consider Inventory, Product Mix — owner did not list them; **ask, do not assume**)
- **Analysis** (new): Metric Correlations, Why Engine
- **Reports**: confirm Org Summary + Rankings land there in the rendered nav
- **Forecasting and Labor Projections**: the `forecasting` section exists — confirm membership
  against the owner's 10-item list
- **HR**: Performance Reviews. **Move Visit Readiness and Graded Visits OUT of People** — the owner
  flagged them as misplaced but **did not say where they go. Ask.**
- **Calendar / Events / Event Impact**: owner floated a new group *or* folding into Planning.
  **Unresolved — ask.**

### Job C — overlay → page (the owner's actual complaint)

The owner's words: *"dozens of popup overlay panels/modals … converting them to url based."* The
complaint is **presentation**, not addressability. 12 panels render inside `ModalShell`.

Per panel: set `route:true`, render as a full view instead of a `ModalShell` child, keep the
`modal===` deep-link entry working. **Batch it** — five or six panels at a time, each batch
independently shippable and revertable. Start with the owner's named list (Scheduling, Performance
Reviews, Food Cost, End of Month, Inventory Control, Count Cycle).

**Explicit exceptions — these STAY as right-side modals** (owner-named): SAGE (already, "as-is"),
Knowledge Base, About, Metric Lineage, Feature Requests, Local News. Three of those do not have a
right-side modal today and would need one built.

**And every popup needs a minimize-and-close option**, which does not universally exist. That is its
own small job and applies to the exceptions, not the conversions.

## Known bugs riding along in Notes 67 (verify each before fixing — all unverified)

- **Food Cost (Original)** defaults its selector to May 2026 despite all data showing.
- **Speed of Service** takes 15+ seconds to load DT History.
- **Forecast Audit** is greyed out — reason unknown.
- **District Overview** has no back button.
- **LifeLenz Bridge** → rename to *Recommended WFM Forecast Adjustments*.
- **Fcst Reference** — confirm it is current.
- **Help** — confirm it is current.

## Out of scope

Everything in `plan-security-loss-prevention.md` (the security section is its own build), the
filterable/sortable table pass, the SAGE-migration question, and the LifeLenz-vs-Meridian forecast
comparison. All are in Notes 67; none belong in an IA dispatch.

## Standing rules that bite here

- **Verify against rendered UI, not registry metadata.** That is what nearly broke this dispatch.
- **Today's UI wins on any disagreement** — never silently move a panel.
- **Ask on the three genuinely unresolved questions** (where Visit Readiness/Graded Visits go;
  Calendar as a group or folded into Planning; whether Inventory/Product Mix join the new section).
- **Batch and ship** — a 57-panel big bang is unreviewable.
