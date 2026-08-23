---
name: finding-food-safety-2026-what-is-actually-measured
description: What McDonald's Food Safety Verification / EcoSure actually assesses (FS-A through FS10, Jan 2026 guide) — temperatures, pests, handwashing, shelf life, checklist competence. Proves Visit Readiness's "Food Safety" flag, which derives from waste and inventory variance, measures none of it. Names the Daily Food Safety Checklist (DFS app) as the real data source.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Food Safety: what is actually assessed — and why the Visit Readiness flag measures none of it

Source: *Operations PACE Food Safety Guide, January 2026* (owner-supplied 2026-08-22, for when
EcoSure reports land). Operational facts recorded for modelling; the document is not reproduced.

---

## The assessed items

| item | what it checks |
|---|---|
| **FS-A-US** | Assessor granted immediate access behind the counter |
| **FS-B-US** | No imminent health hazards |
| **FS1-US** | Free of pest infestation — interior, exterior within 10 ft, corral, shed |
| **FS2-US** | Beef patty internal temp **≥ 155°F** after cooking (10:1 and 4:1) |
| **FS3-US** | Chicken / plant-based **≥ 165°F** (McCrispy for 3rd-party audits) |
| **FS4-US** | Filet-O-Fish **≥ 155°F** |
| **FS5-US** | Breakfast sausage + steak **≥ 155°F** |
| **FS6-US** | McMuffin round eggs **≥ 155°F** |
| **FS7-US** | Manager can demonstrate Daily Food Safety Checklist competence + corrective action |
| **FS8-US** | TCS refrigerated products within primary shelf life (3 random items) |
| **FS10-US** | Handwashing procedure + a system for hourly/activity-based washing |

**Two programs use these:** the **RGRV** Food Safety Verification (internal), and **EcoSure**, the
unbiased **3rd-party** food safety audit.

⚠️ **RGRV rule worth noting:** FS5-US and FS6-US **must** be evaluated if breakfast products are
served at any point during the visit — *"This may require adjusting the timing of the
observations."* So RGRV timing is **not** bound by the CFV 11am–5pm window.

---

## 🔴 This settles the "Food Safety" mislabel (backlog item 1)

Visit Readiness's `FOODSAFETY` group is **`statVar`** (inventory variance) and **`raw`** (raw
waste %). Against the list above:

**There is no overlap. Not partial — none.** Food safety is measured by *temperatures, pests,
handwashing, date codes, and checklist competence*. Waste and inventory variance appear nowhere in
any FS item.

The owner's original objection — *"that would be an inventory/FOB issue and potential
over-production… there will always be waste, it's Fast Food"* — is exactly correct, and the guide
is unambiguous. A store can run high waste with flawless food safety, and can run low waste while
failing FS2 on undercooked patties. **The flag is not imprecise; it is measuring a different
subject.**

**Consequence, restated:** this currently drives the *headline coaching action* on multiple at-risk
stores, displacing the real blocker. Rename to what it measures (waste/variance) and stop it
pre-empting the top line.

## ✅ The real data source exists: the Daily Food Safety Checklist (DFS app)

FS7-US assesses the manager's use of the **DFS app** to record pyrometer temperature readings —
*"demonstrate the procedure of using the pyrometer and recording the temperatures using the DFS
app"*, with a paper fallback when the app is inoperable.

**That is genuine food-safety telemetry, recorded daily, per restaurant** — completion rates,
readings, corrective actions. If it is reachable (API, export, or the same reporting stack as the
other pulls), Meridian could carry a *real* food-safety leading indicator instead of a waste proxy.

**Worth investigating as a data source.** Unknown today: whether DFS data is exportable at all, and
under what system. That question is the natural precursor to any honest food-safety feature —
and note the standing rule that a missing feed is a work item, not a finding.

## Ceiling note for the Model Check

`memory/finding-cfv-2026-visit-rules.md` records that **cleanliness** is scored on every CFV with
no Meridian data source. Food safety is the same shape: scored, consequential, and currently
unmodellable. Both cap achievable correlation regardless of metric tuning — and both have a real
source (DFS app for FS; nothing yet for cleanliness) rather than being permanently out of reach.
