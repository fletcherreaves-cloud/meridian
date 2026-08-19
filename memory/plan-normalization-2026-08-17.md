---
name: plan-normalization-2026-08-17
description: The normalization plan — lift Meridian's hand-rolled mechanisms to industry standards (forecast precompute, query layer, event model, pipeline contract, design-system adoption, routing, shift-dimension join) plus the role-based voice principle and owner advisory notes. Sequenced behind Phase 0.
metadata:
  node_type: memory
  type: plan
---

# Normalization plan — 2026-08-17

Owner-directed, afternoon of 2026-08-17. Everything here is **planned and staged, not started.**

**Live artifacts (the detail lives here, this file is the durable index):**
- Architecture standards — https://claude.ai/code/artifact/639f1cf3-0146-4f41-80aa-f1faf73de7df
- Interface audit — https://claude.ai/code/artifact/63d6d472-113e-45b4-b9e7-672a55d224df
- Structural audit (Phase 0 origin) — https://claude.ai/code/artifact/2d9e73fa-7979-4741-a3ff-5769d462d159

---

## ⛔ SEQUENCING GATE — read before starting anything below

**Nothing in this plan starts until:**
1. Phase 0's ratchets are merged (R1/R3/R4 + R6, already landed), and
2. The open PR queue is merged **and verified** — #373, #374, #376, #377, the calendar fix, #392.

**Stated risk, owner-acknowledged:** architecture work is more interesting than finishing #374's post-migration verification, and interesting work displaces necessary work quietly. **The plan is not the priority; the queue is.** Anyone reading this before the queue is clear should close it and go merge something.

---

## "Three phases" — resolved 2026-08-18

The owner recalled this plan as "three phases." Confirmed directly: that's not a
missing structural layer here — it's a loose reference to **three separate
planning sessions** the owner had with the previous PM (the sessions that
produced the standardization work below: cross-panel/model design-system
standards, "well-known standards" for re-implementing hand-rolled mechanisms,
one consistent system app-wide). Those three conversations are what got
written down as the **seven workstreams (A–G)** in this file. There is no
separate three-phase grouping to reconcile against — this file's structure
*is* the record of those sessions. Don't re-derive or re-ask this.

---

## The framing that produced all of it

Six bugs on 2026-08-17 were hand-rolled solutions to problems with standard answers, and each failed the way its category is known to fail:

- calendar event loss = a **cache-coherency race**
- `sales_ledger_daily` silence = a **pipeline with no assertion on what landed**
- 4.3s modal close = **computation in the wrong place**

**None are Meridian problems. They are categories.**

---

## Workstream A — move the forecast off the render path ⭐ HIGHEST RETURN

**Measured:** `weekProjections` = **76,503 ms of 82,221 ms** of render time (**93%**), 189 `forecastDay` calls per run (27 stores × 7 days), 14 runs. Every other instrumented span combined is under 1.6 s. Closing a modal costs up to **4.3 s**.

**Standard:** precompute where the data lives; the client fetches an answer, not inputs.

**The pattern already exists here twice** — `qsr_daily_activity_rollup` is exactly this, and `forecast_snapshots` already exists as a table. Forecasts simply never moved.

**Migration:** a scheduled job writes the week's projections per store; the panel reads them. **`forecastDay` is unchanged** — it becomes the job's engine rather than the render path's. Zero forecasting-logic change is what makes this safe.

**Do this FIRST of the workstreams.** It is the prerequisite for Workstream B not regressing performance (see the interaction warning there), and it converts routing from a performance rescue into a clean UX change.

Tracks: **#386**, **#369**, **#261** (which this re-scopes — the redesign is *not* the gate on the performance fix), **#256**.

---

## Workstream B — event model: scope + recurrence, expand on read

**Owner's idea, and it is the right one.** Currently 2,651 events materialise into **11,163 per-store day-entries** — 27 copies of Thanksgiving.

**Two distinct compressions, not equally valuable here:**

| Compression | Collapses | Fit |
|---|---|---|
| **Scope** (owner's proposal) | 1 event → 27 stores | **Dominant.** This is the 27× factor. |
| **Recurrence** (RFC 5545 / RRULE) | 1 rule → N dates | Good for holidays + retail windows. **Wrong for football fixtures** — a dated list, not a rule. |

**Design:** one event row + scope (`all` / `OK` / `FL` / store list); expand only the visible window; **materialise only exceptions** (the RFC 5545 model). `RETAIL_EVENT_RULES` already proves the recurrence half works — six rules generating Black Friday across years. The mistake was freezing its output.

**Open design questions, decide before code:** per-store overrides (where does an edited Thanksgiving live), and holding rule-based *and* plain dated events cleanly in one schema.

> ⚠️ **INTERACTION WARNING.** Production currently runs `weekProjections` against **733** event entries because the calendar bug discards the rest. Once fixed and normalised it processes ~11,000 — **fifteen times more per run.** The calendar fix can ship a *slower* app. **Workstream A lands first, or the two are measured together.**

Tracks: **#388**.

---

## Workstream C — pipeline contract

**Three silent successes on 2026-08-17 alone:** pmix backfill wrote 0 rows and exited 0; email parse ran green for **30 consecutive runs** while `sales_ledger_daily` produced nothing; `catch{}` swallowed the calendar write. Different scripts, one missing contract.

**One shared runner module every script calls, owning three things:**
1. **Assert on what was written, not that it finished.** Zero rows over a window that should contain data → exit non-zero. #393 does this for pmix; it belongs to all 24.
2. **Per-partition counts in the log** — per store, per date. A 4-of-27 partial becomes visible instead of averaging into a plausible total.
3. **Freshness SLA per source** (`warn_after` / `error_after`), matched to real cadence. #171's insight applied at the pipeline rather than the panel.

**Plus idempotent partition replace** (Workstream C2): today's backfill pushed ~2.6M upserts and took Supabase into Cloudflare 522s, collapsing three sibling workflows and the SQL Editor. Standard is delete-then-insert per date partition, paced. Makes re-runs cheap and multi-year backfills routine.

Tracks: **#263**, **#336**, **#360** (whose real question is still open: *why did 30 green runs write no ledger rows?*).

---

## Workstream D — adopt the design system that already exists

**The finding that reframed the whole request: the design system is built, correct, and used by 1 of 55 modules.**

`src/components/PanelControls.js` exports `DateRangeControl({ presets, value, onChange, allowCustom })`, `DATE_RANGE_PRESETS`, `isValidCustomRange`, `LocationSelector`, `buildLocationHierarchy`, `ActionMenu(s)`.

| Control | Adoption |
|---|---|
| `DateRangeControl` | **0 / 55** |
| `LocationSelector` · `ActionMenus` · `PanelChrome` | **1 / 55** (`eom-dashboard.js`) |
| `ModalShell` | 9 / 55 |

**It is not merely written — it is *right*.** Its own comment records that trailing ranges end on the last **closed business day**, never a naive "yesterday," and it calls the shared `lastClosedBusinessDay()` helper because *"this bug has already recurred five separate times from hand-copies."* **Every panel that rolled its own date logic is a candidate for a bug this component already solved.**

**What got built instead:** 7,163 inline `style:{…}` objects · 3,702 hardcoded px font sizes · 27 bespoke `<input type="date">` · 413 "Last N" label literals · 61 distinct "no data" strings · 8 of 55 panels accept the app's `dateRange` prop.

**Why adoption failed** (matches the literature exactly): the compliant path costs more than the workaround, and **tokens exist in CSS but 7,163 inline JS styles bypass them** — which is the single root of #351, #368, #287, #306.

### How to land it — this part decides whether it works

1. **Make the compliant path cheapest FIRST.** If adopting `DateRangeControl` takes an afternoon per panel, it loses again.
2. **Convert two panels by hand** — one simple, one awkward. The awkward one reveals what the component is missing; **fix the component, not the panel.**
3. **Ratchet the bypass, not the adoption.** Seed at today's counts, only allow them to fall: inline styles, hardcoded sizes, bespoke date inputs. Same mechanism as Phase 0.
4. **Convert opportunistically, never as a sweep.** Any panel already open for a bug gets converted in that PR.
5. **Write the panel contract down** — every panel declares date mode, scope mode, actions, empty-state reason.

### Date-mode rule (the rule matters more than the component)

| Mode | Use when |
|---|---|
| **Presets only** | The window is part of the method; changing it invalidates the comparison (backtests, trailing diagnostics) |
| **Presets + custom** | Default is a preset but an arbitrary window is legitimate (most analysis panels, EOM exports #365) |
| **Period-anchored** | The unit is a business period, not N days (EOM, Projections, monthly targets) |

Today the mode is an accident of who wrote the panel. It should be a stated property of what the panel is for.

---

## Workstream E — routing vs modals

App.js is already a hybrid: three routed views (`command`/`district`/`store`) plus many modal panels. Which one a panel got was an accident of when it was written.

**Measured consequence:** `view==='command' && !anyModalOpen && h(AtAGlance,…)` means **opening any modal unmounts the panel underneath**, so closing remounts from scratch — the 4.3 s `✕` cost. The modal architecture is directly implicated in the worst interaction cost measured.

**The rule (owner-endorsed):**
> **Route** anything that is a *destination* — a panel you go to, work in, and might return to or share.
> **Modal** anything that is an *interruption* — confirm, pick, log, quick-edit.

**Test that settles almost every case: "would I ever want to send someone a link to this?"** Yes → route.

By that rule most current modals are misclassified — DI Compare, Projections, Forecast Accuracy, Date-Range Report are destinations implemented as overlays.

**Biggest win:** shareable URLs. *"Here's Duncan's labor view for last week"* as a link to a supervisor is impossible today. Also: one layout contract (kills the size inconsistency by construction), one scroll behaviour, working back button, mobile, and route-level code splitting which fixes #232 as a side effect.

**Sequence:** after Workstream A and before the broad panel conversion in D — converting 55 panels to a shell that is about to change would be doing it twice.

---

## Workstream F — role-based voice ⭐ THE OWNER'S OWN PRINCIPLE

**Owner, verbatim intent (2026-08-17):** he is more comfortable with complex data than the vast majority of eventual users; the information *"needs to be able to be presented to an average user at a level to which they will actually understand and act upon it."* And explicitly: **preserve the analytical depth — this is BOTH, not a replacement.**

**The distinction to build around:**
> **An analyst needs a number. An operator needs a decision.**
> *"Labor 21.4% vs 22% target"* → a number.
> *"Labor's fine. Your 11–1 is short 1.5 hours — pull someone off close."* → a decision.

Same data, different product. The second requires knowing which gap matters and what to do — **exactly the judgment the owner has and the audience doesn't.** Presenting it as a metric wastes it.

**The trap is "simplify the UI"** — that loses the analysis the owner needs. This is **audience segmentation, not simplification**: same engine, different surfaces.

**The mechanism already exists: RBAC.** Today roles gate *access* but not *presentation*. **Role should determine the voice, not just the visibility.** GM → a sentence and one action. DO/Supervisor → patch view. Owner/Developer → the full instrument. One computation underneath.

**Reframe worth considering: for a GM, SAGE may be the primary interface and dashboards the drill-down.** A paragraph that says what to do beats a panel showing what happened, for someone on a phone mid-shift.

**Evidence the gap is real** (all from 2026-08-17): Count Cycle said *"No complete weekly count on record"* to a store that had counted · DI Compare says *"Not Dialed-In is better — recalibrate"*, an instruction to a modeller · the Signals Scanner surfaces Pearson r, Spearman and Benjamini–Hochberg FDR.

**Standard to adopt:** every surface answers **"so what do I do?" in its first line.** If it can't, it is an analyst surface and should be labelled as one.

**Test it empirically, not by opinion:** hand it to someone and see whether they take the right action without being told.

---

## Workstream G — join the third dimension: **who was on the shift**

**Owner-directed 2026-08-17**, in answer to *"one opportunity, best advice, something we haven't discussed."*

Meridian pulls and stores three dimensions. Two of them are joined everywhere and the third is joined to almost nothing.

| Dimension | Where it lives | Grain | Joined to outcomes? |
|---|---|---|---|
| **Where** | every `(loc, dt)` table | store | ✅ everywhere |
| **When** | `hour_slot` (24 slots), daypart — **32 files**, a whole DAR Analysis panel | hour | ✅ everywhere |
| **Who** | `employee_skills`, `roster_role_counts`, LifeLenz shifts, Shift Manager Summary | person / shift | ❌ **almost nowhere** |

**Measured, 2026-08-17 — the capability is built and unused, not missing:**

- `rollupShiftsByEmployee()` — `src/engine/lifelenz-shift-jobs.js:124`. Maps shifts to people. **Its only caller is its own test** (`src/__tests__/lifelenz-shift-jobs.test.js:81`).
- `SHIFT_ATTRIBUTABLE_ROLES = ['AM','DM','SM']` — `src/engine/review-engine.js:14`, with a comment naming these as the roles whose results attribute to their own shifts. Referenced in **one panel**, `performance-reviews.js` — a twice-a-year artifact.

**So nothing on the daily operating surface knows who was standing there.**

### Why it matters

Every panel answers *what happened at a restaurant*. A restaurant does not run a shift; a person does. "3708's drive-thru is slow" is not coachable — nobody can act on a building. "3708's DT is fine at breakfast and comes apart 5–8pm, Tuesdays and Thursdays" is a conversation with a named person about a named shift.

This is **Workstream F one level deeper**: F fixes the *wording* (say the decision, not just the number); G fixes the *dimension*. A number attached to a building is rarely a decision, because a building cannot change.

It is also the one thing the incumbents structurally cannot do — QSRSoft owns the outcome data, LifeLenz owns the people data, and **neither owns both.** Meridian has both in one database and currently joins them nowhere.

### ⛔ Constraints — these shape the design, they are not footnotes

1. **Attribute to the SHIFT, not the person — at least first.** Daypart × day-of-week × store captures most of the value with none of the HR exposure. `scripts/qsrsoft-employee-roster-pull.mjs:10` states *"No individual-employee data is stored anywhere"* — that was a considered choice; **keep it.** Surface the pattern, let the human take the last step.
2. **Small n.** A shift manager works ~20 shifts a month. Any per-person metric on that base is mostly noise. Apply the discipline already in Scanner — effect-size floor + FDR — not a naked ranking.
3. **The confound is real.** Good managers get assigned to hard shifts. A naive ranking punishes exactly the people worth keeping.

**Build it as pattern surfacing, never as scoring.** That is also the version that survives being seen by the people it describes.

### The probe (cheap screen, run before committing to the workstream)

**PROBE G-1 is a screen, not the answer.** It measures whether *within-store* variation exists at all — necessary for a person to have anything to explain, not sufficient to prove people cause it. If a store performs identically across its own week, G is dead and costs nothing further.

Full SQL: `memory/probe-g1-shift-dimension.sql`. Verdict rule:

- `median_within_store_spread` **≥** `between_store_spread` → the dimension is real; build G.
- Within **< ~half** of between → stores are uniformly good or bad across their own week; **drop G.**

### ✅ PROBE G-1 RESULT — owner-run 2026-08-18. Verdict: **GO, with one qualifier.**

| | |
|---|---|
| stores | **27** (all of them) |
| avg cells per store | **35.0** — every 5 dayparts × 7 days cleared the 200-car floor |
| median sec per car | **179.7s** — sanity gate PASSED (expected 150–300) |
| median WITHIN-store spread | **86.7s** |
| BETWEEN-store spread | **95.3s** |
| ratio | **0.91** |

Kill threshold was "within < half of between." It returned **91%**. A single
restaurant's own week varies nearly as much as the whole district varies
store-to-store, on full data, in all 27 stores.

**Side benefit: this independently confirms the milliseconds fix.** 179.7s is
right for DT total experience; the microseconds reading `constants.js` used to
document would have produced 0.18s.

### ⚠️ WHAT THIS DOES NOT SHOW — read before building anything

The probe conflates two effects and only one is actionable:

1. **Structural daypart difference** — dinner is slower than breakfast at *every*
   store. Real, not coachable.
2. **Execution difference** — *this* store's Tuesday dinner is slow *for a
   Tuesday dinner*. The coachable one.

Some share of the 86.7s is category 1. **Treating the whole 86.7s as opportunity
is the overclaim to avoid.** The discriminating follow-up (PROBE G-2, in
`probe-g1-shift-dimension.sql`) normalizes each cell against the district median
for the SAME daypart+dow and measures the residual spread:

- `median_execution_spread` **> ~40s** → variance is execution; G has a real target.
- collapses toward **0** → the 86.7s was structural; G shrinks to a much smaller idea.

**G stays gated on G-2, not on G-1.** G-1 only established that there is
something to decompose.

### ✅ PROBE G-2 RESULT — owner-run 2026-08-18. **Workstream G CONFIRMED.**

`median_execution_spread` = **53.4s** across **27 stores**. Threshold was ~40s.

| | |
|---|---|
| raw within-store spread (G-1) | 86.7s |
| **after removing daypart+dow structure (G-2)** | **53.4s** |
| structural component removed | 33.3s |
| surviving share | **62%** |
| vs. the whole between-store spread (95.3s) | **56%** |

Comparing a restaurant's own shift-slots against how that SAME slot runs
district-wide, its worst slot is 53 seconds per car worse than its best — after
subtracting everything every store shares. **One restaurant's internal variance
is more than half the entire fastest-to-slowest store spread.**

### ⚠️ 53.4s is a FLOOR, not the total — owner correction, 2026-08-18

I discarded the 33.3s structural component on the assumption that dayparts differ
because dayparts differ ("dinner is slower than breakfast everywhere — real, not
coachable"). **The owner refuted that:** average check does run higher at dinner,
but **the VLH guide is built to staff for it.** If speed still degrades at dinner,
that is staffing not tracking the guide, or a guide wrong for that store — both
actionable. "Structural" was a category asserted from outside the restaurant.

**The design consequence matters more than the correction.** G-2 normalizes each
cell against the district median for the same daypart — so if all 27 stores
under-staff to guide at dinner, that district-wide coachable problem normalizes
to ZERO residual and the query reports "structural." Same class as averaging
averages: erasing a real effect by assuming it was structure. G-2 stayed useful
only because it is the *conservative* cut; it cannot see a district-common
failure, by construction.

**The better normalizer is already on the same row.** `qsr_daily_activity` carries
`total_needed_hours`, `total_scheduled_hours` and `actual_punched_hours` at the
same `hour_slot` grain as the speed data:

- scheduled vs needed → did the manager **schedule** to guide
- punched vs scheduled → did the shift **execute** the schedule
- punched vs needed → net staffing vs guide

⚠️ **Blocked on one known ambiguity:** CLAUDE.md flags `total_needed_hours` as
*"either the algorithmic recommendation for projected volume, or the actual hours
the manager scheduled — ambiguous without further API investigation."* If it is
the VLH guide, this entire line runs off data already pulled nightly. If not, the
denominator is wrong. **Owner is sending the VLH guides to settle it.**

### ✅ PROBE G-3 RESULT — owner-run 2026-08-18. Both explanations dead; a new finding.

| daypart | sec/car | punched/guide | sched/guide | punched/sched | cars |
|---|---|---|---|---|---|
| Breakfast | **154.3** | **0.928** | 1.056 | 0.879 | 620,752 |
| Lunch | 202.9 | 0.922 | 1.075 | 0.858 | 369,709 |
| Afternoon | 183.8 | 1.171 | 1.376 | 0.851 | 267,769 |
| Dinner | 204.3 | 1.085 | 1.342 | **0.808** | 248,625 |
| Late | **246.5** | **1.207** | 1.292 | 0.935 | 204,292 |

**Speed runs INVERSE to staffing.** Best-staffed daypart is slowest; leanest is
fastest. What speed tracks is **volume** — Breakfast runs 3× Late's cars and is
92s/car faster. Flow, not headcount.

So **both** prior explanations are refuted: dinner is not slow from check size
(PM's "structural" claim) and not from under-staffing to guide (it sits at 1.085
OF guide). The owner's mechanism was right — the guide does compensate — but the
resulting prediction did not hold either.

### ⭐ The finding neither query was looking for

**`punched_vs_scheduled` < 1.0 in EVERY daypart** (0.879 / 0.858 / 0.851 /
**0.808** / 0.935). Across ~1.7M cars, stores punch **12–19% fewer hours than
they scheduled**, worst at dinner. Consistent pattern: **schedule above guide
(1.056→1.376) → lose 15–19% at the punch → land at or below guide.** The two
highest-volume dayparts (Breakfast, Lunch) end up BELOW guide, at 0.928/0.922.

**NOT yet called a defect.** Cutting early when the rush does not materialise is
correct management. Punched < scheduled may be good behaviour, not a gap.

### ⚠️ Two methodological cautions on the table above

1. **Ecological correlation.** These are daypart aggregates. The inverse
   staffing/speed relationship holds ACROSS dayparts and says nothing about what
   happens WITHIN one. Inferring within-daypart causation from it is the classic
   fallacy. G-4 fixes this by holding daypart and volume constant.
2. `sec_per_car` and staffing ratios are ratio-of-sums throughout; the 24-slot
   completeness guard is applied. No averaging of averages.

### 🔓 The `total_needed_hours` ambiguity is now mostly resolved — WITHOUT the guides

`scheduled_vs_guide` runs **1.056–1.376**, systematically ≠ 1.0, so
`total_needed_hours` is demonstrably **not** a copy of `total_scheduled_hours` —
the two columns diverge by daypart in a stable way. That is consistent with it
being the real algorithmic guide, which is what CLAUDE.md left open. Not proof;
the owner's VLH guides now **confirm** rather than **decide**.

### G-4 — the decisive cut (query in `probe-g1-shift-dimension.sql`)

Splits store-days by daypart × (sales met/missed projection) × (under/at/over
guide), then medians `sec_per_car`. Read the **sales MET/BEAT** rows: if
`under guide` is materially slower than `at guide` inside the same daypart, then
understaffing a shift that earned its volume is real and coachable. If they
match, staffing is not the lever and speed is about flow and process.
Matched pair confirmed in the pull script: `prod_sales_scrubbed` (actual) ↔
`proj_prod_sales_scrubbed` (projected).

### ✅ PROBE G-4 RESULT — owner-run 2026-08-18. Night-shift hypothesis SUPPORTED.

Daypart x volume x staffing, median sec/car. **sales MET/BEAT rows only** (shifts
that earned their volume):

| daypart | under guide | at guide | over guide | staffing buys |
|---|---|---|---|---|
| Breakfast | 162.8 | 153.6 | 143.4 | **19.4s** |
| Lunch | 204.7 | 198.2 | 194.6 | 10.1s |
| Afternoon | 204.7 | 205.1 | 188.0 | 16.7s |
| Dinner | 224.4 | 230.6 ⚠️n=68 | 202.9 | 21.5s |
| **Late** | 243.5 | 246.3 | 238.9 | **4.6s** |

**1. The ecological illusion reversed, as predicted.** ACROSS dayparts (G-3) more
staff looked slower. WITHIN a daypart, volume held constant, more staff is faster
in all five. The G-3 caution was load-bearing — building on that aggregate would
have inverted the conclusion.

**2. ⭐ Late is the daypart where staffing barely matters.** Over-guide buys
10–21s everywhere else and **4.6s** at night — a quarter of the effect. And
**1,064 of 1,488** busy Late store-days are ALREADY over guide. Bodies are being
thrown at it and are not working: a **capability constraint, not a headcount
one.** This is the owner's hypothesis (least experienced managers, least
oversight, universal industry issue) and it is what the data shows.

**3. Corroborating:** Late degrades far more steeply under volume than anything
else. Busy-vs-soft costs Breakfast 18.9s; it costs Late **42.3s**. When cars
arrive at night the operation comes apart faster than at any other hour.

### ⭐ Unlooked-for finding: hours are in the wrong dayparts

| | busy days UNDER guide | soft days OVER guide |
|---|---|---|
| Breakfast | **826** | — |
| Afternoon | — | **1,324** |
| Dinner | — | **1,245** |

**Breakfast runs lean exactly when busy; Afternoon/Dinner run fat exactly when
soft.** Breakfast is the highest-volume daypart (620,752 cars, 3x Late) and 826
busy store-days sit under guide at ~19s/car, while 2,569 soft afternoon/dinner
store-days carry hours above guide. **An allocation problem, not a coaching one —
and it is the same hours either way.**

### ⚠️ Two caveats before anyone acts on these numbers

1. **The buckets contain different stores.** A chronically-under-guide restaurant
   may simply be a slow restaurant, so part of the 19.4s is store identity rather
   than staffing. **G-5 must compare each store against ITSELF** on its own under-
   vs over-guide days. Do not put the 19.4s in front of a GM before that runs.
2. **Thin cells:** Dinner at-guide n=68, Afternoon at-guide n=92. Dinner's
   at-guide reading slower than its under-guide (230.6 vs 224.4) is small-sample
   noise, not a real inversion. Do not interpret it.

### 📌 Side opportunity: TPPH should be auto-sourced

TPPH currently reaches the app only via manual upload (`ctrl.tpph`/`lab.tpph`,
`graded-visits.js:362`). It is derivable from DAR as
`transactions / actual_punched_hours` at **hour_slot** grain — finer than the
manual version. Squarely the standing rule: derive from already-pulled atoms
rather than add a manual upload, and keep `MANUAL_ONLY_METRICS` empty.

### 🛑 CORRECTION 2026-08-18 — the G-probe daypart boundaries were INVENTED and 3 of 5 are wrong

Owner supplied the **2022 VLH Workbooks** (Standard + High Productivity). They
define the dayparts the guide itself is built on:

| daypart | PM used | **VLH guide (authoritative)** |
|---|---|---|
| Breakfast | 4am–11am | **5am–11am** |
| Lunch | 11am–2pm | 11am–2pm ✓ |
| Afternoon | 2pm–5pm | 2pm–5pm ✓ |
| Dinner | 5pm–**8pm** | **5pm–11pm** |
| Late Night | **8pm**–4am | **11pm–5am** |

**What went wrong:** the boundaries were built from general knowledge of a
McDonald's day instead of the authoritative source, which the owner held all
along. The guides were requested only to settle the `total_needed_hours` column
ambiguity; they turned out to redefine the axis every G-3/G-4 conclusion groups
on. Same failure as the `dt_untilserve` microseconds/milliseconds defect — a
plausible assumption used where a source of truth existed.

**Blast radius:** the "Late Night" bucket carried **8–11pm**, which the guide
calls Dinner — three hours of real dinner volume diluting the night bucket.
"Dinner" was only the first half of dinner. "Breakfast" absorbed the 4–5am hour
the guide calls Late Night.

**Not corrupt, mislabelled.** `Σpunched / Σneeded` over the same hour set on both
sides is arithmetically valid whatever the buckets. But every conclusion attached
to a daypart NAME needs re-running. Expectation: the night-shift finding
**strengthens** once 8–11pm dinner volume is stripped out.

### ✅ CORRECTED daypart mapping — use this, do not re-derive

`hour_slot` is the END of the block and runs `05:00`→`28:00` across the 4am
business day, so `'05:00'` = 4–5am — Late Night sitting at the START of the
business day while the rest of Late Night sits at the end. The `else` catches both.

```sql
case
  when substring(a.hour_slot,1,2)::int between  6 and 11 then '1 Breakfast'    -- 5a-11a
  when substring(a.hour_slot,1,2)::int between 12 and 14 then '2 Lunch'        -- 11a-2p
  when substring(a.hour_slot,1,2)::int between 15 and 17 then '3 Afternoon'    -- 2p-5p
  when substring(a.hour_slot,1,2)::int between 18 and 23 then '4 Dinner'       -- 5p-11p
  else                                                        '5 Late Night'  -- 11p-5a (24..28 + 05)
end
```

6 + 3 + 3 + 6 + 6 = **24 slots**, reconciling exactly with the DAR's 24.

### ⭐ The guide independently supports the night-shift hypothesis

**IPO by daypart** (identical in both workbooks): Breakfast 3.294 · Lunch 4.391 ·
Afternoon 4.279 · **Dinner 4.854** · **Late Night 3.321**.

The guide **already expects** night productivity ~30% below dinner and staffs for
it — which is exactly the owner's "the VLH guide is designed to compensate,"
stated by the guide in its own numbers. **Night still finishes last on speed with
that allowance built in.** That is the strongest support the capability
hypothesis has had, not a weakening of it.

### ⚠️ There is no single VLH guide — 48 configurations × 2 workbooks

Guides are per **restaurant configuration**: Drive Thru (Side-by-Side/Tandem ·
Single Lane 2 Booth · Single Lane 1 Booth · No Drive Thru) × In-Store (Self Serve
· Crew Pour) × Kitchen (Fryer Same Side · Fryer Opposite · OPL · COPL) × AOT
(Yes/No) = 48 pages, and **two** workbooks (Standard vs High Productivity). Each
restaurant maps to one page with its own labor step-tables.

**We do not currently hold each store's configuration anywhere.** Any per-store
guide analysis needs it first. Guide tables are guest-count step functions
(e.g. Drive Thru Breakfast: 1 crew for 0–9 guests, 2 for 10–43, 3 for 44–65…).

### ✅ PROBE G-5 (Late TPPH by store) — owner-run 2026-08-18. **Capability, not floor.**

The open question was whether low night TPPH is a **staffing floor** (mechanically lower
at low volume — you cannot run below a minimum crew) or **capability**. The discriminator
is whether stores at comparable volume differ. They do, enormously.

**The killer pair — near-identical late volume, opposite everything else:**

| | cars | TPPH | punched hrs | vs guide | sec/car |
|---|---:|---:|---:|---:|---:|
| **Tishomingo-Main & Refuge** (43380) | 4,603 | **3.93** | **1,392** | 0.939 | **141.7** |
| **Elgin** (33222) | 4,752 | **2.49** | **2,737** | **1.693** | 205.8 |

Same number of cars. Elgin uses **twice the hours**, is **58% less productive per hour**,
runs **69% above guide**, and is **64 seconds slower per car**. Volume cannot explain any
of it. **The floor hypothesis is dead; this is capability.**

District TPPH spread: **2.49 → 4.46**, a **1.79×** range across 27 stores.

**TPPH and speed are DIFFERENT axes — do not collapse them.**

- Chipley-St Rd 77 (6178): TPPH **3.86** (above median) but **405.4s** — slowest store.
- Tishomingo (43380): TPPH **3.93** and **141.7s** — fastest store.

A store can be efficient with labour and still slow to the customer, and vice versa. Any
panel must show both; ranking on either alone will mislead.

**Speed outliers worth naming** (vs 141.7s best): Chipley 405.4 · DeFuniak Springs 382.9 ·
Bonifay 337.8 · Freeport 329.2 · OKC-I240/Sooner 305.8. That is **2.1–2.9×** the best store.
Note all five are FL except OKC — worth checking whether configuration or market explains it
before assuming execution.

**Illustrative, NOT a promise:** Elgin does ~6,815 late transactions in 2,737 hrs. At
Tishomingo's 3.93 TPPH that is ~1,734 hrs — a ~1,000-hour difference over 90 days at one
store, one daypart. Treat as an order-of-magnitude sketch only; see caveats.

⚠️ **Ran on the OLD Late boundary** (8pm–4am, including 3 hours of real Dinner). Relative
store-to-store comparison is unaffected — every store used the same bucket — but the
absolute figures and the "late night" label are wrong. **Re-run on corrected boundaries.**

⚠️ TPPH here is total `transactions / actual_punched_hours` — it mixes drive-thru and
in-store, while `sec_per_car` is drive-thru only. Not wrong, but they are not the same
denominator.

### ✅ CORRECTION — store configuration DOES exist. PM was wrong.

Claimed twice that nothing holds each store's VLH configuration. It does:
**`store_vlh_config` (Supabase), edited in Data Manager → VLH Settings**
(`src/views/analytics.js:1983-2075`). Per store: `aot`, `dt_type`, `in_store`, `kitchen`,
`vlh_guide` (standard | high-productivity), `coffee`. The code comment states the purpose
outright — *"used to select correct VLH guide page"* — i.e. it exists for precisely the
job it was declared missing for.

**Third time in one session** an affordance was declared absent when it was present
(after `businessDate()` and the `dt_untilserve` unit). CLAUDE.md's *"check whether an
affordance already exists before adding one"* applies to **claims about the codebase**, not
just to new code. One grep would have prevented each.

### 📋 ENGINEER TASK — TPPH from DAR (owner-approved 2026-08-18)

TPPH currently reaches the app **only** via manual upload (`ctrl.tpph` / `lab.tpph`,
`graded-visits.js:362`). Derive it instead from `qsr_daily_activity`:

    TPPH = sum(transactions) / sum(actual_punched_hours)     -- ratio of sums, per hour_slot

- **Finer than the manual version** — hour_slot grain rather than daily.
- **Auto-first**, removing a manual dependency; keeps `MANUAL_ONLY_METRICS` empty per the
  standing rule, and prefers deriving from already-pulled atoms over a new upload.
- Add to `METRIC_SOURCES` (`src/engine/metric-source.js`) so every panel picks it up in one
  line; keep the manual upload as last-resort fill, never as primary.
- Use the **corrected** daypart boundaries for any daypart cut.
- Watch the denominator: `transactions` is all channels while `dt_trans_cnt` is drive-thru
  only. Pick one deliberately and label it.

### ✅ PROBE G-3 RE-RUN on CORRECTED boundaries — 2026-08-18. Prediction held; one walk-back.

| daypart | sec/car | TPPH | punched/guide | sched/guide | punched/sched | cars | punched hrs | needed hrs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Breakfast | 154.3 | 6.43 | 0.915 | 1.046 | 0.875 | 620,325 | 134,684 | 147,174 |
| Lunch | 202.9 | 5.90 | 0.922 | 1.075 | 0.858 | 369,709 | 94,871 | 102,866 |
| Afternoon | 183.8 | 4.83 | 1.171 | 1.376 | 0.851 | 267,769 | 80,002 | 68,298 |
| Dinner | 220.8 | 4.56 | 1.091 | 1.306 | 0.836 | 432,263 | 134,217 | 122,971 |
| Late Night | **276.2** | **1.05** | **1.590** | 1.426 | **1.115** | **21,081** | 26,280 | 16,529 |

**The prediction held.** Late Night sharpened on every axis: cars 204,292 → **21,081**
(≈**90% of the old bucket was actually Dinner**), sec/car 246.5 → 276.2, punched-vs-guide
1.207 → 1.590, and punched-vs-scheduled 0.935 → **1.115** — the only daypart above 1.0.

### ⚠️ WALK-BACK — "night shift is a capability problem" does not survive the correction

TPPH at Late Night is **1.05** against 6.43 at breakfast. A 6× gap is too extreme to be a
performance story. Work it out: 21,081 cars over ~2,430 store-days ≈ **8.7 cars per store
per night**; 26,280 hrs ≈ **10.8 hrs per store-night** ≈ 2 people over 6 hours.
**Two people, nine cars, six hours.**

That crew is not failing to serve customers — **it is doing overnight work that is not
transactional** (close, deep clean, stock, receive, breakfast prep). **TPPH is the wrong
lens for that shift.** `punched_vs_scheduled` = 1.115 fits: close-and-clean overruns, it
does not get cut early like every other daypart.

**What survives is the GUIDE gap, not the productivity gap:** 26,280 punched vs 16,529
needed = **9,751 excess hours (59% over)**, against a guide that already prices
non-transactional overnight work.

⚠️ **The Elgin-vs-Tishomingo G-5 comparison used the OLD bucket (8pm–4am), so it was
largely an EVENING comparison, not an overnight one. Re-run before trusting it.**

### ✅ PROBE G-5 RE-RUN on CORRECTED boundaries — 2026-08-18 (dispatch20 §4). **The "killer pair" is void, not just rescaled.**

Pulled directly from Supabase via the anon-key REST API (not blocked by RLS for
`qsr_daily_activity`, confirmed by this session's Ponce de Leon verification) — the same
6 Late-Night `hour_slot`s (`05:00`, `24:00`–`28:00`) the corrected `daypartOf()` in
`src/engine/labor-standard.js` produces, 90 days (`dt >= 2026-05-20`), 24-slot-equivalent
completeness guard (only `(loc,dt)` with all 6 Late-Night slots kept — 2,457/2,457 kept,
zero dropped). District totals reconcile with the already-recorded G-3 corrected rerun:
cars 21,203 vs 21,081, punched hrs 26,532 vs 26,280, needed hrs 16,696 vs 16,529, TPPH 1.052
vs 1.05, sec/car 275.8 vs 276.2 — small gap is just a slightly different 90-day window,
methodology confirmed consistent.

**First finding: classify open-vs-closed before reading ANY ratio (Query 5's own rule) — and
the two classification methods almost, but do not exactly, agree; checked, not assumed.**
Applying `pct_slots_with_cars` (threshold 5%, data-driven — did a car actually show up in a
Late-Night slot, last 90 days) to all 27 stores finds 9 closed-overnight stores. That count
matches trap #4's "only 9 fully-closed stores" — but checking identity, not just count
(CLAUDE.md: "diff the two computations before debugging either"), the two 9-store sets are
**8/9 the same, not identical**: `store_labor_config`'s schedule-based table above (lines
277–287, built from configured open/close times) lists **Ardmore-Cooper/12th** as fully
closed; the data-driven classifier instead finds **Freeport** closed and Ardmore-Cooper/12th
genuinely open (20.9% of Late-Night slots have a car, 814 cars / 91 nights — not a trickle).
Two real possibilities, not yet distinguished: the labor config is stale for Ardmore-Cooper
(scheduled hours no longer match actual operation), or Freeport's DT genuinely runs later
than its configured close time suggests. Either way, **schedule config and actual DT activity
are two different signals that can disagree per-store**, and a real panel should show both
rather than silently picking one. Left as a named follow-up, not resolved here.

**The "killer pair" doesn't survive reclassification.** Under the OLD boundary, Tishomingo
(43380) and Elgin (33222) looked like a matched pair at real overnight volume with opposite
capability. Under the CORRECTED boundary, both are **closed overnight** —
Tishomingo at 0.5% of Late-Night slots with any car (3 cars / 91 nights), Elgin at 2.9%
(47 cars / 91 nights). Query 5's own warning fires exactly as designed: on a closed store
the guide-ratio "explodes" (or, per Tishomingo's case, reads deceptively clean) and only
`gapHrs` (punched − needed) is meaningful. Read that way:

| store | loc | pct LN slots w/ cars | cars/91 nights | punched hrs | needed hrs | gapHrs |
|---|---|---:|---:|---:|---:|---:|
| Sulphur | 32525 | 0.0% | 0 | 672.1 | 168.0 | **+504.1** |
| Freeport | 38609 | 2.9% | 26 | 767.5 | 303.2 | **+464.2** |
| Holdenville | 35064 | 0.4% | 3 | 601.0 | 188.0 | **+413.0** |
| Elgin | 33222 | 2.9% | 47 | 853.4 | 581.5 | **+271.9** |
| Defuniak Springs | 6838 | 1.8% | 26 | 713.7 | 548.0 | +165.7 |
| Lindsay-Wal-Mart | 18213 | 0.2% | 1 | 98.1 | 80.5 | +17.6 |
| Tishomingo-Main & Refuge | 43380 | 0.5% | 3 | 287.3 | 286.0 | +1.3 |
| Seminole-Milt Phillips | 10915 | 0.4% | 3 | 686.0 | 685.0 | +1.0 |
| Marietta | 33109 | 0.0% | 0 | 427.9 | 479.0 | −51.1 |

Tishomingo isn't "3.93 TPPH, best in district" — it's a closed store running almost exactly
to the guide's non-transactional overnight allowance (gap +1.3 hrs). Elgin isn't "58% less
productive" — it's a closed store running **272 excess hours** over 90 days, the same shape
of finding as Sulphur/Freeport/Holdenville above it. **The old TPPH-based "capability"
framing was comparing two closed stores on a ratio that Query 5 itself warns is meaningless
for a closed store; it never should have been read as a productivity comparison.** This is
exactly the class of question `overnightExcessByStore()` in the new labor-standard engine
(#409) is built to answer properly — against the owner's 3-4hr close-down / 3hr pre-open
standard, not the VLH guide ratio, which is what it was flagged as unable to grade in the
first place.

**Second finding: among the 18 genuinely-open-overnight stores, TPPH and speed re-rank
cleanly** (ratio-of-sums, corrected boundary, sorted by TPPH):

| store | loc | pct LN slots w/ cars | cars | TPPH | sec/car | vs guide |
|---|---|---:|---:|---:|---:|---:|
| Ponce de Leon-Hwy 81/I-10 | 43701 | 74.2% | 1,228 | 2.74 | 268 | 1.074 (24hr, see §3b) |
| Durant-US Hwy 70/22 | 5985 | 22.0% | 2,367 | 1.96 | 242 | 2.365 |
| Ada-Country Club | 6972 | 21.8% | 2,542 | 1.86 | 257 | 2.878 |
| Duncan-Hwy 81 | 29760 | 16.8% | 2,048 | 1.75 | 183 | 1.100 |
| Chickasha-So 4th | 5183 | 41.8% | 4,075 | 1.60 | 301 | 1.398 |
| Cottondale | 35242 | 16.3% | 641 | 1.48 | 275 | 0.873 |
| Mossy Head | 37566 | 15.4% | 668 | 1.35 | 334 | 1.216 |
| OKC-I240/Sooner | 20475 | 22.3% | 1,412 | 1.16 | 367 | 1.865 |
| Purcell | 11657 | 19.6% | 1,282 | 1.08 | 343 | 6.165 (needed-hrs looks thin — flag, don't trust in isolation) |
| Madill-Hwy 70 | 13113 | 16.3% | 1,138 | 1.03 | 260 | 2.858 |
| Ardmore-Cooper/12th | 24471 | 20.9% | 814 | 0.93 | 308 | 2.289 |
| Atoka-Mississippi | 10422 | 16.7% | 1,043 | 0.92 | 269 | 1.441 |
| Harrah | 34222 | 5.1% | 286 | 0.84 | 193 | 1.011 |
| Ardmore-Broadway | 3708 | 5.5% | 295 | 0.58 | 269 | 2.760 |
| Tecumseh | 33704 | 5.5% | 437 | 0.50 | 219 | 1.595 |
| Pauls Valley-Ballard Rd | 31357 | 5.1% | 389 | 0.46 | 216 | 1.533 |
| Bonifay | 10034 | 5.7% | 206 | 0.33 | 293 | 2.245 |
| Chipley-St Rd 77 | 6178 | 5.5% | 223 | 0.33 | **461** | 1.003 |

Chipley remains the slowest overnight-open store (461s/car, previously 405.4s under the old
mixed Dinner+Late bucket) — that finding survives the correction, it just gets a cleaner
number. Ponce de Leon leads TPPH, expected since it's the district's only true 24-hour store
(see §3b's `overnightExcessByStore` — correctly routes it to `{na:true}` rather than
grading it against a close-down standard that doesn't apply to a store that never closes).

**Takeaway for any future panel:** classify open/closed FIRST (Query 5's rule, now also
`overnightOpenness()` in code), then apply TPPH/speed ranking only within the open group and
`gapHrs`-vs-standard only within the closed group. Mixing the two groups on one ratio is
what produced the invalid "killer pair" story in the first place.

### ⭐ The allocation finding is now PROVEN — full write-up in its own file

Deficit **−20,485 hrs** (Breakfast −12,490, Lunch −7,995). Surplus **+32,701 hrs**
(Afternoon +11,704, Dinner +11,246, Late +9,751). **Surplus covers deficit 1.6×**, net
**+12,216 hrs over guide** district-wide (470,054 punched vs 457,838 needed).

⚠️ Breakfast's −12,490 is the raw ratio-of-sums figure. Dispatch20 §4 re-measured the
pre-open-hours-mislabelled-as-Breakfast effect at **1,716 hrs** (not the ~1,550 estimate) —
**true Breakfast service deficit ≈ −14,207**. See `analysis-labor-allocation-2026-08-18.md`'s
"RE-MEASURED" section. Quote 14,207, not 12,490, going forward.

**AM and PM are different problems with different owners:** breakfast is scheduled to
guide (1.046) and loses **12.5% at the punch** — an EXECUTION problem; afternoon/dinner are
**padded 30–38% above guide when written** — a SCHEDULING problem.

**Actions, caveats and all four queries:**
[analysis-labor-allocation-2026-08-18.md](analysis-labor-allocation-2026-08-18.md) ·
[analysis-labor-allocation-queries.sql](analysis-labor-allocation-queries.sql)

### Next, in order

1. **G-3 (guide adherence)** — daypart × sec_per_car × punched/scheduled/needed
   ratios. Tests the owner's claim directly and reclaims the 33.3s if he is right.
   Gated on the `total_needed_hours` ambiguity above.
2. **G-2b** — the 25 worst slot-vs-peers gaps, in `probe-g1-shift-dimension.sql`.
   The artifact a DO uses: names a store, a daypart and a day against what every
   other store does in that same slot.

### Findings from writing the probe (already banked, independent of the verdict)

- **`qsr_daily_activity` carries hourly speed-of-service for every station** — `dt_untilserve`/`dt_trans_cnt`, `fc_*`, `mfy1/2_*`, `bev_*` — **and `actual_punched_hours` at the same `hour_slot` grain.** Outcome and labor are already on one row, at one key. The join G needs does not require a new pull.
- **Unit defect found and fixed (same commit).** `constants.js:521-529` documented 8 DT timing fields as **microseconds** ("divide by 1,000,000"). Every shipped consumer divides by **1,000** — `graded-visits.js:47` `secOf`, and six sites in `dt-speedofservice.js` including that panel's own tooltip. Milliseconds is correct (µs would put DT total time at 0.18s). The field-definition table is **user-visible**, and it is exactly what a person writing a new query would trust — this probe nearly shipped 1000× wrong off it.

---

## What NOT to do

Optimisation is a candidate list, not a mandate. These cost more than they return:

- **No framework migration.** Next.js / RSC / SSR solve problems a single-operator internal tool doesn't have.
- **No Redux or global client store.** Nearly all state here is *server* state; a query layer covers it.
- **Don't split the pulls into services.** 24 scripts sharing one runner is right.
- **Don't replace the click-trace.** Homegrown, and it produced the single most actionable measurement of the week. **Keep it.**
- **Don't chase TypeScript.** Real benefits, but this week's recurring defects were data-flow and lifecycle bugs types would not have caught. The ratchets address the actual classes far cheaper.

---

## Advisory notes to the owner — recorded because they are easy to lose

Context: 33 years in the industry, every position inside a McDonald's environment short of ownership, DO experience plus maintenance programs, strong record growing sales and guest counts. Building solo, partly by design.

1. **The asset is not the app.** Every competitor renders dashboards. Nobody else has 33 years of knowing which numbers mean something, **encoded as executable rules** — `COVER_FRAC = 0.75` backed by a measured bimodal distribution, the Topic 6 catch, the 4am business day, punched-vs-crew labor. The panels are a delivery mechanism. Protect and invest accordingly.

2. **Nobody is measuring whether any of it changed a store's performance.** Everything is validated for *correctness of measurement*. The loop — insight → action → outcome vs counterfactual — is not closed. This is the question BI products live or die on and it is almost always unmeasured. Best positioned to close it because he controls the operation *and* the instrument.

3. **The bus factor is him, and the mitigation is not the code.** Memory files are organised around **projects**, not **decisions**. A successor could read the code and never learn *why* 0.75, why punched labor, why Wednesday weeks — the things that look arbitrary and get "cleaned up." **A decision log is a different artifact.** Ten one-page entries (decided / rejected / evidence / what would change our mind) preserve more than a hundred project notes.

4. **Solo is defensible; name the trade.** The corrections register is full of the PM's errors and the owner's corrections. **Who corrects his premises?** The PM is agreeable by construction — a good check on arithmetic and consistency, a poor substitute for a peer with skin in the game. **The strongest argument for a second operator is epistemics, not revenue.** Before more multi-tenant work: is that operator real and committed, or aspirational? If aspirational, defer multi-tenancy hard.

5. **The vacation test.** 27 restaurants, 24 scheduled pulls, expiring tokens, one maintainer. **Can he be unreachable for two weeks?** Today a token expiry and a Cloudflare wobble both needed him. Raises the priority of **#312** (runtime token minting) for sustainability reasons, not engineering ones.

6. **What happens when a wrong number reaches someone else.** Four confidently-displayed wrong numbers found on 2026-08-17. In his hands, recoverable. In a GM's, a wrong labor target is a real decision about a real person's hours. **Before a second user: state which numbers are load-bearing, which are directional, and how the app itself says which is which.**

7. **The analytical output may be worth more than the software.** The McValue brief is a document no other operator in that room can produce. Applied to growth applications, lease conversations and FBP forums, that may be the highest-value thing the project generates. **Treat it as a strategy, not a byproduct.**

8. **The curse of knowledge is structural, not personal.** He cannot un-know the 4am business day, so every judgment he makes about "is this clear?" is made by someone who cannot experience the confusion. **The only reliable mitigation is empirical: watch a GM use it and don't help.** Not "is this clear?" — watch where they stop, scroll past, misread, never click. That single hour beats any amount of design theory and is the one validation unavailable from data or from the PM.

---

## Recommended order

1. **Finish Phase 0 + the open queue.** (Gate — see top.)
2. **Workstream A** — forecast off the render path.
3. **Workstream B** — event normalisation (now safe).
4. **Workstreams C + C2** — pipeline contract; independent of the front end, can run in parallel.
5. **Workstream E** — routing rule, before the broad panel conversion.
6. **Workstream D** — design-system adoption, opportunistic + ratcheted.
7. **Workstream F** — role-based voice, once the shell is stable.
8. **Workstream G** — shift dimension. **Gated on PROBE G-1**, which can run any time (it is one read-only query and depends on nothing above).

The query-layer item from the standards artifact (server state ≠ client state) is deliberately last and starts only when something above forces the question — **never as a rewrite.**
