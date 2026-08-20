-- ── Security build Phase 1c — baseline-relative detection: INV-001/INV-002 (dispatch #42) ──────
-- Converts INV-001/INV-002 (dispatch #40, schema-security-rules-phase1b.sql) from a raw ratio
-- threshold to logic_type 'z-score' -- this store's rate for item X vs. OTHER stores' rate for
-- that SAME item X (storeBaseline(), pre-filtered to the same wrin -- src/engine/security-
-- baselines.js, unmodified). See src/engine/security-rules.js's new z-score branch and
-- scripts/security-rules-run.mjs's baseline-before-evaluate reorder at both call sites.
--
-- Why now, not threshold retuning first: exp_usage is systematically wrong for the SAME set of
-- items at nearly every store (memory/project-inventory-data-hygiene-2026-08-20.md) -- a store
-- baseline built from OTHER stores' rate for that same item cancels that shared bias out, where
-- an absolute threshold inherits it whole. See memory/dispatch-42.md §3.
--
-- Idempotent: safe to re-run.

-- threshold is now SIGMA (z-score cutoff), not the rate itself -- 2.5σ, a first-guess in the same
-- "needs tuning against real distribution" tier as every other number in this build (dispatch
-- #42's own worked example uses 2.5 to illustrate the unit change). min_value carries FORWARD the
-- previous ratio threshold ("MINIMAL PATH" per dispatch #42 §4 -- Step 0 came back "uniform / bent
-- ruler", so precise absolute calibration against a known-biased measurement is false precision;
-- these numbers were already first-guesses, now doing a second, more appropriate job as permissive
-- materiality floors instead of being retired).
--
-- min_denominator (INV-001 only, dispatch #42 §5) -- MEASURED against live qsr_variance_stat
-- 2026-08-20, not guessed: of 5,302 non-condiment (loc, wrin) subjects in the trailing 3-month
-- window, a floor of 10 exp_usage units converts 423 (8.0%) from a real-but-garbage ratio into an
-- honest null, on top of the 220 (4.1%) already null at exp_usage=0 -- 4,659 subjects (87.9%) keep
-- a real verdict. Not close to nulling the estate, so this is real protection, not a rule switched
-- off. INV-002 does NOT get a floor: its denominator (storeMonthSales, a qsr_fob join) was
-- measured across the same window at a MINIMUM of $2.1M -- four orders of magnitude from zero --
-- so a "too small to mean anything" floor is structurally unreachable for this denominator and
-- would be dead configuration, not protection. Stated explicitly rather than added reflexively:
-- the shared engine mechanism (dispatch #42 §5's "make it rule-agnostic") means EVERY
-- denominator-bearing rule COULD carry a floor, not that every rule SHOULD.
update public.security_rules set
  logic_type = 'z-score',
  logic_expression = '{"numerator": {"field": "variance", "agg": "sum", "abs": true}, "denominator": {"field": "expUsage", "agg": "sum"}, "scale": 100, "comparator": "gte", "min_value": 20, "min_denominator": 10}',
  threshold = '{"default": 2.5}',
  description = 'Theoretical-vs-actual usage variance rate (variance / exp_usage x 100), z-scored against a store baseline: OTHER stores'' rate for the SAME item over the same window (security-baselines.js storeBaseline(), pre-filtered to the same wrin). Flags when this store is >= 2.5 standard deviations above peers AND the raw rate clears a 20% materiality floor -- the peer comparison cancels out a shared exp_usage mapping bias (memory/project-inventory-data-hygiene-2026-08-20.md); the floor keeps a statistically-unusual-but-trivial variance from flagging. min_denominator (10 exp_usage units) is dispatch #42 section 5''s exposure floor -- below it the rule returns an honest null rather than a ratio inflated by a near-zero denominator (measured 2026-08-20: converts 423 of 5,302 subjects, 8.0%, from a garbage ratio to an honest null; 87.9% keep a real verdict -- not close to nulling the estate).',
  updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-001';

update public.security_rules set
  logic_type = 'z-score',
  logic_expression = '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_value": 10}',
  threshold = '{"default": 2.5}',
  description = 'Dollarized TvA variance rate (dol_diff per $1,000 store-month sales, qsr_fob join), z-scored against a store baseline: OTHER stores'' rate for the SAME item over the same window. Flags when this store is >= 2.5 standard deviations above peers AND the raw rate clears a $10-per-$1,000 materiality floor (roughly 1% of sales) -- both retained from dispatch #40''s original ratio threshold, now doing a second job as a permissive materiality floor rather than the primary gate (dispatch #42 section 4, MINIMAL PATH after Step 0 came back "uniform / bent ruler"). No min_denominator: measured 2026-08-20, storeMonthSales has a MINIMUM of $2.1M across the live estate -- four orders of magnitude from zero, so an exposure floor here would be dead configuration, not protection.',
  updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';
