---
name: dispatch45-min-numerator-lifecycle-investigation
description: Dispatch #45's three parts. A adds min_numerator to the engine, a materiality floor on the RAW numerator sum (INV-002 was flagging 224 financially trivial subjects for want of it). B routes lifecycle-marked inventory items to a distinct hygiene classification instead of a security verdict. C investigates the 162 unmarked flags dispatch-45.md left open — real findings (store concentration, waste doesn't explain it) plus an honest discrepancy against the dry-run's own lifecycle-share number that needs reconciling before it's trusted.
metadata:
  node_type: memory
  type: project
---

# Dispatch #45 — min_numerator, lifecycle routing, and the unexplained flags

2026-08-20. Full brief: `memory/dispatch-45.md` (PR #489, not yet merged as of this writeup — read
from that PR's diff since it wasn't on `main` yet). Built on `claude/pr99-data-integrity-sweep-
17rask` alongside dispatch #44 (independent scope, same branch per the single-designated-branch
constraint).

## Part A — `min_numerator`: an absolute-magnitude materiality floor

INV-002 was flagging 224 subjects on pure 2.5σ with no materiality gate at all. `min_value` (which
gates the computed RATE) was correctly removed post-PR-481-review — the inherited value (10) was
unreachable — but nothing replaced the materiality check it used to (incompletely) provide. The
rate is tiny precisely *because* the denominator (`storeMonthSales`) is large, so a rate-based gate
structurally cannot express "is the raw dollar amount big enough to matter."

**`min_numerator`** (`src/engine/security-rules.js`): built exactly like `min_denominator` — per-rule
data inside `logic_expression`, one shared choke point every `logic_type` funnels through — but
with the *opposite* null/false asymmetry, checked by the callers (`evaluateRule`/
`evaluateZScoreRule`), not inside `evalRatio`/`evalThreshold` themselves:
- `min_denominator` unmet → honest `pass:null` (not enough exposure to compute a rate at all).
- `min_numerator` unmet → real, decided `pass:false` (a rate WAS computed, even a statistically
  unusual one; the raw amount behind it just isn't material). The rate stays visible in `value`;
  only `pass` changes.

Measured before setting anything (live `qsr_variance_stat`, period 2026-08 — the only period this
table currently holds, non-condiment rows, `sum(|dol_diff|)` matching INV-002's own numerator):

```
n=4,474  min=0.00  p10=1.28  p25=4.45  MEDIAN=13.66  p75=39.65  p90=90.39  p95=136.53  p99=282.18  max=604.49
```

Set at **$15** — the measured population median rounded to a clean number, the identical
methodology `phase1c.sql` used for INV-001's own `min_value` (20, "clears roughly half the
floor-passing population"). SQL: `supabase/schema-security-rules-phase1f.sql` (handed back, not
applied — see below). INV-002 stays `active = true` (already was, confirmed live) — the floor lands
in the same migration that gives it the materiality gate it was missing, so no separate
reactivation step is needed.

**Verification**: 7 new engine unit tests (both plain-ratio and z-score shapes, including a
composition test proving `min_numerator` and `min_denominator` never collide — the exposure floor's
null wins when the denominator itself is too small, independent of the numerator), 2 call-site
wiring tests through `computeItemFindingsForRule()` (the real batch-job entry point, not just the
bare engine, per the #366 standing rule), and the threshold guard (`security-rules-thresholds.
test.js`) extended with a separate `MEASURED_NUMERATOR_MAX` map (deliberately NOT the same map as
the rate ceilings — INV-002's rate ceiling is 0.087, its raw-dollar ceiling is $604.49; conflating
them would compare a dollar amount against a rate) — mutation-tested (set `min_numerator: 1000` in
the SQL, confirmed 2 assertions fail; restored, confirmed clean).

## Part B — lifecycle routing: classify, don't suppress

`qsr_variance_stat.descr` carries machine-readable lifecycle markers (`(Deactivated)`, `(Obsolete
NN days left`, `(New)`) the batch job already loads (`mapVarianceStatRow`) but never read. A
deactivated WRIN flagging at high variance is a genuine work item — it's just a data-hygiene one
(fix the item's setup), not a security one (investigate a person or pattern). Deleting the finding,
or leaving it unclassified next to real security flags, discards real signal either way.

**`classifyLifecycle(descr)`** (`scripts/security-rules-run.mjs`) — pure, case-insensitive, returns
`'deactivated'|'obsolete'|'new'|null`. Computed once per subject in `computeItemFindingsForRule()`
from that subject's own item `descr`, attached as `lifecycleCategory` on the finding — independent
of pass/fail, so the finding's real value/threshold/verdict survive intact; nothing is dropped or
altered, only tagged.

**Schema**: `security_findings.lifecycle_category text` (new column — `supabase/schema-security-
findings-lifecycle.sql`, idempotent `alter table add column if not exists`, handed back below).

**Security panel** (`src/views/security-panel.js`): `verdictState(pass, lifecycleCategory)` now
takes the category as a second, priority argument — a lifecycle-classified verdict reads as neither
`flagged` nor `clear`, a new `hygiene` state with its own color/label, regardless of what `pass`
happened to compute to (the dispatch's own explicit requirement: "must not read as either a
security flag or an exoneration"). `groupFindingsBySubject()` excludes hygiene-classified verdicts
from the security tally entirely — `flaggedCount`/`clearCount`/`worstValue`/sort order all read
only the non-hygiene verdicts, with a separate `hygieneCount` for the routed ones — so a subject
with one real security flag and one hygiene-classified item doesn't read as "2 signals" (the whole
point of subject-major grouping is signal convergence, and a hygiene tag isn't a signal). Verdicts
still render fully (`SubjectDetail`), with the item's lifecycle label and its real value/threshold
shown plainly rather than suppressed.

**Verification**: 5 `classifyLifecycle()` unit tests (all 3 real markers, case-insensitivity,
null-safety, unmarked-item null path), 2 call-site wiring tests through
`computeItemFindingsForRule()`, 4 Security panel tests (`verdictState`'s new priority argument;
`groupFindingsBySubject`'s tally exclusion, verdict preservation, and `worstValue` correctness on a
mixed real-flag + hygiene-flag subject).

## Part C — the 162 (now 118 on re-measurement): investigated, not fully explained

Re-measured live before writing anything up, per the standing "measure, don't reason" rule — the
dry-run doc's own 162-count and 13.8%-lifecycle-share figures are a snapshot from an earlier batch
run; this session's numbers come from `security_findings`/`qsr_variance_stat` as they stand now,
and **differ from that snapshot in ways worth stating plainly rather than papering over**:

- **INV-001 flagged count this run: 188** (matches the dry-run's own number — same order of
  magnitude, real corroboration the peer-baseline conversion is stable).
- **Join to `qsr_variance_stat` on `(loc, wrin)`, period 2026-08: only 121 of 188 matched (67
  missing).** `qsr_variance_stat` doesn't carry `emp_token`/period history the finding itself has —
  a flagged item can drop out of the current month's pull (delisted, zero activity that period) or
  the underlying row can shift between when a finding was computed and when this session re-queried
  it. **Not chased further this pass** — a real data-lineage question (should a finding whose
  underlying row no longer exists still render as current?), out of Part C's own scope, worth its
  own follow-up.
- **Of the 121 matched, only 3 carry a lifecycle marker (2.5%) — NOT the dry-run's cited 13.8%
  (26 of 188).** The population-wide marker rate this session measured is 2.6% (136 of 5,320 rows),
  so 2.5% among flagged subjects shows **no enrichment at all** this run, where the dry-run
  reported roughly 5x enrichment (13.8% vs a presumably similar population rate). **This is an open
  discrepancy, not resolved here** — plausible causes: the flagged population moved between runs
  (different items now flag as the estate's data keeps arriving), or the two measurements were
  never directly comparable (different batch runs, possibly different windows). Flagging it
  explicitly rather than picking whichever number is more convenient — Part B's routing mechanism
  is correct and tested regardless of which share is right; only the *reported magnitude of the
  problem it addresses* is in question, and a future session should re-run this exact join right
  after a fresh batch run to settle it.

**The 118 unmarked, matched flags — what the investigation angles show:**

| angle | finding |
|---|---|
| **Store concentration** | **Real and notable.** One store (0013113) accounts for **23.7%** of unmarked flags — nearly 5x an even 1-of-20 share. Top 4 stores account for **48.3%**. 20 of 27 stores have at least one. This is the strongest lead this pass produced — a few stores drive most of the unexplained volume, which points at a store-specific counting/receiving practice or training gap, not a network-wide pattern. |
| **`cls` (food vs paper)** | Roughly even: 54.2% food, 45.8% paper. No meaningful skew — rules out "this is a paper-goods-specific counting quirk" as the dominant story. |
| **Recurrence period-over-period** | **Unanswerable with current data.** `qsr_variance_stat` holds only the single period `2026-08` right now — no prior-period history exists yet to check whether the same `(loc, wrin)` pairs recur. Not a permanent block (CLAUDE.md's "data depth is never the limiter" — this is a backfill question for whoever runs the QSRSoft pull with real credentials), but this session cannot answer it. |
| **`raw_waste`/`comp_waste` explaining the variance** | **No — and this is the clearest negative result.** Only 44.1% of the 118 have *any* logged waste at all, and only **4.2%** have waste covering even half of the usage variance (`|act_usage − exp_usage|`). Logged waste does not explain these flags for the overwhelming majority. This directly supports the still-unbuilt `INV-003` (variance unmatched by logged waste) as the right next inventory rule — its whole premise is exactly this gap. |

**Value distribution of the 118**: median 94.8%, min 20.2%, max 2275.3% — still the same shape the
dry-run described (mostly plausible-mapping-error range, with a long tail of extreme outliers that
likely ARE mapping/UOM errors rather than shrink, consistent with the dry-run's own "1,429% /
1,062% / 827%" top-item observations).

**Honest conclusion, matching the dispatch's own instruction not to force a theory**: the store
concentration is a real, actionable lead — worth a follow-up that pulls the top 4-5 stores'
specific flagged items and checks with those locations' management about receiving/counting
practice. The waste-mismatch finding supports building `INV-003`. Neither is "shrink," and nothing
here should be read as a security conclusion — this remains, as the dispatch itself frames it, a
data-hygiene and measurement question, not a loss-prevention one, until (or unless) the store
concentration angle turns up something else on closer inspection.

## Verification (all parts)

- 18 new tests total (7 engine + 2 wiring for Part A, 5 unit + 2 wiring for Part B's
  `classifyLifecycle`, 4 Security-panel tests for Part B's routing).
- Full suite: 1740/1740 passing (159 files). `npm run build` clean, no entry-chunk budget impact
  (512.85 KB eager / 850 KB budget).
- `node --check` clean on `scripts/security-rules-run.mjs`.
- Loader field map regenerated after touching `loadSecurityFindings()` in `src/lib/supabase.js`.
- Mutation-tested the widened threshold guard (Part A) per the dispatch's own explicit bar.
- Part C is investigation only — no code shipped from it, per the dispatch's own instruction that
  its deliverable is a memory file.
- **Not verified**: neither `min_numerator`'s SQL nor `lifecycle_category`'s column has been
  applied to live Supabase — both handed back below, per the standing SQL protocol. The Part C
  join-mismatch and lifecycle-share discrepancy are also unresolved, named explicitly above rather
  than silently reconciled.

## SQL to run against live Supabase — handed back, not assumed applied

```sql
-- supabase/schema-security-rules-phase1f.sql — see the file for full comments/reasoning
update public.security_rules
set logic_expression = '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_numerator": 15}'::jsonb,
    description = 'Dollarized TvA variance (dol_diff), normalized per $1,000 of store-month product sales (qsr_fob.prod_sales_amt, joined), store baseline z-score (dispatch #42). min_numerator:15 (dispatch #45 -- measured 2026-08-20 population median of sum(|dol_diff|), non-condiment, n=4,474) is a materiality floor on the RAW dollar amount, independent of the rate: without it the rule flagged 224 subjects on pure statistical unusualness regardless of dollar size (max flagged amount ~a few hundred dollars, median ~a few tens) -- min_value was correctly removed post-PR-481-review since the inherited value (10) was unreachable on this rule''s tiny rate, but nothing replaced the materiality check it used to (incompletely) provide.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';

-- supabase/schema-security-findings-lifecycle.sql — see the file for full comments/reasoning
alter table public.security_findings add column if not exists lifecycle_category text;
```

After running: INV-002 gains real materiality protection immediately on its next batch run (stays
`active = true`, no separate reactivation step). `lifecycle_category` starts populating on the next
`security-rules-run.yml` run for the inventory domain rules — existing rows keep `null` until
re-evaluated.
