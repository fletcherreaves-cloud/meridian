---
name: finding-security-scheme-coverage-2026-08-20
description: Coverage matrix of the ten loss schemes named in plan-security-loss-prevention.md against what the build actually detects. One is built. The most-cited scheme in the plan's own research (post-tender void skimming) is unbuilt and blocked on data plus a stubbed engine type. Two inventory schemes are buildable today with data already pulled, and one already has measured evidence pointing at it.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# What the security build actually detects vs. what the plan named

**Owner asked 2026-08-20:** *"Have we incorporated our internal findings around deposit lapping,
skimming, inventory padding and anything else I'm not recalling into our Security section."*
Answered by reading `plan-security-loss-prevention.md` §2.1–2.3 against the shipped rules, not from
memory.

**One of ten is built.** This is not a criticism of the build — Phase 1 deliberately shipped
generic rate-outlier rules to prove the machine end-to-end. But nobody should read "six rules live"
as "the schemes are covered," and the gap had never been written down in one place.

## The matrix

| Scheme | Plan § | Status | What blocks it |
|---|---|---|---|
| TvA variance / protein padding | 2.2 | ✅ **built** | INV-001 live; INV-002 inactive pending #45 |
| Refund/return abuse (ghost customer) | 2.1 | 🟡 partial | CASH-003 targets it; inactive, no threshold, awaiting `manual_ref_cnt` data |
| Deposit lapping | 2.1/2.3 | ⛔ **structurally blocked** | Invisible in QSRSoft by design — a deposit is "accounted for" when *entered*, so a held deposit produces zero over/short. Needs a bank feed. Owner exploring access 2026-08-19; **not dead, pending** |
| Post-tender void/refund skimming | 2.1 | ❌ unbuilt | `transaction_detail` **never pulled** (zero refs in `schema.sql`) + `sequence` LOGIC_TYPE still a stub |
| Threshold avoidance / structuring | 2.1 | ❌ unbuilt | Same `transaction_detail` gap; wants the `window-function` stub too |
| Sweethearting / unrecorded modifiers | 2.1 | ❌ unbuilt | Needs POS line items joined to KDS/production logs — neither pulled |
| Sales skimming (never rung at all) | 2.1 | ❌ unbuilt | No POS event exists to observe; inferential only (inventory depletion without matching revenue) |
| **Inventory padding / phantom gains** | 2.2 | ❌ unbuilt | **Nothing — buildable today** |
| **Waste-log padding / spoilage masking** | 2.2 | ❌ unbuilt | **Nothing — buildable today** |
| Cooking-oil / fryer integrity | 2.2 | ❌ unbuilt | Needs oil-filter logs |

## Three things this makes clear

**1. The plan's own top-cited scheme is unbuilt.** Post-tender void skimming is described as *"the
single most-cited method across all three sources"* — ring a cash sale, collect, void after the
customer leaves, drawer balances clean. It needs per-transaction timestamps to compare
`void_timestamp` against `tender_timestamp`. `transaction_detail` has **zero references** anywhere
in `schema.sql`. Plan line ~211 still lists settling that pull as an open question.

**2. CASH-001/002/004 are proxies, not scheme detectors.** They are rate-outlier checks on cash
over/short, POS over-rings, and promo/discount. Genuinely useful — CASH-002's 10.7% flag rate is
believable and actionable — but they detect *anomalous rates*, not *named mechanisms*. Conflating
the two overstates coverage.

**3. Two inventory schemes need no new data, and one already has evidence.**
- **Waste-log padding**: dispatch #45 Part C measured that only **4.2%** of unexplained INV-001
  flags have logged waste covering even half the usage variance, and only 44.1% have any waste at
  all. That gap *is* the scheme's premise. `qsr_waste` exists as a table; `raw_waste`/`comp_waste`
  are first-class columns on `qsr_variance_stat` and the batch job already loads them. The plan's
  own method — z-score waste-per-sales-dollar grouped by item, day-of-week and closing manager — is
  expressible in the engine as it stands today.
- **Phantom gains**: unexplained *positive* inventory adjustments, especially on items with recent
  negative variance. INV-001 currently discards the sign (`"abs": true`), so signed variance is
  already in the data and simply unused. Roughly a one-rule change.

These two are the cheapest real coverage the build can add, and they are the natural home for the
still-unbuilt `INV-003` rather than treating that as a separate idea.

## What this does NOT say

It does not say the build is behind. Phase 1's job was the machine — rules registry, baselines,
exposure floors, honest nulls, identity vault, panel — and that machine now works end-to-end with
measured calibration. Scheme coverage is the *next* phase's job, and it is now written down instead
of living in one plan document nobody re-reads.

It also does not say the blocked items are dead. Per CLAUDE.md's standing rule, a data gap is a work
item: `transaction_detail` is a pull nobody has attempted, not a wall. Deposit lapping is the one
genuine "cannot see it from here," and even that is pending a bank-access answer.
