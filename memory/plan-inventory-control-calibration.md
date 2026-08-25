---
name: plan-inventory-control-calibration
description: Owner-driven calibration exercise (Notes 69) for a future "Inventory Control" intelligence feature -- NOT a coding task yet. The owner is manually pulling August-MTD reports (on hand, food over base, variance/stat, raw item, detail) and marking every issue they'd flag to a store, to teach the system what "good analysis" looks like on this data before any engineering starts. Waiting on the owner; do not build ahead of this.
sensitivity: open
metadata:
  node_type: memory
  type: plan
---

# Plan — Inventory Control calibration exercise (Notes 69)

## Owner's ask, in full (verbatim, Notes 69)

*"A test for Inventory Control (Then we model other areas after this scope)"*

- *"The process: I'm going to pull the following reports for August month to date: on hand, food
  over base, variance/stat, raw item, Detail."*
- *"I'm going to identify every issue that I can find that should be addressed by a store
  concerning their inventory and mark it concisely."*
- *"For the next phase: your choice as far as the control goes > either I can supply you or my
  findings upfront and source how I came to that logic. Or, I supply you with nothing and just
  simply see what you come up with."*
- *"The goal: to help you learn what it is I'm looking for and what needs to be analyzed and how
  it should be seen based on the data that is presented to you."*
- *"Next steps: we take this information and check against the logic. We're already using an
  adapt any new findings and make any corrections along the way."*
- *"Other areas this may be useful: cash controls, schedule review, operations performance,
  including service analytics, labor control."*

## Status: waiting on the owner — nothing to build yet

This is explicitly a **calibration exercise the owner is running themselves first**, not a feature
request with a scope to implement today. The owner pulls the five report types for August MTD,
manually marks every issue they'd flag, and only THEN decides how much of that reasoning to hand
over (their findings + the logic behind them, or nothing at all — genuinely open, they offered
both). **No dispatch should be written and no engineer should be spawned for this until the owner
comes back with either their findings or a go-ahead to attempt it blind.**

## The choice the owner left open, and how to handle it when it arrives

When the owner returns with their pass on the five reports, there are two paths depending on which
they chose:

1. **They supply findings + reasoning up front.** Treat this as ground truth to encode: build the
   analysis logic to match their stated reasoning, verify it reproduces their exact flagged issues
   on the same August-MTD data (the same discipline this session already uses — hand-verify against
   real data before trusting a script/panel's output), then generalize.
2. **They supply nothing and want to see what the system comes up with independently.** Build a
   first-pass analysis using whatever the existing Inventory Control / EOM / Count Cycle machinery
   already does (per CLAUDE.md, this repo already has `eom-inventory.js`, `count-cycle.js`,
   `weekly-cadence.js`, and the FOB/EOM panels — check what issue-flagging logic, if any, already
   exists there before building new logic from scratch), then compare the system's flagged issues
   against the owner's own list (once they eventually share it) to see where they diverge — that
   divergence IS the calibration signal, not a failure.

Either way, **the actual data sources for the five report types the owner named should already be
in Meridian** (on-hand → `qsr_onhand`, food over base → `qsr_fob`/`fobSnapshotByStore`,
variance/stat → likely `qsr_cash_sheet`'s stat-variance fields or FOB's `statVarianceAmt`, raw item
→ `qsr_raw_item_detail`, "Detail" → unclear which report this refers to, ask if it's not obvious
once this phase starts) — this should be a logic-and-presentation exercise on data Meridian already
has, not a new data-pull project. Confirm that assumption once real scoping starts rather than
assuming it now.

## The stated end goal — generalizes beyond Inventory Control

The owner explicitly named this as a **template exercise**: *"Other areas this may be useful: cash
controls, schedule review, operations performance, including service analytics, labor control."*
Once the Inventory Control calibration produces working analysis logic + a display pattern the
owner is happy with, the same method (manual calibration pass → encode the reasoning → verify
against real data → generalize) is the intended playbook for those other domains too. Don't treat
Inventory Control's eventual solution as a one-off — note the pattern (data sources used, how
issues get surfaced/displayed, what made it feel "right" to the owner) so it can be reused, and
flag in memory when Inventory Control's own dispatch actually starts.

## Next action

None, until the owner shares their findings or says to proceed blind. Do not preemptively build
an "Inventory Control issue detector" — that would defeat the calibration exercise's own purpose.
