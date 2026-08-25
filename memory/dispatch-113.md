---
name: dispatch-113
description: HIGH PRIORITY -- Promo/Discount ROI (src/engine/promo-roi.js + SAGE's query_promo_roi hand-port) is currently live and actively misleading, not just imprecise. Its matched-lift methodology splits store-days into heavy/light promo intensity using a variable that is itself a function of that day's sales (promo dollars scale with traffic), so at a TRUE effect of zero it reports +16.5% mean lift and 27/27 stores "paying." SAGE has already independently refused to trust this screen twice, most recently calling it "not credible" and diagnosing the exact reverse-causality bug on its own. Already-shipped dispatch #111 fixed a separate, unrelated sourcing bug (the discount lever reading manual-only data) and did NOT touch this. memory/finding-promo-roi-denominator-bias-2026-08-23.md is the authoritative writeup, already corrected once in-file after an earlier "fix" (the #601 intensityField change, also already shipped) turned out to make the bias worse, not better in the realistic regime.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #113 — Promo/Discount ROI: replace the endogenous intensity-split with an exogenous comparison

**Read `memory/finding-promo-roi-denominator-bias-2026-08-23.md` in full before starting — it is
unusually important that you read the WHOLE file, including its own top-of-file correction, not
just skim for the fix.** This file already contains one lesson about trusting a plausible-looking
fix without re-testing against a realistic simulation (constant/coin-flip-assigned promo spend is
NOT a realistic test — it grants the independence the estimator needs instead of testing for it).

## The problem, precisely

`matchedLift()` (`src/engine/promo-roi.js`) currently splits each store's days into "heavy" vs.
"light" promo/discount intensity by a **median split on `promoAmt`/`discAmt`** (dollars given
away) and compares average sales between the two groups. This is endogenous: real promo dollars
scale with traffic (more customers → more redemptions → more dollars given away), so the split
itself sorts high-sales days into "heavy" even when promos have ZERO true effect on sales. Measured
in the finding's own realistic simulation (`memory/data/promo-roi-bias-sim-spend-scales-with-
traffic.mjs`, spend scaling with traffic, true effect = 0%): **+16.5% mean lift, 27 of 27 stores
"pay."** The same gap exists in SAGE's hand-ported `matchedLift` in `supabase/functions/sage-chat/
index.ts` (a separate Deno implementation — the same reasoning applies there, not just in the
client engine).

**This is currently live in production**, reporting extra sales that in at least two cases the
finding documents exceed the store's total sales for the day (arithmetically impossible), and SAGE
itself has already refused to act on it twice for exactly this reason.

## What would actually fix it — check the promising lead this dispatch found before assuming you need day-of-week matching from scratch

The finding names three fallback options in order of preference: (1) an exogenous promo-calendar
signal — was a promo *scheduled* independent of that day's outcome; (2) day-of-week × promo-window
matching against the same weekday in a non-promo week; (3) report nothing rather than a
plausible-but-wrong number.

**Option 1 may already be available and unused.** `org_events` already has a real `type==='promo'`
tag (`EVENT_TYPES.promo`, "LTO / Promo") — the SAME calendar dispatch #108's Event Impact Registry
work just measured as having **"756 promo rows / 27 stores, solid coverage"** in production
(verify that count is still accurate before relying on it — it was measured a short time ago in a
different dispatch, re-check don't assume it's stayed the same). If `org_events`'s promo tags were
recorded independent of same-day sales outcomes (i.e., someone tagged "this LTO is running" as a
calendar fact, not derived after the fact from a sales spike), this is a genuinely exogenous signal
sitting in the database already — a much smaller change than building day-of-week matching from
scratch. **Investigate this first**: check how/when `org_events` promo rows actually get created
(Calendar Manager manual entry vs. some derived/inferred process) to confirm they're really
independent of the outcome before trusting them as the treatment indicator. If they check out,
redesign the matched-lift comparison to split by "days with a real org_events promo tag" vs. "days
without," instead of by promo-dollar intensity.

**If `org_events` promo tags turn out to be sparse, unreliable, or themselves outcome-derived**,
fall back to day-of-week × promo-window matching (option 2): compare a promo day against the same
weekday in a nearby non-promo week, which needs no new data source beyond identifying which windows
had promos at all (which the same `org_events` tags, even if sparse, might still answer — or
whatever the actual "was a promo running" ground truth in this data turns out to be).

**If neither is buildable with real, verified-exogenous data, the finding's own explicit fallback
applies: make the screen say it cannot answer, rather than produce a number.** Do not ship a
"less wrong but still endogenous" split as a third attempt at the same mistake — the finding is
explicit that this repo's prior two attempts (percentage split, then dollar split) both failed the
same way, in opposite directions.

## Scope

1. Investigate `org_events`'s promo-tag provenance (Calendar Manager entry path, timing relative to
   the tagged day) to confirm or rule out exogeneity. State the finding plainly either way.
2. Redesign `matchedLift`'s comparison methodology per whichever option (1) or (2) above the
   investigation supports — in both `src/engine/promo-roi.js` and SAGE's hand-ported version in
   `supabase/functions/sage-chat/index.ts` (a genuinely separate implementation, Deno can't import
   the client engine — both need the fix, the same lesson dispatch #111's own resolution already
   learned the hard way for the unrelated sourcing bug).
3. **Build a realistic regression test using the SAME "spend scales with traffic" construction the
   finding used** (`memory/data/promo-roi-bias-sim-spend-scales-with-traffic.mjs` — reuse or port
   this, don't write a new easier-to-pass simulation) at a true effect of exactly 0%, and confirm
   the new methodology reports something close to 0%, not 16.5%. This is the regression bar this
   finding itself sets — meet it, don't invent an easier one.
4. If the fix changes what the panel/SAGE tool can answer (e.g., "report nothing" for stores/periods
   with no real exogenous promo data), update `src/views/promo-roi.js`'s UI and SAGE's tool
   description to be honest about the new, narrower claim — do not silently keep displaying a
   number for cases the new methodology can't actually support.

## Verification bar

- The realistic zero-effect simulation (item 3 above) must show a lift near 0%, not the 16.5% (or
  the old -0.1% percentage-split bias) this finding already measured as wrong in both directions.
- Also construct a KNOWN non-zero effect (reuse the finding's own known-effect construction pattern
  from the earlier, already-shipped fix if one exists, adapted to the new exogenous split) and
  confirm the new methodology recovers something close to the true effect, not just that it reports
  near-zero on a null case — a method that always reports ~0% regardless of input isn't a fix
  either.
- Render the actual `PromoRoiPanel` (`src/views/promo-roi.js`) and confirm real numbers change
  sensibly, and that any store/period the new methodology genuinely can't grade (per item 4 above)
  shows an honest "insufficient exogenous data" state, not a stale or fabricated number.
- Full suite green, `npm run build` clean.

## Do NOT

- **Do not ship another intensity-based split** (percentage or dollar) as a "third try" — the
  finding is explicit this whole family of approach is structurally endogenous, not just
  miscalibrated.
- **Do not construct a simulation that grants independence** (constant spend, coin-flip assignment)
  to validate the fix — the finding explicitly diagnoses this as why the SECOND wrong fix looked
  right in testing. Use the realistic "spend scales with traffic" construction.
- **Do not assume `org_events` promo tags are exogenous without checking their provenance** — verify
  before relying on them as the treatment indicator.
- **Do not touch dispatch #111's discount-lever sourcing fix** — already shipped, correct, and
  solving a different problem (data source, not methodology).
