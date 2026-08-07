---
name: notes-58-queue
description: Notes 58 field queue (2026-08-07) — Inventory Control weekly-count rules, per-item variance charts, Items Recounted tile regression, and the owner's "absolute must" swing-detection alarm.
metadata:
  type: project
---

# Notes 58 — field queue (2026-08-07)

Owner's field notes. Items 1–3 are Inventory Control; item 4 is a new capability the
owner flagged as **an absolute must**.

---

## 1. Inventory Control — weekly count completeness rules

Business rules the owner stated, which the panel does not currently encode:

- **Every weekly count requires a full Food AND Condiment count.** So we should see
  **2 classes every week**, per store. Anything less is an incomplete week.
- **Paper counts are mandatory** on the **mid-month count**. That count **floats** —
  its day-of-week depends on when the individual store counts — so the check cannot be
  a fixed calendar date; it has to be "the mid-month count, whenever that store took it."
- **If a store misses the mid-month paper count, flag it** so a reminder goes out to
  complete it ASAP, or on the next weekly count **at the latest**.

Implication: completeness is a per-store, per-class, per-count-cycle assertion, not a
date check. Needs the count-class dimension (Food / Condiment / Paper) surfaced.

## 2. The new chart — loopback window is wrong

- Owner **likes the chart and does not want it removed**, though it isn't what they
  originally envisioned.
- **Fix:** the loopback must go back to the **last actual physical (submitted) count**,
  not a fixed window.
- **What the owner was actually after:** that same chart style **per counted item**, to
  see variance by item and detect when a specific item went wrong. That's the real
  feature request — the current chart is the aggregate version of it.

## 3. Items Recounted tile — regression

- **Went blank**, reporting "no ledger detail." Needs diagnosis.
- While fixing, the tile should **also show weekly and daily count stats**. Owner is
  open on the design here and invited a proposal.

---

## 4. ⚠️ ABSOLUTE MUST — one-directional swing alarm

Owner's words: *"any metric, especially sales or guest counts, taking a massive
one-directional swing — especially if the wrong way — needs to light up the app. There
needs to be no reason it is not surfaced and made aware."*

Requirements as stated:

1. **Detect** a large one-directional swing in any metric, sales and guest counts first.
   The owner explicitly asked for help choosing **the factor** (the threshold / z-score /
   sustained-direction rule). This is the open design question, not the alarm plumbing.
2. **Impossible to miss.** Surface it prominently — the owner suggested requiring a
   **click acknowledgement** so it cannot be scrolled past.
3. **Preemptively compile a report** when it fires: pull other metrics and their trends
   to establish whether the cause is **operational or otherwise**.
4. **Use AI to scour** for anything missed that could explain a sudden swing.

**Live case to validate against: store 10422 = Atoka-Mississippi** — major hit to sales and guest counts over
the last few weeks, and the app did not make that unmissable.

⚠️ **Correction to the v4.861 commit body:** it renders the example alarm as
"Durant — sales down -20.8%". That store name was a placeholder passed into a console
preview and is WRONG. **10422 is Atoka-Mississippi**; Durant is 5985. All the numbers
(-20.8% sales, -22.4% guests, $38,711 vs LY, and the whole threshold calibration) are
correct and belong to 10422 — only the label was wrong. The committed tests key on the
loc number, not the name, so no code is affected.

### Why this connects to the notifications work

This is the strongest argument yet for the Notifications consolidation in the UI/UX
Phase 2 work (see [[notes-54-56-triage]] and the panel-registry commit). A swing alarm
has nowhere good to live today because "attention" is split across three panels:
`WhatNeedsAttentionPanel`, `AttentionPanel`, and `DistrictPriorityBrief`.

Note the existing engine is a partial fit and a good starting point:
`src/engine/attention-feed.js` already has severity levels, dollar-at-stake ranking, and
per-item `nav` routing — but **no swing/anomaly detector** and no acknowledgement state.
It also has a fully implemented, tested `slowDT` detector that is never wired up
(`buildAttentionFeed` is called without `dtRows`) — free capability already paid for.

Acknowledgement state needs somewhere to persist; `user_settings.notif_state`
(`{seenIds, dismissedIds}`) was the shape proposed in the UI/UX plan's Phase 5.
