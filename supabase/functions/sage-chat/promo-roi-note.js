// Shared, Deno/Node-agnostic warning text for SAGE's query_promo_roi tool (dispatch #85 #5).
// Imported directly by supabase/functions/sage-chat/index.ts and by its Vitest test in
// src/__tests__/, so the SAME text that ships to production is what the test exercises -- not a
// re-implementation of it. Plain JS, no TypeScript, per repo convention.
//
// memory/finding-promo-roi-denominator-bias-2026-08-23.md's later measurement (2026-08-23, hours
// after the dollar-split "fix" from #599/#601 shipped) found the shipped split is ALSO
// endogenous: promo spend that scales with traffic sorts busy days into "heavy" before sales is
// ever compared, reproducing a large positive lift even at a true effect of zero (measured:
// +16.5% mean lift, 27/27 stores "pays", zero true effect). Do NOT attempt the real fix (an
// exogenous treatment indicator, e.g. a promo calendar) as a quick win -- it's a design task. This
// note exists so SAGE reports the tool as unreliable rather than presenting its verdicts as
// findings, until that real fix lands.
export const PROMO_ROI_UNRELIABLE_NOTE =
  '⚠️ KNOWN UNRELIABLE — do not present these verdicts as findings. The heavy/light split used '
  + 'here is a function of the outcome it measures (promo spend that scales with traffic sorts '
  + 'busy days into "heavy" before sales is ever compared), which reproduces a large positive '
  + 'lift even at a true effect of zero (measured: +16.5% mean lift, 27/27 "pays", zero true '
  + 'effect). Report this tool as broken/unverified if asked about promo ROI, not as a screen for '
  + 'where to dig. Full writeup: memory/finding-promo-roi-denominator-bias-2026-08-23.md. '
  + 'Matched-day lift — promo-heavy vs promo-light days within each weekday. verdict: pays=sales '
  + 'lift covers the give-away, costs=it does not, neutral=~break-even, n/a=no extra give-away. '
  + 'extra_sales/giveaway/gross_profit are per heavy day, $.';
