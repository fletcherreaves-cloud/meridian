# Dispatch #29 — Workstream G: join the third dimension (who was on the shift)

**Board (2026-08-19):** `main` at v5.068 (`395b3cd`). Workstreams A–F are all shipped or dispatched.
This is the last of the seven workstreams. It's shaped differently from A–F: the owner already ran
five rounds of probes (G-1 through G-5, with two boundary corrections) directly against production
data, and the underlying finding is **already proven**, not proposed. This dispatch is not "go
investigate" — it's "here's what's built, here's what's proven, here's the specific gap between
the two, go close it."

---

## Read these two files first — don't re-derive what they already establish

- `memory/plan-normalization-2026-08-17.md`'s Workstream G section (lines 191–744) — the full probe
  trail: G-1 (within-store variance is real, 91% of between-store spread), G-2 (53.4s survives
  daypart normalization), a boundary correction (the original daypart cuts were invented, not the
  VLH guide's own, and had to be re-run), G-3/G-4 (staffing helps within a daypart, volume drives
  the across-daypart illusion), G-5 (TPPH-based "capability" story for Late Night died on
  reclassification — Tishomingo/Elgin were both closed overnight, not a matched capability pair).
- `memory/analysis-labor-allocation-2026-08-18.md` — **the proven finding**, standalone: Breakfast
  and Lunch (58% of drive-thru volume) run **under** the VLH guide; Afternoon/Dinner/Late Night run
  **over** it. Deficit −20,485 hrs (true Breakfast service deficit ≈ **−14,207**, not the raw
  −12,490 — the file's own "RE-MEASURED" section explains why), surplus +32,701 hrs, **surplus
  covers deficit 1.6×**, net +12,216 hrs over guide district-wide. AM is an **execution** problem
  (scheduled near guide, loses 12.5% at the punch); PM is a **scheduling** problem (written 30–38%
  above guide before anyone punches in).

Don't re-run these probes. Don't re-derive the daypart boundaries — use the corrected mapping in the
plan doc (Breakfast 5a–11a / Lunch 11a–2p / Afternoon 2p–5p / Dinner 5p–11p / Late Night 11p–5a,
`hour_slot` cut given in the plan at line 476–484). The old 8pm–4am Late Night boundary is dead;
using it silently reproduces the "killer pair" mistake the plan already found and retracted.

## What's actually built already — checked directly against current `main`

**`src/engine/labor-standard.js` exists and is complete** — `daypartOf()` (the corrected boundary,
already coded, not just documented), `allocationByStoreDaypart()`, `allocationDistrict()` (the
engine behind the proven deficit/surplus numbers above), `overnightOpenness()` (the open-vs-closed
classifier G-5 proved is mandatory before any overnight ratio means anything), and
`overnightExcessByStore()` (grades genuinely-closed stores against the owner's close-down/pre-open
hour standard instead of the VLH ratio, which G-5 showed is meaningless for a closed store).

**Its only caller is its own test** (`src/__tests__/labor-standard.test.js`). Grepped directly —
zero other imports anywhere in `src/`. **This is the exact #366 failure mode** (CLAUDE.md: "a test
that only imports the engine can't tell fixed from fixed-but-never-wired-in") — and it's now the
**third** time this session's dispatches have found it: `rollupShiftsByEmployee()` (below), and
#366 itself. The proven district-wide finding — a McDonald's-specific insight no incumbent system
can produce, because it requires joining outcome data (QSRSoft) to labor data (LifeLenz) in one
place — is sitting in a tested, correct engine that nothing on the app renders.

**TPPH auto-sourcing is partially done, at the wrong grain for this workstream.** The plan's
"ENGINEER TASK" (line 569) asked for TPPH derived from the DAR at `hour_slot` grain, auto-first,
closing the manual-only gap. Checked `src/engine/metric-source.js:133-141`: TPPH **is** now
auto-first-sourced from the DAR — but via `qsrActSummaryRows` (`loadQsrActSummary`,
`src/lib/supabase.js:1990`), which sums hourly `qsr_daily_activity` into a **per-store daily**
rollup before the metric resolver ever sees it (confirmed via `inventory.js:91`'s own comment: "sums
hourly qsr_daily_activity into a per-store rollup"). That closes the manual-upload gap for daily
panels — real progress, don't undo it — but it is **not** the hour_slot-grain TPPH the G-3/G-4/G-5
daypart analysis needs (e.g. the Late Night TPPH=1.05-vs-6.43-at-Breakfast finding). That number
still only exists inside probe SQL, not as an app-level metric at the grain a panel would need to
reproduce it.

**`rollupShiftsByEmployee()` (`src/engine/lifelenz-shift-jobs.js:124`) is unchanged from
2026-08-17** — still zero callers outside its own test. This one is explicitly **not** the first
thing to wire up — see the constraints below.

## The three constraints that shape any panel — not footnotes, read before designing anything

1. **Attribute to the SHIFT, not the person — at least first.** `store×daypart×day-of-week` is the
   grain the proven finding and the built engine both already use. `rollupShiftsByEmployee()` stays
   unwired for this workstream's first slice; the roster pull script's own stated design
   (`scripts/qsrsoft-employee-roster-pull.mjs:10`, "no individual-employee data is stored anywhere")
   was a considered choice — keep it. Person-level is a later, separate decision, not this one.
2. **Small n, apply Scanner's discipline.** A shift manager works ~20 shifts a month; per-slot
   metrics on that base are noise without an effect-size floor + FDR correction, the same guardrails
   already live in `src/engine/signal-registry.js`'s Scanner. Don't ship a naked ranking.
3. **The confound is real.** Good managers get assigned to hard shifts (the pattern G-4 had to
   correct for: across-daypart comparisons looked backwards until volume was held constant within
   daypart). Any surfaced pattern needs the same discipline — compare a store/slot against its own
   history or matched peers, never a flat ranking.

**Build it as pattern surfacing, never scoring** — the version that survives being seen by the
people it describes.

## The engineer task, concretely, in order

1. **Wire `labor-standard.js` into an actual panel or tile.** This is the highest-value, lowest-risk
   next step — the analysis is proven, the engine is tested and correct, nothing surfaces it. Show,
   per store: the allocation split (under/over guide by daypart, from `allocationByStoreDaypart`),
   and for overnight specifically, `overnightOpenness()`'s classification **gating**
   `overnightExcessByStore()` — open stores get a TPPH/speed read, closed stores get the
   close-down-hours read, and the panel must show which bucket a store is in before showing either
   number. Mixing the two groups on one ratio is exactly what produced G-5's retracted "killer pair"
   finding.
2. **Extend TPPH to hour_slot grain**, as a distinct addition alongside the existing daily
   auto-source (don't replace it — daily-grain panels still want the daily rollup). This is what any
   daypart-level panel from step 1 will need to reproduce the G-3/G-4 numbers live rather than from
   a one-off probe query.
3. **Leave person-level (`rollupShiftsByEmployee`) unwired for this pass**, per constraint 1.

## An open disagreement, named but not resolved — show both signals, don't silently pick one

G-5's re-run found the schedule-based open/closed classifier (`store_labor_config`) and the
data-driven one (`pct_slots_with_cars` at a 5% threshold) agree on 8 of 9 closed stores but not the
9th: the schedule config calls **Ardmore-Cooper/12th** closed, the data says it's genuinely open
20.9% of Late-Night slots (814 cars / 91 nights — not a trickle); the data-driven classifier instead
flags **Freeport** as closed. Two live possibilities (stale labor config vs. a DT that runs later
than its configured close), not distinguished. **A real panel should show both signals when they
disagree, not silently prefer one** — this is the same "diff the two computations" discipline
CLAUDE.md already states as a standing rule, applied to two classifiers instead of two metrics.

## Tracks

None named in the plan for this workstream specifically.

## What NOT to do

- Don't re-run G-1 through G-5 — they're answered, cited above, and re-running them on the wrong
  (old) daypart boundary is exactly the mistake the plan already made once and corrected.
- Don't build per-person scoring or a leaderboard — constraint 1 above. Shift-grain pattern
  surfacing is the whole first slice.
- Don't rank stores or slots on TPPH and speed as if they're one axis — G-5 showed explicitly they
  aren't (Tishomingo: high TPPH, fastest; Chipley: above-median TPPH, slowest). Show both, don't
  collapse them.
- Don't grade an overnight-closed store on the VLH TPPH ratio — `overnightOpenness()` exists
  specifically because that ratio is meaningless for a closed store; gate on it first.
- Don't quote the −12,490 Breakfast deficit number without the RE-MEASURED −14,207 correction from
  `analysis-labor-allocation-2026-08-18.md` — the raw ratio-of-sums figure undercounts real service
  deficit because of mislabelled pre-open hours.
