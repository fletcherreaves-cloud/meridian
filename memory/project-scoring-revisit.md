---
name: project-scoring-revisit
description: "Prep for the joint Ops/Controls/District/Model-Health scoring session the owner asked for. Contains a MEASURED divergence between the two Model Health scorers (3 of 10 scenarios land on different colors) and a confirmed bug: two settings-fingerprint fields that are never assigned, so one scorer always applies a 10-point penalty and the other never does. Findings only — formulas untouched per the owner's explicit ask."
metadata:
  node_type: memory
  type: project
---

# Scoring revisit — session prep

Owner: *"I don't want to abandon them, I love the concept, I just want them to mean the right
things… I need the two of us to spend time getting this part right."*

**Nothing here has been changed.** The owner asked that formulas not be touched until we sit
down together, and that includes the confirmed bug below — fixing it moves every store's score,
which is exactly the unilateral change they asked not to have made. Findings only.

Continues `notes-63-queue.md` § "Scoring systems". That section documents *what exists*; this
one adds *what's measurably wrong*.

## ⚠️ Confirmed bug: both settings-fingerprint fields are phantom

`grep -rnE "_fp\s*[:=]|_settingsFp\s*[:=]" src/` — **neither `settings._fp` nor
`settings._settingsFp` is ever assigned anywhere in `src/`.** Both are permanently `undefined`.
`backtest.js:803` builds a local `_settingsFp` and stores it *on the calibration object* as
`settingsFp`, but nothing ever puts a counterpart on `settings`.

Each scorer compares against a different one of those two phantoms, so they fail in **opposite
directions on the same component**:

| | Reads | Guard | Real behavior |
|---|---|---|---|
| `modelHealthScore` (`forecast.js:853`) | `settings._fp` | `di.settingsFp && di.settingsFp !== settings._fp` | `di.settingsFp` is a truthy JSON string ≠ `undefined` → **always true**. Every calibrated store permanently loses 10 calibration points and is told *"Settings changed — re-run recommended"* forever. Max achievable score is 90, not 100. |
| `computeModelHealth` (`forecast.js:1833`) | `settings._settingsFp` | `settings._settingsFp && cal.settingsFp && …` | Leading operand is `undefined` → **always false**. The settings-change penalty has never fired once. |

So one scorer nags constantly and the other never nags — and neither is actually detecting
anything. This is the single highest-confidence item on the agenda: it's not a judgment call
about what a score *should* mean, it's a component that has never worked in either
implementation.

## Measured: how far apart the two scorers actually get

Both call themselves "Model Health Score, 0–100" and both are shown to the owner — 
`modelHealthScore` on Store Analytics + the At-A-Glance red-store counter, `computeModelHealth`
on the main analytics dashboard tile. Re-implemented both scorers' arithmetic faithfully and ran
matched scenarios **as the code actually executes** (phantom fields included):

```
scenario                                      A (Store Analytics)   B (dashboard tile)    Δ
Calibrated 3d ago, settings changed since     85 Healthy            95 Trusted           +10
Recent 2W great (4%), 6W poor (11%)           78 Healthy           100 Trusted           +22
Recent 2W poor (11%), 6W great (4%)           82 Healthy            80 Trusted            -2
Calibrated 25 days ago                        77 Healthy            79 Trusted            +2
Data 12 days stale                            72 Fair               80 Trusted            +8  ← different color
Data 60 days stale (abandoned store)          60 Fair               73 Caution           +13
Only 100 samples                              75 Healthy            90 Trusted           +15
Only 30 samples                               69 Fair               78 Trusted            +9  ← different color
MAPE 15% (bad but not awful)                  71 Fair               80 Trusted            +9  ← different color
Healthy baseline                              90 Healthy           100 Trusted           +10
```

**3 of 10 land on a different color. B runs systematically ~10 points hotter.** A store 12 days
stale reads *Fair* on one screen and *Trusted* on another, at the same moment, from the same data.

### Where the divergence comes from — four independent disagreements

1. **Different MAPE window as the primary.** A prefers **6W** (falls back 4W → full); B prefers
   **2W** (falls back 4W → full). Those are different questions. A store with 2W=4% / 6W=11%
   scores 13 on A and 25 on B — the +22 row above. *Decision: which window should "can I trust
   this forecast" be judged on?*
2. **Different freshness curve.** A: `<3→25, <7→20, <14→12, <30→5, else 0`. B: `≤3→25, ≤10→18,
   ≤21→10, else 3`. A can zero the component; B floors at 3, so **B gives a store with 60-day-old
   data the same freshness credit as one at 25 days**. *Decision: should stale data be able to
   zero a component, or only reduce it?*
3. **Different sample-size ladder.** A: `≥300→20, ≥150→15, ≥50→10, ≥20→4, else 0`. B: `≥180→20,
   ≥90→15, ≥42→8, else 3`. A wants roughly twice the history for full credit. *Decision: how much
   history is "enough"?* — worth answering against the v4.483 finding that the simple trailing
   family wins at ~5% MAPE, since that bears directly on how much history a trustworthy model
   needs.
4. **Different labels for the same bands.** Both cut at 75/50. A says Healthy / Fair / Needs
   Attention; B says Trusted / Caution / Needs Attention. Same number, different word.

## Agenda for the session

Ordered so the cheap, factual decisions come first and the judgment calls come last.

1. **Kill the duplicate.** Two implementations of one score is the root problem — every fix below
   otherwise has to be made twice and will drift again. Decide which survives, or write one new
   one. (Recommend: one function, both call sites.)
2. **Fix or delete the fingerprint check.** It has never worked. Either assign a real settings
   fingerprint onto `settings` and let the penalty mean something, or drop the component and
   redistribute its 10 points. Don't leave a third variant of a check that has never fired.
3. **Pick one MAPE window**, one freshness curve, one sample ladder, one label set — the four
   decisions above.
4. **Confirm where the District Score belongs.** It's the average Combined Score across loaded
   stores, and it currently lives on the **Store Dashboard**, not At-A-Glance
   (`store-dash.js:1918`). Worth confirming that's where you want it before redesigning it.
5. **Ops / Controls / Combined** (`pipeline.js:131`, `:154`; Combined = Ops×0.6 + Controls×0.4).
   Not yet audited to the depth above — do this after Model Health, since the same
   "simple-but-trustworthy" standard will apply and the exercise will go faster the second time.

## What to bring

Per the owner's own framing and the note in `notes-63-queue.md`: **a short list of stores where
the scores disagree with your gut read of that store's real performance.** The numbers above prove
the two scorers disagree with *each other*; only you can say which one disagrees with *reality*.
Calibrate against real cases, not formulas. Simple-but-trustworthy is the target — not more
inputs, better-chosen ones.
