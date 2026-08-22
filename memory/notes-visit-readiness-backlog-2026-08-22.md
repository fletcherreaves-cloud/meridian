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

## 2. Model Check — the SAMPLE is too small to judge the model. Do not rework the scoring yet.

On screen: **rank corr 0.23 (weak), direction match 52.00% (14/27)**, captioned *"Weak agreement
so far — treat as directional only."*

**Owner's revised read (2026-08-22), and it is correct:** *"May not need to change the scoring
mechanism — it sounds legit — maybe needs more data."*

**Computed, n = 27:**

| statistic | point | 95% CI |
|---|---|---|
| direction match | 51.9% (14/27) | **[34.0%, 69.3%]** (Wilson) |
| rank corr ρ | 0.23 | **[−0.16, 0.56]**, p ≈ 0.25 |

At this n the true direction-match rate could be anywhere from a third to nearly 70%, and the true
correlation anywhere from slightly negative to moderately strong. **These numbers cannot
distinguish "the model is useless" from "the model is good."** They are not evidence of a weak
model; they are evidence of a small sample.

### So the actual defect is the CAPTION, not the scoring

*"Weak agreement so far"* **asserts weakness**. What is true is **"not enough visits yet to tell."**
The panel is claiming more than its data supports.

⚠️ **That is the same error as item 1**, in the opposite direction — the UI making a stronger
statement than the underlying metric earns. Two instances of one pattern in one panel is worth
treating as a pattern: **Visit Readiness overstates its own certainty.** Any future work here
should check the claim each label makes against what the number can actually support.

### What to do instead of reworking the scoring

1. **Fix the caption** to report uncertainty honestly — show the interval, or say the sample is
   too small. Cheap, and it is the only part that is actually wrong today.
2. **Accumulate paired observations.** The binding constraint is not total data, it is
   *(predicted readiness, actual visit score)* pairs, which arrive only as CFV/RGRV visits happen.
   Re-measure as n grows rather than refitting now.
3. ⚠️ **Re-baseline first: #64 changed the inputs on 2026-08-22.** R2P moved 111.7s → 128.5s on
   one store when it began resolving auto-first. **Every pair measured before that date is against
   different inputs**, so the 0.23/52% figures are already stale. Re-measure before drawing any
   conclusion.
4. **Only then consider fitting the weights** (currently 35/30/20/15, assigned rather than fitted —
   see `memory/project-graded-visits-pace.md`). At n=27 a fit would overfit; if it is ever done,
   report a holdout or cross-validated figure alongside, and the no-invented-thresholds rule
   applies to whatever comes out.

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
