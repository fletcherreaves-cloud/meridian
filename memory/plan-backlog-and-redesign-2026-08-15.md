---
name: plan-backlog-and-redesign-2026-08-15
description: THE PLAN — how the 60 open issues collapse into a working order, why the UI/UX redesign is the container for three of the workstreams rather than one of them, the two cheap measurements that gate it, and the owner-approved home-screen direction (fewer/deeper widgets, KPI grid demoted not deleted). Read with decisions-panel-inventory-2026-08-10 and #261.
metadata:
  type: plan
---

# Backlog plan + UI/UX redesign — 2026-08-15

Owner-approved this session. Written down because the synthesis existed only in a conversation,
which is the failure this repo has already paid for three times.

**Scope of what this was built from:** all 60 open issue *titles*, the bodies of #192 and #261,
`decisions-panel-inventory-2026-08-10.md`, `north-star-discovery-lens.md`, and
`notes-54-56-triage.md` §4. The other ~55 issue bodies were **not** read — a few may hold detail
that would move their position.

---

## 1. The backlog collapses into far fewer decisions than it has issues

60 open issues, roughly: 12 correctness bugs · 8 performance · 9 new data sources · 7
coaching/analysis · 5 theme-token · 2 auth · rest infrastructure.

**The structural fact: the UI/UX redesign is not one of seven workstreams. It is the container for
three of them.**

---

## 2. The redesign is three tracks the docs already prove are one

1. **Panel inventory** — `decisions-panel-inventory-2026-08-10.md`. All 97 panels decided:
   **9 retire · 8 merge · 55 keep · 9 locked**, under the standing harvest-then-remove rule. Salvage
   scoping already ran and confirmed the owner's hypothesis that the orphans were partially-executed
   ideas, not junk (and that `ForecastAudit` is not an orphan at all — it is live in production).
   Recorded sequence: salvage → deletions → merges → renames.
2. **UX coherence** (#192 P2) — the owner's own *"why don't we standardize all views to work and
   behave the same?"* **Gated on a panel scorecard**: every panel against a consistency checklist
   (scroll, header freezing, location selector, empty state, loading state, close affordance). The
   issue is explicit that migration must not begin before that inventory exists.
3. **AtAGlance dissolution** (#261, measured by #256) — 109 seconds of self-time across 45 startup
   renders. #261's load-bearing argument: *optimizing AtAGlance buys a faster monolith that then has
   to be dismantled anyway*, so **performance is not a workstream separate from the redesign —
   treating them separately means doing the work twice.**

**Consequence: most of the performance backlog is redesign work wearing a different label.** #256,
#191, #232, #248, #230, #234, #207 either live inside the tile split or clear its runway.

---

## 3. ⚠️ The redesign is blocked on two cheap measurements nobody has run

This is the most actionable finding in this document.

- **#261 Phase 0 — the instrumentation capture.** If the 9.47s render is DOM commit rather than JS
  compute, the answer is virtualization and the tile split alone will not fix it. **That capture
  decides the architecture**, and every phase below it assumes it comes back pointing at compute.
  That assumption is currently untested.
- **#192 P2 — the panel scorecard.** The inventory *is* the deliverable of step one.

Both are measurement/inventory tasks. Neither is done. The entire redesign sits behind them.

---

## 4. The token work is redesign groundwork, not polish

#203 states it directly: **adopt tokens before any palette change** — ~2,000 call sites currently
ignore them. So the chain **#276 → #286 (step 2) → #287 (the second red, 111 sites) → #296 step 2
(265 white-alpha sites)** is the visual foundation the redesign needs in place first.

This reframes work already in flight: **#296 step 2 is the first stone of the redesign**, not a
standalone bug fix.

---

## 5. Home-screen direction — DECIDED by the owner, 2026-08-15

Owner: *"Agreed, and we can work through what that needs to look like."*

**Decision: fewer, deeper, distinctive widgets — not a denser grid of the same KPIs.**

### The test, which follows from the owner's own north-star

`north-star-discovery-lens.md`: *QSRSoft = system of record. Meridian = system of insight &
decision. Don't re-report their data.*

**A 20-tile KPI grid is re-reporting their data** — sales, labor %, OEPE are all in QSRSoft. It is
the clearest instance of cloning the wheel in the app, and it is on the front door. So the test for
anything on the home screen is: **does this show something QSRSoft structurally cannot?**

### ⚠️ A contradiction between two owner statements, and its resolution

`notes-54-56-triage.md` §4 says *"this real estate is gold: maximize space and content."* #261 says
fewer and deeper. Read literally these conflict, and a future session will pick whichever it reads
first.

**Resolution: "real estate is gold" means every pixel earns its place, not that every pixel is
filled.** Gold is not stored by volume.

### The candidate widget set maps to the four white spaces

| White space (QSRSoft structurally can't) | Widget | Already exists as |
|---|---|---|
| Cross-silo fusion | "what moved together this week" | Signals Scanner correlations |
| Decision trees | *"FOB↑ + waste↑ + stat-var normal → portioning, not theft → coach the closer"* — not "Atoka is down" | EOM diagnosis check-registry, needs generalizing |
| Leading indicators | "what is about to happen," before the P&L says it | Visit Readiness, forecast accuracy, signal decay |
| **Learning loop** | *"you did X three weeks ago — did it work?"* | Coaching loop (#208), `saved_correlations` decay |

**Build the home screen around the learning loop.** QSRSoft has no memory — it cannot tell an
operator whether anything they did worked. Nothing else in the white space is as hard to copy, as
obviously valuable, or as immediately visible to a Field Business Partner.

Plus two that are already distinctive UI rather than new analysis: **SAGE** and the **Bullseye** (a
distribution gestalt the sorted-bar leaderboard cannot show — shipped in #282).

### Pinning — owner decisions, 2026-08-15, and the rule they imply

- **SAGE stays persistent in the top bar.** Confirmed.
- **The Bullseye is NOT pinned.** Owner: *"Bullseye does not have to be pinned if it is better left
  to scroll. On mobile it will likely cause an issue of not being able to see or scroll below it
  anyway."*

**The derived rule: exactly one pinned region — the top bar (greeting + SAGE). Every home-screen
widget scrolls, the Bullseye included.**

This is not a taste call; it is a measured bug generalised. **#225** is the same failure mode the
owner is predicting: six `flexShrink:0` blocks stacked above a single scroll region consumed the
phone viewport and made *the entire lower page unreachable*, with the Patch Heatmap the straw rather
than the cause. His own fix framing there was already this rule — *"everything below the top strip
that says good morning… just make everything else scroll up the screen"* — with only the greeting
header staying pinned.

**A distinctive widget that blocks the viewport is worth negative value on a phone**, and the owner
works from a phone. Any home-screen widget proposal must therefore state where it sits in the single
scroll region; "pin it" has to clear the #225 bar first.

> ⚠️ **#225 appears to be FIXED but is still open.** `at-a-glance.js` now sets `overflowY:'hidden'`
> on the outer container with a `#225:` comment recording the change, so the nested-scroller
> mechanism the issue named is gone. Confirm on a **real phone** — the issue is explicit that
> devtools emulation is not sufficient — then close it. Same staleness class as #279.

### The KPI grid is DEMOTED, not deleted

Stated explicitly so nobody executes this as "delete the data." Fewer-and-deeper moves the grid
**one level in**. The front door answers *what needs my attention* and *did my last move work*; the
grid answers *what are the numbers*, one click away. This is also #261's Phase 3 visibility gate —
below-fold tiles cost zero at startup.

### Three questions still open — needed before #261 Phase 1

1. **What is the owner's actual first move of the day?** Not which metric he looks at — what he
   *does* after looking. "Find which store needs me today" implies a different front door than
   "check we hit yesterday."
2. **Dynamic, user-customized, or hybrid?** All three were named as candidates. It changes the tile
   contract, so settle it before the Phase 1 PR, not after.
3. **How many widgets is "fewer"?** Working assumption 4–6 above the fold, unconfirmed.

---

## 6. The approved order

1. **Finish what is in flight** — #296 step 2 + #303, the #312 probe, the McValue read-only
   measurements, then #292 once the owner's multi-store capture lands.
2. **#192's P1 modal class fix + guard test.** Five reported symptoms, one defect in `ModalShell`.
   One PR retires all five and prevents the sixth. Best effort-to-value ratio on the board.
3. **The two redesign gates, in parallel** — #261 Phase 0 instrumentation and the #192 panel
   scorecard. Everything downstream is guesswork until they land.
4. **#192's P0 items** — the FOB Report that populates nothing, and Change Monitor → Snapshot
   (*"I just don't want the confusion or concern that if I click it it will mess something up"* — a
   shipped feature nobody dares press is worth negative value).
5. **The redesign proper**, in the recorded sequence: salvage-informed deletions → merges → renames
   → tile contract → per-tile subscriptions → visibility gating → customization → learned layout.
6. **Correctness bugs slotted opportunistically** — #299, #300, #302, #303, #285, #228, #231, #289.
   Small, independent, and several are wrong numbers on screen today.

**Independent of the redesign and safe to interleave:** auth (#312 → #311), new data sources (#291/
#292, #288, #277, #275, #290, #257, #278), and the coaching/analysis depth (#208 and its gate #237,
#210, #209, #202, #197).

---

Related: [[decisions-panel-inventory-2026-08-10]] · [[north-star-discovery-lens]] ·
[[notes-54-56-triage]] · [[vision-and-roadmap]] · [[pm-handoff-2026-08-15]] ·
[[feedback-performance-budget]]
