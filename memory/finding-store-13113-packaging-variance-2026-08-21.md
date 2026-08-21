---
name: finding-store-13113-packaging-variance-2026-08-21
description: The first operational finding the security build has produced. Store 0013113 flags TvA variance at 3.5x the estate rate, and the flags are 82% packaging against a 47% baseline - a store-specific packaging counting problem, chronic and improving, not loss. Includes what was ruled out and how, and the reason this should be a process conversation rather than an investigation.
metadata:
  node_type: memory
  type: finding
---

# Store 0013113 — a packaging counting problem, not a loss problem

**2026-08-21. The first thing this build has surfaced that points at something real on the ground**
rather than at its own measurement error. Everything below is measured; what was ruled out is
recorded alongside what was found, because the ruling-out is most of the value.

## What was found

**1. The flag rate is 3.5× the pack, and it is not a size effect.**

| store | subjects | flagged | rate |
|---|---:|---:|---:|
| **0013113** | 195 | **28** | **14.4%** |
| 0035064 | 206 | 18 | 8.7% |
| 0018213 | 193 | 13 | 6.7% |
| 0043701 | 208 | 13 | 6.3% |
| 0037566 | 198 | 11 | 5.6% |
| *pack* | ~200 | 7–8 | 3.4–4.1% |

Every store carries 193–208 subjects — a tight band — so there is no "bigger store" effect. The
raw count *is* the rate. This normalisation was run first precisely because it could have dissolved
the finding; it did not.

**2. The items are store-specific, not the estate-wide broken set.** Of the top 25 flagged items,
**16 flag at only this store** and the rest at 2–3. These are not the 30 WRINs with broken
`exp_usage` mapping (`project-inventory-data-hygiene-2026-08-20.md`) that flag everywhere.

**3. The flags are overwhelmingly PACKAGING.**

| | flagged | paper | food | paper % |
|---|---:|---:|---:|---:|
| all other stores | 151 | 71 | 80 | 47.0% |
| **store 0013113** | 28 | **23** | 5 | **82.1%** |

At the 47% estate baseline, 28 flags should yield ~13 paper items. This store has 23 — about **3.7
standard deviations** out. McFlurry cups, sundae cups, lids, fry cartons, wraps, pie boxes, cookie
totes, hot cups.

**4. It is chronic, not an event.**

```
2026-05   172 items   48.3%      2026-07   179 items   26.6%
2026-06   184 items   23.7%      2026-08   173 items   21.3%
```

No step change, so no manager swap / remodel / POS build to point at. Item count is stable, so
nothing structural changed. **It is also improving** — roughly halved since May.

## What was ruled out, and how

- **Store size / item count** — ruled out by the tight 193–208 band (finding 1).
- **The estate-wide broken-WRIN problem** — ruled out by `stores_flagging_item` (finding 2).
- **A datable event** — ruled out by the flat period trend (finding 4).
- **Skipped counts** — ruled out: store 0013113 does **not** appear in the estate's top 10 for
  uncounted items (`act_usage = 0`), where the leaders sit at 1.7–1.9%.
- **Theft** — ruled out by magnitude and by category. The top item is McFlurry cups at **2,245%**,
  meaning actual usage ran ~22× expected. Nobody removes McFlurry cups at 22× volume; there is no
  resale value and no way to move them. The same holds for lids and fry cartons.

## What it most likely is

**Packaging counting practice at one store.** The mechanism is ordinary and fits every measured
fact: packaging arrives in cases and sleeves, partial sleeves are the classic thing to miscount or
skip entirely, and a large share of the flagged items are `SMPLY DEL` / `MCCAFE REFRESH` transition
SKUs where outgoing and incoming packaging sit on the shelf together.

**This is a process conversation, not an investigation.** It surfaced from a panel called
"Security," and it is not a security finding. Saying so plainly matters: the cost of treating a
counting problem as a suspicion is paid by a real person at a real store.

## Still open, and would sharpen it

Whether the store's **median** variance is ordinary or also elevated. If ordinary, this is a normal
store with a narrow, concentrated packaging problem. If elevated, it is broader counting sloppiness
that shows up worst in paper. Those imply different conversations. The query is written and unrun
(estate-median comparison from `qsr_variance_stat`, latest period, `exp_usage > 10`).

## Why this one matters beyond itself

Every prior inventory result from this build described the build's own measurement error — bent
rulers, degenerate baselines, unreachable thresholds. **This is the first that survived every
attempt to explain it away as an artefact**, and it did so through five independent checks. The
peer-relative z-score conversion (dispatch #42) is what made it visible: under the old flat ratio,
this store was buried in 2,603 estate-wide flags dominated by mis-mapped items.
