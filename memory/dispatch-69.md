# Dispatch #69 — Visit Readiness overstates its own certainty, in both directions

**Status:** shipped. Three owner-raised items from `memory/notes-visit-readiness-backlog-2026-08-22.md`,
unified under one theme the notes file itself named: the panel's language makes stronger claims
than the underlying data or math supports — once by inflating a waste proxy into a food-safety
verdict, once by inflating a 27-visit sample into a "weak agreement" conclusion.

---

## 1. "Food Safety" → "Waste & variance" (correcting a mislabel, not just renaming)

`memory/finding-food-safety-2026-what-is-actually-measured.md` settled this: the `FOODSAFETY`
group is exactly `statVar` (inventory variance) and `raw` (raw waste %). Against the real EcoSure
FS-A through FS10 checklist (temperatures, pests, handwashing, shelf life, checklist competence)
— **zero overlap.** The flag was never imprecise, it was measuring a different subject and calling
it Food Safety.

Renamed throughout the engine and panel (`src/engine/visit-readiness.js`,
`src/views/visit-readiness.js`): `FS`/`Food Safety` → `W&V`/`Waste & variance` in chip labels,
the district stat tile, the print report, the panel's intro copy, and every generated sentence.
`READINESS_GAPS`'s genuine `Food Safety criticals` entry (the real, unmodelled EcoSure gap) is
untouched — that one was always correctly named.

**The functional bug, not just the label:** `buildVerdict()` used to check `fsFlag === 'elevated'`
**first**, returning the waste/variance line as the headline coaching action regardless of the
store's actual readiness band — even for a store whose band is `'ready'` (the two computations are
independent by design; `fsFlag` is deliberately kept out of the composite, so nothing stops them
disagreeing). On the live panel this displaced the real blocker on 10/27 stores, and the
Ardmore-Broadway counterexample proved it backwards: `FS elevated` while its real EcoSure audit
scored 86/100 and met target. Fixed: the band/topDrivers verdict always leads; an elevated flag is
appended as a secondary note (`"...Also check waste & variance — elevated (score N)."`), never the
headline.

## 2. Model Check caption — report progress toward enough data, not a verdict

At n=27, `notes-visit-readiness-backlog-2026-08-22.md` computed the actual 95% CI: direction match
`[34.0%, 69.3%]` (Wilson), rank corr `[−0.16, 0.56]`. That interval can't distinguish "the model is
useless" from "the model is good" — it's evidence of a small sample, not a weak model. The old
caption ("Weak agreement so far — treat as directional only") asserted a conclusion the data can't
support — the same defect as item 1, in the opposite direction.

`calibrateReadiness()` (`src/engine/visit-readiness.js`) now returns `pairsNeeded` and `etaLabel`.
`CALIBRATION_PAIRS_FOR_POWER = 46` is the n needed for 80% power to detect rank corr ≥ 0.4 (a
Fisher z-transform power calculation), taken directly from the backlog file's own table — not
invented here. `CALIBRATION_PAIRS_PER_YEAR = 81` (27 stores × 3 CFV visits/yr) is settled in
`memory/finding-cfv-2026-visit-rules.md`, which also closed the open 2-vs-3 cadence question the
backlog had flagged as unconfirmed.

Below the threshold, the panel now shows `"{n} of ~46 visits needed to tell — next check ~{month}"`
instead of a strength verdict; at or above it, the existing Strong/Moderate/Weak ladder still
applies (now backed by enough power to mean something). The rank-corr and direction-match NUMBERS
are unchanged and still shown — only the caption's *claim* changed, per CLAUDE.md's "say the number
AND the decision" rule: the number stays, the decision text gets honest.

Deliberately **not done** in this dispatch (out of scope per the backlog's own framing):
re-baselining calibration against dispatch #64's auto-first migration, restricting Speed metrics to
the 11am–5pm CFV window, backfilling last year's visits, or fitting the composite weights. All four
are real next steps the backlog and `finding-cfv-2026-visit-rules.md` already name; none is a
one-line caption fix.

## 3. Report-detail toggle → split dropdown on the Report button

`detail` (`full`/`summary`) was read in exactly one place — `doPrint()` — but sat in the filter row
styled identically to the All/OK/FL scope pills, which DO change the on-screen view. It read as a
broken view toggle ("Summary button doesn't seem to do anything").

Removed from the filter row; the header's `🖨 Report` button is now `ReportButton`, a small
self-contained split dropdown (`🖨 Report ▾` → `Full audit` / `Summary`), each option printing
immediately with that detail level. `doPrint` now takes an explicit `detail` argument rather than
reading React state from closure, since `setDetail` is async and a same-click closure read could
still see the previous value.

## Verification

- `src/__tests__/visit-readiness.test.js`: updated the one test that encoded the OLD (buggy)
  priority ("an elevated food-safety flag takes priority...") to assert the corrected behavior —
  band-driven verdict leads, waste & variance is appended, never prepended — plus a new test
  proving a `'ready'`-band store with an elevated flag still gets "no action needed" as its
  headline. Added a `calibrateReadiness progress fields` suite covering `pairsNeeded`/`etaLabel`
  math (below threshold, exactly-at threshold, well past threshold, and that the ETA lengthens for
  smaller n).
- `src/__tests__/visit-readiness-caption.test.js` (new): renders the actual `VisitReadinessPanel`
  consumer with a 27-store fixture (all real `DEFAULT_TARGETS` locs, varied per-store margins so
  rank corr is computable — a fixed margin saturates every store's score near the ceiling and
  produces a degenerate zero-variance `r=null`, which would silently mask the branch under test).
  Asserts the panel shows `"27 of ~46 visits needed to tell — next check ~<month>"` and does NOT
  show "Weak/Strong/Moderate agreement" — per the standing "would this verification still pass if
  reverted" rule, this is the only way to prove the panel actually shows the fix, not just that the
  engine's fields compute correctly. **Demonstrated revert-sensitive**: `git stash` the engine/view
  changes and re-run — fails on `CALIBRATION_PAIRS_FOR_POWER` being undefined (the whole caption
  branch imports it), restored.
- 2036/2036 tests (7 new: 2 verdict-priority + 4 calibration-progress + 1 render), build clean,
  entry chunk unchanged (`visit-readiness.js` is lazy-loaded).

## Out of scope

- `crewHrs`-style manual-only gaps — not raised in this dispatch.
- Re-baselining the 0.23/52% figures against #64's inputs, the daypart/channel-window fix, and the
  historical backfill — all named next steps in `finding-cfv-2026-visit-rules.md`, each its own
  dispatch-sized effort, not folded in here.
- Fitting `READINESS_WEIGHTS` — explicitly deferred until enough paired data exists (this dispatch
  is what makes "enough" honestly visible).
- **New, flagged after this dispatch started (worth doing next, not folded in here): "Part D0"** —
  split the existing Model Check pairs by `reportType` (CFV vs RGR) **before** any daypart/channel
  work. The pairs behind the 0.23/52% figures are likely a mixture of two different instruments
  with different pass rates; pooling them can depress ρ on its own, independent of the daypart
  mismatch `finding-cfv-2026-visit-rules.md` already names. This changes what "n" and "pairsNeeded"
  mean (per-type n, not pooled n) and needs its own design pass — not a drop-in to this dispatch's
  `calibrateReadiness()` signature.

---

# 🔴 FOLLOW-UP added after this shipped (2026-08-22, same day)

Two items that post-date the work above. **Neither is a criticism of what shipped** — both rest on
a measurement taken after it landed.

## 1. `CALIBRATION_PAIRS_FOR_POWER = 46` is powering for an effect that cannot exist

Section 2 ships the caption **"{n} of ~46 visits needed to tell — next check ~{month}"**, with 46
taken from the backlog's power table (80% power to detect rank corr **≥ 0.4**). That was the right
number given what was known, and it is a large improvement on *"Weak agreement so far"*.

**But ρ ≥ 0.4 is above the achievable ceiling.**
`memory/finding-cfv-predictability-ceiling-2026-08-22.md` measured, on **217 CFV visits (2023-2026)
validated against Propel's own published card**:

| | |
|---|---|
| a store's CFV score vs its **own next** CFV score | ρ = **+0.023**, n=190, CI **[−0.12, +0.17]** |
| store identity's share of CFV variance (ICC) | **0.087** (permutation p = 0.092) |
| ⇒ ceiling for **any** store-level predictor, √ICC | **≈ 0.30** |

So the panel now tells an operator that 46 visits will settle it. **46 visits will not settle it**,
because the effect being powered for is larger than the outcome can produce. That is the same
defect class as items 1 and 2 — a claim stronger than the data supports — in a third form:
**a promise of future certainty that will not arrive.**

⚠️ **Do not simply re-point the constant at 0.30 and move on.** Powering for ρ ≥ 0.3 needs ~84
pairs and the ICC itself is marginal (p = 0.092), so a "you'll know by <month>" promise is
unsafe at any threshold. The honest surface is **the ceiling alongside the estimate** — 0.23
against a ~0.30 maximum — not a countdown.

**Also worth revisiting:** `CALIBRATION_PAIRS_PER_YEAR = 81` (27 × 3 CFV/yr) is correct for CFV,
but `calibrateReadiness` pairs against `ds.gradedVisits`, which the parser fills from **both CFV
and RGR**. See item 2.

## 2. Part D0 — split the pairs by `reportType` FIRST. No new pull, no new data.

Added after this dispatch was picked up, so it was never in scope for the shipped work.

The three graded-visit instruments have nothing like the same outcome distribution:

| instrument | cadence | outcome |
|---|---|---|
| RGR (comprehensive) | ~1/store/yr | ~100% pass |
| EcoSure | 2/store/yr | 93–98% pass |
| **CFV** | **3/store/yr** | **55.3% meet 80% — 44.7% below** |

`calibrateReadiness` pairs against `ds.gradedVisits`, populated from **both CFV and RGR** PDFs
(`src/parsers/graded-visits.js` — `reportType: 'CFV'`, and the RGR branch at `:158`). **So its 27
pairs are plausibly a mixture of one instrument nearly everyone passes and one nearly half fail.**
Pooling them depresses ρ on its own, independent of model quality — the same mixing-regimes error
flagged twice elsewhere in this file's source material.

**Do:** group the existing pairs by `reportType` and compute ρ (with CI) separately for CFV and
RGR. The field is already on every row; no capture required. If they differ materially, the pooled
0.23 was never a meaningful number.

⚠️ **Scope note:** the ≈0.30 ceiling above is **CFV's**. RGR's own test-retest is 0.342 at n=25
with CI [−0.06, +0.65] — too imprecise to use, and not interchangeable with CFV's. **A
per-instrument ceiling is a prerequisite for interpreting either correlation**, which is why D0
comes before the daypart/channel work.
