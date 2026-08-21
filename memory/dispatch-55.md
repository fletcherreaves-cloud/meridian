---
name: dispatch-55
description: Two parts, two PRs. Part A closes dispatch #54 Job B's one remaining open decision - the Forecasting and Labor Projections section - whose owner list was committed in memory the whole time. All ten of its panels are kind='test-kitchen', so promoting them empties the Test Kitchen entirely; that consequence is accepted, not a surprise to discover mid-build. Part B is Job C Batch 1, the first six overlay-to-page conversions.
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

### The owner's list, verbatim (`notes-67-queue.md:34-36`)

Projections · Proj vs Actuals · Forecast Models · DI Calibration · Forecast Accuracy · LifeLenz Gap ·
DI Compare · Fcst Reference · Forecast Audit · LifeLenz Bridge.

Listed alongside "Inventory and Food Cost (new section)" and "Analysis (new section)", both of which
Job B built as real nav sections — so this is a real nav section too, not a grouping inside something
else.

### The thing that makes this bigger than a `section:` edit — measured, not assumed

**All ten are `kind:'test-kitchen'`.** And there are **exactly ten `kind:'test-kitchen'` panels in
the registry** — the owner's list *is* the entire Test Kitchen.

```
grep -c "kind:'test-kitchen'" src/app/panel-registry.js   ->  10
```

So promoting them to a real section **empties ⚗ TEST KITCHEN completely and the header disappears**
(Job B's own `renderSection` returns null for an empty section — that behaviour is already tested).
Two consequences, both intended, neither to be discovered halfway through:

1. **The ⚗ TEST KITCHEN header stops existing in the UI.** That is the point — these graduated.
2. **Their betaMode behaviour inverts.** Today `kind:'test-kitchen'` means *hidden when betaMode is
   on*. As ordinary `kind:'nav'` they render always. Call this out explicitly in the changelog body
   so the owner meets it in the release notes rather than in the sidebar.

**Owner has approved the section. Ship it with those consequences.** Do not invent a compromise
(a "graduated but still beta-gated" third kind) to avoid them — that is scope the owner didn't ask
for, and it would leave the Test Kitchen half-alive.

### The trap in three of the ten

Three carry a `section:` that is **currently inert** because `kind:'test-kitchen'` short-circuits
section rendering. Flip `kind` without fixing `section` and they land somewhere wrong:

| panel | today's `section:` | must become |
|---|---|---|
| `proj` (Projections) | **`planning`** | `forecasting` |
| `lfz-gap` (LifeLenz Gap) | `scheduling` | `forecasting` |
| `lifelenz-bridge` | `scheduling` | `forecasting` |

`proj` is the dangerous one: left alone it drops **Projections into the Planning section the owner
just approved as exactly four links** (#516 — Planning hub, Calendar, Events & Tags, Event Impact).
Job B's `'the Planning section is exactly the owner's four links, hub first'` test catches this. If
that test goes red, the fix is `proj`'s `section:`, **not** the test's expectation.

### The rest of Part A

- **Section label:** `SECTIONS`' `{ id:'forecasting', label:'Forecasting' }` becomes
  **`Forecasting and Labor Projections`** (`panel-registry.js:205`).
- **Rename** `lifelenz-bridge`'s label to **`Recommended WFM Forecast Adjustments`** — cosmetic,
  no logic change (`notes-67-queue.md:82`, `dispatch-54.md:149`). Check the label's length against
  the sidebar's actual width at the collapsed and mobile breakpoints; it is roughly triple the
  current one and this nav truncates rather than wraps.
- **Two owner-flagged bugs, bundled here because they are about these exact panels.** Both are
  "investigate and report; fix in this PR only if the fix is small and obvious":
  - **Forecast Audit appears greyed out** (`notes-67-queue.md:77`, `:113`). Owner asks why. Reads as
    a gating bug. Note it shares `perm:'analytics.forecasting'` with nine others that presumably
    are *not* greyed out — so start by diffing it against them rather than assuming a permissions
    cause. If the root cause is not small, report it with a proposed patch; do not widen this PR.
  - **Fcst Reference "make sure it is current and updated"** (`notes-67-queue.md:75`, `:87`). This
    is a staleness concern, not a bug report. Say what it currently shows and whether that is
    current; propose, don't unilaterally rewrite reference content.

### Part A's verification bar

The nav changes visibly, so the snapshot re-baselines again — and a re-baselined snapshot proves
nothing on its own. **The membership diff is the check that matters**, the same one that verified
Job B: render `AppSidebar` from `main` and from the branch, and diff the **set** of reachable nav
text across full-access / betaMode-on / betaMode-off / optional-panels-visible.

Expected, and nothing else:
- **lost:** `⚗ TEST KITCHEN`, `Forecasting`
- **gained:** `Forecasting and Labor Projections`, `Recommended WFM Forecast Adjustments`
- **lost:** `LifeLenz Bridge` (renamed — must reappear under its new label, not vanish)
- **no panel label lost.** Any other disappearance is a regression, not a regroup.

Also: the ten panels currently vanish under `betaMode: true` and must **stop** doing so. Assert that
directly — it is the behaviour change, so it needs its own assertion, not just a snapshot that
happens to cover it.

---

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
