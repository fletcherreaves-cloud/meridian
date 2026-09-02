---
name: finding-controls-vs-outcomes-2026-09-02
description: Owner asked whether stores with looser QSRSoft loss-prevention controls (T-Red/HALO thresholds, cash-over-short tolerance) correlate with worse actual results (T-Reds, cash-over-short, POS-over, refunds). Measured against 27 stores, 1-month and 3-month trailing windows, live Register Audit data. Real finding on T-Red thresholds (a small group of outlier stores, not a smooth trend); the striking cash-over-short correlation is a single-store artifact that collapses when that store is excluded. Shipped as a live, honest, non-causal "District Standard Check" in Signals (v5.330) rather than a one-time claim.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Controls vs. actual outcomes — do looser QSRSoft settings predict worse results?

**2026-09-02, owner ask.** *"See if stores with looser controls set in their systems correlate to
higher cash control issues in their actual results... Perhaps do a 1 month and 3 month look
back."* Full methodology and honest results below — the shipped feature (Signals → 🎛️ Store
Controls → 🔎 District Standard Check) recomputes this live rather than freezing today's numbers.

## Method

- **Predictors**: `qsr_store_controls.config.RFMControls` (tred_before_total_amount,
  tred_after_total_amount, tred_after_total_quantity, halo_amount, halo_quantity) and
  `VarianceControls.max_drawer_cash_over_short_limit` — 27 stores, live service-role read.
- **Outcomes**: `audit_rows` (Register Audit), aggregated per store, dollar-weighted (sum of the
  raw dollar/count numerator over sum of `drawer_sales`, never an average of per-row percentages —
  the CLAUDE.md "never average averages" rule) — T-Red-Before $ as % of sales, T-Red-Before count
  per 1,000 guest checks, cash-over-short (absolute) as % of sales, POS-over as % of sales, refund
  $ as % of sales. Two windows: `date >= today-30` and `date >= today-90` (today = 2026-09-01, the
  table's max date at measurement time).
- Pearson r computed both ways, plus a p-value from a crude normal approximation (no scipy
  available) — treat p-values as directional, not exact.

## Findings

**T-Red thresholds — real, but concentrated in a handful of outlier stores, not a district-wide
trend.** 20-21 of 27 stores run the *identical* config (T-Red Before $10 / After $12 / qty 5). Six
stores run meaningfully looser settings (3708, 10422, 24471, 32525, 34222, 35064 — some 5-10x
looser). All-store Pearson r for `tred_before` vs T-Red-Before-%-of-sales: **+0.48 (1mo) / +0.58
(3mo)**, both p<0.01. But this is driven by the group split, not a smooth relationship: restricting
to only the 21 standard-config stores, r drops to **+0.18 / +0.21** (not enough remaining spread to
mean much). The real, defensible number: **outlier-group mean T-Red-Before rate 4.6-4.7% of sales
vs 3.9% for the standard-config group, in both windows** — real, materially different, but a
group-level finding across 6 stores, not a per-dollar dose-response across all 27.

The three T-Red threshold fields (before/after-amt/after-qty) are themselves nearly perfectly
correlated with each other across stores (r=0.90-0.99) — they move together as one underlying
"how loose is this store's RFM config" factor, not three independent signals. Citing all three as
separate confirmations would overstate the evidence.

POS-over showed a similar all-stores correlation (r=+0.39-0.44) that also weakens/reverses once the
outlier group is excluded (r=-0.29/-0.38 among the 21 standard stores) — the all-stores number was
mostly the same group-split artifact, not an independent finding.

**HALO showed no "looser = worse" case.** If anything the opposite: `halo_amount` vs refund % of
sales was r=-0.43/-0.45 (looser HALO → *fewer* refunds), borderline significant, no causal story
attempted.

**Cash-over-short tolerance — a single-store artifact, not a finding.**
`VarianceControls.max_drawer_cash_over_short_limit` never surfaced before this dispatch. All-store
r vs actual cash-over-short (abs, % of sales): **+0.94 (1mo) / +0.89 (3mo)**, p<0.0001 — looks like
the strongest relationship in the whole analysis. **It collapses to r=-0.03 in both windows once
store 13113 is excluded.** That one store runs a $4,000 tolerance (every other store: $100-700) and
also has by far the worst actual cash-over-short (1.23%/0.59% of sales vs 0.01-0.22% everywhere
else). With n=27 and one point 5-8x outside the range of the rest, a single store can and does
produce a headline-looking correlation coefficient that means nothing about the other 26. Reverse
causation is at least as plausible a story as forward causation here (a chronic-variance store's
tolerance getting manually widened, rather than the wide tolerance causing the variance) — this
data can't distinguish the two directions.

## What shipped (v5.330)

Not a static write-up of the numbers above — a **live** "🔎 District Standard Check" panel
(`src/views/signals.js`, `DistrictStandardCheck` component) that:
- Recomputes the district mode for T-Red Before threshold from whatever stores are currently
  loaded (`districtMode()`, ties broken toward the stricter/lower value).
- Splits stores into standard-config vs non-standard live, fetches the selected 1mo/3mo window via
  `loadAuditRowsWindow()`, and shows the two groups' actual dollar-weighted T-Red-Before rate
  side by side, plus each non-standard store named individually with its own rate.
- Names the single highest-cash-O/S-tolerance store explicitly (never folds it into a group
  average), alongside its actual rate and the district median tolerance for contrast.
- Carries a permanent, un-removable caveat footer: correlational not causal, small-n, "use this to
  decide who to look at, not as proof of why."

Also shipped in the same PR: every other previously-unsurfaced `qsr_store_controls` field the owner
asked about — cash drawer starting amounts (`DrawerBanks`, per register), FC spare drawers
(`SpareDrawers`), Safe Count Controls (backup amount, petty cash), Deposit Settings (armored car,
smart safes, manual-refunds-disabled, deposit validation), and the rest of `VarianceControls`
(invoice price/qty checks, promo/coupon/discount variance tolerances) — all in the per-store detail
panel of the same Store Controls tab.

## What's NOT claimed

- Not a policy recommendation to change any specific store's threshold — the T-Red finding
  supports *reviewing* the 6 outlier stores, not a district-wide mandate.
- Not evidence for standardizing HALO (no consistent "looser = worse" signal there).
- Not evidence that cash-over-short tolerance should be tightened at store 13113 specifically —
  that store's numbers are worth a manual look, but this analysis can't tell you whether the loose
  tolerance is cause or symptom.

## Related

- `memory/project-qsrsoft-controls-endpoint.md` — the original endpoint finding, corrected same day
  (v5.328) for a separate conflation issue (DEFAULT_TARGETS vs QSRSoft's own thresholds).
- `src/lib/supabase.js`'s `loadAuditRowsWindow()` — the exact loader this reuses, already built for
  audit_rows all-stores windowed reads (dispatch #52, Security panel drill-down).
