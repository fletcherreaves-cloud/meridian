---
name: vision-and-roadmap
description: North-star vision, Smart Targets model design, accuracy-integrity system, strategic-review scope, deployment paths, and the prioritized roadmap (set 2026-07-21)
metadata:
  node_type: memory
  type: project
---

# Meridian — Vision & Roadmap (2026-07-21)

Owner directive: move Meridian from an experience-driven internal tool to
**differentiated intelligence** — surface correlations, composite signals, and
predictions *no competitor is looking at*. Every number must be trustworthy:
**correct math, never average averages, dollar-weight aggregates, self-audit all
reports.** One wrong figure and the whole system loses trust.

## North-star themes
1. **Accuracy is the moat.** A shared, cross-applied accuracy layer + self-audit.
2. **Targets the data proves** — a real target-setting model for ALL metrics.
3. **Discover what others miss** — novel composite signals + grade-visit prediction.
4. **Coherent, best-in-class UX** — standardized modals, one design language.
5. **Multi-user, then multi-tenant** deployment.

---

## Workstream A — Accuracy & Integrity System (FOUNDATION, do first / bake into everything)
A shared toolkit applied at every report/aggregation boundary:
- `assertDollarWeighted()` — aggregates across stores must be Σ$/Σbase, never mean of store %s. Central helpers so no panel re-rolls its own (wrong) average.
- **Never-average-averages guard** — lint/util that flags `avg(of ratios)` patterns.
- **Reconciliation checks** — cross-source totals must agree within tolerance (e.g. sales via ledger vs DAR vs labor); surface mismatches instead of silently picking one.
- **Self-audit pass on generated reports** — each report exposes an invariant set (row sums = total, % in [0,100], date coverage complete) with a visible ✓/⚠ badge.
- **Regression safeguards** for previously-logged bugs: scale mismatches (0-1 vs 0-100), 1000-row Supabase cap (always `fetchAll`), zero-padded loc joins, microsecond/ms unit errors, straight-avg FOB. Codify each as a reusable check.
- Rules live in `memory/project-data-redundancy.md` (freshest-wins) + this file.

## Workstream B — Smart Targets Model v2 (all metrics, forecasted)
See detailed design below. Delivers the visible win AND exercises Workstream A.

**Progress (2026-07-22):**
- ✅ **Pure engine** `src/engine/smart-targets.js` (v4.450) — robustBaseline
  (median ±k·MAD, excluded-days count), trendSlope, likeSizedPeers, peerAnchor
  (good-direction quartile of same-volume-band peers), blend (capped, never worse
  than baseline, direction-aware), confidence, computeSmartTarget. **18 unit
  tests**, all passing.
- ✅ **v2 panel** `src/views/smart-targets.js` (v4.451) — nav 🧭 "Smart Targets"
  (modal key `smart-targets-v2`). Pilots **Sales** from qsr_daily_activity product
  sales; 5-col comparison Official/Smart/Current/vs-Official/Confidence + anomalies,
  FL/OK/patch/store scope, 60/90/180d base. METRICS registry = extension point.
- ⚠️ **A dormant v1 exists**: `src/features/smart-targets.js` (`computeSmartTargets`
  + `SmartTargetPanel`, modal `smart-targets`, no nav). Left intact; decide which
  to retire. v2 does NOT reuse v1.
- **TODO (updated 2026-07-22):**
  - **Multi-projector + win-tracking (owner's #1 ask):**
    - ✅ **Layer 1 shipped (v4.458):** owner's **T3M/T6W/T3W weighted-recency
      projector** as pure fns in `src/engine/smart-targets.js`
      (`weightedRecencyProjection`, `windowRate` w/ anomaly-exclusion +
      `excludeDates`/`eventDelta` hooks) plus a **generic scoreboard harness**
      (`backtestProjectors`, `periodTotal`, `toISODate`) that grades ANY set of
      period-projectors on held-out 28-day folds and names the per-store winner.
      9 new unit tests. Panel (`src/views/smart-targets.js`) now shows a
      **"Best fit"** column (winning method + MAPE per store) and an aggregate
      **Method scoreboard** strip (owner vs 3-wk run-rate vs 3-mo avg wins), plus
      winner/MAPE in CSV. `PROJECTORS` array = the plug-in point.
    - ✅ **Layer 2 shipped (v4.459):** the `src/engine/forecast.js` daily models
      (Composite/Momentum/Regression/Ensemble) fold into the scoreboard as
      period-projectors (sum of daily `forecastModels` over the target window).
      Run **async behind a "＋ Forecast models" button** with a per-(loc,date)
      `fcCache` ref + chunked yields so the panel stays instant on open. Caveat:
      forecast models read daily history from `ds.laborRows` (uploaded
      Operations/Labor) — where that's absent cloud-side they score "—" rather
      than fabricate. **Future:** retarget the forecast models to the auto
      product-sales series so they compete everywhere, not just where labor
      uploads exist.
    - ✅ **Layer 3 — the bakeoff verdict (v4.483, 2026-07-23):** a full backtest
      across **all 27 stores** delivered a decisive result: the **simple trailing
      family (T3M/T6W/T3W · recent-3wk · 3-mo-avg) beat every engineered model.**
      Engineered models (Composite/Momentum/Regression/Ensemble) won **0 stores**;
      on a representative store the simple methods clustered at **5.3–5.5% MAPE**
      while Regression was **14.1%**, Ensemble **11%**, Momentum **10.5%**,
      Composite **8.5%**. Reading: monthly store sales is a stable, mean-reverting
      series — recent trailing level ≈ next month; the engineered models add
      variance with no bias payoff (overfitting). **Second, subtler finding:** the
      three simple methods are **statistically tied** (differences within n=few-fold
      noise), so "best-fit method per store" was chasing coin-flips. **Third, a gap
      the bakeoff exposed:** the recommended "Smart" number was computed by a THIRD
      path (`computeSmartTarget` peer-blend) that **was never in the bakeoff** — we
      were recommending a number we hadn't proven.
    - ✅ **Changes shipped from the verdict (v4.483):**
      1. **Primary Smart number = MEDIAN of the three simple projections**
         (`PRIMARY_KEY='median3'`, `medianProject` in `src/views/smart-targets.js`).
         Median-of-tied-three averages away the per-store coin-flip instead of
         cherry-picking the lowest-MAPE method. Closes the "recommend what we proved"
         gap. The peer-anchored `computeSmartTarget` is **preserved as a secondary
         "stretch target"** on hover — not deleted.
      2. **Backtest decoupled from the learning window** (`BT_DAYS=400`,
         `BT_FOLDS=6`, `BT_PERIOD=28`). A 90-day window only yielded ~2 folds
         (n=2 → noisy winners); pulling ~400 days purely for grading gives up to
         ~6 recent folds while the shorter user lookback still drives baseline/peers.
      3. **Engineered models PRESERVED, intact, on demand** — relabeled "＋
         Diagnostic models" (was "Forecast models"). Kept for diagnosis (why does
         simple win?) and potential **longer-range** use; nothing ripped out. This
         is a standing owner directive: cautiously protect the other models.
    - ⏭️ **Follow-ups from the verdict:** diagnose *why* simple wins and try to
      fold that structure back into the engineered models (candidate for their
      redemption on longer horizons); consider deepening folds further as history
      grows; watch the scoreboard for any store where an engineered model ever
      legitimately wins.
    - ✅ **Known-event (+/-) UI shipped (v4.486):** per-store, per-metric adjustments
      in `smart_target_adjustments` (Supabase): **exclude one-off days** (dropped from
      the learning window so a holiday/outage/remodel doesn't bias the target) +
      **event delta** (signed $ added to the projected total, monthly metrics) + note.
      New **Adj** column on the Smart Targets table opens a per-store editor; loaders
      `loadSmartTargetAdjustments`/`saveSmartTargetAdjustment` (fail soft if the table
      isn't created yet — empty adjustment deletes the row). Wired via the engine's
      existing `excludeDates`/`eventDelta` hooks. ⚠️ needs the `smart_target_adjustments`
      SQL block run in Supabase to persist.
  - ✅ **Ratio metrics shipped (v4.484):** **Labor %** (sales-weighted, from Daily
    Glimpse `laborPct`×`allNetSales`) and **DT speed / OEPE** (car-weighted, from
    Glimpse `oepe`×`dtGC`), both `direction='lower'`. New engine fns
    `weightedLevel` (Σ v·w / Σ w — never averages daily ratios) + `weightedRecencyLevel`
    (recency-weighted trailing levels, the "simple wins" analog for ratios), 4 unit
    tests. METRICS registry now has `ratio`/`weight`/`officialVal`; the model memo
    branches ratio vs monthly; vs-Official coloring is direction-aware; Official
    pulls per-store `tLabor`/`tOepe` from DEFAULT_TARGETS. Ratio metrics skip the
    projector backtest (the ×days bakeoff doesn't apply to a level).
  - ✅ **FOB % metric shipped (v4.489):** resolved the numerator by matching the
    At-A-Glance FOB tile exactly — FOB % = Σ(rawWaste+compWaste+condiments+
    empMgrMeals+statVariance+unexplained)/Σ prodSales, dollar-weighted. `qsr_fob` is
    daily-but-cumulative-MTD, so `fobMonthly()` collapses to one monthly point per
    store (latest row = month total) fed through the ratio engine; official =
    `tFOBTarget`. Recency windows degrade gracefully to a trailing-months weighted
    level (recommend the 180d lookback for FOB).
  - Horizons out to **yearly** (user asked for 60/90/180d → up to 1yr).
  - Auto-run calibration; prompt user for any judgment calls inline.
  - ✅ **"Apply as Official" shipped (v4.489):** per-store ("→ Official") + bulk
    ("✓ Apply as Official") writes the Smart number to `monthly_targets` for the
    upcoming month via `applyOfficialTargets(entries, year, month, col)` — a PARTIAL
    upsert that sets only that metric's column (sales→`sales_proj`, labor→
    `crew_labor_pct`, FOB→`fob_target_pct`; OEPE has no column so no Apply), preserving
    every other target for that store/month. Instant feedback via a per-metric
    `appliedOff` override (ds.monthlyTargets isn't reactive). Feeds Projections.

## Workstream C — The two "next-ups"
- **Projections → current-month actuals for all locations/groupings** (pairs with the *Projections vs Actuals* feature idea).
- **DT/Speed-of-Service → weekly-trend chart by patch/store.**

## Workstream D — UX Coherence & Audit (best-in-class pass)
- **Standardize modals:** one modal shell component, one close affordance (single ✕, top-right, 44px), consistent header/padding/safe-area, consistent surfaces/typography. Today there are several "looks" and mixed close controls (✕ / Close / Exit).
- **Score & polish** every panel/modal/model on effectiveness (esp. ones rushed under time pressure): rate clarity, accuracy surfacing, mobile, flow. Produce a scorecard + fixes.
- **Find holes** — incomplete thoughts/flows, dead ends, half-wired features.
- Lens: end-user making business decisions the moment they open the app — it should "scream progress and getting things done."

## Workstream E — Differentiators (the frontier)
- **Graded-Visit Predictor** (owner's flagship idea): ingest historical **CFV, RGR, Ecosure** grades; map the operational environment (speed, waste, labor, integrity, complaints) in the window preceding each grade; learn the pattern; score each store's current likelihood of passing + the specific levers to pull. New data source to ingest.
  - ⏸️ **BLOCKED on data (2026-07-23):** owner doesn't have an **EcoSure sample** available yet — can't start ingestion/modeling until at least one graded-visit export is in hand. Resume the moment a sample lands. (Standing note carried per owner request.)
- **Novel composite indices** — e.g. Profit-Leak Index (waste+discount+O/S+OT), Operational Coherence Score (speed+labor+accuracy alignment), Traffic-vs-Sales divergence (guest-count leading indicator).
- Rule: only build a target/signal when a correlation is established or industry-proven.

## Workstream F — Deployment
- **Additional users, same org (now):** magic-link login exists; RBAC via `profiles.accessible_locs`. Gaps: invite/provisioning flow, role-assignment UI, per-role scoping tests, onboarding. Data already cloud-first.
- **Future tenant, different company:** multi-tenant. `org_config` already externalizes territory/patch config. Needs: `org_id` on all tables + tenant-scoped RLS, per-tenant data pipelines (their QSRSoft/LifeLenz creds + secrets), branding, onboarding, billing/roles. Larger lift — design doc before build.

---

## Smart Targets Model v2 — design (the "solid plan")

**Goal:** a realistic, forecasted target for EVERY metric, per store, robust to
anomalies, anchored to both the store's own trajectory and its district peers.

**Inputs (cloud-first, all history):** per-metric series from the auto/emailed
streams (DAR summary, Daily Glimpse, qsr_fob components, cash sheet, LifeLenz).
Wire EVERY metric to a source so none are blank — the current "no data" Food &
Paper rows come straight from `qsr_fob` component amounts.

**⭐ OWNER'S INTENT CORRECTION (2026-07-22) — how projection actually works:**
The owner's traditional, proven sales-projection method is **NOT** a plain
baseline×trend. It is a **weighted-recency blend of trailing windows**:
**T3M (trailing 3 months) + T6W (trailing 6 weeks) + T3W (trailing 3 weeks),
with more weight on the most recent window** — while ruling out anomalies and
**accounting for known events (+/-)** (holidays, promos, local events, closures).
Requirement: **run BOTH** — (a) programmatically replicate the owner's
T3M/T6W/T3W weighted method, AND (b) our developed forecast models
(`src/engine/forecast.js` model set). **Track every method's projection per
store and grade which one wins** (lowest error vs actuals) → this per-store
"which-model-wins" scoreboard is itself valuable insight data. Do not lose this
intent: the owner's method is a first-class projector, not a fallback.

**Per store, per metric:**
1. **Robust baseline** — central tendency that ignores anomalies: **median + MAD**
   (median absolute deviation) or trimmed mean. Winsorize / drop points beyond
   k·MAD. Report *how many* days were excluded ("3 anomalous days set aside") —
   this operationalizes the owner's "handle addressable one-offs through store
   discipline, not by baking them into the target."
2. **Own trajectory** — the owner's **T3M/T6W/T3W weighted-recency blend**
   (above), anomaly-filtered, event-adjusted. Robust baseline + bounded trend is
   a *component/sanity-check*, not the whole method. Realistic step, not a leap.
3. **District peer anchor** — FL and OK computed **separately**. Use the district's
   **dollar-weighted** distribution (never average of store %s) for that metric,
   within the store's **volume tier** (compare like-sized stores). Stretch anchor =
   top-quartile in the good direction.
4. **Blend** — target = own-trajectory baseline nudged toward the district
   best-quartile by a **bounded step** (close X% of the gap), **capped** so no
   period demands more than Y% improvement. Direction-aware (lower/higher better).
5. **Confidence band** — from sample size + variance; show target ± band and a
   High/Med/Low tag. Low-sample metrics propose conservatively.

**Aggregation rule:** any roll-up (district/patch/all) is dollar-weighted or
count-weighted as appropriate — **never mean-of-means**. Runs through Workstream A.

**Output columns:** Official (management file) · Smart (this model) · Current
(L4W actual) · vs Official · Status — with excluded-anomaly count + confidence.

---

## Candidate NEW metrics/targets (correlation- or industry-proven)
Only add when data supports it. Have data for most already:
- **DT share of sales %** (profit engine) · **Digital/MOP mix %** (check & frequency lift)
- **DT cars-held / held-time** (throughput) · **Kitchen (MFY) service time** (now surfaced)
- **Speed-of-service per station** · **R2P** (have) · **Guest-count trajectory** (leading vs sales)
- **Waste $ per $1,000 sales** (volume-normalized) · **Promo/Discount %** (margin leak, have)
- **CSAT: OSAT / Accuracy B2B** (SMG, have thresholds) — tie to speed
- **Labor: Act-vs-Need adherence, OT %, TPPH by daypart** (DAR punched/needed)
- **Composite:** Profit-Leak Index, Operational Coherence Score, Visit-Readiness score

---

## Prioritized sequence (proposal)
- **P0** Accuracy layer primitives (build into B immediately).
- **P1** Smart Targets Model v2 (all metrics) → then the two next-ups (Projections current-month actuals; DT weekly-trend by patch/store).
- **P2** UX coherence pass + panel scorecard + hole-finding.
- **P3** Differentiators: Graded-Visit Predictor (ingest CFV/RGR/Ecosure) + composite indices.
- **P4** Deployment: same-org multi-user → multi-tenant design.

## Working agreement (owner-requested)
- Suggest the best prompt when it'll get a better result.
- Flag scope drift; keep us focused.
- Accuracy is non-negotiable — self-audit every generated report.
