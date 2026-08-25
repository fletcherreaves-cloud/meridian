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

---

## Resolution (2026-08-25)

**Option 1 checked out.** Investigated org_events' promo-tag provenance before trusting it, per
this dispatch's own instruction — queried production directly with `SUPABASE_SERVICE_ROLE_KEY`
(`select * from org_events where event_type='promo'`, all 756 rows, not a sample). Every single
row carries `entered_by:'lto-import'`, `method:'bulk upload'`, and its `(label, date_start,
date_end)` matches `data/marketing-calendars/2025-opnad-retail-windows.json`'s program names and
dates exactly — e.g. the first row is `loc:6972, date_start:2025-01-07, date_end:2025-02-09,
label:'Value for Money: McValue Menu'`, byte-identical to that JSON's first entry. All 27 stores
carry the identical 28 rows each (756 = 27 × 28) with identical dates — one national calendar
applied uniformly, not 27 independent store-level judgment calls. **This is McDonald's corporate
OPNAD marketing calendar, bulk-imported by a script/process outside this repo (not itself found —
`data/marketing-calendars/README.md` still says "not yet done" as of 2026-08-23, so the import
ran between then and 2026-08-24's measurement in an untracked way), set months ahead of any given
trading day, genuinely independent of that day's own sales.** Nothing in the data or its
provenance metadata suggests any row was entered after the fact from a sales observation.

**The fix, in both files.** `src/engine/promo-roi.js`'s `matchedLift()` no longer takes an
`intensityField`/median split at all — it takes a `tagCoverage` object (built by the new
`promoTagCoverage(userEvents)`) and splits each store's days into **tagged** (a real, org-sourced
`event_type='promo'` entry covers that date) vs **untagged**, restricted to that store's own
**known calendar-coverage window** (`covStart`..`covEnd`, the earliest/latest date any tag for
that store actually touches). `supabase/functions/sage-chat/index.ts`'s hand-ported `matchedLift`
got the identical restructuring, with its own `loadPromoTagCoverage()` querying `org_events`
directly (service-role access makes this simpler server-side than the client's day-map
reconstruction). The discount lever passes an always-empty coverage map (`NO_EXOGENOUS_SIGNAL`)
to the same function on both sides, so its "no candidates" result is structurally honest rather
than an accident of borrowing promo's calendar.

**A real trap this surfaced, not anticipated by the dispatch: coverage vs. saturation.**
Restricting the comparison to each store's *own known coverage window* (rather than treating any
date outside a tag as "confirmed untagged") is load-bearing for two separate reasons measured
directly against production, not assumed:
1. **A date the calendar has never reached is unknown, not evidence of "no promo".** Silently
   defaulting an out-of-coverage day to "untagged" would inject exactly the kind of unverified
   assumption this whole dispatch exists to remove.
2. **Production's promo calendar currently only reaches 2025-12-02** (measured: `min(date_start)`
   = 2025-01-07, `max(date_end)` = 2025-12-02, all 756 rows). Today's date is 2026-08-25 and the
   app's live sales streams run through the present. **That means the exogenous split currently has
   ZERO overlap with the sales data the live panel/SAGE tool actually load** — the fix is
   methodologically sound but, as shipped, will show "cannot determine" for present-day queries
   until a 2026 calendar is loaded. The raw materials already exist and are uncommitted-to-DB:
   `data/marketing-calendars/REV_2__2026_OPNAD_Calendar_10.29.25.pdf` (not yet extracted) and two
   2026 media-mix workbooks (different shape — GRPs by week-start, not start/stop pairs). Extracting
   and loading those into `org_events` is real, separate follow-up work, explicitly out of this
   dispatch's scope (it's a data-acquisition task, not an engine-methodology one) — **flagging it
   here so it isn't mistaken for "the fix doesn't work."** The fix's correctness was validated with
   synthetic data specifically because production has this gap right now (see below); it is not
   evidence the methodology is untested, only that the live calendar needs a refresh.
3. **Even setting the 2025-vs-2026 gap aside, 2025's real coverage is itself near-saturated**:
   measured directly, 357 of 365 days in 2025 carry SOME promo-type tag for a given store (pooling
   every subtype including Happy Meal rotations, which run almost continuously), leaving only 8
   untagged days all clustered at the very start/end of the year — not enough spread across
   weekdays for a real matched comparison. Excluding Happy Meal-labeled rows specifically (a
   judgment call about which campaigns plausibly drive register-level discount dollars) raises
   the untagged count to 61 days in 5 real gaps, which likely would score usably — but that
   exclusion is exactly the kind of "clever, unverified split choice" this dispatch's own history
   warns against making on assumption, so **this fix pools all `event_type='promo'` subtypes,
   matching dispatch #108's own precedent** (its `measure-tagged-event-impact.mjs` pools the same
   way) rather than inventing a new subset rule. The practical upshot, stated plainly: **even once
   a 2026 calendar is loaded, this screen may score few or no stores if 2026's promo coverage is
   as saturated as 2025's** — that would be an honest "cannot determine" from real data scarcity,
   not a bug, and not something to paper over with a narrower, unverified tag definition.

**Validated against the finding's own realistic construction, not an easier one.** Built
`memory/data/promo-roi-bias-sim-exogenous-tag-zero-effect.mjs`, reusing the finding's exact "spend
scales with traffic" generator (promo dollars = ~3% of sales × noise, so give-away dollars are
mechanically driven by that day's own volume — the property that broke both prior fixes) and
adding a realistic national-calendar tag: several ~4-week windows, identical across all 27
simulated stores, assigned **without ever reading sales or spend** — the one structural property
a real corporate calendar has that neither retired split did.
- **At a TRUE effect of 0%**: the new exogenous split measures **mean lift −0.51%** across 27/27
  stores. Reproduced the retired dollar split on the *identical* sales/spend generator inline in
  the same script for direct comparison: **+16.9%** — matching the finding's own +16.5% within
  simulation noise, confirming this isn't a softer test.
- **At a KNOWN +8% effect** (`promo-roi-bias-sim-exogenous-tag-known-effect.mjs`, tag assignment
  still independent of sales, only the *outcome* on tagged days is genuinely higher): the new
  split recovers **mean lift +8.38%**, 27/27 stores scored, 0 negative — essentially unbiased, and
  proof the method isn't just reporting ~0% regardless of input (the dispatch's own explicit
  warning against a fix that would pass the zero-effect test vacuously).
- Both ported into `src/__tests__/promo-roi.test.js` as real CI assertions (not just standalone
  scripts) — a revert of the split logic fails the suite, not just a manually-run `.mjs` file.
- Added a coverage-window-exclusion test (a store with 91 days of sales but a calendar known only
  for the first 35 correctly excludes the other 56, rather than treating them as untagged) and a
  full `computePromoDiscountRoi(ds, userEvents, opts)` wiring test built specifically to satisfy
  "would this verification still pass if the change were reverted" — it constructs the district
  through the real `ds` + `userEvents` call path (not a direct `matchedLift` override) and confirms
  omitting `userEvents` degrades to the same honest empty result rather than silently defaulting
  back to something plausible-looking.

**UI and SAGE tool surface updated to the narrower, honest claim (item 4).** `src/views/promo-roi.js`
replaced the old "known-unreliable, do not act on these" red banner with a real methodology
explanation (what the split now is, and each store's actual calendar coverage window when data
exists) and split the "not enough data" empty state into three distinct, correctly-labeled cases:
ordinary data-volume shortfall (existing copy, unchanged), "no exogenous promo-calendar tag covers
the loaded range" (new, promo-specific, names the fix — tag/confirm in Calendar Manager or widen
the date range), and "no exogenous signal exists at all" (new, discount-specific, states plainly
this is a structural limit, not a temporary gap). SAGE's `query_promo_roi` tool description,
`promo_note`/`discount_note` return fields (`supabase/functions/sage-chat/promo-roi-note.js`), and
its response shape (`n_candidates`, `coverage`, `reason`) were rewritten the same way — SAGE can
now see and say *why* a period can't be graded instead of only "unreliable, don't act on this."

**Explicitly not done this pass, named so nobody re-discovers it as a mystery:**
- **The 2026 marketing calendar was not extracted or loaded.** This is the reason the live fix
  will show "cannot determine" today — see the trap above. Real follow-up work
  (`data/marketing-calendars/REV_2__2026_OPNAD_Calendar_10.29.25.pdf` + the two media-mix
  workbooks), not touched here because it's data acquisition, not engine methodology, and this
  dispatch's scope was the split logic.
- **Did not investigate whether the near-saturation problem (2025's 357/365 tagged days) also
  affects the underlying business reality** — i.e. whether McDonald's really does run *some*
  national campaign almost continuously, which would mean "was a promo running" is close to
  always-true and a genuinely different question (which campaign, how intensely) is what actually
  varies. That reframing, if real, is a design question for a future dispatch, not something to
  resolve by picking an ad-hoc campaign subset here.
- **The `minDays=24`/`minPerCell=2` thresholds were not re-validated** — inherited unchanged from
  the retired split; this dispatch changed the split variable, not the scoring thresholds.
- **No live production render was performed** — `PromoRoiPanel`/`query_promo_roi` were exercised
  against synthetic `ds`+`userEvents` fixtures built to mirror production's real shape (verified
  against the actual `org_events` schema and the actual `orgEventsToDayMap()`/`mf_events`
  contract), not against a real logged-in session, since this environment has no path to real
  end-user session state. Given the coverage gap above, a live render today would show the
  "cannot determine" state for both levers regardless — there is currently no loaded promo-tagged
  period that overlaps real 2026 sales data to render a scored table against.
- **`sage-chat` needs a redeploy** (`supabase functions deploy sage-chat --no-verify-jwt`) for
  SAGE's side of this fix to reach production — not run from this environment, per the existing
  standing pattern for edge-function changes in this repo.

**Verification bar, status:**
- ✅ Realistic zero-effect simulation shows ≈0% (−0.51%), not the retired split's +16.5%/+16.9%.
- ✅ Known +8% effect construction recovers ≈true effect (+8.38%), proving the method isn't
  vacuously reporting zero regardless of input.
- ✅ Neither simulation grants independence (no constant spend, no coin-flip promo assignment) —
  both reuse the finding's own "spend scales with traffic" generator throughout.
- ✅ `PromoRoiPanel` and `query_promo_roi` rendered/exercised against realistic fixtures; honest
  "insufficient exogenous data" states confirmed for both the no-coverage and no-signal-exists
  cases, distinct from the ordinary low-volume empty state.
- ✅ Full suite 2381/2381 green pre- and post-rebase onto latest `main`; `npm run build` clean.
- ✅ Entry chunk measured before/after by stashing the change and rebuilding both states: 1568.32 KB
  / 456.87 KB gzip → 1570.64 KB / 457.68 KB gzip (+2.32 KB / +0.81 KB gzip).
- ⚠️ Not verified against a live production render (see "explicitly not done" above) — the honest
  reason is stated, not glossed over: production's promo calendar currently doesn't overlap
  present-day sales data at all.

**What remains uncertain, stated plainly rather than left implicit:** this fix removes the
*measured* bias mechanism (selection on the sales outcome) and replaces it with a variable proven
independent of that mechanism. It does **not** newly establish that promos "really" pay or don't —
same as the original finding's own explicit scope note. It also does not yet have live production
data to run against. What can be said with confidence: the split variable is no longer a function
of the thing it's trying to measure, which is the specific, narrow claim this dispatch asked for.
