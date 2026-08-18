---
name: analysis-labor-allocation-2026-08-18
description: PROVEN — labor hours sit in the wrong dayparts. The two busiest dayparts run UNDER the VLH guide while the three softest run OVER it, and the surplus covers the deficit 1.6x. Includes the schedule-vs-execution split, the overnight reframe, the actions, and every query.
metadata:
  node_type: memory
  type: analysis
---

# Hours are in the wrong dayparts — PROVEN, with the hours to pay for it

**Owner-directed 2026-08-18.** Surfaced by PROBE G-3/G-4 while investigating drive-thru
speed. **Nobody hypothesised it** — it fell out of a cut built for a different question.

> **This file supersedes the first version.** The original ran on invented daypart
> boundaries. Everything below is on the **VLH guide's own boundaries** (Breakfast 5a–11a,
> Lunch 11a–2p, Afternoon 2p–5p, Dinner 5p–11p, Late Night 11p–5a). Queries in
> `analysis-labor-allocation-queries.sql`.

---

## The measured picture (27 stores, 90 days, ~1.71M drive-thru cars)

| daypart | sec/car | TPPH | punched vs guide | sched vs guide | punched vs sched | cars | punched hrs | needed hrs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Breakfast | 154.3 | 6.43 | **0.915** | 1.046 | 0.875 | 620,325 | 134,684 | 147,174 |
| Lunch | 202.9 | 5.90 | **0.922** | 1.075 | 0.858 | 369,709 | 94,871 | 102,866 |
| Afternoon | 183.8 | 4.83 | 1.171 | **1.376** | 0.851 | 267,769 | 80,002 | 68,298 |
| Dinner | 220.8 | 4.56 | 1.091 | **1.306** | 0.836 | 432,263 | 134,217 | 122,971 |
| Late Night | 276.2 | **1.05** | **1.590** | 1.426 | **1.115** | 21,081 | 26,280 | 16,529 |

**58% of drive-thru volume is served UNDER guide; 42% is served OVER it.**
(990,034 cars under · 721,113 over.)

---

## ⭐ THE PROOF — the surplus covers the deficit 1.6×

| daypart | punched − needed |
|---|---:|
| Breakfast | **−12,490** (raw Σpunched−Σneeded; see "RE-MEASURED" below — true service deficit ≈−14,207 once mislabelled pre-open hours are pulled back out) |
| Lunch | **−7,995** |
| Afternoon | +11,704 |
| Dinner | +11,246 |
| Late Night | +9,751 |
| **deficit** | **−20,485** |
| **surplus** | **+32,701** |
| **net district-wide** | **+12,216 over guide** |

Totals: **470,054 punched** vs **457,838 needed** over 90 days.

**You can fully staff breakfast and lunch to guide out of hours you are already paying
for, and still hand back 12,216 hours.** Cost-neutral is no longer a hope; it is
arithmetic. This is what makes it the highest-value item on the board — every other speed
lever costs money or headcount; this one is a transfer.

---

## ⭐ THE KEY INSIGHT — AM and PM are DIFFERENT problems with DIFFERENT owners

Read where each daypart loses its hours:

| daypart | sched vs guide | punched vs sched | diagnosis |
|---|---:|---:|---|
| Breakfast | **1.046** | **0.875** | schedule is right — **12.5% doesn't show up** |
| Lunch | 1.075 | 0.858 | same: schedule fine, execution loses it |
| Afternoon | **1.376** | 0.851 | **padded 38% over guide when written** |
| Dinner | **1.306** | 0.836 | **padded 31% over guide when written** |
| Late Night | 1.426 | **1.115** | padded **and** runs long |

**The PM surplus is a SCHEDULING problem. The AM deficit is an EXECUTION problem.**
They are not two ends of one behaviour and they do not share a fix.

---

## What to do

### Action 1 — PM padding (scheduling · weekly · GM)
Afternoon and dinner are written **30–38% above guide before anyone clocks in.** That is a
pen stroke, not a behaviour change, and it is where 22,950 of the surplus hours come from.
**Instruction: schedule afternoon and dinner to guide.**

### Action 2 — AM show-rate (floor execution · daily · GM/shift manager)
Breakfast's schedule is essentially correct and **12.5% of it does not arrive** — on the
highest-volume daypart in the business. Attendance, late clock-ins, or early cuts. Harder
than Action 1 because it is people rather than planning.

> **Do both or neither.** Cut PM alone and you bank hours without fixing speed. Fix AM
> alone and you spend more. Together it is the cost-neutral trade, and the 1.6× surplus
> means it closes with room to spare.

### Action 3 — overnight: decide the question before touching the hours
**Is overnight open to serve customers, or to produce?** At **8.7 cars per store per
night** it is plainly not a sales daypart — that is ~2 people, ~9 cars, 6 hours.

If that crew is closing, deep-cleaning, stocking and prepping breakfast, the work is
legitimate — but it should be **planned production time with a task list and a stated
finish time**, not open-ended coverage. The guide already prices overnight
non-transactional work at 16,529 hours; **26,280 are being punched.**

**The handle is `punched_vs_scheduled` = 1.115** — the ONLY daypart above 1.0. Every other
daypart cuts early; overnight runs *past* schedule. Compare punch-out times to scheduled
end times, set a close-completion standard, hold to it.

⛔ **Do not cut overnight blind.** Strip hours without knowing what that crew produces and
you get dirty restaurants and late breakfast openings — landing straight on the daypart
that is already short.

### Action 4 — run the concentration check FIRST (query 2)
Five stores is five conversations; twenty-seven is a broken standard. Read
`scheduled_vs_guide` on the PM rows to find who pads, and `punched_vs_scheduled` on the
Breakfast rows to find who loses people at the punch. **Two different name lists.**

---

## ✅ CONCENTRATION ANSWERED (Query 2, owner-run 2026-08-18)

**Different answer per finding — do not treat these as one programme.**

| finding | verdict | implication |
|---|---|---|
| **Afternoon padding** | **23 of 27 stores over guide** | district standard |
| **Dinner padding** | 19 of 27 over guide | district standard |
| **Late Night excess** | **74% of the 9,751 hrs in 10 stores** | specific restaurants |
| **Breakfast deficit** | **two opposite causes** | two different name lists |

### ⭐ The breakfast deficit is TWO problems. The district average hid it.

The district figure — *"scheduled to guide (1.046), loses 12.5% at the punch"* — is the
**average of stores scheduling 0.741 and stores scheduling 1.216.** Averaging them produced
a number that describes no actual restaurant and implies the wrong fix for both halves.

**Group A — the schedule itself is short. Execution is fine.**

| store | sched vs guide | punched vs sched |
|---|---:|---:|
| Bonifay | **0.753** | 0.964 |
| Sulphur | **0.741** | 0.929 |
| Tecumseh | **0.801** | 0.953 |
| Harrah | 0.838 | 0.861 |
| Ardmore-Cooper/12th | 0.861 | 0.906 |
| Holdenville | 0.930 | 0.894 |
| OKC-I240/Sooner | 0.938 | 0.860 |

Bonifay punches **96%** of what it schedules. Nothing is wrong with its execution — the
schedule was written 25% below guide. **Fix: rewrite the breakfast schedule.**

**Group B — the schedule is right; the people do not arrive.**

| store | sched vs guide | punched vs sched |
|---|---:|---:|
| **Lindsay-Wal-Mart** | 1.011 | **0.692** |
| Cottondale | 1.216 | 0.799 |
| Ponce de Leon | 1.130 | 0.815 |
| Seminole-Milt Phillips | 1.010 | 0.819 |
| Mossy Head | 1.060 | 0.837 |
| Tishomingo | 1.043 | 0.853 |

**Fix: attendance.** Telling Bonifay to work on attendance, or Lindsay to fix its schedule,
would each be exactly wrong.

### Two stores to look at before anything else

**Ada-Country Club — over guide in EVERY daypart.** +1,031 / +804 / +1,420 / +2,188 / +985
= **+6,428 hours** over 90 days, the largest single block in the district. Schedules
1.392 → 1.481 → 1.809 → 1.857 → 2.334, padding harder as the day goes on. One store, one
schedule, one conversation.

**Lindsay-Wal-Mart — the opposite pathology.** Schedules 1.011 / 1.263 / **2.179** /
**2.071** and punches **0.692 / 0.559 / 0.614 / 0.561**. Nearly half the scheduled labour
never clocks in. **The schedule there is not a plan, it is a wish** — and no allocation fix
survives contact with it.

### ⚠️ Late Night ratios are unsafe until Query 5 runs

**Purcell reads 6.174× guide.** Almost certainly an artifact: a store that CLOSES overnight
has `total_needed_hours` ≈ 0, so any close-and-clean hours make the ratio explode. Purcell's
guide is ~2.2 hrs/night against ~13.8 punched. **On Late Night read `gap_hrs`, never the
ratio, until Query 5 says which stores are actually open.** Sulphur (punched/scheduled
**2.097**) and Holdenville (**2.241**) raise the same question — both punch more than double
their overnight schedule.

## ⚠️ The overnight reframe — a walk-back, recorded deliberately

An earlier read called low night productivity a **capability problem** (least experienced
managers, least oversight). On corrected boundaries that framing does not survive intact:

**TPPH at Late Night is 1.05 against 6.43 at breakfast — a 6× gap that is too extreme to
be a performance story.** Overnight labour does overnight *work*: close, deep clean, stock,
receive, prep. **TPPH measures transactions per hour and overnight hours mostly do not
produce transactions.** It is the wrong lens for that shift, and `punched_vs_scheduled` at
1.115 fits — close-and-clean overruns, it does not get cut early.

**What survives is the guide gap**, not the productivity gap: 26,280 punched vs 16,529
needed = **9,751 excess hours, 59% over**, against a guide that already accounts for
non-transactional overnight work.

**The Elgin-vs-Tishomingo comparison was measured on the OLD bucket (8pm–4am), so it was
largely an EVENING comparison, not an overnight one. Re-run before trusting it.**

---

## ⚠️ Caveats

1. **The 19.4s speed payoff for staffing breakfast to guide was measured on the wrong
   boundaries.** Hours arithmetic above is solid; the seconds figure is not. **Re-run
   before telling any GM "this buys you X seconds."**
2. **`total_needed_hours` is assumed to be the VLH guide.** Strong evidence — `sched vs
   guide` runs 1.046–1.426, systematically ≠ 1.0, so it is demonstrably not a copy of
   `total_scheduled_hours` — but not confirmed against the workbook tables.
3. **Per-store rates mix stores.** A chronically-under-guide restaurant may also be a slow
   restaurant. Query 2 gives the per-store split.
4. **Guides are per-configuration** — 48 variants × 2 workbooks. Store mapping lives in
   **`store_vlh_config`**, edited at **Data Manager → VLH Settings**
   (`src/views/analytics.js:1983-2075`): `aot`, `dt_type`, `in_store`, `kitchen`,
   `vlh_guide`, `coffee`.
5. **Approximate divisors:** per-store-night figures use 27 × 90 = 2,430 store-days; the
   24-slot completeness guard drops some, so treat those as close rather than exact.

---

## Still to run

- **Query 3** — `actual_punched_dollars` converts the 12,216 excess hours to money at the
  real blended wage rather than an assumed one.
- **Re-run the under/over-guide speed effect** on corrected boundaries (caveat 1).
- **Re-run the per-store TPPH/speed table** on corrected boundaries (overnight reframe).

---

# Overnight labour — the owner's operational standards (2026-08-18)

**These are OPERATIONAL standards, not the VLH guide, and they DISAGREE with it.** The
guide is guest-count driven, so for a closed restaurant it returns near-zero and cannot
say what a close-down *should* cost. These can.

| standard | value | crew |
|---|---|---|
| **Close-down** | **3–4 combined labour hours** after close | manager + 3 crew (or + 2 at a low-volume store) |
| **Pre-open** | crew clocks in **1 hour before open** | **1 manager + 2 crew = 3 labour hours** |

Owner: *"anything more than that is typically viewed as overkill."*

⚠️ **The pre-open hour crosses a daypart boundary depending on open time:**

- store opens **5:00am** → crew in 4–5am → **3 labour hrs land in LATE NIGHT**
- store opens **6:00am** → crew in 5–6am → **3 labour hrs land in BREAKFAST**
- store opens **5:30am** (Lindsay) → half in each

## Where the hours-of-operation data lives — it EXISTS, do not re-request it

**`store_labor_config`** (Supabase), populated 2026-07-22 for all 27 stores, parsed from
`MBI_Labor_Analysis.xlsx` (cols AI–BE). Loader `loadStoreLaborConfig()`
(`src/lib/supabase.js:2632`); parser `src/parsers/index.js:2185-2200`.

- `hours_json` — per weekday `{open, close, hours}` as **Excel day-fractions**
- `is_24hr` (bool) · `is_24_note` (raw string — **preserves the "24 HR W/E" nuance**)

⚠️ **`store_labor_config.loc` is UNPADDED (`'3708'`) while `qsr_daily_activity.loc` is
zero-padded to 7 (`'0003708'`). A naive join silently returns zero rows.**

### Decoded time fractions — do not re-derive

| fraction | time | | fraction | time |
|---|---|---|---|---|
| 0.1666667 | 4:00am | | 0.875 | 9:00pm |
| 0.2083333 | 5:00am | | 0.9166667 | 10:00pm |
| 0.2291667 | 5:30am | | 0.9583333 | **11:00pm** |
| 0.25 | 6:00am | | 0 | **midnight** |
| | | | 0.0416667 | 1:00am |

`close <= open` means the close wrapped past midnight — add 24.

## Result: nine stores are closed for the ENTIRE 11pm–5am block

Every punched hour is close-down or pre-open, so the standards apply directly.

| store | opens | pre-open in LN | expected | actual/night | excess/night | 90d hrs |
|---|---:|---:|---:|---:|---:|---:|
| **Ardmore-Cooper/12th** | 5:00 | 3.0 | 6–7 | **13.9** | **+6.9** | **621** |
| Sulphur | 6:00 | 0 | 3–4 | 7.4 | +3.4 | 306 |
| Holdenville | 6:00 | 0 | 3–4 | 6.6 | +2.6 | 234 |
| Elgin | 5:00 | 3.0 | 6–7 | 9.4 | +2.4 | 216 |
| DeFuniak Springs | 5:00 | 3.0 | 6–7 | 7.9 | +0.9 | 81 |
| Seminole | 5:00 | 3.0 | 6–7 | 7.5 | +0.5 | 45 |
| Marietta | 5:00 | 3.0 | 6–7 | 4.7 | **UNDER** | 0 |
| Tishomingo | 6:00 | 0 | 3–4 | 3.1 | **on target** | 0 |
| Lindsay-Wal-Mart | 5:30 | 1.5 | 4.5–5.5 | 1.1 | **anomaly** | 0 |

**Total ≈ 1,503 hrs / 90 days = $19,975 ≈ $81k/yr** at the measured $13.29 late-night wage.

### ⚠️ CORRECTION — an earlier figure of ~$143k/yr was WRONG

It treated *every* overnight hour at a closed store as close-down, ignoring pre-open crew
entirely. Adding the 3-hour opening allowance cuts it to ~$81k and **changes three
verdicts**: DeFuniak and Seminole drop from "2× standard" to essentially on target, and
**Marietta flips from at-standard to UNDER**.

- **Lindsay is an anomaly, owner-confirmed** — Walmart location, very small footprint,
  genuinely quick to reset. **The wage-and-hour concern raised against it is WITHDRAWN.**
- **Tishomingo at 3.1 proves the standard is achievable** — not theoretical, one of the
  restaurants already hits it.
- **Ardmore-Cooper survives every adjustment** and is the one unexplained store.
- **Ponce de Leon validates the method**: config says 6.00 open hrs in Late Night (24-hour,
  corporate requirement for year one), punched 13.4 ≈ 2.2 crew straight through. Config and
  punch data agree independently.

### ⚠️ Mixed-hours stores need a DAY-OF-WEEK cut before judging

A weekly average erases variable hours. **Chickasha** reads 32.0 punched vs 2.43 average
open hours — but that blends a genuinely 24-hour Saturday with a Monday closing at
midnight, and `is_24_note = "24 HR W/E"` says so. Same caution for Bonifay, Atoka, Durant,
OKC-I240, Tecumseh, Pauls Valley, Ardmore-Broadway, Harrah, Purcell, Chipley.
**Only the nine fully-closed stores are safe to act on from this cut.**

## ⭐ Knock-on: the Breakfast deficit is UNDERSTATED

For **6am-opening** stores the pre-open hour sits at 5–6am inside **Breakfast**, with the
store closed, zero guests, and therefore a near-zero guide — while 3 people are punched in.

Full-week 6am openers: **Duncan, Sulphur, Holdenville, Tishomingo, Harrah**; Sunday-only:
Purcell, OKC-I240, Pauls Valley, Tecumseh, Lindsay. That is roughly **1,550 hours over 90
days of non-service labour sitting in the Breakfast bucket**, making those stores look
better staffed for service than they are.

**So the true Breakfast service deficit is worse than the measured 12,491 hrs — nearer
14,000 — and the allocation case gets stronger, not weaker.**

### ✅ RE-MEASURED (dispatch20 §4, 2026-08-18) — 1,716 hrs, not the ~1,550 estimate; corrected deficit ≈14,206

The "~1,550 hrs" above was a rough estimate from a manual full-week/Sunday-only store
grouping. Measured directly instead: pulled `store_labor_config.hours_json` for all 27
stores (every weekday, not just the worked Monday example), applied
`preOpenLateNightFraction(openHour)` from `src/engine/labor-standard.js` per store per
weekday, and multiplied by each weekday's actual occurrence count in the 90-day window
(13 of each weekday, 91 days total, `dt >= 2026-05-20`). 24hr stores (Ponce de Leon)
excluded — the pre-open standard doesn't apply to a store that never closes.

**Measured total: 1,716.0 hrs**, not ~1,550 — about 11% more than the estimate.

| store | hidden pre-open-in-Breakfast hrs (90d) |
|---|---:|
| Duncan-Hwy 81 | 273.0 |
| Sulphur | 273.0 |
| Harrah | 273.0 |
| Holdenville | 273.0 |
| Tishomingo-Main & Refuge | 273.0 |
| Lindsay-Wal-Mart | 156.0 |
| OKC-I240/Sooner | 78.0 |
| Purcell | 39.0 |
| Pauls Valley-Ballard Rd | 39.0 |
| Tecumseh | 39.0 |

**Corrected Breakfast deficit: 12,491 + 1,716 ≈ 14,207 hrs** — matching "nearer 14,000" but
with a measured number in place of the estimate. Use **14,207**, not 12,491 or a rounded
"~14,000", in any future reporting of the Breakfast execution deficit — per dispatch20 §4's
explicit instruction to fold this in rather than quote the raw (understated) figure.
