---
name: project-labor-analysis-flh
description: Weekly Fixed-Labor-Hours (FLH) planning — porting the "MBI - Labor Analysis" worksheet into Meridian. Sheet structure, exact formulas, data model, phased plan, and the eventual LifeLenz live-page scrape.
metadata:
  node_type: memory
  type: project
---

# Labor Analysis / Fixed-Labor-Hours (FLH) — port of MBI worksheet

Owner uploaded `MBI_Labor_Analysis.xlsx` (single sheet "MBI - Labor Analysis",
week 07/15/26–07/21/26, 27 stores = 20 OK + 7 FL, + OK/FL subtotals + grand
total). Goal: get it into Meridian, pull a per-location weekly labor report, and
**eventually auto-pull the LifeLenz inputs by scraping live scheduling pages per
store for a selected date range** (not a LifeLenz report — must scrape).

Owner decisions (2026-07-22): **Phase 1 = config tables + compute engine +
per-location report, fed by uploading this sheet.** Phase 2 = LifeLenz scrape.
Interim Band-1 source = **parse this xlsx**.

## Sheet structure — five column bands

| Band | Cols | Contents | Nature |
|---|---|---|---|
| 1 · From LifeLenz | A–J | Location, Proj Sales/mo(B, mostly empty), Sales Forecast wk(C), Labor % of Sales actual(D), GC Forecast(E), Hours Forecast(F), Hours Scheduled(G), Sched Fixed Labor %(H), TPPH(I), Avg Rate of Pay(J) | input |
| — | L | Labor Target (Organization) % | input |
| 2 · Efficiency | K,M–W | derived (see formulas) | computed |
| 3 · Rec Fixed/Floor | X–AB | threshold × O | computed |
| 4 · Known fixed hrs | AC–AH | Maintenance hrs, # maint people, maint days off, Prep hrs, Lobby hrs, 24-Hr Y/N | manual "gathered" input |
| 5 · Hours of Op | AI–BE | Open/Close times in ~10 day-band variants (Excel time fractions) | config input |
| 5b · Hours/day | BF–BL | Hours open per weekday (Wed→Tue) | computed |

## Exact formulas (row-normalized, extracted from the sheet's 491 formula cells)

```
K Scheduled Labor $        = C*D
M Labor Target +2%         = L+0.02
N Target Labor $           = C*L
O Proj Hrs/Wk (target)     = (C*L)/J
P Proj Hrs/Wk (target+2%)  = (C*M)/J
Q Hours ± sched vs forecast= G-F
R Hours ± sched vs target  = (G*24)-O        ⚠️ ×24 quirk (Q uses G directly)
S Hours ± sched vs tgt+2%  = (G*24)-P        ⚠️ ×24 quirk
T $ ± vs projected LifeLenz= Q*J*24
U $ ± vs projected target  = R*J
V $ ± vs projected tgt+2%  = S*J
X Rec Fixed @0.1           = O*0.1     Y @0.15 = O*0.15
Z Rec Floor @0.1           = O*0.1     AA @0.15= O*0.15
AB Combined @0.25          = O*0.25
Thresholds (row 3): X3=.1 Y3=.15 Z3=.1 AA3=.15 AB3=.25
```

✅ **G×24 RESOLVED (v4.464):** Hours Forecast (F), Hours Scheduled (G) and Actual
Hours (W) are Excel **`[h]:mm` durations** — stored as fractions of a DAY (raw
62.52 displays "1500:30" = 1500.5 hours). The sheet's "(G*24)-O" was compensating
for that. Fix: the **parser converts F/G/W to real hours (×24)** and the engine
math is now unit-consistent (`Q=G-F`, `R=G-O`, `S=G-P`, `T=Q*J`, `U=R*J`, `V=S*J`)
— reproduces S=170.46, U=3727.68, V=2240.1 exactly. Loader has a back-compat heal
(hours <300 → ×24) so rows written before v4.464 display right without re-upload.

Verified against store 3708 (row 4): C=74379, D=0.2519, F=46.2083, G=62.5208,
J=13.1417, L=0.215 → K=$18,736.07, N=15,991.49, O=1,216.85, Q=16.31, R=283.65,
T=5,144.99, X=121.68, AB=304.21. Engine unit tests assert these.

## Progress

- ✅ **Engine** `src/engine/labor-analysis.js` (v4.460) — `computeLaborRow`,
  `analyzeStore`, `aggregateGroup` (DOLLAR-WEIGHTED subtotals: Σ$/Σsales, Σgc/Σhrs
  — never mean-of-%s), `analyzeSheet` (OK/FL/grand via `isFL` predicate),
  `hoursOpen`/`fracToTime` (Excel time-fraction → hours/clock; close≤open wraps
  past midnight), `FLH_THRESHOLDS`. **18 unit tests**, all green.

## Progress (parser)

- ✅ **Parser** `parseMbiLaborAnalysis(rows)` + `parseMbiLaborAnalysisWb(wb)` in
  `src/parsers/index.js` (v4.461). Reads by FIXED column position (`_MBI` map +
  `_MBI_HOURS_BANDS` + `_MBI_PERDAY`) since duplicate headers ("Store Open Time
  Sun" ×2) make header lookup ambiguous. Output:
  `{ weekStart, weekEnd, monthTag, stores:[{loc, band1{…}, config{…}}] }`.
  - **Hours deciphered** to a canonical 7-weekday model: bands applied broad→
    specific (last wins), per-day hours from BF–BL are authoritative (fall back
    to `(close−open)*24`, wrap past midnight). `is24hr` = all-days-24 OR the
    Y/N flag; `is24Note` preserves the "24 HR W/E" nuance.
  - Skips Sub Total / Grand Total / legend rows; loc unpadded via `parseInt`.
  - `detectType` routes `MBI_Labor_Analysis.xlsx` → `mbi-labor` (added BEFORE the
    generic 'labor analysis' match so it doesn't collide).
  - Fixture `src/__tests__/fixtures/mbi-labor-sample.json` (real rows: 3708,
    5183, 18213, 6178, 43701 + a subtotal row). **11 parser tests**, all green.

## Progress (persistence + panel — Phase 1 COMPLETE)

- ✅ **Tables** (v4.462) — `store_labor_config` + `lifelenz_labor_week` in
  `supabase/schema.sql` (user has run both). Load/save in `src/lib/supabase.js`:
  `saveStoreLaborConfig`/`loadStoreLaborConfig`,
  `saveLifeLenzLaborWeek`/`loadLifeLenzLaborWeek`.
- ✅ **Upload wiring** (v4.463) — App.js dispatch: `detectType`→`mbi-labor`→
  `parseMbiLaborAnalysisWb` → saves weekly Band-1 + per-store config to Supabase,
  keeps `ds.laborAnalysis` for immediate display.
- ✅ **Panel** `src/views/labor-analysis.js` — nav 🧮 "Labor Analysis" (modal
  `labor-analysis`). Report tab: per-store weekly table (inputs + engine-derived
  efficiency + recommended fixed/floor), scope pill (All/FL/OK/patch/store),
  **dollar-weighted OK/FL/Grand subtotals**, scorecard flags (labor%>target red;
  hours ± green/amber), CSV + print. Config tab: editable gathered fixed-hours
  (maint/prep/lobby/24hr) + read-only deciphered per-day hours.

## TODO (Phase 1 remaining)

- Hours-of-operation **editing** in the Config tab (currently read-only; edit the
  7-weekday open/close). Fixed-hours inputs already editable.
- Optional: load `ds.laborAnalysis`/config on startup (panel loads lazily on open
  now, which is fine).
- **Supabase tables** (owner runs SQL):
  - `store_labor_config` (loc PK): 7-day open/close (or the raw day-band set),
    is_24hr, maint_hours, maint_people, maint_days_off, prep_hours, lobby_hours.
  - `lifelenz_labor_week` (loc, week_start PK): sales_fcst, labor_pct_actual,
    gc_fcst, hours_fcst, hours_sched, sched_fixed_pct, tpph, rate,
    labor_target_org, actual_hours.
- **Report panel** `src/views/labor-analysis.js` — per-location weekly report
  mirroring the sheet layout; pill location selector; printable/exportable;
  dollar-weighted OK/FL/grand subtotals; scorecard flags (over-target hours,
  >25% fixed rule). Config editor to populate Band-4/5 "gathered" inputs.
- Wire into nav (Labor Tools area).

## Phase 2 — Auto Band-1 from `lifelenz_schedule` ✅ SHIPPED (v4.485, 2026-07-23)

**No scrape needed.** The daily `lifelenz_schedule` (synced daily by
`scripts/lifelenz-pull.mjs`) IS the LifeLenz Labor Analysis report at day grain, so
the weekly Band-1 is just an aggregation of it — cloud-fresh on every device.

- **Engine** `deriveBand1FromSchedule(scheduleRows, {weekStart, orgTargetFor})` +
  `isoWeekMonday()` in `src/engine/labor-analysis.js` (pure, 11 unit tests). Buckets
  a Mon–Sun week per store, sums the extensive parts, recomputes the intensive
  ones from the SUMS (never a mean of daily ratios).
- **Owner-confirmed mapping (2026-07-23):**
    - **Hours Forecast (F) = Σ(`proj_vlh` + `fix_guide_hrs` + `proj_floor`)** — Proj
      VLH + Fixed + Floor, **HOURLY only, NO salaried manager** (mgr is salaried,
      excluded from this labor %).
    - **Hours Scheduled (G) = Σ(`sch_vlh` + `sch_fix_hrs` + `sch_floor`)**.
    - salesFcst(C)=Σ`fcst_sales` · gcFcst(E)=Σ`fcst_tcs`.
    - laborPctActual(D) = Σ(`labor_pct`·`fcst_sales`)/Σ`fcst_sales` (sales-weighted;
      normalizes a % stored as 21.5 → 0.215). labor$ = that.
    - rate(J) = Σlabor$/Σ hoursSched · tpph(I) = Σ`fcst_tcs`/Σ hoursSched.
    - **laborTargetOrg(L) = DEFAULT_TARGETS[loc].tCrewLabor** (crew/hourly target,
      matching the hourly-only basis — NOT tLabor which includes mgr).
    - actualHours(W) left null (schedule has no punched hours; DAR join is a later
      option). Hours are plain decimals in the report — NO ×24 (the day-serial
      issue was only the MBI xlsx).
- **Panel** `src/views/labor-analysis.js` — loads `loadLifeLenzSchedule({daysBack:35,
  daysFwd:21})`, derives the week, and **auto (schedule) WINS**; the manual
  MBI/`lifelenz_labor_week` only gap-fills stores auto lacks for the SAME week
  (standing freshest-wins rule). If the schedule has nothing for the week it falls
  back to the manual week entirely (prior behavior preserved). Added **‹ / ›
  week nav + "This week"** and an **⟳ Auto / Manual source chip** (shows +N when
  manual gap-filled).

### Still open (owner)
1. Confirm the **G×24** in the engine's R/S columns is intentional (or drop to plain
   G) — pre-existing question, not introduced here.
2. **actualHours(W)** — worth joining DAR `actual_punched_hours` so the sheet's
   actual-vs-plan column populates? (Currently null on the auto path.)
3. **Week convention** — auto defaults to the current Mon–Sun week; the MBI sheet may
   plan the *upcoming* week. The ‹ / › nav covers it, but confirm the default.

## Open questions for owner

1. Confirm the **G×24** in R/S is intentional (or fix to plain G).
2. Hours-of-operation **normalization rule**: stores fill different day-band
   schemes; a close value of `0` appears to mean midnight/24-hr — confirm.
3. Which day-band scheme is canonical for reporting hours/day (BF–BL)?

---

## Weekly Schedule Summary (v4.504, 2026-07-24)

Surfaces the LifeLenz weekly-schedule "top section" band across ALL stores (LifeLenz
shows one at a time). **No new pull** — derived from `lifelenz_schedule` (already
synced daily by `scripts/lifelenz-pull.mjs` via the `labor_analysis_actuals_report`
CSV). `src/engine/schedule-summary.js` rolls daily rows into per-store-week band;
`src/views/schedule-summary.js` is the panel (Operations → 🗓 Schedule Summary).

**Reconciliation (verified to the penny/minute vs a real store week — DeFuniak 0006838,
wk of Wed Jul 22 2026; test `src/__tests__/schedule-summary.test.js`):**
- Sales Forecast = Σ daily `fcstSales` ($89,850.72 ✓)
- GC Forecast = Σ daily `fcstTCs` (7,191 ✓)
- Scheduled Hrs = Σ (`schVLH`+`schFixHrs`+`schFloor`) (1460:30 ✓)
- Forecast Hrs = Σ (`projVLH`+`fixGuideHrs`+`projFloor`) (1488:45 ✓)
- Labor % = **dollar-weighted** Σ(`laborPct`×`fcstSales`)/Σ`fcstSales` (24.50% ✓)
- Schd TPMH = GC forecast ÷ scheduled hrs (4.92 ✓)
- Daily over/under = daily sched − forecast hrs (all 7 ✓)

**LifeLenz business week begins WEDNESDAY** (`WEEK_START_DOW=3`) for this org.
**laborPct unit** is passed through weighting unchanged (frac-or-%; UI normalizes with
`Math.abs(v)<=1.5 ? *100`). **Fixed Lbr %** is computed hours-based (Σ`schFixHrs`/Σ sched
hrs) and labeled "(hrs)" — confirm against a store vs LifeLenz's own Fixed Lbr% before
treating as authoritative (LifeLenz may use a cost-based denominator).

**✅ PER-JOB BREAKDOWN SHIPPED (v4.507):** the right-panel per-job hours+cost breakdown
(Drive Thru / Grill / Lobby / Maintenance / …, #shifts, reg/OT hours, $cost, $/hr) is now
pulled from LifeLenz `ShiftsForSchedulePeriod` into the `lifelenz_job_hours` table and shown
in the Weekly Schedule Summary expanded store view. Details + the ⚠️ reconstructed-GraphQL
caveat in `memory/project-lifelenz-schedule-jobs.md`. (User: run the `lifelenz_job_hours` SQL
block in `supabase/schema.sql`.)

### Fixed / Floor standard — viewed SEPARATELY (owner-confirmed 2026-07-24, v4.506)

Owner: *"Floor Hours and Fixed Hours viewed separately. It did not always used to be
that way. Fixed Hours and Floor Hours should each be scheduled between 10%–15% for each
segment, BUT no more than 25% of total hours scheduled."*

- **Denominator = total scheduled hours** = `Σ(schVLH + schFixHrs + schFloor)` — the same
  total already used for Scheduled Hrs and Fixed %.
- **Fixed %** = `Σ schFixHrs / total sched` → target band **10–15%**.
- **Floor %** = `Σ schFloor / total sched` → target band **10–15%**.
- **Combined (Fixed + Floor) %** = `Σ(schFixHrs+schFloor) / total sched` → hard cap
  **≤ 25%**.
- Constants live in `src/engine/schedule-summary.js`: `FIXED_FLOOR_SEG_MIN=0.10`,
  `FIXED_FLOOR_SEG_MAX=0.15`, `FIXED_FLOOR_COMBINED_MAX=0.25`. Both store rows and the
  district roll up as **ratio-of-aggregates** (Σseg / Σsched), never a mean of store %s.
- **Panel** (`src/views/schedule-summary.js`): three columns/tiles — **Fixed %**, **Floor %**,
  **F+F %**. Each segment is **green in-band (10–15%), amber outside**; combined is
  **green ≤25%, red over the cap**. Replaces the single "Fixed Lbr % (hrs)" tile.
- The ~0.17pp gap once seen vs LifeLenz's own Fixed Lbr% (our 12.44% vs their 12.61% on
  DeFuniak) is rounding at the display layer — the hours-based math is correct.
