// Shared, Deno/Node-agnostic notes for SAGE's query_promo_roi tool (dispatch #85 #5, updated by
// dispatch-113.md). Imported directly by supabase/functions/sage-chat/index.ts and by its Vitest
// test in src/__tests__/, so the SAME text that ships to production is what the test exercises --
// not a re-implementation of it. Plain JS, no TypeScript, per repo convention.
//
// dispatch-113.md replaced the split entirely. matchedLift used to split each store's days into
// heavy/light at the median of same-day promo-dollar intensity -- a variable that is itself a
// function of that day's sales (real redemptions scale with traffic), so the split silently
// sorted busy days into "heavy" regardless of any real effect. Measured at a true effect of
// exactly zero on a realistic "spend scales with traffic" construction: +16.5% mean lift, 27/27
// stores "pays" (memory/finding-promo-roi-denominator-bias-2026-08-23.md). The fix splits on
// whether a REAL org_events 'promo' tag (the national marketing calendar McDonald's corporate
// sets months ahead) covers that date instead -- verified 2026-08-25 against production that
// every promo-type org_events row today was bulk-imported from that calendar
// (entered_by:'lto-import'), independent of any store's own sales. Re-validated against the same
// realistic construction: memory/data/promo-roi-bias-sim-exogenous-tag-zero-effect.mjs measures
// ≈0% at a true effect of 0%, and promo-roi-bias-sim-exogenous-tag-known-effect.mjs recovers a
// known +8% effect to within a point.
export const PROMO_ROI_METHOD_NOTE =
  'Matched-day lift, split by an EXOGENOUS calendar fact, not by same-day promo spend: a store-day '
  + 'counts as "tagged" only when a real org_events promo-type row (the national marketing '
  + 'calendar, set months ahead by corporate) covers that date. Tagged vs untagged days are '
  + 'compared within the same weekday, and only within each store\'s OWN known calendar coverage '
  + 'window (coverage_start/coverage_end below) -- a date outside that window is excluded, never '
  + 'assumed untagged. A prior version split on same-day promo-dollar intensity and was measured '
  + 'to fabricate a large positive lift even at zero true effect '
  + '(memory/finding-promo-roi-denominator-bias-2026-08-23.md); this tool no longer does that. '
  + 'verdict: pays=sales lift covers the give-away, costs=it does not, neutral=~break-even, '
  + 'n/a=no extra give-away on tagged days. extra_sales/giveaway/gross_profit are per tagged day, $. '
  + 'Still association-with-controls, not a randomized trial -- a directional screen, not proof.';

// The discount lever has no equivalent exogenous signal in this data model: register-level comps/
// overrides are a same-day, reactive decision, and org_events has no 'discount' event type. Any
// matched-day split here would be endogenous by the same mechanism the fix above closes, so this
// lever intentionally reports it cannot be measured rather than a plausible-but-wrong number.
export const DISCOUNT_ROI_NO_SIGNAL_NOTE =
  'Discount ROI cannot be determined here — there is no exogenous, calendar-style signal for when '
  + 'a register-level discount/comp happens (unlike a national promo, it is not scheduled months '
  + 'ahead). Any matched-day split on this lever would repeat the same selection-on-the-outcome '
  + 'bias the promo split above was fixed to remove, so it is intentionally left unscored. Report '
  + 'this as "cannot determine," not as a finding of zero/no effect.';
