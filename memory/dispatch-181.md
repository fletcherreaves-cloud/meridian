# Dispatch #181 — empMealAmt/mgrMealAmt(+counts): reconciliation-test, then wire if it holds up

## Context

Dispatch #165's audit (`memory/audit-emailed-stream-redundancy-2026-08-27.md`, §5) flagged:
*"`empMealAmt`/`mgrMealAmt`/`empMealCnt`/`mgrMealCnt` — same class of gap [as promo/posOver];
`qsr_cash_sheet` carries the raw fields but they were not reconciliation-tested in this audit
(unlike promo/posOver), so a fix here should re-verify field-level agreement first, the same way
§2 did for the others."*

**Confirmed still true, live, before drafting this**: `metric-source.js`'s `empMealAmt`/
`mgrMealAmt` chains have no `opsCashRows` source (`srcs: [['glimpseRows',...],
['ctrlRows',...], ['auditRows',...]]` — email/manual only); `empMealCnt`/`mgrMealCnt` likewise.
`qsr_cash_sheet.metrics` DOES carry `emp_meal_discount_amt`/`emp_meal_discount_qty`/
`mgr_meal_discount_amt`/`mgr_meal_discount_qty` (confirmed in a real live row). `loadOpsCashSheet`
already combines the two into a single `mealDiscAmt` (`emp_meal_discount_amt +
mgr_meal_discount_amt`) for a DIFFERENT purpose (a Sum/Sum ratio leg) — the individual per-type
fields are not separately aliased or chained anywhere.

**This is explicitly NOT the same shape as #180 (promo) or #175 (cashOS/posOver)** — those had a
measured 97-98% reconciliation already in hand from #165's audit. This one does not. Per the
audit's own instruction, this dispatch's FIRST job is measuring whether `qsr_cash_sheet`'s
emp/mgr meal fields actually agree with the emailed `glimpseRows` values on real data — matching
dispatch #172's method (a real sampled window, both sources, joined on (loc, date)) — before
touching any chain. **Do not wire anything in until that measurement is done and looks clean; a
poor reconciliation rate here is a legitimate, valuable "investigate further" outcome, matching
this session's own established precedent (#172, #177, #178) of NOT forcing a fix onto a partial
finding.**

## Task

1. Pull a real sample (a couple weeks, all 27 stores is fine — this table isn't huge) of
   `daily_glimpse_daily.emp_meal_amt`/`mgr_meal_amt`/`emp_meal_cnt`/`mgr_meal_cnt` and
   `qsr_cash_sheet.metrics.emp_meal_discount_amt`/`.emp_meal_discount_qty`/
   `.mgr_meal_discount_amt`/`.mgr_meal_discount_qty`, joined on `(loc, date)`. Measure match rate
   at a reasonable tolerance (follow #165's/#172's own precedent — e.g. within $1 or within 0.1
   units, not an exact-float match). Report the real numbers, the same way every prior
   investigation this session has (name the credential, show the observation).
2. **If reconciliation is strong (roughly 90%+, matching the bar #165 used for promo/posOver)**:
   wire it the same shape as #180/#175 — alias `empMealAmt`/`mgrMealAmt`/`empMealCnt`/`mgrMealCnt`
   to camelCase in `loadOpsCashSheet` (reading `emp_meal_discount_amt`/`_qty`/
   `mgr_meal_discount_amt`/`_qty`), then add `['opsCashRows', ...]` as the FIRST source in each of
   the four `metric-source.js` chains, keeping the existing email/manual sources as fallback.
3. **If reconciliation is weak or shows a real, unexplained discrepancy** (matching the pattern
   dispatch #172 found for cash O/S before it turned out to be mechanical bugs, or #173's genuine
   unresolved gap): do NOT wire the chain. Instead, investigate the SAME way #172 did — check for
   an obvious mechanical cause first (a header/field-name mismatch somewhere, a units mismatch, a
   day-boundary issue) before concluding it's a real, deeper discrepancy. Write up whatever you
   find in a `memory/finding-*.md` file either way (fixed-a-bug outcome or
   still-open-here's-why outcome), matching this session's established convention.
4. Regenerate the loader field map if you touch `loadOpsCashSheet`:
   `node scripts/gen-loader-emits.mjs --write`.

## Verification

- If a fix ships: a reconciliation test using the REAL measured match rate from step 1 (not an
  invented number) as documentation in the code comment, plus the same per-day auto-first /
  email-only-fallback test shape as #180/#175, plus standard suite + build.
- If no fix ships: the finding write-up is the deliverable — no code change required.

## Out of scope

- `promoAmt`/`promoPct` (separate dispatch, #180 — different, already-measured-clean gap).
- Any other `METRIC_SOURCES` chain.
- Reordering or deprecating `ctrlRows`/`auditRows` as sources — additive only, per the standing
  "keep a manual/emailed fallback" rule.
