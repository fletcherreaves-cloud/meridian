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
- **TODO:** extend v2 to labor %, FOB %, speed (add METRICS entries + a source per
  metric; ratio metrics anchor on level with direction='lower'); persist accepted
  Smart targets; add an "apply as Official" action.

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

**Per store, per metric:**
1. **Robust baseline** — central tendency that ignores anomalies: **median + MAD**
   (median absolute deviation) or trimmed mean. Winsorize / drop points beyond
   k·MAD. Report *how many* days were excluded ("3 anomalous days set aside") —
   this operationalizes the owner's "handle addressable one-offs through store
   discipline, not by baking them into the target."
2. **Own trajectory** — robust baseline + bounded trend (slope over trailing
   window), projected forward. Realistic step, not a leap.
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
