# Dispatch #208 — District View: Overview tab digest (cross-tab headline summary)

## Context — owner-requested, "all inclusive"

Owner, live in this session: *"Another to add to district view — let's add new data to overview
tab to represent the new tabs and be all inclusive!"* `StoreDash`'s (`src/views/store-analytics.js`)
Overview tab is the per-store landing tab in District View's drill-down — it currently shows its
own KPI vitals, daypart pace, priority findings, and charts, but nothing summarizing the OTHER
tabs in the strip, several of which (Food Cost, Labor & Scheduling, the Store Cockpit tabs from
dispatch #204) are genuinely new since Overview was last touched. "All inclusive" means: someone
scanning just Overview should get a taste of every other tab, not just what Overview already shows.

**Full current tab strip** (`StoreDash`, tabs array ~line 1849): `overview`, `forecast`,
`scorecards`, `brief`, `intelligence`, `foodcost`, `laborsched`, `action`, `shift`, `register`,
`records`, `insights`. This dispatch is scoped to ONE new section inside the existing `overview`
tab body — not a redesign of Overview, not changes to any other tab.

## Already represented in Overview — do not duplicate

A fresh scoping pass confirmed these tabs' headline numbers are **already shown** in Overview's
existing KPI/Findings sections, via the same underlying data:
- **Scorecards** (`opsScore`/`ctrlScore`) — already in the top KPI row.
- **Intelligence Brief** (`store.findings` top severity) — already substantially covered by the
  existing "Priority Findings" section (same `store.findings` source).
- **Forecast Table** (`rangeTotal` vs `rangeLY`) — already the "Period Sales" KPI card.

**Do not add new tiles for these three** — say so explicitly in the PR body rather than silently
skipping them, so it reads as a deliberate scope decision, not an oversight.

## Deliberately excluded, with reasons

- **3 Peaks** — its natural headline (daypart OEPE vs target) is already partially echoed in Shift
  Analysis's "3 Peaks × Labor Gap" widget; not a strong enough standalone signal for a tile.
- **AI Insights** — narrative-only tab, no single headline number to tile.

## The six new tiles — one per remaining tab, in a new "Tab Digest" row

Insert a new tile row between the existing "Priority Findings" section and the collapsed "Charts"
block (~line 2148), and ABOVE the `allStores.length>1` district-wide "Enterprise Overview" block
(that block is a separate, conditionally-absent, district-scoped concern — new tiles must render
regardless of `allStores.length`, don't mix them into that block). **Match the existing "Metric
Vitals" tile shape exactly** (icon + label + big mono value + colored status dot + one-line detail,
`display:grid` — see lines 2057–2105 for the pattern to clone), so this reads as a natural extension
of Overview's own visual language, not a bolted-on new component. Each tile is clickable
(`onClick:()=>setTab('<id>')`) to jump straight into the full tab — same "headline number, one-line
why, click through to the real thing" shape `src/views/at-a-glance.js`'s `ToleranceRollupTile`/
`OpportunityTile` already establish at the district level; this is that same pattern one level down.

1. **Food Cost** → `foodcost` tab. FOB % vs target, gap in pp, top driver label. Source:
   `buildStoreFobReport()` (`engine/fob-report.js`) fed by `fobSnapshotByStore()`
   (`engine/eom-inventory.js`) over `ds.qsrFobRows`. **This is the heaviest tile** — the
   period-resolution/report-assembly logic (`nowPeriod`, `lastPeriods()`, `monthlyByLoc`, `curSnap`
   selection) currently lives INLINE inside `FoodCostCockpitTab` (`store-cockpit.js:141-180`), not
   as a reusable function. **Factor that block into an exported helper** (e.g.
   `computeFoodCostHeadline(loc, ds, t)` in `store-cockpit.js`) that BOTH `FoodCostCockpitTab` and
   Overview call — per this repo's standing "check whether a helper exists before writing one" /
   never duplicate a computation rule. If `ds.qsrFobRows` isn't already warm for the selected store
   when Overview renders, decide whether to trigger the same fallback fetch `FoodCostCockpitTab`
   uses (`loadQsrFob()`) or show a lighter "tap Food Cost to load" state until visited — your call,
   but state which you chose and why in the PR body.
2. **Labor & Scheduling** → `laborsched` tab. Crew Labor % vs target + gap, and a SHORT
   (one-clause) version of the Planning-vs-Execution verdict — not the full paragraph
   `LaborCockpitTab` shows. Source: `resolveLaborTarget(t)` (`engine/labor-basis.js`, already
   imported in `store-analytics.js`), `computeLaborGapSplit(rows)` (`engine/labor-gap-split.js`)
   fed by `ds.qsrActSummaryRows` filtered to the store, and `metricRate(ds, loc, weekRange,
   'laborPct')` (`engine/metric-source.js` — add the import, `metricSeries`/`metricAvg` are already
   imported but not `metricRate`). Cheap: `ds.qsrActSummaryRows` is already eagerly loaded, no new
   fetch.
3. **Location Intelligence** → `intelligence` tab. "Total Opp / Year" — the summed dollar
   opportunity across the roadmap. Source: `liComputeAll(loc, ds, settings)` →
   `liBuildRoadmap(stats)` → `roadmap.reduce((s,o)=>s+o.dollarOpp,0)` — both currently
   **module-private** in `features/location-intel.js`, only `LocationIntelligence` is exported.
   Add both to the export list (safe, no logic change) before Overview can call them. Synchronous
   over already-loaded `ds` arrays — no new fetch.
4. **Records** → `records` tab. Best Day Sales (`liveRec.sales.day`) or recent record-break count.
   Source: `computeRecords(ds, window)` + `scopeRecordData(liveAll,[loc])` from `record-day.js` —
   **already imported into `store-analytics.js`** (same file as Overview). Cheapest tile: no new
   import, no new fetch.
5. **Register Audit** → `register` tab. Employee risk counts: `summary.highRisk` (riskScore ≥ 70)
   / `summary.watchCount` (40–69) — both already computed inside `analyzeRegisterAudit()`'s own
   return object (`utils/register-audit.js`, already imported). **Real tradeoff to flag**:
   `ds.auditRows` is a lazy-fill stream — today only `RegisterAuditTab` triggers
   `ensureLazyFill('auditRows')` on demand. Adding this tile means every District View store-dash
   open now pulls Register Audit data eagerly, not just when that tab is visited. Measure the
   actual added load cost (a real timing measurement, not a guess) and report it in the PR body;
   if it's material, consider gating the fetch behind the tile actually scrolling into view rather
   than firing on every Overview mount — your call, but justify it with the real number.
6. **Action Plan** → `action` tab. Top action: `generatePlan(store, settings).actions[0]`
   (`store-dash.js`) — first item by the plan's fixed priority order (OT → Cash O/S → OEPE → …).
   Cheap: plain function over `store`/`settings` already in scope, no new fetch.

## Verification

- All 6 new tiles render real, live-computed numbers for a real selected store (not
  placeholder/mock data) — pick at least 2 different stores and hand-check one tile's number
  against its source tab's own displayed number, to prove the summary and the full tab agree.
- Each tile's click-through correctly jumps to (`setTab`) its target tab.
- The 3 "already represented" tabs (Scorecards/Brief/Forecast) and the 2 "deliberately excluded"
  tabs (3 Peaks/AI Insights) are named in the PR body as intentional non-additions, not silently
  dropped.
- Food Cost tile: confirm the factored-out `computeFoodCostHeadline` helper (or equivalent) is
  genuinely shared — `FoodCostCockpitTab` calls it too, not a second inline copy.
- Location Intelligence: confirm `liComputeAll`/`liBuildRoadmap` exports didn't change any existing
  behavior of `LocationIntelligence` itself (pure export-list addition).
- Register Audit tile: real timing measurement for the added eager fetch, reported in the PR body,
  with your gating decision justified against that number.
- New tiles render regardless of `allStores.length` (i.e. they appear for a true single-store
  context too, not just when the district-wide Enterprise block is present).
- Panel-contract: no changes needed to `StoreDash`'s own chrome (it's a top-level view, not a
  modal) — confirm this stays true, don't introduce a new backdrop/close affordance by accident.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Any redesign of the tabs being summarized (Food Cost, Labor & Scheduling, Location Intelligence,
  Records, Register Audit, Action Plan) — read-only reuse of their existing engines.
- The `allStores.length>1` "Enterprise Overview" district-rollup block at the bottom of Overview —
  leave it exactly as-is, don't fold the new tiles into it or relocate it.
- 3 Peaks and AI Insights tiles — deliberately excluded, see above.
