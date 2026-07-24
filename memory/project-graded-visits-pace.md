---
name: project-graded-visits-pace
description: McDonald's 2026 Operations PACE graded-visit standards (CFV/RGR/Food Safety) — scoring, thresholds, consequences, and the metric-mapping basis for the Graded-Visit Readiness Index
metadata:
  node_type: memory
  type: project
---

# 2026 Operations PACE — graded-visit standards (source-quoted)

Built from the 10 official 2026 PACE PDFs the owner uploaded (Feb 2026). Extracted text
lives (ephemerally) in the session scratchpad; this is the durable digest. PACE = the
System's largest Brand-Standards program (People·Performance·Process; phases
ALIGN·COACH·EVALUATE). Results feed the **Operations Franchising Standard** (franchise standing).

## Graded visit types (2026)
- **Customer First Visit (CFV)** — UNANNOUNCED, **3×/yr**, one service channel + Behind-the-Counter. Pass = **≥80%**. No remediation, but feeds trend.
- **Running Great Restaurants Visit (RGRV)** — announced, **1×/yr**. Pass = overall **≥80% AND no critical missed AND ≤1 component <80%**. All McD-conducted now (self-assessment gone).
- **3rd-Party Food Safety (EcoSure)** — UNANNOUNCED, **2×/yr**. Pass = **≥80% AND no critical missed**.
- Non-scored: PEAK certification (annual prereq — "unlocks" the year's visits), BAS (Nov 15–Feb 28), Alignment Check-Ins, PACE+ Support Visits (25% of org).

## CONSEQUENCES (the "why operations is critical")
- 1 component <80% → Acceptable, fix in 90d, no re-visit. 2+ components <80% OR overall <80% → **Unacceptable → announced follow-up in 30–90d**. Any **critical missed** (Health&Safety or Food Safety) → fix same day + **unannounced re-check within 14 days**.
- **4 qualifying visits → Operations Process to Cure** (was 2 in 2025). **NEW: mandatory support visit after just 2** qualifying visits (within 90d). Egregious circumstances / refused access / health-dept closure can trigger Process to Cure immediately.
- In Process to Cure: brand-protection remediation continues, other components cease, ongoing Cure Visits. **Repeat unacceptable visits → Business Reviews / Franchising Standards** = franchise standing at risk.
- EcoSure critical miss (FS-A..FS7) → 14-day unannounced full re-visit. Refusing access (FS-A-US) = automatic fail + Process-to-Cure qualifier.

## CFV scoring (≥80% pass; channel pts + 32 Behind-Counter)
Channels: Drive Thru 56, In-Restaurant 61, Curbside 52, Delivery 32. Speed = partial credit, everything else all-or-nothing.
- **DT OEPE ≤120s (8 pts, tiered):** ≤120"=8, 121–140=7, 141–160=5, 161–180=3, 181–190=1, ≥191=0.
- DT **Line Time ≤70s** (4). IR **Wait ≤90s** (4), **R2P ≤90s** (8). Curbside/Table R2P+Fulfillment **≤135s** (8, tiered). Delivery **E2E <30min** (diagnostic).
- **Accuracy 8 pts** (all-or-nothing) + sandwich quality 6 + fries 4 in every channel — the heaviest fixed points.
- Behind-Counter (32): eProduction levels, secondary shelf life, UHC holding, fries setup, assembly check, positioning, travel paths, shift-leader focus. "Fresh beef patties cannot be held in UHC."

## RGRV components (pass = ≥80% + no critical + ≤1 comp <80%)
| Component | Pts | Key numbers |
|---|---|---|
| Quality | 75 | fresh beef 175–190°F / frozen 155–170°F; buns ≤48hr; fries hold 7min / hash 10min; initiator ≤5s; assembler ≤2 products; soft drink ≤36°F |
| Service | 102 | **OEPE ≤120s (S6) + trended OEPE (S7)**; **R2P ≤90s (S13) + trended (S14)**; **Delivery ≤5min trended (S21)**; greet ≤10s |
| Cleanliness | 86 | equipment clean/repair; shake+grill certs ≤12mo; 4-step cleaning |
| Shift Leadership | 33 | **travel paths every 30min (15min peak)**; positioning 24hr ahead; pre-shift data; CSAT recovery plan |
| Health & Safety | 37 | CRITICAL Y/N: exits/extinguishers, PPE (ANSI Class 2 vest), fire-suppression 6mo, CO2 alarm |
| Food Safety | 100 | see below |
**NEW 2026: trended OEPE/R2P/Delivery are SCORED** (2 pts each) — met by QoQ improvement OR meeting standard (120s/90s/5min), read from Portal's last completed quarter.

## Food Safety visit (12-stop travel path; ≥80% + no critical; temps taken by mgmt)
**Criticals (Y/N, any No = fail + 14d unannounced re-check):**
- FS-A-US access granted (NEW). FS-B-US no imminent hazard (NEW). FS1 pest-free within 10ft (>5 small flies fails). **FS2 beef ≥155°F/69°C. FS3 chicken/plant ≥165°F/74°C. FS4 filet ≥155°F. FS5 sausage/steak ≥155°F. FS6 round eggs ≥155°F.** FS7 mgr can complete Daily Checklist.
**Scored (FS8–FS33):** handwash ≥100°F; sanitizer ≥50ppm chlorine / quat ≥200ppm; freezers ≤0°F (backup fail >5°F); fridges ≤40°F; hot-hold ≥140°F; **FS31 DFSC ≥90% over 60 days** (systemic fail = >6 missed in 30d); ANSI-certified mgr; allergen program.

## ★ Metric mapping → Readiness Index (feature basis; direction = predicts WORSE grade)
- **Service speed (strongest, ~1:1):** DAR **OEPE** vs 120s, **R2P** vs 90s, delivery restaurant-time vs 5min, **park/pull-forward rate** (inflates OEPE + accuracy risk). **Build QoQ-trend features exactly as the Portal scores them** — near-perfect predictors of the 6 trended points.
- **Accuracy:** **SMG accuracy(B2B) / problem %**, **refund count/$**, **T-Reds-after** (post-total re-rings = wrong orders). Best internal daily proxy for the 8-pt accuracy items.
- **Quality/holding:** **FOB comp waste** (ambiguous — discipline vs remakes; disambiguate with refunds/SMG), raw/stat variance, SMG OSAT-taste.
- **Hospitality:** SMG OSAT/friendliness; labor%/TPPH (thin peak staffing degrades speed+hospitality together).
- **Shift Leadership:** schedule adherence, TPPH, labor gap at peak (LifeLenz VLH), tracking-vs-plan; tighter OEPE/R2P variance = well-led.
- **Food Safety:** hard to predict from sales; use waste/holding proxies + **DFSC completion %** (single best food-safety leading indicator if ingestible). Cook-temp criticals ~ understaffing at grill (weak).
- **Cleanliness = biggest data gap** (only labor-coverage-at-close as proxy) — flag explicitly.
- **Controls metrics (T-Reds/cash O-S/refunds/promo):** NOT directly graded — value is as behavioral proxies (T-Reds-after+refunds→accuracy is the strongest).

### Index design implications
1. Weight toward **Service speed + Accuracy** (heavily graded AND proxied ~1:1).
2. Build **QoQ-trend** features (Portal scores QoQ, not just level).
3. Food Safety = separate binary RISK FLAG (waste/holding + DFSC completion), not a % score.
4. Cleanliness = acknowledged coverage gap.
Design as a transparent weighted composite ("why" explainable), validated against the CFV/RGR outcomes already parsed in `src/parsers/graded-visits.js` / `src/views/graded-visits.js`. EcoSure slots in as another target when a sample lands.

## Other 2026 must-knows
PEAK replaces GDCT; PROPEL replaces GPM. Segmentation no longer sets visit count (all restaurants same #). PACE Standing % removed from Portal; added Drive-Thru/non-DT/SPOD comparison group. CO2: LogicCO2 MK-7 & Analox AX-50 no longer acceptable. Q5→Q5a/Q5b; 2nd beef temp check removed. Grace: 90d RGRV/CFV, 30d Food Safety after Significant Event; 180d/30d after ownership change.
