---
name: project-perf-reviews
description: "Performance Review System — architecture, file locations, data model, and Phase 2 roadmap"
metadata: 
  node_type: memory
  type: project
  originSessionId: ac407d52-bc14-4517-af65-49f116393c04
---

# Performance Review System — v4.223

Built as of 2026-06-27. Fully functional Phase 1.

## Files
- `src/engine/review-engine.js` — scoring engine, config, localStorage helpers (pure JS, no React)
- `src/views/performance-reviews.js` — full UI panel (PerformanceReviewsPanel export)
- Registered in `App.js` as `showPerfReviews` → `modal==='perf-reviews'`
- Nav item in `shell.js` under PERFORMANCE section: "Perf Reviews" → 📋

## Config Storage
`localStorage.getItem('mf_review_config_v1')` — full JSON config including:
- `overall: { metrics: 0.70, behavioral: 0.30 }`
- `categoryWeights: { rgr, sales, profit, people }` with `.weight` and `.label`
- `metrics: { rgr[], sales[], profit[], people[] }` — each metric has `key, label, weight, better, unit, scored, t[3], src, field`
- `competencies: { GM, AM, AS, OM }` — each role has `{ rgr[], sales[], profit[], people[], admin[] }` of string items

## Reviews Storage
`localStorage.getItem('mf_perf_reviews_v1')` — JSON object keyed by `{name}_{year}_{half}`
Each review: `{ id, name, role, loc, year, half, status, kpis:{months:{1..6}}, behavioralRatings:{q1,q2}, comments:{q1,q2,midYear}, wage, createdAt, updatedAt }`

## Monthly KPI fields (in each `kpis.months[N]`)
All fields have actual + `Tgt` suffix twin: `oepe/oepeTgt`, `salesVsTgt/salesVsTgtTgt`, `labor/laborTgt`, `foodOB/foodOBTgt`, `headcount/headcountTgt`, etc.

## Auto-populate Sources
- `oepe, r2p, kvs (kvst)` ← ds.opsRows
- `salesVsTgt, labor (laborPct)` ← ds.laborRows
- `foodOB (fobDollar)` ← ds.fobRows
- All others: manual entry

## Scoring
- `rateMetric(actual, target, metricCfg)` → 1-4 rating
  - `unit:'pct'` → deviation = (actual-target)/|target|
  - `unit:'abs'` → deviation = actual-target (raw units)
  - `better:'higher'` → rating 4 if dev ≥ t[0], 3 if ≥ t[1], 2 if ≥ t[2]
  - `better:'lower'` → rating 4 if dev ≤ t[0], etc.
- `computeScores(review, cfg)` → `{ q1, q2, half }` each with `{ metrics, behavioral, overall }`
- Overall = metrics×0.70 + behavioral×0.30

## Roles
- GM: General Manager (store-level)
- AM: Assistant Manager (store-level)
- AS: Area Supervisor (patch-level — these are the patch supervisors in Settings)
- OM: Operations Manager (market-level)

## Phase 2 Remaining
1. Dev Plan tab (add/edit/track development action items)
2. ✅ Print/PDF export — `printReview()` (full review), `printCheckpoint()` (monthly 1:1 doc)
3. Wage review section wiring in SummaryTab (currently read-only)
4. Year-over-year trend comparison view
5. Hourly manager reviews (lighter version)
6. Tag/search reviews by score range or status

## Monthly 1:1 Checkpoint (added 2026-06-30)
- `printCheckpoint(review, cfg, month, orgLabel, orgLogo)` — new function in performance-reviews.js
- Generates one-page print doc: KPI table for selected month, discussion notes lines, acknowledgment + dual signature block
- Button: "1:1 Checkpoint" in the review header, with a month selector dropdown (defaults to last month in the half)
- Still to add: digital acknowledgment sign-off in the app (store acknowledgment date/name to localStorage so supervisor can log that the 1:1 occurred)

## Additional Requests (2026-06-30)
- Printable/fillable paper form for when manual entry is required
- Monthly checkpoint must be email/print/PDF-able — print is done, email TBD
- In-app sign-off: receiving manager provides code, signature, or login credentials to prove receipt

**Why:** All above-store/above-store context: AS reviews 1+ stores as a patch supervisor. User is Director of Strategy Planning & Improvement (NOT in the review system as a reviewee).
