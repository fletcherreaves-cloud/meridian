---
name: notes-visit-readiness-backlog-2026-08-22
description: Owner-raised Visit Readiness issues, 2026-08-22 — the Food Safety flag is mislabelled (it measures waste, not food safety), the Model Check is barely better than a coin flip and should be reworked, and the Report-detail toggle reads as a view toggle. Not urgent; captured so they survive the session.
metadata:
  node_type: memory
  type: notes
---

# Visit Readiness — three owner-raised items (2026-08-22)

Owner framed these as **"for when we have time."** Not urgent. Captured because chat does not
survive the session.

---

## 1. 🔴 "Food Safety" is the wrong name for what is being measured

**Owner:** *"Food Safety Risk is ill warned. Need to say something different. Appears it is
deriving based on waste. That would be an inventory/FOB issue and potential over-production. The
way we operate, there will always be waste. It's Fast Food."*

**He is right, and the code already half-admits it.** `FOODSAFETY` (`visit-readiness.js:139`) is
exactly two metrics, both from `fobRows`:

| metric | what it actually is |
|---|---|
| `statVar` — Stat variance % | inventory variance |
| `raw` — Raw waste % | product waste |

Their own in-code `pace` strings say *"Directional holding/handling proxy only — **NOT an EcoSure
prediction**."* So the engine hedges correctly and **the UI does not**: the panel renders
`Food safety: elevated`, `FS elevated`, and *"Address food-safety risk first — waste/holding
proxies are elevated."* That is a much stronger claim than the underlying metric supports.

**Why it matters beyond wording.** On the current screen, **10 of 27 stores** are flagged
`FS ELEVATED`, and on the At-Risk list the food-safety line is the *headline coaching action* for
Holdenville, Ardmore-Broadway and Defuniak Springs — it outranks the real blocker. If waste is
structurally normal in fast food, this trains operators to ignore the panel's top line. That is
worse than showing nothing: it is the "a number nobody acts on is not a shipped feature" rule
failing in the direction that also **displaces** the number they should act on.

**Direction (not a decision — owner's call):** rename to what it measures — *Waste & variance*,
or fold it into the existing Quality area — and stop it pre-empting the top coaching line. Any
genuine food-safety signal needs holding-time/temperature data, which `memory/project-graded-
visits-pace.md` already records as an acknowledged gap.

## 2. Model Check is barely better than a coin flip

On screen: **rank corr 0.23 (weak), direction match 52.00% (14/27)**, with the panel's own honest
caption *"Weak agreement so far — treat as directional only."*

52% on a binary direction call is **coin-flip territory**. The honesty of the caption is good and
should stay, but a predictor at that level is not yet decision-support.

**Owner:** *"I believe there is enough data present to rework the scoring mechanism here to
reflect something more useful."*

**Worth doing, and worth doing properly:**
- 27 stores with a recent actual visit score is the ground truth. That is a small n — enough to
  *fit* something simple, **not** enough to justify an elaborate model, and the standing
  no-invented-thresholds rule applies to any weights that come out of it.
- The current weights (Speed 35 / Accuracy 30 / Quality 20 / Leadership 15) were **assigned, not
  fitted** — see `memory/project-graded-visits-pace.md`. Fitting them against actual visit scores
  is the obvious first move.
- ⚠️ **#64 changed the inputs on 2026-08-22.** Several metrics now resolve auto-first instead of
  from stale manual uploads (R2P moved 111.7s → 128.5s on one store). **Any correlation measured
  before that date is against different inputs.** Re-measure the baseline before concluding
  anything about the model.
- Beware overfitting 27 points. Report the fit *and* a holdout or cross-validated figure.

## 3. The Report-detail toggle reads as a view toggle

**Owner:** *"Summary button doesn't seem to do anything."*

**Not broken — print-only.** `detail` (`visit-readiness.js:380`) is read in exactly one place:

```js
const doPrint = () => openPrint(readinessReportHTML(res, { scopeLabel, detail }));
```

Nothing on screen consumes it. It is labelled *"Report detail"*, but at `fontSize: 9` beside
pill buttons styled identically to the All/OK/FL filters — which **do** change the view. So it
reads as a view control and behaves as a print option.

**Direction:** attach it to the action it modifies — a split/dropdown on the **Report** button
(`Report ▾ → Full audit / Summary`) — rather than parking it among the filters. Cheap, and it
removes a "this is broken" reaction from the first-time user.

---

## Not in this file

`#514` (McValue 2.0 price-test chart) — **merged 2026-08-22** as `21de726`. Verified before
merging: tag balance in both HTML files, `@media print` present, zero remaining "our own price"
instances, CI green.
