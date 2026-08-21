---
name: dispatch-55
description: Two parts, two PRs. Part A establishes the owner's standing rule - kind is lifecycle, section is placement, and section must be truthful even when nothing renders it - then fixes the three forecasting panels whose section is currently wrong, so a future promotion lands them correctly. Test Kitchen STAYS; the earlier draft that emptied it is superseded. Part B is Job C Batch 1, the first six overlay-to-page conversions.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #55 — the forecasting section, then Job C Batch 1

**Ship as two PRs, Part A first.** A is small and closes an owner question that has been open since
Job B; B is the largest and riskiest job in the #54 sequence. Do not combine them.

---

## ⚠️ Read this before anything else: the list was never missing

Job B reported the forecasting-section membership as blocked on *"an owner list not available this
session."* **That list was committed in memory at the time**, at
`memory/notes-67-queue.md:34-36`, and its three parenthetical instructions were committed too:

| detail | where it already lives |
|---|---|
| the ten-panel membership | `notes-67-queue.md:34-36` |
| rename LifeLenz Bridge → *Recommended WFM Forecast Adjustments* | `notes-67-queue.md:82`, **and `dispatch-54.md:149`** |
| Forecast Audit "why is it greyed out?" | `notes-67-queue.md:77` and `:113` |
| Fcst Reference "make sure it is current and updated" | `notes-67-queue.md:75` and `:87` |

The rename was in **dispatch #54's own brief**, one file the job was working from. Nothing needed
to be asked. This is the `MEMORY.md` "🛑 BEFORE YOU THEORIZE" rule in its cheapest possible form:
**`grep -rn "<the thing>" memory/` before reporting something as unavailable.** A blocked item costs
a round trip and a day; the grep costs seconds. Treat "I don't have that" as a hypothesis to test
against `memory/`, exactly like any other hypothesis in this repo.

---

## Part A — the Forecasting and Labor Projections section

> **REVISED 2026-08-21 after the owner's decision. The earlier draft of this Part promoted all ten
> panels out of the Test Kitchen. Do NOT do that.** The owner's call: *"assign them a category, but
> leave them in the test kitchen. That way if I decide to promote them, they'll naturally fall into
> the right section."* That is a better design than the one it replaced, and it removes this Part's
> only risky change — Test Kitchen stays, betaMode behaviour is untouched, and nothing about today's
> nav moves.

### The standing rule this establishes (owner-stated, applies to every panel from now on)

**`kind:` is lifecycle. `section:` is placement. They are independent, and `section:` must be
truthful even when nothing renders it.** A panel's section says where it belongs; its kind says
whether it is showing yet. Promotion is then a one-field edit — flip `kind` and the panel lands in
the right place with no second decision to make and no chance to forget one.

This is how the data model already wants to behave: `section:` is simply inert while
`kind:'test-kitchen'`, so making it truthful costs nothing today and buys the whole promotion path.

**Where the registry already stands** (measured, so nobody re-derives it):

| | |
|---|---|
| panels | 82 |
| by kind | `nav` 44 · `optional` 13 · `hub-tab` 11 · `test-kitchen` 10 · `internal` 4 |
| panels with **no** `section:` | **0** |
| `section:` values not in `SECTIONS` | **0** |
| panels whose `section:` is **inert** (`test-kitchen`/`hub-tab`/`internal`) | **25** |
| `SECTIONS` entries with no members | `help` (ties to the deferred help-vs-admin split) |

So the rule is already satisfied *structurally*. What is missing is that some values are **wrong**,
and nothing catches that — which is the whole problem with the 25.

### ⚠️ Inert metadata rots. This rule needs a guard or it is worse than nothing.

A `section:` nothing renders is a field nothing checks, and this repo has now paid for that class
three times in a week: the stale `'Proj Workflow'` label Job A found, the 15 schema-drift columns
dispatch #52 found, and — right now, in this very registry — **`proj` claims
`section:'planning'`**, which is simply false and went unnoticed precisely because it is inert.

The owner's rule makes 25 panels depend on metadata being right at some future promotion. Ship the
guard in the same PR:

1. **Structural ratchet** — every panel has a `section:` that exists in `SECTIONS`. True today (0
   and 0 above); lock it so it stays true for panels added later.
2. **The promotion test — the one that actually serves the owner's purpose.** For each
   `kind:'test-kitchen'` panel, simulate the promotion (flip `kind` to `'nav'` in a copy of the
   registry) and assert it **renders under the header the owner named**. That proves "they'll
   naturally fall into the right section" instead of assuming it. A test asserting `section:` string
   equality would pass with the rendering path broken — this one renders, same standard as Job A's
   snapshot and Job B's section tests.

### The actual edits

**Three panels carry a wrong `section:`. Fix them — this is the substance of Part A:**

| panel | today | must become |
|---|---|---|
| `proj` (Projections) | **`planning`** | `forecasting` |
| `lfz-gap` (LifeLenz Gap) | `scheduling` | `forecasting` |
| `lifelenz-bridge` | `scheduling` | `forecasting` |

That takes the `forecasting` section from **7 members to the owner's full 10**
(`notes-67-queue.md:34-36`). `proj` is the one that matters most: left wrong, the day someone
promotes it, Projections silently lands in the Planning section the owner approved as exactly four
links (#516).

**Also:**
- **Section label:** `{ id:'forecasting', label:'Forecasting' }` →
  **`Forecasting and Labor Projections`** (`panel-registry.js:205`). Invisible today — all 10
  members are `test-kitchen`, so the section renders empty and its header is absent from the nav
  (confirmed against the current snapshot). Pure preparation, which is the point.
- **Rename** `lifelenz-bridge`'s label to **`Recommended WFM Forecast Adjustments`**
  (`notes-67-queue.md:82`, `dispatch-54.md:149`). Cosmetic, no logic. **This is the only
  user-visible change in Part A.** Check it at the collapsed and mobile breakpoints — roughly triple
  the current length, and this nav truncates rather than wraps.
- **Two owner-flagged bugs**, both "investigate and report; fix here only if the fix is small and
  obvious":
  - **Forecast Audit appears greyed out** (`notes-67-queue.md:77`, `:113`). It shares
    `perm:'analytics.forecasting'` with nine panels that are presumably not greyed out — start by
    diffing it against them rather than assuming a permissions cause. If the root cause isn't small,
    report it with a proposed patch; do not widen this PR.
  - **Fcst Reference "make sure it is current and updated"** (`notes-67-queue.md:75`, `:87`). A
    staleness concern, not a bug report. Say what it shows and whether that's current; propose,
    don't unilaterally rewrite reference content.

### Part A's verification bar — much tighter than the earlier draft

Because nothing is promoted, **the nav must be identical except for one renamed label.** Run the
membership diff that verified Job B (render `AppSidebar` from `main` and from the branch, diff the
**set** of reachable nav text across full-access / betaMode-on / betaMode-off / optional-panels-
visible):

- **expected lost:** `LifeLenz Bridge`
- **expected gained:** `Recommended WFM Forecast Adjustments`
- **nothing else, in either direction.**

That is a strong bar precisely because Part A is metadata work: any other movement means a
`section:` edit leaked into the rendered nav, which is the one thing this design promises it cannot
do. `⚗ TEST KITCHEN` must still be present, and the ten panels must still vanish under
`betaMode: true` exactly as they do today.

## Part B — Job C Batch 1 (overlay → page)

Owner-approved as stated. Scope is exactly dispatch #54's Job C, first batch — **six panels, none of
which have `route:true` today** (verified):

| id | label |
|---|---|
| `sched-hub` | Scheduling |
| `perf-reviews` | Performance Reviews |
| `fob-analysis` | Food Cost |
| `fob-eom` | End of Month |
| `eom-dashboard` | Inventory Control |
| `count-cycle` | Count Cycle |

Per `dispatch-54.md:98-105`, for each: set `route:true`, render as a **full view** instead of a
`ModalShell` child, and **keep the `modal===` deep-link entry working** — an existing bookmark or
in-app link to `modal=sched-hub` must still land on the panel.

**The complaint is presentation, not addressability.** `routing.js` already does
`pushState`/`searchParams` and is deliberately scoped to `route:true` panels — 4 of 57 today. This
batch takes it to 10. Do not rewrite `routing.js`; use it.

**Explicit non-goals for this batch** (from #54, do not drift into them):
- The panels that **stay** right-side modals: SAGE, Knowledge Base, About, Metric Lineage, Feature
  Requests, Local News. Three of those need a right-side modal built — **not this batch.**
- The universal minimize-and-close affordance — **its own job**, not this batch.

### Part B's verification bar

A conversion that renders the panel but breaks its deep link is the failure mode, and a test that
only checks `route:true` in the registry cannot see it — that is the #366 shape (engine right,
call site unwired) this repo has already paid for once.

Per converted panel, all six:
1. The panel renders as a full view, not inside `ModalShell`.
2. `modal=<id>` still opens it — exercise the **actual dispatch path**, not the registry flag.
3. The URL updates via `routing.js`, and a direct load of that URL lands on the panel.
4. Browser back leaves the panel and returns where it came from.

Then the same membership diff as Part A: converting a panel to a page must not remove it from the
sidebar. Six panels moving out of `ModalShell` is exactly when one quietly stops being reachable.

---

## Both parts

- `npm test` green; `npm run build` clean.
- Entry chunk before/after **both numbers in the commit body** (budget ≤ 2.8 MB / ≤ 850 KB gz;
  it is 1680 KB / 493.6 KB gz at v5.092). Part B converts panels to views — if any becomes a static
  import, the entry chunk moves. `lazyPanel()` by default.
- Version bump per PR (Part A and Part B are separate versions).
- **Commit every `memory/` file you touch in the same commit as the work.**
- Anything you cannot answer from code: **`grep -rn` in `memory/` before reporting it blocked.**
  See the top of this file for why.
