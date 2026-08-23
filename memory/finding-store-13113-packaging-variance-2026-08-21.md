---
name: finding-store-13113-packaging-variance-2026-08-21
description: The first operational finding the security build has produced. Store 0013113 flags TvA variance at 3.5x the estate rate, and the flags are 82% packaging against a 47% baseline - a store-specific packaging counting problem, chronic and improving, not loss. Includes what was ruled out and how, and the reason this should be a process conversation rather than an investigation.
sensitivity: open
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

## ✅ ANSWERED same day — it is BOTH, and a fourth measurement reframes the mechanism

The estate-median comparison ran (latest period, `exp_usage > 10`):

| | items | uncounted | waste logged | median var % |
|---|---:|---:|---:|---:|
| **store 0013113** | 173 | **0** | **$3,173** | **21.3%** |
| estate median | 169 | 0 | $5,497 | 15.5% |

**The median is elevated too — 1.4× the estate.** So this is not "a normal store with one narrow
problem." It is both moderately elevated across the board *and* heavily concentrated in packaging.

**Counting completeness is firmly ruled out:** `uncounted = 0`, matching the estate median exactly.
They are counting everything.

**New, and it reframes the mechanism: this store logs 42% less waste than the median store.**
Elevated variance + complete counts + low waste logging is the signature of **product wasted but
never logged** — unlogged waste lands in variance by definition. Packaging waste is the classic
thing not to log: a crushed sleeve of cups, a dropped stack of cartons, damaged transition stock.
Too trivial-feeling to write up, and cheap enough that nobody bothers.

That single story explains all four measurements at once, which no earlier hypothesis did.

### ❌ REFUTED same day — the unlogged-waste mechanism is wrong

The confound-removing query ran (latest period, per-store waste split by class):

| | paper waste | food waste |
|---|---:|---:|
| **store 0013113** | **530** | **2,654** |
| other stores (avg, n=26) | 486 | 4,876 |

**Paper waste logging is NORMAL — slightly ABOVE average (+9%).** The 42% total gap is **entirely
food** (−46%). The store logs packaging waste fine, and its variance problem is packaging. The two
do not connect. **The unlogged-waste mechanism proposed above is dead.**

This was flagged in advance as a live outcome, which is why the 42% was never cited as a finding.

**What survives, untouched:** the whole finding above — store-specific items, 82% paper vs 47%,
3.5× flag rate, chronic, complete counts, not theft.

**What is now unexplained again:** the mechanism. Note the distinction that matters — *waste
logging* and *counting accuracy* are different activities, and this only rules out the former. A
store can log every crushed sleeve it discards and still miscount the sleeves on its shelf. So
**"packaging counting practice" remains the leading explanation with no specific mechanism behind
it.** Remaining candidates, none tested: partial-sleeve counting, receiving/delivery posting on
packaging, transition-SKU handling where old and new stock coexist.

**A separate new thread:** why is this store's FOOD waste logging 46% below the estate average when
food is *not* where its flags are (5 of 28)? Either genuine efficiency, or food under-logging
contributing to the elevated 21.3% median. **Do not conflate this with the paper problem** — they
are two findings, and only one of them has evidence behind it.

**Superseded note, kept for the reasoning trail:** `waste_logged` is a **dollar** sum, and this store's problem is concentrated in **paper**,
which is cheap. A store whose waste is mostly packaging shows low waste dollars even if it logs
every cup. It is also not normalised to sales volume. Two queries remove both confounds and are
written but unrun: waste per $1,000 of sales (`qsr_daily_activity.net_sales`), and the paper-vs-food
split of the waste gap itself. **Do not cite the 42% figure as a finding until those run.**

If waste-per-$1k is normal and only the paper share is low → **under-logged packaging waste**, and
that is the answer. If waste-per-$1k is low across both classes → a broader logging-discipline gap.
Either way it stays a process conversation; which process changes.

**This is also precisely what `INV-003` (variance unmatched by logged waste) is built to detect** —
so the question may answer itself once that rule is activated, without anyone running SQL.

## Why this one matters beyond itself

Every prior inventory result from this build described the build's own measurement error — bent
rulers, degenerate baselines, unreachable thresholds. **This is the first that survived every
attempt to explain it away as an artefact**, and it did so through five independent checks. The
peer-relative z-score conversion (dispatch #42) is what made it visible: under the old flat ratio,
this store was buried in 2,603 estate-wide flags dominated by mis-mapped items.
