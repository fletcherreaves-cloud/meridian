---
name: benchmark-daily-readiness
description: The daily 0-100 readiness benchmark — two scores, each anchored to named checkable facts. Update at the end of every working session. Read before quoting any readiness number.
metadata:
  type: benchmark
---

# Daily readiness benchmark

Owner request, 2026-08-11: *"lets remember this and it can become kind of a daily benchmark."*

**Two scores, not one** — a single number hides the real answer, because Meridian is already a
good tool for one user and a long way from being deployable to a second.

---

## The rules that keep this honest

A subjective 0-100 is exactly the kind of number this repo spends its time arguing against
(`feedback-measure-dont-reason.md`). It feels like information and isn't. Left unanchored it
drifts upward, because every session feels productive.

1. **Every score cites the anchors.** If the number moves, name **which anchor moved**. "Felt
   like a good day" is not a reason.
2. **It can go down.** A score that only rises is not a measurement. Regressions, newly
   discovered breakage, and widening plan-to-shipped gaps all push it down.
3. **Anchors are facts, not judgements** — seconds, kilobytes, counts. The score is a
   judgement; the anchors are not.
4. **Shipped beats designed.** Design docs and filed issues do **not** raise the score. They
   raise it when they merge and work.
5. **Append, never overwrite.** The trend is the point.
6. **Separate REGRESSION from DISCOVERY.** A score can fall because something broke
   (regression) or because we found a flaw that was always there (discovery). Only the first
   is bad news — the second usually means a good day's investigating. **Say which.** Without
   this the benchmark punishes looking, which is exactly backwards.

---

## Anchors — check these before scoring

### Tool-for-the-owner
| Anchor | How to check |
|---|---|
| Startup wall clock (T3) | `?clicktrace=1` in production |
| Entry chunk gzip headroom | `npm run build` (gated since #207) |
| Open P0 bugs | GitHub, P0-labelled / named in triage issues |
| Surfaces displaying something **false** | known-wrong list below |
| Built-but-switched-off capabilities found | running count; each one means more exist |

### Deployable-to-a-second-operator
| Anchor | How to check |
|---|---|
| Multi-tenant exercised? | has any second tenant ever loaded it |
| RBAC exercised beyond one user? | has any non-owner role been used live |
| Onboarding path exists? | could a new operator start without the owner |
| Correctness dependent on owner's tacit knowledge? | how often does he catch what the app doesn't |
| Manual-primary streams remaining | `MANUAL_ONLY_METRICS` + panels still upload-fed |

---

## 2026-08-11 — baseline

**Tool for the owner: 74**
**Deployable to a second operator: 55**

**Anchors:**
- Startup T3 **~63.5s** (render improved 167s → 51s, 47 → 27 commits; **wall clock barely moved**)
- Entry chunk **818.69 KB gzip, 31.31 KB headroom**, now enforced by a build gate (#207)
- Tests **1253**, CI runs tests on PRs, sync-failure watcher live, bundle gate live
- **4 built-but-switched-off capabilities found in one day** — Anomaly Scan (`kind:'optional'`),
  the retail Event Impact pipeline (never scheduled), the ineffective lazy imports, the
  Inventory panel (`kind:'optional'`, manual-fed). Four in a day means there are more.
- Known-wrong surfaces: **yearly targets** (Q1 uploads never happened, months contribute 0),
  **3 of 9 event-impact categories** still unwired (event/weather/promo)
- Multi-tenant: **never exercised**. RBAC: **exists, unexercised**. Onboarding path: **none**.
- Owner caught **two** of my errors today (#174's premise, the "0 store(s)" inference) — real
  correctness still leans on him

**Why 74 and not higher:** startup is the tax on every session and it hasn't moved in wall
clock. A feature set you cannot enumerate (see the four switched-off finds) is not a feature
set you can rely on.

**Why 55 for deployment:** multi-tenant untested, and a second operator has none of the
owner's instinct for which panels currently lie.

**The flag worth carrying forward:** today's **plan-to-shipped ratio got worse**. Four design
docs and ~10 issues produced; four PRs merged, mostly *defensive* — corrections, guards, gates.
That is the right work and it raises "will it stay good" far more than "how good is it." **The
floor came up; the ceiling did not move.** Push 3 is what moves the ceiling and it has not
started.

**Single number that matters most right now:** the **63-second startup** — everything else is
downstream of wanting to open the thing.

---

## Log

| Date | Tool | Deploy | What moved |
|---|---|---|---|
| 2026-08-10 | 76 | — | prior read, single score, pre-anchors |
| 2026-08-11 | 74 | 55 | **−2, DISCOVERY not regression** — see below |

### 2026-08-11 note on the −2

Six PRs merged and three real bugs root-caused, which pushed **up**. It still landed 2 lower
than the 2026-08-10 read of 76, and the reason matters:

- **Four built-but-switched-off capabilities found** — all four were equally true on 08-10,
  nobody had looked.
- **Startup confirmed still ~63.5s** — the render work (167s → 51s) had implied more wall-clock
  improvement than actually materialised. Measured, not assumed, for the first time.

So the product improved and the *estimate* got more honest at the same time, and the second
outweighed the first. **The 76 was partly optimism about unchecked things.** Expect more of
this while discovery outpaces shipping; it is not a bad sign, but it does mean early
movements in this log say more about how hard we are looking than about the product.
