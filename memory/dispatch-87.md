---
name: dispatch-87
description: The two residual test gaps the engineer self-reported after shipping #628, plus the citation-anchor rule. Small and bounded. #86 is CLOSED -- do not re-dispatch it; this is what is genuinely left of that workstream.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #87 — the residue of #628, and stop citing line numbers

**Reads first:** `memory/dispatch-86.md`'s SHIPPED banner and its `## PM verification` section,
then `memory/dispatch-77.md`'s Resolution.

**Status:** ready. No owner decision. Small — this is deliberately *not* a redo of #628.

---

## 🟢 First, the thing not to do

**Dispatch #86 is CLOSED.** Its work shipped as #628 under the #77 label. The engineer flagged the
overlap before anyone re-ran it, which is the correct behaviour and saved a duplicate build. Two
of its steps landed under different names and are not to be "corrected":

| #86 said | #628 shipped | verdict |
|---|---|---|
| a separate `parts: {num, den}` field | `derive.kind:'ratio'` inside the existing `derive` | **better** — one object, so the marker and the formula cannot drift apart, which was the whole risk `parts:` was invented to manage |
| `metricRollup()` | `metricSumRatio()` | same contract, different name — leave it |
| walk both maps explicitly | `Object.assign(METRIC_SOURCES, DERIVED_METRICS)` already merges them, so one lookup covers both | **verified, not assumed** — exactly what #86 asked for |
| sample real rows to find the 3 denominators | read `loadOpsCashSheet`'s existing inline `amt ÷ net_sales_amt` and reuse it | **stronger** — equal to the stored % by construction, not merely reproducing it |

## Item 1 — pin `metricAvg` against silent absorption

#86's verification bar asked for it, #628 didn't add it, and the engineer said so unprompted.
`metricAvg` was correctly left untouched, but nothing stops a future refactor from quietly folding
it into `metricSumRatio` and moving numbers on ~70 call sites.

Add a test that pins `metricAvg`'s output on a fixture where the two rollups genuinely disagree,
and assert the **mean-of-daily** answer — so the pin fails if anything ever redirects it.

⚠️ Reuse the fixture that already exists in `metric-sum-ratio.test.js` for that disagreement
rather than building a second one; the point is one number, not a new harness.

## Item 2 — per-metric num/den assertions for the other 9

Today `metric-sum-ratio.test.js` has arithmetic blocks for `laborPct` and `discPct` only. The
other nine ratio metrics (`tpph`, `avgCheck`, `cashOSPct`, `tRedAPct`, `tRedBPct`, `compWaste`,
`rawWaste`, `statVar`, `spph`) are covered only by the membership assertion on
`rollupCapableMetricKeys()`.

**The risk is not the summation** — `metricSumRatio` is generic, so if it is right for two it is
right for all. **The risk is a reversed or wrong pair in the declaration**, which is invisible:
`tpph` as `actHrs/gc` instead of `gc/actHrs` produces a plausible-looking number and a silently
wrong ranking. That is a per-metric fact and needs a per-metric assertion.

Cheapest form that actually catches it, table-driven over `rollupCapableMetricKeys()`:

1. `derive.fn(a, b) === a / b` for sample values — pins that `inputs` really is `[num, den]` in
   that order **and** that `fn` is a plain division, not something with a guard that reorders it.
2. For each metric, one fixture where Σ/Σ ≠ mean-of-daily, asserting the hand-computed Σ/Σ.

Table-driven so a newly-marked ratio metric is covered the day it is added, not the day someone
remembers. If a metric can't be fixtured cheaply, **say which and why in the commit body** — do
not silently skip it (`memory/dispatch-85.md` on silent caps).

## Item 3 — convert the remaining line-number citations in the ACTIVE files

The rule is now in CLAUDE.md (*"Cite anchors, not line numbers"*). This dispatch already converted
the `⚠️ ROLLUP CAVEAT` cites in `dispatch-77.md` and `dispatch-86.md`.

**Scope: `dispatch-77.md` only** — it carries **32 `file:NNN` cites**, the most of any file in the
repo, and it is the active reference for this workstream, so its cites are the ones people follow.
Convert them to symbol names or quoted comment phrases.

🔴 **Do NOT sweep the other ~490.** They are archive. The measured reason: correcting a line number
mints a new one that the next PR breaks — #627 fixed `:309-315` to `:349-355` and #628 invalidated
that within hours. A sweep would recreate the problem at scale. Fix one opportunistically when you
are already editing that line; otherwise leave it.

## Verification bar

- Item 1's pin must **fail** if `metricAvg` is redirected to `metricSumRatio`. Verify by actually
  doing it, then reverting — don't assert that it would.
- Item 2 must be table-driven off `rollupCapableMetricKeys()`, and must **fail** if any metric's
  `derive.inputs` pair is reversed. Verify by reversing one, then reverting.
- Item 3: `grep -cE "\.(js|mjs|ts|sql):[0-9]+" memory/dispatch-77.md` goes to 0, and every anchor
  you substitute is greppable — check each one actually resolves.

## Do NOT

- Do **not** re-open or re-implement #86. See the table above.
- Do **not** rename `metricSumRatio` to `metricRollup`, or `derive.kind:'ratio'` to `parts:`.
- Do **not** touch `metricAvg`'s behaviour. Item 1 pins it; it does not change it.
- Do **not** sweep the ~490 archival line cites.
- Do **not** fix the open `avgCheck` sales-basis finding here — it needs the product-sales vs
  all-net-sales gap **measured** first, and then a decision about widening `netSalesAmt`'s chain.
  Recorded in `dispatch-86.md`'s `## PM verification`; owner's call, not this dispatch's.
