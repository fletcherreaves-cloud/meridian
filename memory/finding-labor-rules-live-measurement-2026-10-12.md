# LABOR-001/002/003 — live measurement + activation (2026-10-12)

**Credential:** `SUPABASE_SERVICE_ROLE_KEY` (service-role, bypasses RLS), this session's own env
var, confirmed live via the standard `content-range` PostgREST probe before any other claim here.

## What was measured, and how

`security_rules` held only 9 rows (CASH-001..004, INV-001..003/004/005) — the LABOR-001/002/003
migration (`schema-security-rules-labor.sql`, PR #1433) had been committed to the repo but **never
applied to the live database**. Nothing here was "flip a flag" until the rows existed at all.

1. Fetched the real tables directly (PostgREST, service-role) into local JSON:
   `lifelenz_punch_edits` (321 rows, all of it — brand new table), `qsr_employee_tenure` (1716
   rows, paginated), `qsr_punch_times` for the same date window (3745 rows).
2. Ran the **actual shipped functions** from `scripts/security-rules-run.mjs`
   (`mapPunchEditRow`/`mapTenureRow`/`mapPunchTimeDateRow`, `joinPunchEditsWithTenure`,
   `computeLaborEmployeeFindingsForRule`, `buildLocDatePunchIndex`/
   `joinManagerEditsWithPunchVolume`, `computeManagerEditFindingsForRule`) against that real data,
   locally, with no DB write — a faithful dry run of the real code, not a reimplementation in
   Python that could silently diverge from it.
3. Inserted the 3 rule rows live (PostgREST POST, `201 Created`) with the decided final values.
4. Ran `node scripts/security-rules-run.mjs` for real against production — the actual job, actual
   identity-vault tokenization, actual `security_findings` writes. Confirmed via a second
   `content-range` probe: `258/258` real LABOR-001/LABOR-002 finding rows now exist.

**Window actually available: 2026-10-08..2026-10-12 (5 days), 25 of 27 stores.**
`lifelenz_punch_edits` is only days old — this is a cold-start snapshot, well short of the rules'
own 28-day design window. Treat every number below as "what the data shows today," not a
steady-state baseline. Re-measure again no sooner than ~2026-11-09 (28 real days).

## Results

**LABOR-001 (ghost employee) — ✅ ACTIVATED.**
- 321 edit rows → 129 distinct (loc, geid) subjects.
- Cross-vendor identity join (`lifelenz_punch_edits.geid` → `qsr_employee_tenure.geid`): **121/129
  = 93.8% hit rate.** This was the one open, previously-unverified assumption named in the
  migration's own header — it holds, strongly, for this org. The 8 misses are real and unexplained
  (newly hired employees not yet in the latest tenure pull is the likeliest read, not checked
  further) — those 8 subjects simply can't be evaluated for this signal until they resolve, same
  honest exclusion the rest of this codebase already applies to an unresolved identity.
- Of the 121 joined subjects, **0 carry any `termination_entry_date` at all** → 0/129 flagged.
  This is the expected, reassuring answer: everyone currently getting a punch edit is, as far as
  this check can tell, an active employee. It is a clean, decided "no ghosts found," not a sign
  the mechanism doesn't work.

**LABOR-002 (self-approval) — ✅ ACTIVATED.**
- Same 321/129. **0/129 flagged.** No employee self-approved their own edit in this window — a
  believable clean result for what should be a rare, deliberate event. Mechanism ran without
  error on real data.

**LABOR-003 (per-manager outlier edit rate) — ❌ STILL NOT ACTIVATED.**
This is the one real finding of this pass: the shipped `min_denominator: 500` was an unmeasured
guess, and it was wrong by roughly an order of magnitude. Real per-(loc, manager) subject
denominator sums (summed `storePunchVolume` across only the days that manager has an edit on
record — the same honest two-stage pre-aggregation INV-004 uses), n=60, sorted:

```
min 1, p10 3, median 46, p90 108, max 193
```

**Not one of the 60 real subjects could ever clear 500.** Every single one landed on
`pass: null, reason: "denominator below minimum exposure floor (500)"` — exactly the "degenerate,
never produces a value" failure mode a pre-ship measurement exists to catch, not a hypothetical.
Lowered to `min_denominator: 20` (clears the measured near-zero tail — 9/60 subjects at ≤4 — without
being aggressive, the same "clears the tail, not aggressive" standard this codebase already uses
for INV-004's own floor). Left `active: false` regardless of that fix, because:
- The fixed `20` is still a cold-start-window number, not one measured against a real 28-day
  history.
- The store-baseline population itself is dominated by the same thin-denominator noise observed
  above (peer stdev ≈200 against a mean ≈110 — a genuinely noisy, not-yet-trustworthy baseline).

**Do not activate LABOR-003 off this pass's numbers.** Re-run this exact measurement once
`lifelenz_punch_edits` has accumulated something close to 28 real days (target: on or after
2026-11-09), and re-tune `min_denominator`/`min_value` against whatever that run shows — the same
discipline INV-004's own migration documents before it picked 2.5σ.

## What changed live vs. in the repo

- `security_rules`: 3 new rows inserted (LABOR-001 `active=true`, LABOR-002 `active=true`,
  LABOR-003 `active=false`, `min_denominator: 20`).
- `security_findings`: 258 new rows (129 LABOR-001 + 129 LABOR-002), written by a real run of
  `scripts/security-rules-run.mjs`, not synthesized.
- `supabase/schema-security-rules-labor.sql` updated to match this live state exactly (the
  `INSERT ... ON CONFLICT DO NOTHING` statements now carry the final `active`/`min_denominator`
  values directly, plus idempotent `UPDATE` statements so re-applying this file to an environment
  where the rows already exist under the old, unmeasured values still corrects them).
