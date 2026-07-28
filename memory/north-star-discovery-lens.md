---
name: north-star-discovery-lens
description: The guiding operating principle for Meridian (owner's own framing, 2026-07-27). Do NOT re-implement what QSRSoft already does well — QSRSoft is the system of record and isn't going anywhere. Meridian's job is to BRIDGE THE GAP: use QSRSoft's vast data to do what its architecture structurally can't — cross-silo fusion, real-world decision trees, leading indicators, a learning loop, and novel ways to see data. Discovery over replication. Read every roadmap/feature decision through this lens.
metadata:
  node_type: memory
  type: design
---

# North-star lens: bridge the gap, don't clone the wheel (2026-07-27)

Owner's own framing, verbatim intent: "We don't need to redesign the wheel of what QSRSoft
can do. They're valuable and not going anywhere. My vision is to bridge the gap of what it
can't or doesn't do with the vast data it has… get real-world thought process and decision
trees into more play… discover truly unique and valuable ways to see data differently…
continue expounding on correlations… explore uses not covered in QSRSoft. Learn and burn."

## The principle (apply to every feature/roadmap call)
- **QSRSoft = system of record. Meridian = system of insight & decision.**
- **Don't re-report their data.** If QSRSoft already does X well, we pull/reference it, we
  don't rebuild it. (This tempers the report-catalog: pull for *fusion/decision*, not to
  duplicate a report.)
- **Discovery over replication.** Value = the things their siloed, descriptive,
  benchmark-to-norm architecture structurally CAN'T do.
- **Learn and burn.** Test many hypotheses; keep the ~10% that stick; cheerfully discard the
  rest. High discard rate is the cost of finding the priceless one, not failure.

## The white space (what QSRSoft can't do, by design)
1. **Cross-silo fusion** — join weather × labor-gap × speed × CSAT × waste × promo *together*.
   QSRSoft reports each domain alone. (Started: Signals Scanner, weather/DOW correlations.)
2. **Decision trees / prescriptive "so what do I do"** — encode the operator's real reasoning
   (e.g. "FOB↑ + waste↑ + stat-var normal → portioning, not theft → coach the closer").
   (Started: EOM diagnosis check-registry — generalize it.)
3. **Leading indicators** — today's pattern → tomorrow's predicted outcome, before the P&L.
   (Started: forecast, visit-readiness, signal decay.)
4. **Learning loop / memory** — did the intervention actually move it? QSRSoft has no memory.
   (Started: `saved_correlations` KB + decay monitor.)

## Correlation program — the next depth (owner wants to keep expounding here)
1. **Time-lagged correlations** — "X today → Y in N days," not just same-day. Where causation
   and prediction live.
2. **Multi-metric "syndromes"** — find *clusters* that co-move, name them (e.g. "Friday
   fatigue": late travel-paths + slow KVS + accuracy dip + waste spike). Named = coachable.
3. **Correlation → decision tree → action** — promote a surviving discovery into the
   operator's reasoning + a recommended move. The bridge from "interesting" to "priceless."
4. **Hypothesis Lab (the burn)** — fast test of wild ideas; survivors → KB (with decay);
   discards logged and dropped. A discovery journal, not a one-shot scan.
5. **Causal-ish attribution** — longitudinal: after an intervention, did the metric move vs a
   matched baseline? Turns correlation into "what actually works here."

## Novel indices QSRSoft has no concept of (invent from THEIR raw data)
- **Operational Fragility** — how close is a store to breaking under a rush?
- **Coaching ROI** — did a manager's attention actually move the metric?
- **Manager Effectiveness** — decoupled from store difficulty (adjust for the hand they were dealt).
- **Store Health** — one number with a transparent bridge to its drivers.

## How this steers existing work
- **Opportunity-$ layer** (`design-opportunity-dollars.md`) — keep it, but frame as *decision/
  prioritization* (where's my biggest recoverable $), not a QSRSoft cashflow-widget clone.
- **Report catalog** (`qsrsoft-report-catalog.md`) — pull candidates chosen for *fusion &
  decision value*, not to mirror a report we could just link to.
- **Signals/Scanner + saved_correlations** — the spearhead; the correlation program above is
  its roadmap.
Related: `memory/vision-and-roadmap.md` (accuracy-integrity, novel composite indices, P3).
