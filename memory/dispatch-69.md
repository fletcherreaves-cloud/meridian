# Dispatch #69 — Visit Readiness overstates its own certainty (three UI defects + one cheap measurement)

**Status:** ready to dispatch. Not started.
**Source:** `memory/notes-visit-readiness-backlog-2026-08-22.md` (owner-raised, 2026-08-22),
plus a correction from `memory/finding-peak-cfv-api-2026-08-22.md` that makes Part D far cheaper
than the notes file assumed.

---

## The theme, and why these four belong in one dispatch

The owner raised three separate Visit Readiness complaints. They are **one pattern**: in every
case the UI makes a stronger claim than the number behind it can support — in both directions.

| | UI says | number supports |
|---|---|---|
| A | `Food safety: elevated` | inventory variance % and raw waste % |
| B | `Weak agreement so far` | ρ=0.23, 95% CI **[−0.16, 0.56]** — indistinguishable from "good" |
| C | a pill styled like the All/OK/FL **view** filters | a **print** option |

A and B are the same defect mirrored: A over-claims severity, B over-claims certainty. C is a
smaller affordance bug in the same panel and is cheap to fix while you are in the file.

Part D is the measurement that should precede any future scoring work here.

---

## Part A — "Food Safety" is the wrong name for what is measured

**Owner, verbatim:** *"Food Safety Risk is ill warned. Need to say something different. Appears it
is deriving based on waste. That would be an inventory/FOB issue and potential over-production.
The way we operate, there will always be waste. It's Fast Food."*

**He is right, and the engine already agrees with him.** `FOODSAFETY`
(`src/engine/visit-readiness.js:139`) is exactly two metrics, both `fobRows`:

| metric | what it actually is |
|---|---|
| `statVar` — Stat variance % | inventory variance |
| `raw` — Raw waste % | product waste |

Both carry the in-code `pace` string *"Directional holding/handling proxy only — **NOT an EcoSure
prediction**."* The engine hedges correctly. **The UI does not:**

| site | current string |
|---|---|
| `src/views/visit-readiness.js:15` | `FS low` / `FS watch` / `FS elevated` / `FS n/a` |
| `src/views/visit-readiness.js:91` | `fs.l.replace('FS', 'Food safety:')` → `Food safety: elevated` |
| `src/views/visit-readiness.js:436` | `stat('FS elevated', d.fsElevated, …)` |
| `src/engine/visit-readiness.js:186` | `Address food-safety risk first — waste/holding proxies are elevated…` |

### Why it matters beyond wording

`:186` is the **top coaching line**. On the owner's current screen, 10 of 27 stores are flagged, and
on the At-Risk list the food-safety line is the headline action for Holdenville, Ardmore-Broadway
and Defuniak Springs — **it outranks the real blocker.** If waste is structurally normal in fast
food, this trains operators to ignore the panel's top line. That is the *"a number nobody acts on
is not a shipped feature"* rule failing in the worse direction: it also **displaces** the number
they should act on.

### What to do

1. **Rename the surface.** Recommended: **"Waste & variance"** (flag label `WV low/watch/elevated`).
   ⚠️ **The owner has not picked the name.** The *decision to rename* is his and already made; the
   *word* is open. Ship the recommendation, and make it a one-constant change so he can override it
   in a single edit — do not spread the string across four files.
2. **Stop it pre-empting the top coaching line.** `:186` currently returns food-safety as the first
   recommendation. It should rank **below** any elevated Speed/Accuracy/Quality/Leadership driver,
   not above. A waste flag is a real signal; it is not the thing to say first before a graded visit.
3. **Leave the engine alone.** The metrics, bands and the deliberate exclusion from the readiness
   composite are all correct. This is a labelling and ranking change, not a scoring change.
4. **Keep the honest footnote.** `:107`'s report foot already says *"the food-safety flag shown
   above is a waste/holding proxy only"* — update its wording to match the new name; do not delete
   it.

⚠️ A genuine food-safety signal needs holding-time/temperature data.
`memory/project-graded-visits-pace.md` already records that as an acknowledged gap, and
`memory/finding-ecosure-propel-api-2026-08-22.md` is the route to the real thing. **Do not
close the gap by renaming it** — the gap entry in `CoverageGaps` stays.

---

## Part B — Model Check: report uncertainty, not a verdict

On screen: **rank corr 0.23 (weak), direction match 52.00% (14/27)**, captioned
*"Weak agreement so far — treat as directional only."* (`src/views/visit-readiness.js:260`).

**Owner's revised read, and it is correct:** *"May not need to change the scoring mechanism — it
sounds legit — maybe needs more data."*

**Computed, n = 27:**

| statistic | point | 95% CI |
|---|---|---|
| direction match | 51.9% (14/27) | **[34.0%, 69.3%]** (Wilson) |
| rank corr ρ | 0.23 | **[−0.16, 0.56]**, p ≈ 0.25 |

At this n the true rate could be anywhere from a third to nearly 70%. **These numbers cannot
distinguish "useless" from "good."** They are not evidence of a weak model; they are evidence of a
small sample. *"Weak agreement"* **asserts weakness** — the panel is claiming more than its data
supports.

### What to change

**The caption and the strength label, not the scoring.**

1. `calibrateReadiness` (`src/engine/visit-readiness.js:226`) already returns `n`, `r`, `hits`,
   `hitRate`. **Add the intervals** — Wilson for the hit rate, Fisher-z for ρ — and return them.
   Both are a few lines and neither needs a dependency.
2. The caption ladder at `:258-262` branches on `cal.r` alone. **It must branch on whether the
   interval excludes the null**, not on the point estimate. When the ρ CI spans 0, the honest line
   is *"not enough visits yet to tell"* — the same thing the n<3 branch at `:242` already says
   correctly. Today the panel says that at n=2 and then starts asserting weakness at n=3.
3. **`strength` (`:240`) has the same bug**: `Math.abs(r) >= 0.3 ? 'moderate' : 'weak'` labels a
   point estimate with no regard for n. Suppress the word, or qualify it, when the CI is wide.
4. **Show progress toward power instead of a verdict.** The owner asked for this explicitly:
   *"Maximum visits is 3 per store, so 81 total per year (may only be 2 per store now, let me
   check). Either way our model should have that information."* Something like
   **"27 of ~46 visits needed to tell"**. It is honest, it is actionable (it says *wait*, and how
   long), and it stops a small sample reading as a broken model.

   ⚠️ **Confirm the cadence with the owner before hardcoding it — 3/yr vs 2/yr changes every
   figure by ~40%**, and the owner was still checking. Whatever it is, it belongs in a named
   constant, not inline.

   | goal | pairs needed | at 81/yr | at 54/yr |
   |---|---|---|---|
   | detect ρ ≥ 0.4 (80% power) | 46 | ~3 months | ~4 months |
   | detect ρ ≥ 0.3 (80% power) | 84 | ~8 months | ~13 months |
   | direction match to ±10% | 96 | ~10 months | ~15 months |
   | direction match to ±5% | 384 | ~4 years | ~6.6 years |

   ⚠️ **Repeat visits to the same store are NOT independent.** Store effects persist, so effective
   n grows more slowly than the raw count. The table is optimistic; say so in the tooltip rather
   than presenting a date as a promise.

### 🔴 Do NOT refit the weights

The 35/30/20/15 weights are assigned, not fitted (`memory/project-graded-visits-pace.md`). At n=27
a fit overfits. If it is ever done, report a holdout or cross-validated figure alongside, and the
no-invented-thresholds rule applies to whatever comes out.

### 🔴 The current 0.23 / 52% figures are already stale

**#64 changed the inputs on 2026-08-22** — R2P moved 111.7s → 128.5s on one store when it began
resolving auto-first. Every pair measured before that date is against different inputs.
**Re-measure before drawing any conclusion**, including in Part D.

---

## Part C — the Report-detail toggle reads as a view toggle

**Owner:** *"Summary button doesn't seem to do anything."*

**Not broken — print-only.** `detail` (`src/views/visit-readiness.js:380`) is read in exactly one
place:

```js
const doPrint = () => openPrint(readinessReportHTML(res, { scopeLabel, detail }));
```

Nothing on screen consumes it. It is labelled *"Report detail"* at `fontSize: 9` (`:416`) beside
pills (`:418`) styled identically to the All/OK/FL scope filters — which **do** change the view. So
it reads as a view control and behaves as a print option.

**Fix:** attach it to the action it modifies. A split or dropdown on the existing **🖨 Report**
button (`:398`) — `Report ▾ → Full audit / Summary` — rather than parking it among the filters.
Cheap, and it removes a "this is broken" reaction from the first-time user.

---

## Part D — the daypart/channel-matched re-measure (no new data pull required)

`notes-visit-readiness-backlog-2026-08-22.md` item 2(b) proposed a structural explanation for the
low ρ that has nothing to do with sample size:

> Graded visits can now only occur **11:00–17:00** — lunch and snack, no breakfast, essentially no
> dinner. Visit Readiness scores a store on **all-day averages** (OEPE, R2P, KVS, labor %, TPPH)
> while the visit observes a **six-hour slice**. That mismatch dilutes correlation no matter how
> good the metrics are, and **no amount of extra data fixes it**.

### 🔴 This is cheaper than that note assumed — correction from the PEAK capture

The note framed the visit side as unknown. **It is not. Meridian already stores it:**

| where | evidence |
|---|---|
| `src/parsers/graded-visits.js:80,81` | `daypart: _after(L,'Day parts')`, `weekpart: _after(L,'Weekpart')` |
| `src/parsers/graded-visits.js:67` | `channelOf()` — first module that is not "Behind the Counter" |
| `src/lib/supabase.js:2653,2654,2660` | `graded_visits` has `daypart` / `weekpart` / `channel` columns |
| `src/views/visit-readiness.js:266` | `VisitPatterns` already renders breakdowns by dow / daypart / weekpart / channel |

So the model side can be windowed to the **actual daypart of each visit**, per visit — not assumed
from the policy window — and it works for the **old regime too**, where 11am–5pm did not apply.

### Do this, in this order

1. **FIRST, measure the fill rate.** ⚠️ A column that exists is not a column that is populated.
   `_after(L,'Day parts')` returns null when the PDF layout differs, and **RGR sets `channel: null`
   by design** (`graded-visits.js:158` — whole-restaurant, not single-channel). Count non-null
   `daypart` / `weekpart` / `channel` per visit and per `report_type` **before building anything on
   them.** I could not do this from the agent env — the anon key returns zero rows on
   `graded_visits` (tenant RLS). If fill is poor, that is the finding and Part D stops here.
2. **Re-measure ρ and direction match with the model side windowed to each visit's own daypart.**
   `qsr_daily_activity` is hourly — PK `(loc, dt, hour_slot)`, slots `05:00 → 28:00`, and
   `hour_slot` is the **END** of its block (`"06:00"` = 5–6am). `loadQsrActSummary` already selects
   `hour_slot`.
   ⚠️ **Confirm front-counter R2P can be windowed at all** — it derives from
   `fc_untilserve`/`fc_untilclosedrawer` (`src/lib/supabase.js:1990`) and per-`hour_slot`
   availability is unverified. DT fields (`dt_untilserve`, `dt_trans_cnt`) are confirmed hourly.
   ⚠️ **Check `count(hour_slot)` per `(loc, dt)` before trusting any DAR-denominated ratio** — a
   short day understates the denominator and inflates the ratio (CLAUDE.md, business-day rule).
3. **Report the two ρ values side by side** — all-day vs daypart-matched, same pairs, with CIs.
   If ρ jumps, the model was right and the *aggregation window* was wrong. That is a far better
   outcome than either "weak model" or "small sample", and it is available today rather than in a
   year.
4. **Tag every pair with its regime** (pre- vs post- the 11am–5pm change) and report them
   separately before pooling. ⚠️ **Confirm when the window changed** — the owner said "beginning
   this month".

### Out of scope for Part D

- Building a PEAK API pull. That is a separate, larger piece
  (`memory/finding-peak-cfv-api-2026-08-22.md`), it is SSO+MFA-gated, and Part D needs none of it.
- The prior-year backfill. It is the right move for sample size and it is the owner's own proposal,
  but it must be a **leak-free reconstruction** — predicted readiness recomputed using only data
  available as of each historical visit date, reusing the existing Back Test discipline
  (`runPeriodTotalBacktest`, `BT_DAYS`/`BT_FOLDS`), never a hand-rolled `asOf`. Separate dispatch.

---

## Verification bar

Per the standing revert-sensitivity rule, an engine-level test is **not** sufficient for Parts A–C
— every one of them is a defect in what the **panel renders**, so the test has to render
`VisitReadinessPanel` and assert on its output. A test that only imports
`src/engine/visit-readiness.js` would pass with the entire UI change reverted.

- **A:** render the panel and assert the old string is absent and the new one present; assert an
  elevated-waste store with a worse Speed driver does **not** lead with the waste line.
- **B:** feed a fixture at n where the CI spans 0 and assert the caption says *not enough*, not
  *weak*; feed a large-n fixture and assert it does assert. Both cases, or the branch is untested.
- **C:** assert the toggle is not rendered among the scope filters and that choosing Summary still
  reaches `readinessReportHTML` with `detail:'summary'`.
- **D:** produces a measurement and a memory file, not necessarily code. If it lands a windowed
  metric path, that path needs the same treatment.

Standard bar otherwise: full suite green, `npm run build` clean, entry-chunk numbers in the commit
body, ratchet ceilings only moved with an in-file note saying why.
