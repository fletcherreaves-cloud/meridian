---
name: project-eom-item-journey
description: EOM count-cycle "Item Journey" visual guide, the two-modes (EOM vs year-round progress) dashboard design, and the authoritative EOM data-coverage audit (what's auto-pulled vs still a gap). Owner's Notes-29 vision — trust through verifiable facts.
metadata:
  node_type: memory
  type: project
---

# EOM Item Journey + Two Modes + Data-Coverage Audit (2026-07-26)

Owner (Notes 29 continuation) asked three connected things: (1) explore the **two
modes** — EOM count-completion vs a **year-round progress/results** view; (2) audit
**what EOM data is still not auto-pulled**; (3) can we **map a raw item's count
cycle and show, visually, where it went wrong** — "a visual guide to show the path
of items and where it went wrong… by item or complete count." The recipients mostly
**don't know how to diagnose food cost** — so the output must be visual, plain, and
build trust by getting the facts **provably** right.

> **OWNER'S TRUST PRINCIPLE (verbatim intent, load-bearing):** *"When we can [point to
> what happened] with authority, backed up by data that can be easily verified, we
> gain trust and repeated good corrective behavior. Part of what makes this platform
> valuable is the trust that we are 100% sure we get the facts right and verified."*
> → Every surfaced statement is tagged **fact** (read straight off the item ledger,
>   verifiable) or **inference** (a data-backed educated guess to confirm on-site).
>   Never blur the two. We only assert what the ledger proves.

---

## 1. ✅ Item Journey — the count-cycle visual guide (SHIPPED v4.542)

**The data was already being pulled.** `mapRawItemHistory` (eom-parsers.js) parses the
eBOS `raw_detail/{itemId}` response into a full movement ledger — every **invoice,
POS sale, waste, comp-waste, transfer, and physical count** with date, qty change,
$ impact (on counts), and the counting manager (eID). It already reached the client
in `rawByLoc[loc][i].history`; it just fed the `raw-items-timing` diagnosis check and
was never *visualized*.

**Engine — `src/engine/eom-item-journey.js`** (`buildItemJourney`, `buildStoreJourneys`):
- Classifies each ledger event into a **lane**: `received / used / waste / transfer /
  count` (`SOURCE_LANE` + `LANE_META` with colors + flow sign).
- Sorts chronologically, tallies flow totals (received in, used/waste out, net transfer),
  computes **waste share of outflow**, finds the **break-point count** (largest |$|),
  and **nets the count variance $** for the period.
- Emits **signals**, each `kind:'fact'` or `kind:'inference'`:
  - FACT: every material count variance, attributed to its **date + counter**.
  - INFERENCE: recoverability — a big variance realized **before** the count window is
    *locked for the period* ("recount now won't recover it — verify the count sheet");
    **inside** the window it *may* be recoverable ("recount + resubmit").
  - INFERENCE: waste dominates outflow (≥15%) → "usage driven by waste, not sales."
  - INFERENCE: net transfers out → "confirm the paired store logged the matching side."
- **Verdict** headline (good/warn/bad) = net count $ vs a $50 floor.
- `buildStoreJourneys` = worst-net-variance first. Tests: `eom-item-journey.test.js` (8).

**UI — `ItemJourneyView` in `eom-dashboard.js`** (modal opened via **📊 Item journeys**
button in the 🔬 Diagnose modal, shown when the store has raw-item detail):
- Verdict banner → flow-summary chips → **count-cycle timeline** (every event, count
  events as gold diamonds with $, count-window days flagged with a gold dot) →
  **What the data shows** (✓ Verified green / 💡 Likely-check blue) → a legend footer.
- Worst-first item picker chips at the top (net-variance $, color = verdict tone).

**Deliberately honest limits:** Item Journeys only cover items with a pulled
`raw_detail` — currently the **top-20 actionable WRINs per store** (|$| ≥ 50). That's
right for diagnosis but is NOT the full catalog. Broadening is a data-pull decision
(see audit §3). The verdict/inference heuristics are intentionally conservative.

---

## 2. ✅ Two modes — EOM vs year-round progress (SHIPPED v4.542)

**Problem it solves:** Count Progress % + Last-Count only meant anything in the
last-3-day window, because the On-Hand pull was gated to those days. Off-window the
dashboard looked empty even though FOB + diagnosis are cloud-fresh all month.

**Enabler — On-Hand year-round daily snapshot** (`scripts/qsrsoft-onhand-pull.mjs`):
- `runMode()` replaces the hard window gate. Inside the last-3-days window → hourly
  pull (count-completion tracking, unchanged). Outside it → **one light snapshot per
  day** at `ONHAND_PROGRESS_HOUR` (default **10:00 UTC**, matching the other pulls) so
  `last_counted` freshness stays current all month. `ONHAND_PROGRESS=0` disables the
  daily snapshot; `ONHAND_FORCE=1` still forces any run. Workflow cron unchanged
  (hourly) — the script's gate decides which hours actually work.

**Client — mode toggle** (`eom-dashboard.js`): a header segmented control
**[EOM Count] [Year-Round]**.
- `defaultModeFor(period)`: EOM only when the selected period is the current month
  AND today is in its last 3 days; otherwise Progress. Re-defaults on period change;
  manual toggle overrides after.
- **EOM mode**: emphasizes count-completion (current behavior).
- **Progress mode**: sub-header reframes to freshness + results; the **Last count**
  cell shows **"Nd ago"** (red past 40 days). Count % is understood as window-only.

---

## 3. 📋 EOM data-coverage audit (what's auto-pulled vs still a gap)

**✅ Auto-pulled to Supabase (cloud-fresh, all devices):**
| Stream | Table | Script / cadence |
|---|---|---|
| Variance Stat (monthly + daily) | `qsr_variance_stat` | `qsrsoft-variance-pull.mjs`, daily 10:30 UTC |
| Yields (merged onto variance for the cause overlay) | (on variance rows) | same pull |
| Waste / comp-waste / promo | `qsr_waste` | same pull |
| Transfers | `qsr_transfers` | same pull |
| Raw-item forensic ledger (**top-20 actionable WRINs/store, \|$\|≥50**) | `qsr_raw_item_detail` | same pull |
| On-Hand count progress | `qsr_onhand` | `qsrsoft-onhand-pull.mjs` — hourly in window **+ daily year-round snapshot (new)** |
| FOB $ / components | `qsr_fob` | existing FOB pull |
| eBOS purchases | `qsr_ebos_daily` | `qsrsoft-ebos-pull.mjs` |
| DAR (sales/DT/labor/hourly) | `qsr_daily_activity` | `qsrsoft-dar-pull.mjs` |

**⚠️ Still a gap (not yet auto-pulled / wired):**
1. **`qsr_inventory_summary`** — loader/saver exist in `supabase.js`, but **no script
   populates it**. The Physical-Inventory / Inventory-Summary eBOS endpoint hasn't been
   captured. (Task #60.) This is the by-class ending-inventory summary — would give the
   "complete count" (whole-store) view that complements the per-item journey.
2. **Full-catalog raw_detail** — journeys cover only the top-20 actionable WRINs/store.
   A "trace ANY item" experience needs a broader (or on-demand per-WRIN) `raw_detail`
   pull. On-demand fetch when a user opens an item not in the top-20 is the cheap path.
3. **`monthly_targets` → diagnosis checks** — the FOB-component check still uses a band
   floor, not the store's real monthly target. Wire `monthly_targets` in (Task #60).
4. **purchases-posted check** — registered but pending; confirm eBOS "posted vs pending"
   purchases so late-posted invoices can be attributed.
5. **CoachQ** (owner exploratory) — surface recommended FOB prompts / tap QSRSoft's own
   AI. Feasibility unknown; investigate. See `memory/coachq-query-patterns.md`.

---

## 3b. ⏰ Notes 30 (owner, 2026-07-26 night) — NEXT SESSION queue

**A. Item Journey enhancements (EOM Dashboard → 🔬 Diagnose → 📊 Item journeys):**
1. **Show the actual item quantity variance** on the timeline/verdict (not just $). **Bonus:** convert to **cases** where appropriate (use `case_sz`/UOM from `qsr_inventory_summary` or the raw-item UOM).
2. **Add column headers** to the timeline (Date · Type · Qty/Detail · $).
3. **Match the over/under variance qty to the current Variance Stat report — must tie out EXACT.** The journey's netCountDollars / count difference should reconcile to `qsr_variance_stat.dol_diff` (and unit variance to `variance`) for the same WRIN+period. Verify and, if off, fix the attribution (likely a sign or aggregation mismatch). This is a trust-critical reconciliation.
4. **Make the flow chips (Received / Used / Waste / Transfer) clickable** → drill to the actual underlying events for review (the ledger rows already exist in `history`; render a filtered event list per lane on click).

**B. Dashboard data gap (screenshot 2026-07, Year-Round mode):** Count Progress, By Class, and Last Count all show 0% / "—" for every store; Count Window = "not yet". Root cause to CONFIRM next session: `qsr_onhand` has no rows for 2026-07 yet — On-Hand only pulled inside the last-3-day window, and the new year-round daily snapshot (`runMode()` in qsrsoft-onhand-pull.mjs, v4.542) **may not have run yet** (just shipped; also the July window opens the 29th). Verify the daily snapshot actually fires and populates `qsr_onhand` so Year-Round mode shows last-count freshness before the window. If the snapshot works but the table's still empty, check the pull's auth/period. FOB $/% populate fine (qsr_fob is flowing), so the dashboard itself is healthy — this is purely an On-Hand data-availability question.

## 4. Next candidates (for when the owner returns to EOM)
- **Complete-count (whole-store) journey** once `qsr_inventory_summary` is pulled —
  same fact/inference visual, but rolled to the class/store level (the "by complete
  count" half of the owner's request).
- **On-demand raw_detail** so any WRIN (not just top-20) can be traced.
- **Print/PDF + share** the Item Journey (owner values "passing the information along").
  Today only the text diagnosis report prints; the visual journey does not yet.
- Wire `monthly_targets`; purchases-posted; shift-level attribution; cross-store per-WRIN
  yield drill.
