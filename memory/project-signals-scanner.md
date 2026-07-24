---
name: project-signals-scanner
description: Signals auto-correlation scanner + expanded metric registry (v4.495) — engine, guardrails, cloud-source wiring, deliberate deferrals
metadata:
  node_type: memory
  type: project
---

# Signals — Auto-Correlation Scanner & Metric Expansion (v4.495, 2026-07-24)

Origin: Fletcher asked (via the claude.ai Home chat, then re-scoped here in Claude Code
against the real repo) to predefine "obvious" signals, audit + expand the available
metrics (he flagged missing regular refunds, T-Reds before/after total, and the cryptic
"Red B"), and auto-run every metric combination to discover high-value correlations.

The claude.ai answer proposed a **standalone Python (pandas/scipy) script writing JSON to
localStorage**. Re-evaluated against the code and rejected that shape: the correlation
engine already existed in JS (`src/engine/signal-registry.js` — Pearson, regression,
`computeCustomSignal`), the stack has zero Python (all automation is Node `.mjs`), and
localStorage violates the cloud-first / freshest-wins rule. Built it in JS instead.

## What shipped

**Metric-registry expansion** (`src/engine/signal-registry.js`, `METRIC_CATEGORIES`):
- Relabeled the cryptic **"Red B %" → "T-Reds Before Total %"** (key stays `tRedBPct`).
- Added the previously-parsed-but-unsurfaced **Controls** loss-prevention family (all
  already produced by `parseCtrlData`, `parsers/index.js:454-473`): `tRedBCnt`,
  `tRedAPct`, `tRedACnt`, `discCnt`, `discAmt`, `promoPct`, `promoCnt`, `promoAmt`,
  `cashOSAmt`, `posOverAmt`, `manualRefAmt` (kept), `cashRefCnt/Amt`, `cashlessRefCnt/Amt`.
- Added Food Cost `discCoupon` ("Disc Coupon %", fobRows).
- **Cloud metric groups** (NEW — the engine previously read ONLY manual-upload arrays):
  `Daily Glimpse (Cloud)` → `glimpseRows`, `Cash Sheet (Cloud)` → `cashRows`,
  `Sales Ledger (Cloud)` → `salesLedgerRows`, `DAR Summary (Cloud)` → `qsrActSummaryRows`.
  Keys are prefixed (`gl*`, `cs*`, `sl*`, `qa*`) so existing saved `custom_signals` that
  reference manual metric keys are untouched. Cloud rows already arrive as `{loc, date, …}`,
  the exact shape `extractMetricValues` wants — no adapter needed.

**Scanner engine** (same file, appended):
- `spearman(pairs)` — Pearson on average-ranked values (monotone/outlier-robust).
- `pValueFromR(r,n)` — two-sided p from the t-stat via a normal-tail approx (accurate for
  n≳30, the scanner's daily minimum; monthly small-n is directional only).
- `benjaminiHochberg(items, alpha)` — FDR; sets `.qValue` + `.fdrSig`. Denominator = all
  pairs scored (not just surfaced ones), so the correction reflects the true search space.
- `scanAllPairs(ds, {granularity, minN, minAbsR, scopeLoc, alpha})` — extracts each usable
  metric once, correlates every pair on shared `loc_period` keys, runs FDR across the full
  test set, THEN surfaces by effect size, sorted by |r|. Returns
  `{metricsUsed, tested, fdrCount, results[]}`.
- `SEEDED_SIGNALS` — 7 curated "obvious" pairings (Park→OEPE, Labor%→TPPH,
  T-RedsBefore%→CashO/S%, Disc%→Sales, GC→Sales, Promo%→GC, FOB%→BaseFood%).

**UI** (`src/views/signals.js`): new **🔎 Scanner** tab (`ScannerTab`) — granularity toggle,
min-|r| + store-scope controls, Run button, ranked result rows (r, ρ, n, q, cross-domain /
⚠nonlinear / FDR✓ badges, `+ Track` → saves to Signal Lab via `saveCustomSignal`), and a
live **Predefined signals** section. `MetricSelect` already iterates `METRIC_CATEGORIES`, so
all new metrics/cloud groups appear in the Signal Lab builder automatically.

Tests: `src/__tests__/signal-scanner.test.js` (18 cases — spearman, p-values, BH-FDR,
scanAllPairs, registry integrity). Full suite 188 pass. Build clean.

## Deliberate deferrals / known limitations (for the next session)

- **`qsr_fob` (qsrFobRows) NOT wired as a scanner source.** It's daily-cumulative-MTD, so
  naive monthly summing double-counts. Needs the same collapse-to-last-day treatment Smart
  Targets uses (`fobMonthly`) before it can correlate correctly. Manual `fobRows` covers
  monthly food cost for now.
- **Raw hourly `darRows` NOT wired** — would need daily aggregation; the daily
  `qsrActSummaryRows` covers the same DAR data at the right grain.
- **`extractMetricValues` drops zero values** (`v === 0` → skipped) for daily granularity.
  For loss-prevention COUNT metrics a legitimate zero-refund day is dropped, so the scanner
  correlates only non-zero days. Left as-is to avoid regressing existing metrics; revisit if
  zero-inflated controls correlations look off.
- Cloud metrics intentionally duplicate a few manual ones (sales/gc/laborPct) so cloud
  loss-prevention fields have cloud outcomes to pair against on devices with no manual upload.
- Freshest-wins is only *partially* satisfied: cloud metrics are ADDED, manual metrics are
  still primary for existing keys. Promoting cloud to primary (or a per-metric fallback) is a
  future call — deferred to avoid changing behavior of saved signals.
