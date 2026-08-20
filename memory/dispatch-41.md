# Dispatch #41 — Reconcile the two Model Health Score implementations

**Board (2026-08-20), at time of writing:** independently investigated and confirmed live
(`memory/backlog-master-2026-08-19.md` §4 already flagged this; re-verified against current code,
not assumed stale). Grounded further with external industry research (below) after the owner
asked for real due diligence before this dispatch was finalized — the same discipline already
applied to the loss-prevention build (ACFE/CISA/NIST), not reasoning from scratch.

---

## The bug, verified directly against real code

`src/engine/forecast.js` has two independently-maintained implementations of the same 0-100
composite score (Calibration 30 + Data Freshness 25 + MAPE Accuracy 25 + Sample Size 20, banded
green≥75/yellow≥50/red<50), introduced in the same commit two months ago (`3263842`, 2026-06-20)
and never reconciled since — confirmed via `git log -S` on both function names, every later touch
to either was a cosmetic lockstep edit (color-token swaps, precision bumps), never a diff of one
against the other.

- **`modelHealthScore(loc, ds, settings)`** — `forecast.js:847`. Consumed by
  `src/views/at-a-glance.js:374` (the "N stores at red model health" checklist item) and `:821`
  (the green/yellow/red district tally feeding both the top-of-page banner text and the AI
  narrative summary's input counts).
- **`computeModelHealth(loc, settings, ds)`** — `forecast.js:1868`. **Note the swapped argument
  order** — both `ds`/`settings` are objects so a careless collapse won't throw, it'll silently
  score every store on garbage. Consumed by `src/views/model-health-badge.js:10,18`
  (`ModelHealthBadge`, a colored score pill + expandable breakdown).
- **Both render on the same screen, for the same store, at the same time** —
  `src/views/store-analytics.js:1758` calls `modelHealthScore` directly for the page's
  "Model Health Confidence Bar" header, and `:1804`, a few lines later in the same header block,
  renders `ModelHealthBadge` (→ `computeModelHealth`). A user can see two different numeric scores
  for one store stacked vertically on one screen, and per the divergence below they can
  legitimately disagree — this is the concrete "user-visible risk," not a hypothetical.

**The floor-masking bug, verified line-by-line against both functions:** `modelHealthScore`
floors every component to a true `0` on failure (uncalibrated → 0/30, data ≥30 days old → 0/25,
MAPE ≥18% → 0/25, samples <20 → 0/20 — `forecast.js:868,876,884,897`). `computeModelHealth`
**cannot produce a true zero on Calibration, Freshness, or MAPE once a store has ever had any
data at all** — its floors are 6/30 (`:1888`), 3/25 (`:1902`), 5/25 (`:1922`), 3/20 (`:1936`). A
store dead for 900 days still banks 17 of 100 points in `computeModelHealth` before anything else
is scored. This is a real, live instance of "one weighted-average component can mask a
catastrophic failure in another" — not a hypothetical either; see the research section below for
why every recognized model-monitoring platform avoids exactly this.

**A second, independent, verified bug shared by both — a dead field, checked opposite ways:**
```
modelHealthScore   (forecast.js:869): if(di.settingsFp && di.settingsFp !== settings._fp) cp-=10
computeModelHealth (forecast.js:1887): fpChanged = settings._settingsFp && cal.settingsFp && ...
```
Grepped the entire `src` tree for `settings._fp =` / `settings._settingsFp =`: **neither is ever
assigned anywhere in the app.** (The only other `_settingsFp` hit is an unrelated local variable
inside `backtest.js:803`, not a `settings.` property.) Consequence: in `modelHealthScore`,
`settings._fp` is always `undefined`, so the `-10` penalty fires **every time** a calibration
carries a fingerprint. In `computeModelHealth`, `settings._settingsFp` is always falsy, so the
penalty **never** fires. Same dead field, opposite always-wrong behavior in each function — fix or
remove this check as part of the reconciliation, don't just carry it forward unexamined.

---

## Industry research grounding (owner-requested due diligence, external sources)

Full findings with citations live only in this session's transcript; the load-bearing conclusions
that shape the fix below, kept here so the reasoning survives independent of that transcript:

- **Weighted-additive composite scoring is a legitimate, well-precedented pattern** (FICO credit
  scoring uses the same shape: 35/30/15/10/10) — the fix below is not "throw out the design,"
  it's "close the floor-masking hole every recognized model-monitoring platform (AWS SageMaker
  Model Monitor, Google Vertex AI Model Monitoring, Evidently AI, Arize, WhyLabs) avoids by
  keeping a hard failure from being diluted by healthy components." The SLA-scoring precedent for
  this specific fix shape is a hybrid: `SLA = min(hard-gate, weighted-average(components))` — a
  minimum gate wrapped around the weighted-additive core, not a replacement for it.
- **NPS's grade-boundary precedent is directly relevant and currently unmet here**: Reichheld
  didn't guess the 6-vs-7 promoter/passive cutoff — he validated it against actual repurchase/
  referral behavior. Meridian's 75/50 grade cutoffs have never had that validation step. Not fixed
  in this dispatch (needs persisted history to validate against, out of scope here — see "not in
  this dispatch" below), but the standing rule this dispatch should leave behind: **once
  persisted history exists, validate these bands the same way, don't assume they're right forever
  because they look reasonable.**
- **MAPE's known asymmetry is real and directionally dangerous for this specific tool**: MAPE
  systematically rewards under-forecasting over over-forecasting (an over-forecast is unbounded,
  an under-forecast is capped at 100% error) — for a labor-scheduling signal, that quietly rewards
  the worse failure mode (understaffing). This is real and worth fixing, but **scope-narrowing
  finding, verified directly**: `mape6w`/`mape4w`/`mape2w` are computed exactly once, in
  `src/engine/backtest.js`'s `_computePeriodMape` (`:727-778` — a genuine mean of per-row absolute
  percentage errors, real MAPE, not mislabeled WAPE already), and consumed not just by both health
  functions but also by `src/views/at-a-glance.js` and `src/views/analytics.js`, with "MAPE"
  appearing directly in rendered UI text (e.g. `mLabel` → `"6W MAPE"`). **Swapping the underlying
  metric to WAPE is a real, separate, higher-blast-radius change — not a rename inside
  `forecast.js`** — and is deliberately NOT scoped into this dispatch (see below).

## The fix — reconcile to one implementation, preserve both call signatures

**Step 1 — measure before touching anything**, per this repo's own standing rule.
`src/__tests__/forecast.test.js` already has a `ds`/`laborRows` fixture-builder pattern usable for
this. Before picking values, construct 3-4 real scenarios (freshly calibrated; 25-days-stale
calibration; drifting MAPE where `mape2w` is high but `mape6w` is low; never calibrated) and run
both functions side by side, logging `.score` vs `.total` and grade vs grade, to confirm the
divergence is real on realistic inputs — not just reasoned from reading the code (even though this
dispatch already did that reading; the repo's rule is to reproduce against computed output before
changing anything, not to skip the step because the reasoning looks solid).

**Step 2 — land one canonical rubric**, keeping the 30/25/25/20 weights and 75/50 grade cutoffs
unchanged (no source validates a different split for this specific composite — see research above;
changing the numbers now without evidence just repeats the original sin with new digits):
- Floors: adopt `modelHealthScore`'s true-zero floor behavior on every component, not
  `computeModelHealth`'s never-zero floors.
- MAPE-window priority: adopt `modelHealthScore`'s explicit 6W→4W→full preference (stated
  rationale: "most operationally relevant") over `computeModelHealth`'s 2W→4W→all.
- Settings-fingerprint check: **fix it for real, don't just pick one function's already-broken
  version.** Either wire up a real fingerprint the way `backtest.js:803`'s local `_settingsFp`
  already computes one (`JSON.stringify({lyOutlierThreshold, opsNorm})`) — stamp it onto
  `settings._fp` at the point calibration runs, so the comparison has something real to check
  against — or remove the `-10` penalty entirely and say why in the code comment. Don't ship a
  reconciled function with a dead-field check that silently never fires or always fires.
- **Add a weakest-link override gate on top of the weighted sum, not as a fifth weighted
  bucket**: if never calibrated, OR data is critically stale (recommend >45 days — roughly double
  today's top freshness cutoff, tune if real data suggests otherwise), OR the Accuracy component
  itself scores a true 0, cap the grade at red regardless of the weighted total. This directly
  closes the floor-masking bug and matches the SLA hybrid-gate precedent above.
- **Promote the existing drift check** (`mape2w > mape6w + 5`) from a small point deduction into
  part of that gate — a drifting store shouldn't grade green purely on the strength of its other
  three components, since drift is a leading indicator the accuracy number alone doesn't capture
  yet.

**Step 3 — collapse to one real implementation, preserve both exported names and their existing
signatures.** Keep `modelHealthScore(loc, ds, settings)` as the canonical scorer. Turn
`computeModelHealth(loc, settings, ds)` into a thin adapter in the same file: call the canonical
function with arguments in the right order, then reshape its return value into
`computeModelHealth`'s existing shape (`{total, grade:'green'|'yellow'|'red', gradeLabel,
gradeColor, components:{cal,fresh,mape,sample}, notes:{...}, statement}` — map `reasons` → both
`components` (by `.pts`) and `notes` (by `.msg`) keyed by `.cat`). This keeps the change contained
to `forecast.js` — `at-a-glance.js`, `store-analytics.js`, and `model-health-badge.js` need zero
code changes, only new tests that render them (next).

**Step 4 — give the red grade an actual consequence** (per this repo's own "a number nobody acts
on is not a shipped feature" standing rule): when the canonical function returns a `red` grade,
the store's displayed projection should default to the Simple/trailing model (T3M/T6W/T3W median)
rather than whatever engineered model triggered the red grade — that's the model family this
project's own v4.483 backtest already proved most robust across 27 stores. Scope this narrowly:
change the default *displayed* model selection for a red-graded store, not the underlying Model
Assignment backtest/override system (dispatch-unrelated, don't touch it).

## Verification approach — must exercise the actual consumers, not just the function

Per this repo's own #366 lesson (a test that only imports the engine can't tell "fixed" from
"fixed but never wired in"):
- A direct-comparison test (both old functions' outputs, side by side) is useful for Step 1's
  measurement but does **not** count as this dispatch's real verification — it can't catch a
  future revert of the wiring in `at-a-glance.js` or `model-health-badge.js`.
- `src/__tests__/at-a-glance-checklist-freshness.test.js` already establishes the render pattern
  this dispatch needs (`createRoot`/`act` under `@vitest-environment happy-dom`, no
  `@testing-library` dependency in this repo). Reuse it: render `AtAGlance` with a fixture store
  that would grade differently under the old two rubrics, assert the rendered checklist text and
  banner text reflect the canonical score.
- Render `ModelHealthBadge` directly (small, standalone) with the same fixture, assert the
  displayed `{total}`/`{gradeLabel}` pill text matches the canonical function's output for that
  store — this is what actually proves the adapter's argument-order fix and reshape are correct,
  not just that `computeModelHealth`'s return value looks right in isolation.
- A fixture that exercises the weakest-link gate directly: a store with a passing weighted total
  but one hard-failing component (e.g. never calibrated) must still render red end-to-end.

## Explicitly not in this dispatch

- **Swapping the underlying accuracy metric from MAPE to WAPE.** Real, externally well-grounded
  finding (see research above), but `mape6w`/`mape4w`/`mape2w` are shared infrastructure
  (`backtest.js`'s `_computePeriodMape`, consumed by `at-a-glance.js` and `analytics.js` too, with
  "MAPE" in rendered UI labels) — a genuinely separate, higher-blast-radius dispatch: it needs its
  own investigation of every consumer, a decision on renaming the field/label vs. silently
  changing the math under the same name (the latter is actively misleading and should not
  happen), and probably owner sign-off given it changes a number surfaced in multiple panels, not
  just the two functions this dispatch reconciles.
- **Persisting Model Health as a time-series** (a `model_health_snapshots`-style table, rubric
  versioning via semver, dual-window/consecutive-day alerting before a red grade escalates to a
  district-level alert) — real, externally-grounded findings from the same research pass, but new
  infrastructure, not a bug fix. A separate future dispatch once this one ships; not blocking.
- **Validating the 75/50 grade cutoffs and 30/25/25/20 weights against real outcomes** — needs
  persisted history to validate against (the item directly above), can't be done today regardless
  of how this dispatch's code changes land.
- Any change to `Dialed-In`'s calibration engine itself, `backtest.js`, or the Model
  Assignment/override system — untouched. The `store-dash.js:15` dead `ModelHealthBadge` import
  (imported, never rendered) — a one-line adjacent cleanup, mention it in the PR if convenient,
  not required.
