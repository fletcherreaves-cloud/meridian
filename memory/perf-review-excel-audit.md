---
name: perf-review-excel-audit
description: Phase D audit of the app's Performance Review config (DEFAULT_REVIEW_CONFIG in review-engine.js) against the authoritative MFR_Performance_Review_ver_4.xlsm workbook (owner-provided 2026-07-27). Weights match exactly; several metric SCORING THRESHOLDS diverge and need owner decisions before aligning (scoring-critical).
metadata:
  node_type: memory
  type: project
---

# Perf Review — Excel Audit (Phase D of #59, 2026-07-27)

Source of truth: **MFR_Performance_Review_ver_4.xlsm**, sheets **Category Weights**
and **Metric Scoring**. Compared against `DEFAULT_REVIEW_CONFIG` in
`src/engine/review-engine.js`.

## ✅ WEIGHTS — full match (no change needed)
- Overall split: **Metrics 70% / Behavioral (Human Element) 30%** ✅
- Category weights (Results): RGR **0.325**, Sales **0.10**, Profit **0.325**, People **0.25** ✅
- RGR metric weights: OEPE .20, OSAT .10, EPB2B .10, R2P .10, DelivWait .10, KVS .10,
  2ndSide .05, Complaints .05, FS Audits .05, EcoSure .10, FS Tablet .05 (Σ=1.0) ✅
- Sales: .70 / .15 / .15 ✅ · Profit: .35 / .35 / .15 / .15 ✅ ·
  People: .25 / .15 / .30 / .20 / .10 ✅
- **Note:** the workbook has a **"2026 PACE"** alternate weighting column (OEPE .25,
  OSAT .50(?), R2P .15, DelivWait .05 … + a new **Delivery Star Rating .05**). Looks
  like a forthcoming 2026 re-weight — confirm with owner whether to add as a template.

## ⚠ THRESHOLDS — discrepancies to resolve (scoring-critical; do NOT change silently)
Format: **metric** — Excel band (4/3/2/1) vs app `t:[t4,t3,t2]`.

### Confirmed MATCHES
- **R2P Front Counter** — Excel ±5 / 10 sec ≈ app abs `[-5,5,10]` ✅
- **KVS** — Excel ±3 / 6 sec = app abs `[-3,3,6]` ✅
- **Delivery Wait** — Excel 3:30 / 4:00 / 6:00 (tgt 4 min) = app abs `[-30,0,120]` (tgt 240s) ✅
- **Op Supplies** — Excel ±5% / 10% = app pct `[-0.05,0.05,0.10]` ✅
- **0-90 Turnover** — Excel ±5% / 10% = app pct `[-0.05,0.05,0.10]` ✅

### MISMATCHES (need owner decision)
1. **OEPE** — Excel scores by **% of target (±5% / 10%)**, with a 120-sec absolute
   floor for a 4. App uses **absolute seconds** `[-5,5,10]`. → likely should be
   `unit:'pct', t:[-0.05,0.05,0.10]` (+ optional 120s floor).
2. **Voice OSAT** — Excel 4 = **≥+10%**, 3 = +5–10%, 2 = 0–5%, 1 = below. App
   `[0.05,0,-0.05]` (4 = +5%). App is **more lenient** by one band.
3. **Food Over Base $** — Excel **±0.15% / 0.45% of target**; app `[-0.05,0.05,0.10]`
   (±5% / 10%). App ~30× looser. ⚠ big. NEEDS the denominator clarified (% of the
   FOB target $, or % of sales?).
4. **Labor vs Target** — Excel **±0.25% / 0.75%**; app `[-0.05,0.05,0.10]` (±5%/10%).
   Same looseness issue as FOB. Confirm denominator (labor % points vs relative %).
5. **# Shift Certified Managers** — Excel uses **absolute count (+2 / ±1)**; app uses
   **% of target** `[0,-0.10,-0.20]`. Unit mismatch.
6. **Total Profit** — Excel bands ±0.42% / 0.43–1.30% / etc.; app `[0.05,0,-0.05]`.
   Representation differs — review.
7. **Retention Programs** — Excel 4 ≥90.01% of target / 80–90 / 70–79.99 / ≤69.99;
   app `[0,-0.10,-0.20]`. Review.
8. **FS EcoSure / FS Audits / FS Tablet** — Excel absolute % bands
   (95–100 / 85–94.99 / 80–84.99 / ≤79.99); app treats as % **of target**. Confirm
   whether these should score on the absolute % (a 92% EcoSure → 3) rather than % of a target.

## ✅ OWNER DECISIONS (2026-07-27)
- **FOB / Labor thresholds = absolute percentage-POINTS** of the metric (e.g. "FOB%
  within 0.15 pts of the target FOB%"), NOT relative %. → FOB should score on FOB%
  (fob$ ÷ sales) vs target FOB%, `unit:'abs'`, `t:[-0.15, 0.15, 0.45]`; Labor same
  basis `t:[-0.26, 0.25, 0.75]` (in labor-% points). **NOTE:** FOB currently scores
  off `field:'fobDollar'` — this is a metric-definition fix (switch to FOB%), not just
  a threshold change. Confirm the app's stored scale (0.25 vs 25) before finalizing t[].
- **Naming:** DROP "MFR" (previous org). Corrected template = **"Official 2025"**.
- **2026 PACE template:** approved — BUT the workbook's "2026 PACE" column is only
  partially filled (RGR-only: OEPE .25 / OSAT .50 / R2P .15 / DelivWait .05 / new
  Delivery Star .05 = 1.0; no Sales/Profit/People PACE weights). **BLOCKED** pending
  the finalized full 2026 weighting from the owner.

## Recommendation / next
- The **weights are correct** — no action.
- The **thresholds** above are the Phase-D deliverable: present to owner, get decisions
  (especially the ambiguous "% of Target" denominators for FOB/Labor and the abs-count
  for Shift Certified), THEN align `DEFAULT_REVIEW_CONFIG.metrics[*].t` (+ `unit`) to
  match. Phase A snapshot means existing reviews keep their old scoring; the corrected
  thresholds flow into new reviews/templates.
- Consider shipping the corrected numbers as a **named template "MFR Official 2025"**
  (and maybe a **"2026 PACE"** template from the alternate weighting column) rather than
  only mutating the global default — matches the Phase B template model.
