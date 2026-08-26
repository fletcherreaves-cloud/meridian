# Dispatch #145 — Performance Review RGR: add EAP, OSAT B2B, EAD as new metrics — keep EPB2B
# untouched

**Owner's ask (2026-08-26):** *"Yes, I want to wire it in to the performance review but I wanna
add it as a separate category and keep EPB2B in case I need to use it later. I also want to add
categories if they're missing for the items in the screenshot as they are what's on the yearly
targets. So I believe we will be adding OSAT B2B, EAD which stands for [Voice] Execute As
Designed. Those can be wired up with targets from the yearly targets we already have."*

This follows a real investigation this session (not guessed): the PM traced "EPB2B" against the
actual FullScale report column headers baked into `src/__tests__/smg-fullscale-dataonly.test.js`
and found the report's real "Experienced a Problem (Yes)" question is the OVERALL section (no
B2B qualifier) — already parsed into `smg_fullscale.overall_problem`, live with real data, just
never wired to any review metric. That's **EAP** (Experienced A Problem) here — a NEW metric,
**not** a rename of the existing `epb2b` key. The owner confirmed: keep `epb2b` exactly as it is
(still override-only, dormant, available if a real B2B-specific problem-rate source shows up
later) and add EAP as its own thing.

## The three new metrics — what's real for each, verified live before writing this

1. **EAP (Experienced A Problem — overall)**
   - Actual: **real, live** — `smg_fullscale.overall_problem` (0-1 fraction; confirmed real
     values across multiple stores, 2026-08-26).
   - Target: **no yearly-workbook column exists for this** (checked `parseYearlyTargets`'s full
     column map — nothing maps to "overall problem"). Override-only via the Targets Editor
     (`target-overrides.js`), same pattern as `totalProfit`/`complaints`.
2. **OSAT B2B**
   - Actual: **real, live** — `smg_fullscale.osat_b2b` (confirmed real values, 0.88-0.96 range
     across stores, 2026-08-26).
   - Target: **real, already parsed and persisted** — `parseYearlyTargets`'s `osatB2B` →
     `t.tOsatB2B` → `yearly_targets.osat_b2b_pct` (`src/lib/supabase.js:367`). Fully auto both
     sides — the cleanest of the three, no override needed.
3. **EAD (Voice Execute As Designed)** — note the owner said "Experienced As Designed"; the
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

1. Add three new metric entries to `DEFAULT_REVIEW_CONFIG.metrics.rgr` (`src/engine/review-
   engine.js`) — `eap`, `osatB2B`, `ead` (or your preferred key names; state your choice and
   reasoning if you deviate from these). Follow the exact shape of existing entries (`weight`,
   `better`, `unit`, `scored`, `t` thresholds, `src`, `field`, `note`) — you'll need to make a
   real call on threshold bands (`t:[...]`) and `weight` for each; a reasonable starting point is
   matching `osat`'s existing thresholds/weight-scale for OSAT B2B and EAP (same 0-1 satisfaction/
   problem-rate family), and something conservative for EAD given no actual exists yet to
   validate against — state your reasoning, don't just copy `osat`'s numbers blindly.
   **Do NOT change `rgr`'s total category weight sum silently** — adding 3 new weighted metrics
   to a category whose weights presumably sum to something meaningful today changes that category's
   internal balance; either rebalance the existing RGR weights so the category still sums correctly,
   or make the 3 new ones `scored:false` (reference-only, like `secondSide` already is) if you're
   not confident on the right weight allocation — ask/flag rather than silently guessing a
   consequential weighting decision.
2. Wire actuals in `autoPopulateKPIs` (`review-engine.js`, in the `if (sr)` SMG-FullScale block
   near where `mo.osat = sr.osat5` already lives) — `mo.osatB2B = sr.osatB2B` (or whatever the
   parsed-row field is actually named in `ds.smgFullscale`'s shape — confirm the exact in-app
   field name, it may differ from the raw Supabase column name `osat_b2b`) and `mo.eap =
   sr.overallProblem` similarly. EAD gets no actual wiring — it has none.
3. Add target mappings to `REVIEW_METRIC_TARGET_FIELD`: `osatB2B: 'tOsatB2B'`, `ead: 'tVoiceEAD'`.
   `eap` gets NO entry here (no workbook target) — instead add it to `target-overrides.js`'s
   `TARGET_OVERRIDE_FIELDS` (new `tEAPTarget` field, override-only) following the exact pattern
   `totalProfit`/`complaints` already use, with an accurate note explaining why (no workbook
   column, real actual data, override-only target).

## Do NOT

- Do not touch, rename, or repurpose the existing `epb2b` key/metric — it stays exactly as-is,
  override-only, dormant.
- Do not invent an actual-data source for EAD — none exists; leave it manual/override on the
  actual side and say so plainly.
- Do not silently change RGR's category weight balance without either rebalancing explicitly or
  making the new metrics unscored reference-only — this is a real scoring-math decision, not a
  mechanical one.
- Do not re-derive or second-guess `kpi-registry.test.js`'s "no actual source for voiceEAD"
  finding — it's already correct and tested; just cite it.

## Verification bar

- Confirm OSAT B2B renders with both a real actual and real target for a real store/month with
  live FullScale + yearly-targets data, scored normally.
- Confirm EAP renders with a real actual and, once an override target is set via the Targets
  Editor, scores normally; with no override set, behaves the same as any other override-only
  metric with no target (flagged by `missingReviewTargets`, not a crash).
- Confirm EAD renders with a real target and an empty/manual actual slot, clearly distinguishable
  from a metric that's broken vs. one that's genuinely awaiting a future data source.
- Confirm `epb2b`'s existing behavior is completely unchanged (same fields, same override
  mechanism, still present as its own metric).
- State clearly what weight/threshold decisions you made for the 3 new metrics and why.
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean.
