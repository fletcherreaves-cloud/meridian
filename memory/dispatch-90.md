---
name: dispatch-90
description: SAGE's OT figures are a 60-day window halved, which mis-ranks the stores -- Madill is the district's top OT store and SAGE ranked it 5th at 59% of its real value. Pull the real window. Also records the labor-% basis question as SETTLED (crew/punched, per #327) so it stops being re-litigated, and one store SAGE's under-staffed list missed.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #90 — SAGE's OT window, and the labor-% basis is SETTLED

**Reads first:** `memory/handoff-2026-08-24-key-rotation.md`. Ground truth for everything below is
the owner's Controls export **2026-07-25 → 2026-08-23** (27 stores, exactly the window SAGE was
asked about), compared against a live SAGE answer run **after** #625/#626 were deployed.

**Status:** ready, no owner decision. Small.

---

## 🟢 Item 0 — NOT a bug. Recorded so it is never re-litigated.

**SAGE's labor % is crew/punched, excluding salaried managers. That is CORRECT and matches the
project.** Owner-confirmed 2026-08-24: *"Crew labor should come from punched labor, as is
everywhere else. This eliminates salaried manager."*

Measured against the export:

- `Crew Labor %` and `Punched Labor %` are **identical to ten decimal places on all 27 stores** —
  one column of truth, two names.
- SAGE's per-store figures track it to **within ±0.3pp** on most stores (the larger gaps are
  window differences: SAGE averaged 60 days, the export is 30).
- The export's third column, `Actual Labor %`, **loads salaried-manager dollars in** and differs on
  **6 of 27** stores — all Florida (Mossy Head +4.03pp, Bonifay +3.63, Chipley +2.72, Freeport
  +2.71, Cottondale +1.63, Defuniak +1.49).

⚠️ **This was already decided, and the decision is documented in code.** `supabase.js`'s `#327`
comment: *"laborDollar aliases `crew_labor_dollars`, NOT `gross_dollars` — gross_dollars includes
salaried_manager_dollars (verified store 6178, where they differ by exactly that column: gross
2978.60 vs crew 2661.50)."*

🔴 **The PM raised this as "SAGE's ranking is materially wrong" and was wrong to.** The comparison
was run against `Actual Labor %` — the one column that is *not* the project's basis — which made a
correct, deliberate, already-documented convention look like a defect, and briefly reordered the
Tier-1 list around it. **Do not "fix" SAGE to report total labor.** If a future session finds the
FL stores' salaried-manager load and thinks it has found something, it has found `#327`.

**The one true consequence, stated once and not as a defect:** crew-only genuinely excludes 1.5–4.0
points of real cost at those six stores. That is a known, chosen property of the metric, not a gap
to close here.

## Item 1 — the real bug: OT is a 60-day figure halved

SAGE reports OT as *"60-day figure halved."* That is not the 30-day window it was asked for, and it
**mis-ranks the stores** — the thing an OT list exists to do.

| store | SAGE | actual 30d | error |
|---|---|---|---|
| **Madill (13113)** | $1,706 (its #5) | **$2,711** | **−37%, and it is actually #1** |
| Ardmore-Cooper (24471) | $3,244 (its #1) | $2,418 | +34%, actually #2 |
| Mossy Head (37566) | $1,874 | $2,243 | −16% |
| Sulphur (32525) | $1,891 | $1,985 | −5% |
| Marietta (33109) | **not listed** | $1,706 | missed entirely |
| Chickasha (5183) | **not listed** | $1,616 | missed entirely |

District total is fine — SAGE $24,752 vs actual **$23,590**, 4.7% out. **The total is right and the
ranking is wrong**, which is the worst combination: it looks credible and sends you to the wrong
store. SAGE's Tier-1 action was an OT audit at Ardmore-Cooper; the real top store is Madill.

**Fix:** query OT over the **requested** window rather than scaling a fixed 60-day pull. Halving
assumes OT is uniform across the two months and it plainly is not.

**Verification bar:** a 30-day OT question must return **Madill first** against this export, and
must include Marietta and Chickasha. Assert on the **ordering**, not just the totals — a total-only
test passes with the ranking still broken, which is exactly today's failure.

## Item 2 — one store missing from the under-staffed list

SAGE named Bonifay and Sulphur as the only under-staffed stores. Against the export's
`Act vs Need`, **Seminole (10915) is the most under-staffed in the district at −51.4 h/day** and
did not appear at all.

| | store | h/day |
|---|---|---|
| under | **Seminole (10915)** | **−51.4** ⬅ missed |
| under | Sulphur (32525) | −49.5 |
| under | Bonifay (10034) | −30.2 |
| over | Ada (6972) | +57.2 |
| over | Chickasha (5183) | +55.6 |

Find out why it was dropped before changing ranking logic — it may be an RBAC/loc-filter artifact
rather than a threshold, and those have different fixes.

## Item 3 — quantify the LifeLenz `need_vlh` inflation while the ground truth is in hand

SAGE was **right** to refuse to dollarize the LifeLenz gap, and the export now measures how far off
that baseline is: SAGE quoted Ada at **+151.9 h/day** from LifeLenz; the Controls `Act vs Need` for
the same store, same window, is **+57.2 h/day** — LifeLenz's need baseline runs roughly **2.7×**
the Controls one.

Record that ratio in `finding-overscheduling-is-chaos-not-cost.md`. It converts *"the gap is
uncalibrated"* from a qualitative warning into a measured one, and it is the first hard number
anyone has put on it. **Do not use 2.7 as a correction factor** — one window, one comparison, and
the two baselines may not even be measuring the same thing.

## Do NOT

- Do **not** change SAGE's labor % to include salaried managers. See item 0 and `#327`.
- Do **not** ship item 1 on a total-only test. The total is already right; the ordering is the bug.
- Do **not** apply 2.7 as a LifeLenz correction factor.
- Do **not** widen into the forecast-bias question (SAGE's "-6.0% on 27 of 27"). That needs a real
  30-day Forecast-Accuracy run first and is the owner's to verify.
