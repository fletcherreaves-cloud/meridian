---
name: notes-25-queue
description: Owner "Notes 25" (2026-07-24) — queued items alongside the Visit Readiness workstream. Mix of big projects (Product Mix → Pricing Engine), a systematic vs-LY correctness bug, and several quick wins. Captures each item + status + Claude's triage so we execute without re-deciding.
metadata:
  node_type: memory
  type: project
---

# Notes 25 — queue (owner, 2026-07-24)

Loaded while picking **Visit Readiness** as the active big workstream. Owner: "some are
probably related and easy to complete."

## 1. Product Mix → Pricing Engine  🔷 BIG (own workstream)
- Build **auto-pulls** for product-mix data.
- Use for **unit-movement + pricing** analysis.
- Build a **Pricing Engine** — owner will supply an **old used spreadsheet** as the foundation; build from there.
- Want to **see how price changes affect operations from a sales perspective** (elasticity / what-if).
- Possible **new data sources**: Martin Brower (Sync), Deloitte, McDonald's Pricing Website.
- → Roadmap candidate; likely the next big project after Visit Readiness. Needs the spreadsheet + source recon.

## 2. CFV statistic tracker  🟡 (fold into Visit Readiness)
- Build a **statistic tracker for known variables** on CFV graded visits: **day-of-week, frequency, etc.**
- Related to Visit Readiness / graded-visits — do as part of that workstream.

## 3. Weekly Schedule Summary — Fixed/Floor: projection vs scheduled?  🟡
- Clarify: are the **Fixed/Floor hours projections or scheduled**? Add ability to **list both + the +/- variance**.
- Eventually: a **per-location actionable report** to send stores so they can correct + manage the schedule better.
  (ties to Notes 23 #8 — multi-week history + export.)

## 4. Org Summary — key metrics + ⚠️ systematic vs-LY bug  🔴 IMPORTANT
- Add high-level, high-impact metrics: **FOB, Digital % of Sales**, etc. (suggestions welcome).
- ✅ **vs-LY calc FIXED (v4.522)** — was showing everyone **26–33% down**. Root cause: the shared
  `buildStore` pipeline (`src/engine/pipeline.js`) summed the full current 28-day window for `pSales`
  but `pLY` only over whatever last-year days existed in the data → partial LY coverage read as a
  uniform ~30% decline. Fixed with **matched-day** (a day counts on both sides only when it has real
  sales this year AND a comparable LY value). One shared fix → corrects Org Summary + every per-store
  vs-LY (analytics.js, coaching.js, store-dash.js, store-analytics.js all read the same pSales/pLY).
  Remaining nicety: pipeline reads manual `laborRows` only — could also draw LY from the DAR
  `qsrActSummaryRows.lySales` so cloud-only devices show YoY without a manual upload (follow-up).

## 5. Store Scorecard → rename "Rankings" + add groups  🟢 QUICK-ISH
- Relabel **Store Scorecard → Rankings**.
- Expand to include **groups** (patch / operator / state / org), not just stores.

## 6. Guest Voice — wiring / data pulls  🟠 INVESTIGATE
- "Does not seem to be pulling in emails." Check the SMG VOICE ingest (PDF comments + FullScale Excel)
  wiring + whether the email pipeline is landing. May be env (email pipeline) or code.

## 7. Changelog — refresh + maintain footer section  🟢 QUICK
- The footer section data needs refreshing + ongoing maintenance.

## 8. Data Manager — show source report per Data Type  🟢 QUICK
- For each Data Type listed, show **which actual named report / data** it comes from
  (hover tooltip, fine print, or similar).

## 9. Panel Manager — "add everything" + mandatory-visible flag  🟢 (extends v4.518)
- Owner loves Panel Manager; initial thought: **add everything** into it.
- Open to advice on which items are listed; wants some **mandatory / always-visible** (can't hide).
- Claude advice: keep CORE panels always-on and **not hideable** (avoid hiding Home / Data Manager /
  Settings and getting stuck). Add a read-only **"Always shown (core)"** reference section so the manager
  is a complete map, while only the OPTIONAL set stays toggleable. Add a `locked:true` concept.

---

## Triage summary
- 🔴 **Priority correctness:** #4 vs-LY systematic bug (trust-critical, cross-cutting).
- 🔷 **Big project (queue):** #1 Product Mix → Pricing Engine (needs owner's spreadsheet + source recon).
- 🟡 **Fold into active work:** #2 CFV tracker (→ Visit Readiness), #3 Schedule Fixed/Floor clarify (→ Scheduling).
- 🟢 **Quick wins:** #5 Rankings rename+groups, #7 Changelog footer, #8 Data Manager source labels, #9 Panel Manager mandatory.
- 🟠 **Investigate:** #6 Guest Voice ingest.
