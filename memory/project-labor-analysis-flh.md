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

⚠️ **G×24 unit inconsistency:** R/S multiply Hours Scheduled by 24 while Q does
not. Reproduced faithfully in the engine (matches the sheet's own numbers) but
**flagged for owner** — if G is already weekly hours this is a latent bug in the
original sheet. Confirm before trusting R/S/U/V for decisions.

Verified against store 3708 (row 4): C=74379, D=0.2519, F=46.2083, G=62.5208,
J=13.1417, L=0.215 → K=$18,736.07, N=15,991.49, O=1,216.85, Q=16.31, R=283.65,
T=5,144.99, X=121.68, AB=304.21. Engine unit tests assert these.

## Progress

- ✅ **Engine** `src/engine/labor-analysis.js` (v4.460) — `computeLaborRow`,
  `analyzeStore`, `aggregateGroup` (DOLLAR-WEIGHTED subtotals: Σ$/Σsales, Σgc/Σhrs
  — never mean-of-%s), `analyzeSheet` (OK/FL/grand via `isFL` predicate),
  `hoursOpen`/`fracToTime` (Excel time-fraction → hours/clock; close≤open wraps
  past midnight), `FLH_THRESHOLDS`. **18 unit tests**, all green.

## TODO (Phase 1 remaining)

- **Parser** — parse the multi-band xlsx (merged headers on rows 1–3, data from
  row 4, stop at "Sub Total"/"Grand Total"/legend rows) into: (a) weekly Band-1
  rows for `lifelenz_labor_week`, (b) per-store config for `store_labor_config`
  (hours-of-op normalized to a canonical 7-day model + fixed-hours inputs).
  STORE_NAMES keys unpadded; sheet loc already unpadded ("3708").
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

## TODO (Phase 2)

- **LifeLenz live-page scrape** — Band-1 numbers are NOT a LifeLenz report; scrape
  the scheduling/forecast pages per store for a selected date range (Playwright,
  same two-path auth as existing pulls) → upsert `lifelenz_labor_week`. Keep the
  xlsx upload as the freshest-wins fallback.

## Open questions for owner

1. Confirm the **G×24** in R/S is intentional (or fix to plain G).
2. Hours-of-operation **normalization rule**: stores fill different day-band
   schemes; a close value of `0` appears to mean midnight/24-hr — confirm.
3. Which day-band scheme is canonical for reporting hours/day (BF–BL)?
