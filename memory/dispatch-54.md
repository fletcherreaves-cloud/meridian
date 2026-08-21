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

### ✅ The three open questions — ANSWERED by the owner, 2026-08-21

1. **Visit Readiness + Graded Visits → Operations.** ("They would be more Operations.")
2. **Calendar / Events & Tags / Event Impact → fold into Planning**, but Planning then needs clear
   internal sub-navigation.
   **⚠️ CLARIFIED 2026-08-21 — the Planning SECTION gets FOUR links, and the hub is NOT exploded.**
   An earlier draft said "three links," counting only the folded-in panels. `panel-catalog.md:42`
   records Planning as a **merged hub (v4.513)** — five panels *deliberately consolidated* into one
   nav entry with five lazy tabs (Targets / Monthly / Pace / Yearly / Smart), where legacy modal ids
   already deep-link to the matching tab. **Turning those five tabs into five sidebar links would
   reverse that consolidation.** Do not.
   So the section is: **Planning (the hub, keeping its five tabs) · Calendar · Events & Tags ·
   Event Impact.**
   This is the accordion-vs-tabs distinction doing real work: the hub's five tabs are **peer views
   on one page** (tabs/pills), the sidebar section is **hierarchy** (accordion). Conflating them is
   what would have exploded the hub. Owner: *"may need to have clear sections when planning is opened. Use
   menus or something. Be consistent with our preferences though."*
   **⚠️ There is no single house idiom today — pick one and make it the standard.** Two exist:
   `store-analytics.js:1415` uses **underline tabs** (amber `borderBottom`), and `security-panel.js:481`
   uses **pill buttons**. **Use pills**: CLAUDE.md's UI conventions already name pill-style for
   location selectors, and the Security panel is the newest surface. State the choice in the
   writeup so the next panel does not re-decide it.
3. **Inventory and Food Cost takes ALL inventory/food-cost panels** — Food Cost, End of Month,
   Inventory Control, Count Cycle, **plus Inventory and Product Mix**. ("all inventory and food
   cost related items should be grouped together.")

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

**BUILD the three missing right-side modals** (owner-approved 2026-08-21): About, Metric Lineage,
Feature Requests. These have no right-side modal today, so this is new work, not conversion. SAGE is
the reference implementation — match it.

### Four more interruption candidates, and the rule behind them

Owner asked for other candidates. `routing.js`'s own test is the right one: *"would I ever want to
send someone a link to this?"* By it, four more qualify:

| panel | why |
|---|---|
| **Settings** | Nobody links to settings. Pure interruption, consulted mid-task. |
| **Panel Manager** | Same — configuration, never a destination. |
| **Help** | Reference consulted *while* doing something else, not a place you navigate to. |
| **Task Queue** | A personal work list, read alongside other work. |

**And the pattern worth adopting as a rule:** those four plus the owner's six are almost exactly the
registry's **`help` and `admin`** sections. So rather than hand-maintaining an exception list —
**`help` and `admin` panels are interruptions (right-side modal); everything else is a destination
(routed page).** That is explainable, it survives new panels being added, and it falls out of
section metadata Job A is already wiring up.

**One genuine ambiguity — do NOT decide it silently: `Data Manager`.** It is in `admin`, but uploading
files is a task you go and do rather than a thing you glance at. Ask the owner.

**Not candidates**, for the record: Forms Library and Printable Forms sit in `forms`, and you *would*
link someone to a form — destinations.

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
