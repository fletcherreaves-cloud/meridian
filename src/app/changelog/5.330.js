// @ts-nocheck
export default {version:'5.330', date:'2026-09-02', changes:[
  'Signals: Store Controls tab (v5.328) extended with the remaining unused qsr_store_controls ' +
  'fields -- cash drawer starting amounts (DrawerBanks, per-register) + FC spare drawers, Safe & ' +
  'Deposit Controls (backup amount, armored car, smart safes, manual-refunds-disabled, deposit ' +
  'validation), and Variance Tolerances (cash O/S tolerance, invoice price/qty checks, promo/ ' +
  'coupon/discount variance) -- none of these were surfaced anywhere in the app before today.',
  'District-standard flagging: the main table now marks (●) any store whose T-Red Before ' +
  'threshold or cash-over-short tolerance differs from this district\'s live-recomputed most ' +
  'common setting -- never a frozen number.',
  'New "🔎 District Standard Check" panel answers the owner\'s question directly: does a looser ' +
  'T-Red/HALO/cash-tolerance setting actually correlate with worse real-world results? Live, ' +
  '1-month/3-month toggle, computed against real Register Audit data (loadAuditRowsWindow). ' +
  'Ships the honest finding from a same-day 27-store analysis: the handful of stores running a ' +
  'looser-than-standard T-Red Before threshold DO show a materially higher actual T-Red-Before ' +
  'rate (~4.6-4.7% of sales vs ~3.9% for standard-config stores, consistent across both windows) ' +
  '-- shown live per-store, not hardcoded. The cash-over-short "tolerance" finding is flagged as ' +
  'what it actually is: one store\'s number (a $4,000 tolerance vs everyone else\'s $100-700), ' +
  'not a district trend -- the apparent r=+0.94 relationship collapses to r=-0.03 once that one ' +
  'store is excluded, and reverse causation (limit widened because the store already had a ' +
  'variance problem) is at least as plausible as the limit causing it. Never states this as ' +
  'proof of causation -- explicit caveat footer, correlational framing throughout.',
  'Full suite (3718 tests) and build both clean (532.99 KB / 850 KB eager budget). Smoke-tested ' +
  'via dev server + headless Chromium, zero JS errors.',
]};
