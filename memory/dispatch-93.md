---
name: dispatch-93
description: LifeLenz's need_vlh baseline and the Controls/DAR need baseline disagree across all 27 stores, not just the two spot-checked in dispatch #90 -- district avg +43.7 h/day (LifeLenz) vs +2.9 h/day (Controls), 8 of 27 stores flip direction entirely, and where they agree on direction the ratio ranges 0.02x to 12.6x (not a fixed multiplier). vlh_guide config and OK/FL market both checked and ruled out as the explanation. This is an investigation, not a quick fix -- find the actual root cause before proposing one.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #93 — LifeLenz vs Controls need-model disagreement, full district measured

**Read first:** `memory/finding-overscheduling-is-chaos-not-cost.md` (the two-store spot check that
started this — Ada 2.7×, Seminole a full sign flip) and `memory/dispatch-90.md` item 2/3 (the SAGE
fix that made staffing-gap questions default to the Controls basis instead of LifeLenz, as an
interim mitigation — this dispatch is the deeper "why" that fix explicitly deferred).

**Status:** ready, no owner decision needed. This is real investigative work with an unknown
answer, not a scoped code fix — expect this to produce findings and possibly a follow-up dispatch,
not a merged PR that closes the question.

---

## The measurement — all 27 stores, 30 days, both bases

Reproduced live against Supabase (service-role read), 2026-07-20 → 2026-08-18, both tables
computed with their exact existing app aggregation logic (not a re-derivation — Controls basis
matches `aggregateLaborSummary`'s null-skipping average; LifeLenz basis matches
`aggregateLifelenzLabor`'s null-as-zero-across-all-rows average):

| store | Controls (h/day) | LifeLenz (h/day) | |
|---|---|---|---|
| Seminole-Milt Phillips | −59.7 | −0.9 | |
| Sulphur | −49.1 | −7.8 | |
| Bonifay | −33.9 | −8.4 | |
| Holdenville | −25.8 | **+7.1** | 🔴 flip |
| Ardmore-Cooper/12th | −21.2 | **+27.5** | 🔴 flip |
| Tishomingo-Main & Refuge | −16.7 | **+29.9** | 🔴 flip |
| Harrah | −16.3 | **+40.1** | 🔴 flip |
| Lindsay-Wal-Mart | −13.7 | **+18.9** | 🔴 flip |
| Pauls Valley-Ballard Rd | −5.1 | **+24.8** | 🔴 flip |
| Chipley-St Rd 77 | −4.4 | **+14.1** | 🔴 flip |
| OKC-I240/Sooner | −0.7 | **+19.5** | 🔴 flip |
| Tecumseh | +2.5 | +0.4 | |
| Mossy Head | +3.0 | +38.0 | |
| Freeport | +3.2 | +27.7 | |
| Marietta | +5.0 | +21.9 | |
| Defuniak Springs | +5.5 | +42.5 | |
| Cottondale | +9.1 | +61.1 | |
| Ponce de Leon-Hwy 81/I-10 | +11.4 | +45.0 | |
| Elgin | +13.9 | +44.1 | |
| Atoka-Mississippi | +16.0 | +83.8 | |
| Durant-US Hwy 70/22 | +21.1 | +88.8 | |
| Purcell | +23.8 | +48.0 | |
| Ardmore-Broadway | +27.1 | +64.1 | |
| Duncan-Hwy 81 | +31.9 | +93.8 | |
| Chickasha-So 4th | +42.4 | +88.9 | |
| Madill-Hwy 70 | +42.9 | +75.3 | |
| Ada-Country Club | +65.5 | +191.1 | |

**District:** Controls avg **+2.9 h/day** (11 under / 16 over — this matches
`finding-overscheduling-is-chaos-not-cost.md`'s "the district lands on plan by accident" finding
almost exactly). LifeLenz avg **+43.7 h/day** (3 under / 24 over — close to, though not exactly,
the earlier SAGE-observed "all 27 stores positive, +35.8 h/day"; the small discrepancy is
plausibly just a different window).

**8 of 27 stores flip direction entirely** between the two bases — not a rounding difference, a
sign disagreement (e.g. Ardmore-Cooper: Controls says −21.2 h/day under-staffed, LifeLenz says
+27.5 h/day over-staffed, same store, same window).

**Where the two bases agree on direction (19 stores), the ratio is not close to fixed:** ranges
from **0.02× to 12.60×**, mean 3.75×. Dispatch #90's Ada measurement (2.70×) sits well inside this
range but is not representative of it — a single-store ratio was never going to generalize, and it
doesn't. **This rules out "apply a correction factor" as a viable fix, full stop** — there is no
single number that would correct this relationship, because it isn't behaving like one relationship.

## Two candidate explanations already checked and ruled out

Don't re-check these — both were tested against the flip-direction stores specifically:

1. **`store_vlh_config.vlh_guide`** (per-store LifeLenz need-model setting, values `standard`/`hpg`
   in this data) — **not the answer**. All 8 flip stores use `standard`; so do 17 of the 19
   non-flip stores. No correlation.
2. **OK vs FL market** — **not the answer**. Flips are 7 of 20 OK stores and 1 of 7 FL stores,
   roughly proportional to each market's share of the district, not concentrated in one market.

## What hasn't been checked — start here

- **Store volume/size.** Is the disagreement bigger at high-volume stores, low-volume stores, or
  uncorrelated? Ada (district's largest ratio, 2.9×) and Ardmore-Broadway (district's
  highest-volume store per `STORE_KB`) are both high-volume and both diverge — worth checking
  systematically rather than anecdotally.
- **`store_vlh_config`'s other fields** (`aot`, `dt_type`, `in_store`, `kitchen`, `coffee`) —
  checked for `vlh_guide` only. A different field, or a *combination*, might correlate where the
  single field didn't.
- **Staleness.** `store_vlh_config.updated_at` was identical (`2026-07-30T20:02:15`) across the
  three rows sampled while scoping this dispatch — if that's true district-wide, the config was
  set once and never touched per-store since, which is consistent with (but does not prove) a
  stale labor guide as the root cause the owner has suspected since
  `finding-overscheduling-is-chaos-not-cost.md`'s open questions. Check whether `updated_at` truly
  never varies by store, and if so, look at what LifeLenz itself shows for when each store's guide
  was actually last edited (if that's visible anywhere — may need a LifeLenz UI/API check, not
  just this table).
- **Whether LifeLenz's `need_vlh` is a genuinely different quantity, not a miscalibrated version of
  the same one.** `need_vlh` could be modeling "hours needed per the labor guide's target
  ratios" while the Controls basis's `total_needed_hours` models something else entirely (e.g. an
  observed-demand-driven need). If so, "calibration" is the wrong frame — they may not be
  competing measurements of one truth, and the fix might be a *product* decision (which one should
  drive staffing recommendations, and are they even asking the same question) rather than a data
  bug to close.

## Verification bar

This dispatch does not have a fixed "done" state the way #90/#92 do — it's exploratory. A
reasonable stopping point: either (a) a concrete root-cause hypothesis survives a real test against
the flip-direction stores specifically (not just correlation across all 27 — the 8 flips are the
sharpest signal in this data and any real explanation should account for them), or (b) enough
candidates are ruled out that the honest conclusion is "these are different quantities, not a
calibration problem" — which is itself a useful, dispatch-worthy answer. Either way, append the
finding to `finding-overscheduling-is-chaos-not-cost.md` (its existing "LifeLenz vs Controls need
baseline" section is exactly where this belongs) rather than creating a new file.

## Do NOT

- **Do not compute or propose a correction factor.** The ratio instability (0.02×–12.60×) already
  rules this out; re-deriving that conclusion wastes a round.
- **Do not assume the Controls basis is "correct" and LifeLenz is "wrong."** Both are real
  measurements of something; which one (if either) should drive staffing decisions is a product
  question, not a data-quality question this dispatch can resolve alone.
- **Do not change what SAGE's tools report.** `query_labor_summary` already defaulting to the
  Controls basis for staffing-gap questions (dispatch #90/#647) stands regardless of what this
  investigation finds — that was a "give SAGE the more grounded number" fix, not contingent on
  fully explaining the disagreement.
- **Do not re-check `vlh_guide` or OK/FL market** — both ruled out above, with the specific
  per-store breakdown that ruled them out.
