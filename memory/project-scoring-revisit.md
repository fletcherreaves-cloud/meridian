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

---

# CONVERGED DESIGN (owner + PM working session, 2026-08-10)

The owner brought their own plan; it was reviewed unedited against the PM's. ~80% aligned.
Everything below is **decided** unless marked PROPOSED.

## The governing principle — DECIDED

**Score only what a manager or team can actually control.** Owner: *"let's make it things a
manager or team can actually control."* This resolves most individual input questions without
having to argue them one at a time.

The case that forced it: **store 10422 lost ~24% of guest traffic over five weeks with no
identified operational cause.** Every sales-denominated ratio (TPPH, Labor%) degrades
mechanically in that window, so the Ops Score would have reported Atoka as executing badly at
exactly the moment it most needed to tell the truth.

## Inputs — DECIDED

**Out:**
- **Labor%** — sales in the denominator. Replaced by `actVsNeed` (actual − needed hours, DAR,
  already flowing), which is honest when traffic moves because needed hours move too.
- **Discount%** — substantially LTO/corporate-driven; measures the calendar as much as the manager.
- **Sales vs target** — the purest uncontrollable metric. (Sales vs *forecast* survives as an
  OUTCOME measure, not an execution input — see the two-axis structure below.)
- **TPPH weighted up** — rejected. Same sales-denominator problem as Labor%; `actVsNeed` does
  the job TPPH was standing in for, honestly. TPPH may stay at low weight, not as a heavyweight.
- **Visit Readiness (the predictor)** — would double-count. Verified: `READINESS_WEIGHTS.speed`
  is 35% of the composite and is built from *"CFV DT OEPE ≤120s · DT Line Time · IR R2P ≤90s."*
  With OEPE and R2P already scored directly, including the predictor counts them twice at
  different weights — averaging averages, against the standing rule.

**In:**
- **`actVsNeed`** replacing Labor%.
- **Voice / SMG** — the guest was entirely absent from a score that claims to summarize store
  performance. A store could be fast, cheap, and disliked and score well.
- **ACTUAL graded-visit results** (real CFV / RGRV / EcoSure scores when a visit happened) —
  independent evidence, not derived from other inputs. Owner: *"A pass is sign of a store doing
  things right."* The predictor stays its own panel.
- **KVS Usage** and **R2P** — clean, controllable, already flowing from DAR.
- **FOB, split two ways** (owner's idea, and the strongest single addition):
  - *Process health* — counts on time, recounts that move variance toward zero rather than away.
    **Fully controllable, and already computed**: `eom-count-sessions.js` grades every recount
    helped/hurt/held, `computeCountProgress` tracks on-time counting, the Count Reliability scan
    grades consistency. Nothing new to build, only to score. Weight toward this half.
  - *Outcome* — FOB vs target with trending. Partly controllable (price, waste, theft).
- **Scheduling accuracy + improvement** (owner's idea) — see the decomposition below.

## Scheduling accuracy — DECIDED to decompose, standard still OPEN

Scoring "schedule vs forecast" naively punishes a manager for **Meridian's own forecast error**.
A store whose model runs high looks like a chronic over-scheduler forever. Three numbers, not one:

| Comparison | Measures | Whose fault |
|---|---|---|
| Schedule vs forecast | Did they schedule to plan? | Manager ✅ |
| Actual vs schedule | Did they flex during the day? | Manager ✅ |
| Forecast vs actual | Was our model right? | **Ours** ❌ — Model Health's job |

Score the first two only. **This makes Model Health load-bearing**, so issue #146 (one
implementation + a fingerprint check that actually fires) must land first, and a scheduling
score should only apply to stores whose Model Health is Trusted.

**OPEN — the owner flagged this themselves:** "+2% of forecast" is ambiguous. Two readings —
2% of forecast *sales* converted to labor dollars via average rate of pay, or 2% of
forecast-implied *hours*. PM recommends **hours**: it's the unit a scheduler works in and it
doesn't drift when average rate of pay changes. Needs a clear written standard either way, plus
a defined softening band for slightly-over.

Scoring **improvement** as well as level is deliberate and unusual — it rewards a struggling
store that is getting better. That is a coaching instrument, and it is consistent with the
structure below.

## Coaching vs ranking — owner: *"It could, theoretically, be or become both"*

### PROPOSED structure: one controllable core, two axes — not one blended number

- **Execution Score** — controllable components only, per the principle above. The coaching
  number. The GM owns it, and it is fair to coach against.
- **Outcome context** — sales vs forecast, traffic vs LY, FOB $ result. **Displayed alongside,
  never blended in.** Blending destroys the coaching signal and muddies the ranking.

Read together they give the thing an owner actually needs:

| | Results good | Results bad |
|---|---|---|
| **Executing well** | Replicate — find what they're doing | **External problem — not the GM.** This is the Atoka cell |
| **Executing poorly** | Coasting on a good location; fragile | Intervene now |

The top-right cell is the one no current Meridian number can express, and it is exactly the
case that started this. It routes to *"go find the cause"* — the swing detector, and eventually
the reputation/mention work — rather than to coaching a manager who did nothing wrong.

Sales vs forecast is the right outcome axis (owner: *"I actually don't hate the sales vs
forecast though, maybe that is the way"*). Same caveat as scheduling: it is meaningless when the
forecast isn't trustworthy, so it is also gated on Model Health = Trusted. Second reason #146
comes first.

---

# Session part 2 — scheduling standard settled, two findings (2026-08-10)

## Scheduling accuracy — DECIDED, and the standard is theirs, not ours

The "+2%" is **2 percentage points of labor %**, not 2% of hours and not 2% of forecast sales.
Owner: *"if a store's projected labor% is, say, 21.5%, what we are saying is schedule no more
than 23.5%."* The hours conversion is for actionability, not for scoring.

**Stores are already told "no more than 1.5–2%."** That range IS the softening band the owner
asked for — we don't invent a curve, we grade against the standard people were trained on. A
GM can recite it; a score built on our own invented threshold is one they'd argue with.

The buffer exists to absorb callouts, no-shows, and unexpected sales, and it is **intended,
not tolerated** (owner, confirmed). So the shape is a BAND, asymmetric — tight low, generous
high — because under-scheduling deliberately removes the cushion:

| Scheduled vs projected labor % | Credit |
|---|---|
| Below projection | **Penalized from the first tick, scaling with shortfall. NO tolerance band.** |
| Projection → +1.5pp | Full |
| +1.5 → +2.0pp | Partial (the standard's own band) |
| > +2.0pp | Penalized, scaling with overage |

Without the low-side penalty a chronically lean store grades perfectly on scheduling while its
Speed metrics suffer — the cause scored as a symptom, in a different component.

**No acceptable under-range — owner, confirmed:** *"we do not give an under range that is
acceptable we want store to be able to adequately serve all guests efficiently."* No grace zone
below projection, but no cliff either: 0.1pp under must not grade like 2pp under, so the penalty
starts at zero deviation and scales.

**PM WITHDREW a proposed "waive the low side if service held" exception.** Wrong twice over.
(1) It solved a problem the three-way decomposition already handles — forecast error is scored
separately and gated on Model Health = Trusted, so on a Trusted store under-scheduling really is
under-scheduling. (2) It would have rewarded getting away with it: a lean store with no callout
and no rush was lucky, not right, and daily service averages are coarse enough to hide a bad 45
minutes. "No harm measured" is not "no harm."

Consequence: **the Model Health gate is load-bearing, not nice-to-have.** With no low-side
tolerance, grading a store against an unreliable forecast is actively unfair. **#146 must land
before any of this ships.**

⚠️ **OPEN — which number is "projected"?** `lifelenz_labor_week` offers two different baselines:
`hoursFcst` (LifeLenz forecast hours, derived from forecast sales) and `laborTargetOrg` (the org
labor target). A store can be at plan against one and under against the other, so the whole
standard hinges on it. PM's read is `hoursFcst` — it moves with the forecast day, which is what a
scheduler builds against — but that is an inference and needs the owner's confirmation.

**Score in percentage points; present in hours.** Rate of pay varies by store and state, so
keeping the conversion in the presentation layer stops rate imprecision from moving anyone's
grade.

### The data already exists — this is not a data project

`lifelenz_labor_week` carries, per store per week: `hoursFcst`, **`hoursSched`** (the manager's
plan), `actualHours`, **`rate`** (per store, so no district-average fudge), `salesFcst`,
`laborTargetOrg`, `laborPctActual`, `tpph`. Both fair axes compute directly:

- **Schedule vs forecast** = `hoursSched` vs `hoursFcst` — already in hours, no conversion
- **Actual vs schedule** = `actualHours` vs `hoursSched`
- 2pp ceiling → hours allowance = `2% × salesFcst ÷ rate`, per store

⚠️ **Loader caveat:** `loadLifeLenzLaborWeek` with no explicit `weekStart` returns only each
store's MOST RECENT row. Scoring *improvement* needs a series, so that needs a small change to
fetch a window. Weekly granularity is correct and deliberate — schedules are built weekly.

## FINDING — make-table utilization is real, coachable, and currently invisible

Owner: *"All stores have mfy results. Some stores suck at using both sides of the table, hence
the null or 0 results. But they are correct."*

**A zero is a FINDING, not a coverage gap.** The PM initially framed nulls as missing data and
worried about renormalization; that was backwards. Renormalizing these away would erase a real
operational failure and hand the weight back to service — flattering the store that earned the
hit. Whatever is built must score them, not skip them.

**But KVS Time cannot see this.** `kvst = _mfyTime / _mfyCnt` where `_mfyCnt` is mfy1 + mfy2
**combined**. With one side idle, everything routes through the other and average time *per
transaction* looks normal while throughput is halved. The damage surfaces as cars waiting —
OEPE and park% — which is the same service/production misattribution, one level deeper.
Weighting KVS Time up does NOT catch what the owner described.

**The measurable signal is mfy2 volume relative to mfy1 — and it never reaches the app.**
Verified against live columns:

```
qsr_daily_activity_rollup   mfy1_trans_cnt → 400 (no such column)
                            mfy2_trans_cnt → 400 (no such column)
                            mfy_trans_cnt  → 200
qsr_daily_activity (hourly) mfy2_trans_cnt → 200  ✅ exists
```

Both the rollup table and `schema-qsr-daily-summary.sql` do `sum(mfy1_* + mfy2_*)`. Reasonable
when KVS Time was the only consumer; it means this metric is uncomputable today.

**Fix:** carry the two sums into the rollup as separate columns; derive the ratio client-side.
NOT a combined "utilization %" in SQL — the rollup moves aggregation, not definitions.

**Measure before thresholding:** a small store at low volume may legitimately run one side, so
the metric needs a volume gate and the threshold must come from the measured distribution across
the 27 — not a guessed number. Same rule as the swing alarm's −10%.

Status: PENDING owner go-ahead to file as its own issue. Worth having independent of scoring.

## Speed splits into Service and Production — DECIDED

Owner: KVS Time is *"the other half of the variable hour employees… may even point to an area
(service vs production) when it comes to diagnosing issues."* Confirmed in the data:

| Metric | Formula | Side |
|---|---|---|
| OEPE | `(_dtTotal − _dtStore) / _dtCars` | Drive-thru → service |
| Park % | `_dtHeld / _dtCars` | Drive-thru → service |
| R2P | `(_fcServe − _fcDrawer) / _fcCnt` | Front counter → service |
| KVS Time | `_mfyTime / _mfyCnt` | MFY → **production** |
| KVS Healthy | `_kvsH / (_kvsH + _kvsU)` | Kitchen display → **production** |

Three of four are service, so Speed today is almost entirely a service measurement — and it
**misattributes** kitchen failures to service, because a slow MFY makes the car wait at the
window. The drive-thru crew takes a hit it didn't earn.

Two balanced sub-scores, not one flat list — a flat list gets the coverage but loses the
diagnostic, which is the whole value:

| | KVS Time fine | KVS Time high |
|---|---|---|
| **OEPE fine** | Both healthy | Kitchen slow, service absorbing — fragile at peak |
| **OEPE high** | Service/window problem | **Kitchen is the constraint** — coaching the window is wasted |


---

# CORRECTION — KVS Healthy Usage, and the live bug it exposed (2026-08-10)

## The PM proposed rebuilding a metric QSRSoft already computes

Earlier this session the PM proposed surfacing raw `mfy1_trans_cnt`/`mfy2_trans_cnt` from the
rollup to build a "make-table utilization" metric, and said its threshold "must come from the
measured distribution across the 27." **Both wrong.** The owner pointed back at the QSRSoft KB;
the article **"2nd Side Formula"** (`qsrsoft_kb`) already defines exactly that metric:

> Healthy Usage is a check to see if both sides are being used once a certain number of items
> come through. It starts with checking if there have been **36/38 (breakfast/regular menu) items
> in a quarter hour period**. Once that threshold is met, then **at least 20% of the items need
> to be on each side**… The :15 result will be either **0% or 100%**… If a quarter hour does not
> meet 36/38 total items sold, it will display as **N/A**… For the full day average, **it only
> counts the 0% and 100% quarter hours**.

Volume gate and share rule are both defined upstream. **Scrap the schema change and the
measurement step.** Third time in one session the PM proposed building something that already
existed — the standing rule ("before fixing a thing, confirm it is still used") needs its general
form: **check what exists before designing, published vendor definitions included, not just our
own code.**

## The three states, and the bug

| Value | Meaning |
|---|---|
| N/A / blank | Volume never required the 2nd side. **Fine.** |
| **0%** | Threshold met, both sides not staffed. **Worst result, fully coachable.** |
| 100% | Ideal. In-between = partial compliance across quarter hours. |

`METRIC_SOURCES.kvsHealthy` is `mode:'pos'` and `_ok` requires `v > 0`, so **a real 0% is
discarded as missing data — the worst result is the one Meridian cannot currently see.** Worse in
aggregate: `metricAvg` drops every 0% day, so a store at 0% half the time and 100% the rest
reports **100%, not 50%** — a compliance metric inflating itself on the One-Pager and morning
brief. Filed as **issue #150**, with `park` flagged as a likely second instance (`park = 0` means
cars came and none were parked — the *good* outcome — discarded the same way).

The null path is already correct: `(_kvsH + _kvsU) > 0 ? … : null` returns null exactly when no
quarter hour met the threshold, which IS the KB's N/A. So `mode:'any'` gives all three states
their correct distinct handling with no other change.

**Once #150 lands this is the cleanest scoring input discussed all session:** binary at the
quarter hour, defined volume gate, low-volume periods auto-excluded, fully controllable, and no
threshold for us to invent.

---

# Labor target — SIX competing numbers, and the authoritative one may not be wired (2026-08-10)

## Which is authoritative — ANSWERED

**Meridian's own target.** Owner: *"meridian (my) target is what they are expected to make. It is
sent to all operators mid month for following month for approval."* So the number is set by the
owner, distributed monthly, and approved — a real business process, not config.

## But there are six labor percentages per store, and they disagree

`DEFAULT_TARGETS` alone carries **four** (`tLabor`, `tCrewLabor`, `tBonusLabor`, `tCombLabor`).
Add the LifeLenz AOS ceiling and the owner's monthly projection. Measured:

| Store | Meridian `tLabor` | LifeLenz AOS | Gap | `tCrewLabor` | `tBonusLabor` | `tCombLabor` |
|---|---|---|---|---|---|---|
| 3708 | 22.0% | 21.5% | +0.50pp | 21.0% | 21.75% | 24.92% |
| 5183 | 21.25% | 21.5% | −0.25pp | 22.0% | 21.25% | 27.85% |
| 18213 | 22.5% | 21.25% | +1.25pp | 22.5% | 20.25% | 24.56% |
| 6178 | 23.0% | 21.25% | +1.75pp | 23.0% | 21.0% | 24.77% |
| 43701 | 26.0% | 24.0% | **+2.00pp** | 26.0% | 21.25% | 24.55% |

Ponce de Leon is a **full 2pp apart — the entire tolerance band.** A store scheduled exactly to
Meridian's target sits at the +2% ceiling by LifeLenz's reckoning. Pass/fail depends purely on
which number you grade against.

## `laborTargetOrg` is a generator constraint, not a target — DO NOT USE (owner)

The owner identified it from the LifeLenz **AOS configuration** screen: *"LABOR COST
OPTIMISATIONS → Maximum labor cost percentage,"* a per-day ceiling the **auto-scheduler obeys when
generating a schedule**. Grading a manager against it would be scoring them on a machine's input.
The owner's store 0043380 reads a flat **22% across all seven days** — no weekday/weekend
differentiation, the signature of a set-once value. Owner: *"I genuinely didn't know this was a
setting. So, clearly, let's not use it as of now."*

⚠️ **Live consequence, independent of scoring:** the Labor Analysis panel's *"Hours ± Sched vs.
Target"* and *"vs. Target +2%"* columns (`engine/labor-analysis.js`, `views/labor-analysis.js`)
are computed off `laborTargetOrg`. Those columns have been grading against an unowned value.

## ⚠️ OPEN + likely defect — the approved number may not reach the score

**Verified:** `loadMonthlyTargets` maps `crew_labor_pct → tCrewLabor` and
`bonus_crew_pct → tBonusLabor`. **There is no `tLabor` in `monthly_targets`.** And
`computeOpsScore` (`pipeline.js`) grades labor against `t.tLabor`.

So the monthly approval cycle populates crew and bonus labor but **not the field the score uses**.
`tLabor`'s only other source is the static `constants.js` map — the `org_config` override path is
**dormant, confirmed by owner query 2026-08-10**: `select ... from public.org_config where
key = 'store_registry'` returns **0 rows**. (The key is `store_registry`, with `defaultTargets` as
a property inside its `data` blob — `App.js:2046` — not a `default_targets` key; the PM guessed
the wrong shape first.) The code comment there already said so: *"a future tenant's
STORE_NAMES/DEFAULT_TARGETS override… No row for this owner yet → no-op."* It is onboarding
scaffolding for a second tenant, not a live override. `setLiveStoreNames` is equally dormant, so
STORE_NAMES is static too — expected, not a bug.

**Therefore, on a normal login all three layers collapse to one:** `ds.targets` is `{}` (only an
in-session OpsTargets.xlsx upload fills it), `org_config.store_registry` has no row, so
`buildStore` always reads `DEFAULT_TARGETS` from `constants.js`. Ops and Controls scores grade
every store against numbers hardcoded in a source file, changeable only by editing and deploying
code — while `mergedTargets`, carrying the monthly approved crew labor % and every Targets-panel
override, is rebuilt each render and discarded.

**Question for the owner:** on the sheet sent to operators, which line is *the* number — crew
labor %, bonus crew %, or a total?
- **Crew labor** → the authoritative number already flows monthly as `tCrewLabor`, and
  `computeOpsScore` is reading a static field beside it. One-field bug, real consequence: the
  score grades against a number nobody approved.
- **A total** → it isn't flowing at all, and `tLabor` is stale config in exactly the way
  `laborTargetOrg` proved to be.

**Scheduling accuracy stays PARKED until this is settled** — the baseline is the whole standard.

## Scheduling accuracy already exists — do not rebuild it

Fourth time this session the PM proposed building something already present.
`src/engine/labor-analysis.js` `computeLaborRow` already computes, from the LifeLenz MBI labor
sheet, per store: `laborTargetPlus2 = L + 0.02`, `projHrsTarget = (C×L)/J`,
`projHrsTargetPlus2 = (C×M)/J`, `hrsVsForecast = G−F`, `hrsVsTarget = G−O`,
`hrsVsTargetPlus2 = G−P`, plus the dollar equivalents — where `G` is scheduled hours and `J` is
the store's **own** rate of pay. The source spreadsheet carries "Labor Target + 2%" and "Hours
+/- Sched vs. Target +2%" as native columns. The owner's 21.5% → 23.5% example is literally store
3708's fixture row (`laborTargetOrg: 0.215`, `laborTargetPlus2: 0.235`).

Consequences for the earlier design notes:
- **The PM's "score in percentage points, present in hours" recommendation is backwards** from how
  the business already works. The sheet converts to hours using each store's own rate; follow it.
- **The three-way forecast decomposition is less load-bearing than the PM claimed** for this axis.
  The standard grades against a labor *target*, not against Meridian's forecast, so a manager was
  never being charged for our forecast error here. `hrsVsForecast` exists separately if wanted.
  #146 remains a prerequisite for **sales-vs-forecast**, not for scheduling.
- The genuinely new work is the **low side** — nothing computes "scheduled below target," because
  the source only ever asked the +2% question.

## Standing rule, generalized (fourth strike)

"Before fixing a thing, confirm it is still used" is too narrow. The rule is: **search for the
thing before designing it — our own code, published vendor definitions, and the source
spreadsheets alike.** Four proposals this session were retired by something that already existed:
Places API (already researched and rejected), make-table utilization (QSRSoft's "2nd Side
Formula"), scheduling accuracy (`labor-analysis.js`), and the hours-vs-percentage-points
convention (the MBI sheet). Belongs in `feedback-verification-in-sandbox.md`.

---

# Labor-basis fields — which are live, which are reserved (owner, 2026-08-10)

Four labor bases exist in `DEFAULT_TARGETS`. Only two are live:

| Field | Status |
|---|---|
| `tCrewLabor` | ✅ **AUTHORITATIVE.** The number sent to operators mid-month for the following month's approval. Flows monthly via `monthly_targets.crew_labor_pct`. |
| `tLabor` | ⚠️ What `computeOpsScore` currently grades on. Static only — no monthly path. 14 of 27 stores differ from `tCrewLabor`, up to 1.75pp. |
| `tBonusLabor` | 🅿️ **Not used today. Reserved — may be used next year.** |
| `tCombLabor` | 🅿️ **Not used today.** Owner: *"Combined should be used but this organization is not set up for it currently. Wouldn't be hard but not a bridge to cross at the moment."* |

## ⚠️ DO NOT DELETE the two unused fields

`tBonusLabor` and `tCombLabor` are **deliberately reserved**, not dead code. This session has been
aggressively retiring orphans (ORPHANS emptied, four panels harvested and deleted) under a
harvest-then-remove rule, and two target fields nothing reads are exactly what a future cleanup
sweep would remove on sight. The owner has stated both are intended. Leave them.

## Design consequence for #153 defect 2 — make the basis selectable, don't hardcode crew

Owner: *"Down the road if this actually gets much bigger and the organizations and operators are
on the platform, it will need to be an option."*

So the fix is **not** a straight `tLabor` → `tCrewLabor` swap in `computeOpsScore`. The labor basis
should resolve through **one named place**, defaulting to `tCrewLabor`, so switching an org to
combined later is a config change rather than a hunt through the scorer.

**CORRECTION (owner, same session):** the PM originally wrote "do not build a config UI — the
owner deferred it." **That was the PM extrapolating, not the owner's words.** What the owner said
was that *the organization* is not set up for combined labor and that is not a bridge to cross
right now. Owner's correction: *"Not sure I deferred this unless we were in the heat of it. I very
much would like this to happen!"*

Two separable things, and conflating them is what caused the error:

| | Status |
|---|---|
| The **organization** being ready for combined-labor accounting | Not now. A business change, not ours. |
| **Meridian offering the choice** of basis | ✅ **Wanted. Build it.** |

These are compatible, and the ordering is the point: **the option should exist before the org is
ready**, so switching is a setting rather than a project.

**Scope:**
- Labor basis resolves through **one named place**, default `tCrewLabor`.
- A real setting to choose among `tCrewLabor` / `tLabor` / `tBonusLabor` / `tCombLabor` — which is
  also what keeps the two reserved fields honest: they stop being dead code the moment they are
  selectable.
- **Per-ORG, not per-user** — this is an accounting basis, not a preference. `org_config` is the
  right home and matches the multi-tenant scaffolding already present (`tenants`/`tenant_stores`,
  `store_registry.defaultTargets`).
- Admin-gated. Changing it moves every store's score.
- Same before/after reporting as the rest of #153 — the owner sees which stores move and why.
