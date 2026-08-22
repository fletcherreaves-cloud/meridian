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
