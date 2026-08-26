# Dispatch #145 — Performance Review RGR: add EAP and EAD as new metrics — OSAT B2B and EPB2B
# BOTH held, owner investigating

**Owner's ask (2026-08-26):** *"Yes, I want to wire it in to the performance review but I wanna
add it as a separate category and keep EPB2B in case I need to use it later. I also want to add
categories if they're missing for the items in the screenshot as they are what's on the yearly
targets. So I believe we will be adding OSAT B2B, EAD which stands for [Voice] Execute As
Designed. Those can be wired up with targets from the yearly targets we already have."*

**⚠️ REVISED SCOPE (2026-08-26, same day) — OSAT B2B dropped from this dispatch, do not build
it.** The original version of this dispatch (superseded, see git history if needed) claimed OSAT
B2B was "fully auto both sides, cleanest of the three." That claim was disproven the same day:
a real target screenshot from Yearly Projections → Target Categories → CSAT showed OSAT B2B
targets in the **1.5%–8.5%** range, but the live `yearly_targets.osat_b2b_pct` values for the
same stores are in the **0.88–0.96** (88–96%) range — a ~22x mismatch. These are two different
concepts sharing a misleading column name; `osat_b2b_pct` is very likely actually a B2B-specific
**problem-rate** target (possibly EPB2B's real target, mislabeled), not a satisfaction-style OSAT
B2B target. This was reported to the owner, who responded: *"On the EPB2B I don't think it's a
mislabel even if the data looks similar. Let me work through it to figure out what needs to be
there and resolve any missing data so there are no questions left — if needed we can pause on
that work for now other than doing the ones where there are no questions."*

**So: OSAT B2B and EPB2B are BOTH held, full stop, pending the owner's own investigation.** Do
not wire OSAT B2B, do not touch `epb2b`, do not guess at either's real target/actual source. This
dispatch covers ONLY the two metrics with no open question — **EAP** and **EAD** — per the
owner's explicit "the ones where there are no questions" instruction. A future dispatch will
cover OSAT B2B once the owner resolves what `osat_b2b_pct` actually is.

This follows a real investigation this session (not guessed): the PM traced "EPB2B" against the
actual FullScale report column headers baked into `src/__tests__/smg-fullscale-dataonly.test.js`
and found the report's real "Experienced a Problem (Yes)" question is the OVERALL section (no
B2B qualifier) — already parsed into `smg_fullscale.overall_problem`, live with real data, just
never wired to any review metric. That's **EAP** (Experienced A Problem) here — a NEW metric,
**not** a rename of the existing `epb2b` key, and unrelated to the OSAT B2B/EPB2B ambiguity above.

## The two new metrics in scope — what's real for each, verified live before writing this

1. **EAP (Experienced A Problem — overall)**
   - Actual: **real, live** — `smg_fullscale.overall_problem` (0-1 fraction; confirmed real
     values across multiple stores, 2026-08-26).
   - Target: **no yearly-workbook column exists for this** (checked `parseYearlyTargets`'s full
     column map — nothing maps to "overall problem"). Override-only via the Targets Editor
     (`target-overrides.js`), same pattern as `totalProfit`/`complaints`.
2. **EAD (Voice Execute As Designed)** — note the owner said "Experienced As Designed"; the
   real field name throughout the codebase (parser, Supabase, yearly-projections.js) is
   **"[Voice] Execute As Designed"** — confirm this is the same concept the owner means before
   wiring (near-certain given "EAD" + "yearly targets" both point at the same field, but state
   this explicitly in the PR rather than silently correcting the name).
   - Actual: **confirmed genuinely absent** — `src/__tests__/kpi-registry.test.js` has a real
     guard test (`'deliberately excludes the yearly-workbook-only fields with no actual source'`)
     explicitly documenting that `voiceEAD` has NO actual-data source anywhere in the codebase
     (dispatch #109's own finding, preserved by a test — do not treat this as new information,
     re-verify it still holds and cite it, don't re-derive). `performance-reviews.js`'s own SRC
     note says the actual would come from **Pace Portal** (not yet ingested — same blocker as
     EPB2B and the original Complaints/Total Profit gaps).
   - Target: **real, already parsed and persisted** — `parseYearlyTargets`'s `voiceEAD` →
     `t.tVoiceEAD` → `yearly_targets.voice_ead_pct` (`src/lib/supabase.js:369`).
   - So: wire the TARGET now (real, auto). The ACTUAL stays manual/override until Pace Portal
     access exists — do not silently invent a fake actual source or leave the metric half-broken;
     state plainly in the PR that this one is target-auto/actual-manual, matching EPB2B's own
     current state.

## Scope — build

1. Add two new metric entries to `DEFAULT_REVIEW_CONFIG.metrics.rgr` (`src/engine/review-
   engine.js`) — `eap`, `ead` (or your preferred key names; state your choice and reasoning if
   you deviate from these). Follow the exact shape of existing entries (`weight`, `better`,
   `unit`, `scored`, `t` thresholds, `src`, `field`, `note`) — you'll need to make a real call on
   threshold bands (`t:[...]`) and `weight` for each; a reasonable starting point is matching
   `osat`'s existing thresholds/weight-scale for EAP (same 0-1 problem-rate family), and
   something conservative for EAD given no actual exists yet to validate against — state your
   reasoning, don't just copy `osat`'s numbers blindly.
   **Do NOT change `rgr`'s total category weight sum silently** — adding 2 new weighted metrics
   to a category whose weights presumably sum to something meaningful today changes that category's
   internal balance; either rebalance the existing RGR weights so the category still sums correctly,
   or make the 2 new ones `scored:false` (reference-only, like `secondSide` already is) if you're
   not confident on the right weight allocation — ask/flag rather than silently guessing a
   consequential weighting decision.
2. Wire the actual in `autoPopulateKPIs` (`review-engine.js`, in the `if (sr)` SMG-FullScale
   block near where `mo.osat = sr.osat5` already lives) — `mo.eap = sr.overallProblem` (or
   whatever the parsed-row field is actually named in `ds.smgFullscale`'s shape — confirm the
   exact in-app field name, it may differ from the raw Supabase column name `overall_problem`).
   EAD gets no actual wiring — it has none.
3. Add a target mapping to `REVIEW_METRIC_TARGET_FIELD`: `ead: 'tVoiceEAD'`.
   `eap` gets NO entry here (no workbook target) — instead add it to `target-overrides.js`'s
   `TARGET_OVERRIDE_FIELDS` (new `tEAPTarget` field, override-only) following the exact pattern
   `totalProfit`/`complaints` already use, with an accurate note explaining why (no workbook
   column, real actual data, override-only target).

## Do NOT

- Do not touch, rename, or repurpose the existing `epb2b` key/metric — it stays exactly as-is,
  override-only, dormant.
- Do not add an `osatB2B` metric of any kind — it is explicitly OUT of scope for this dispatch,
  pending the owner's own investigation into what `yearly_targets.osat_b2b_pct` actually
  represents. Do not guess at a resolution.
- Do not invent an actual-data source for EAD — none exists; leave it manual/override on the
  actual side and say so plainly.
- Do not silently change RGR's category weight balance without either rebalancing explicitly or
  making the new metrics unscored reference-only — this is a real scoring-math decision, not a
  mechanical one.
- Do not re-derive or second-guess `kpi-registry.test.js`'s "no actual source for voiceEAD"
  finding — it's already correct and tested; just cite it.

## Verification bar

- Confirm EAP renders with a real actual and, once an override target is set via the Targets
  Editor, scores normally; with no override set, behaves the same as any other override-only
  metric with no target (flagged by `missingReviewTargets`, not a crash).
- Confirm EAD renders with a real target and an empty/manual actual slot, clearly distinguishable
  from a metric that's broken vs. one that's genuinely awaiting a future data source.
- Confirm `epb2b`'s existing behavior is completely unchanged (same fields, same override
  mechanism, still present as its own metric), and confirm no `osatB2B` metric was added.
- State clearly what weight/threshold decisions you made for the 2 new metrics and why.
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean.
