---
name: coachq-query-patterns
description: Fletcher's ACTUAL CoachQ (QSRSoft AI) search history, captured 2026-07-26. A map of what he really asks the AI to do — the highest-signal roadmap input for SAGE, the EOM diagnosis engine, Smart Targets, and Labor tools. Endpoint recorded (token redacted).
metadata:
  node_type: memory
  type: project
---

# CoachQ query patterns — what Fletcher actually asks (2026-07-26)

Source: his CoachQ session history. **Endpoint (auth = Cognito ID token in `x-auth-token`, ~1h TTL — TOKENS NEVER STORED):**
`GET https://api.sso.myqsrsoft.com/agents/services/user-sessions/v1/omni/{orgId}` → `[{sessionId, description}]`
(orgId = a546d4ef-684a-4f25-8bc0-6580af068875). Could be pulled to mine his own patterns over time.

## The dominant query (repeated ~20×, near-verbatim)
> **"analyze fob and give me a detailed report and action plan for all items over +/-$50 variance"**
> (variants: "…Look for other opportunities in food cost as well, such as waste or other components";
> "Troubleshoot my FOB"; "…Troubleshoot any opportunities with counting")

⇒ **This is EXACTLY what the EOM 🔬 Diagnose does** (top-5 + ±$50 + action plan + waste + count-timing).
The feature is dead-on his #1 need. The count-timing drill (v4.538) directly serves "troubleshoot counting."
**Implication:** make Diagnose one-click + exportable + district-wide — it replaces his single most-repeated AI task.

## Recurring themes (each = a validated feature signal)
1. **FOB ±$50 + action plan** — core; ✅ built. Also per-store ("35064", "34222", "6972") and all-locations + "top 5 opportunities per location."
2. **Waste deep-dive w/ manager & shift attribution** — "identify shifts and/or managers contributing";
   recurring specific item **Sweetener for Brewed Tea (WRIN 10726-000)**. ✅ manager-share built; ⏳ SHIFT-level
   attribution + per-WRIN yield/serving-factor drill are gaps.
3. **"Realistic" targets, NOT averages** —
   - FOB: *"project where FOB should be for each location… what they realistically should be if controlling components correctly, not averages."*
   - Labor %: *"realistic labor target % (punched hours)… factor in hrs vs needed and hrs vs scheduled."*
   ⇒ Smart Targets should offer a **"well-controlled" target** (best-quartile / entitlement), not just trailing avg.
4. **Loss-prevention by manager** — "Total Order Promo and Cash Refunds by manager, last 30 days, all locations";
   *"employees that should be looked at further… a long-term employee who suddenly began having issues = red flag."*
   ⇒ the **manager-history anomaly overlay** (a good operator's metrics degrading) — matches the diagnosis manager-risk weight; build a controls-by-manager view + change-point flag.
5. **Labor deep-dive** — VLH imbalance, OT, clock-in-early/out-late, daypart hours +/-, per-employee/per-manager trends, T&A. (store 6838/6938, 6-wk lookback, Wed–Tue workweek.)
6. **Forecast integrity** — *"dates over last 2 years when a location had an unusual sales day (anomaly) that should NOT be used in forward forecasts."* ⇒ auto-anomaly-exclusion for Smart Targets / forecasting.
7. **Per-WRIN yield / serving-factor across locations** — recurring (sweetener 10726-000). ⇒ a WRIN drill across stores using Variance Stat + Yields (we now have both streams).
8. **Ops supplies purchases $ by location**; **profit opportunity by patch**; **product-sales proj vs actual** (already have projections/forecast).
9. **"What-if" costing** — *"how much did zeroing out Cajun sauce on 07/07 impact FOB — 438 units @ $0.1982."* ⇒ a quick per-item $ impact calc.

## How this steers the roadmap
- **EOM Diagnose is validated as the flagship** — his most-repeated ask. Prioritize one-click + export + the editable flow.
- **Shift-level + per-WRIN drills** are the next depth layer (he asks for them by name).
- **"Realistic/entitlement" targets** (FOB + labor) is a distinct Smart-Targets mode he explicitly wants.
- **Manager change-point / controls-by-manager** is a recurring loss-prevention ask — pairs with the diagnosis manager-risk overlay.
- **Forecast anomaly-exclusion** feeds Smart Targets integrity.
