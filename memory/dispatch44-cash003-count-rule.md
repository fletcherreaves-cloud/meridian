---
name: dispatch44-cash003-count-rule
description: CASH-003 re-expressed as a count rule (manOverringQty pulled, manualRefCnt/drawerGC ratio replaces manualRefAmt/drawerSales) and the threshold guard widened from phase1c.sql's z-score pair to the whole seed/migration family. Both items PR #481's merge commit named as KNOWN OPEN.
metadata:
  node_type: memory
  type: project
---

# Dispatch #44 — CASH-003 re-expressed as a count rule; threshold guard widened to the whole file family

2026-08-20. No formal `dispatch-44.md` was written to `memory/` — this dispatch's scope came from
PR #481's own merge commit body ("KNOWN OPEN, not addressed here") plus a follow-up chat message
naming the same two items plus #43 Phase 2 (deferred, not started this pass). Both items below are
real, live-measured fixes, not speculative cleanup.

## CASH-003 — why the fix is the instrument, not the number

CASH-003 (manual refund/self-authorized refund rate) has been `active = false` since dispatch #42
first measured it: 0 of 670 subjects flagged, a threshold (8, $ per $1,000 drawer sales) unreachable
against a measured max of 0.7702 — the exact same signature INV-002 had (a threshold nobody checked
against the rule's own range), just on a `ratio`-type rule instead of `z-score`.

Re-measured live 2026-08-20 (`security_findings`, `rule_id=CASH-003`, n=670) before touching
anything, per the standing "measure, don't reason" rule:

```
total findings: 670, non-null: 660, nulls: 10 (min_denominator floor)
min 0.0000  median 0.0000  p95 0.0000  max 0.7702
nonzero count: 1 of 660
```

**659 of 660 non-null subjects sit at EXACTLY 0.0000.** This is not INV-001's bent-ruler problem
(uniform 50.4%) and not purely a wrong-constant problem either — it's that manual overrings are, as
the owner has separately confirmed, a genuinely rare event. A dollar RATE (dollars of manual refund
per $1,000 of drawer sales) structurally collapses to zero for nearly the entire population no
matter what threshold sits above it — there is no number inside this rule's own achievable range
that would flag the ONE real subject (0.7702) without being trivially gameable (a $0.01 manual
refund on a slow day scores the same shape of "rate" as a real one).

**The fix is the instrument, not the constant.** `audit_rows` already has the pattern for exactly
this event type: CASH-002 flags `posOverCnt` (a COUNT of POS over-ring transactions) per 1,000
transactions, not `posOverAmt` in dollars — and that shape produces a believable 10.7% flag rate.
The QSRSoft API's own response has always carried the identical Amt/Qty pairing for manual
overrings (`manOverringAmt`/`manOverringQty`) that every other override category already uses
(`overringAmt`/`overringQty` → `posOverAmt`/`posOverCnt`; `refundCashAmt`/`refundCashQty`) — the Qty
side was simply never pulled. PR #481's merge commit named this gap explicitly.

### What changed

- **`supabase/schema.sql`** — `audit_rows` gains `manual_ref_cnt numeric` (fresh-install schema).
- **`supabase/schema-security-rules-phase1e.sql`** (new) — `alter table audit_rows add column if
  not exists manual_ref_cnt numeric` (idempotent) + converts CASH-003's `logic_expression` from
  `manualRefAmt/drawerSales` to `manualRefCnt/drawerGC` (same scale 1000, same comparator gte),
  moves `min_denominator` from 250 (a drawerSales-dollars floor — meaningless once the denominator
  is a transaction count) to CASH-002's own 25 (now the identical physical quantity), and **clears
  `threshold` entirely** (`{}`, no `default` key) rather than guessing a number.
- **`scripts/qsrsoft-register-audit-pull.mjs`** — `mapRow()` adds `manualRefCnt:
  num(r.manOverringQty)`; `saveAuditRows()` adds the `manual_ref_cnt` column to the upsert.
- **`src/lib/supabase.js`** — `saveAuditRows()`/`loadAuditRows()` (the `audit_rows` pair, NOT
  `ctrl_rows`'s separate manual-upload save/load, which shares some field names by coincidence but
  is a different table/PK/consumer entirely and was left untouched) round-trip `manual_ref_cnt`.
- **`scripts/security-rules-run.mjs`** — `mapAuditRow()` adds `manualRefCnt: r.manual_ref_cnt`.
- **`src/engine/security-rules.js`** — **no change**. Rules are data; a plain `ratio` rule's
  numerator/denominator field names are the only thing that moved.

No manual-upload equivalent exists for this field: `src/parsers/index.js`'s `parseRegisterAudit`
Excel-header search has no "Manual Refund/Overring Qty" column to find, only the `$` one — this
field is auto-pull-only (null on manually-uploaded rows), same as several other API-only columns
already in this table.

### Why threshold is cleared, not guessed

`manual_ref_cnt` has never been pulled — not one row in `audit_rows` has a real value for it yet.
There is no measured range to set a floor inside, so setting a number now (even a "first guess, tune
later" one, the tier every other rule's original threshold started in) would repeat the exact
mistake this migration exists to undo: a constant nobody checked against real data. `resolveThreshold()`
returns `null` with no `default` key; `evaluateRule()` returns an honest `pass: null` ("no threshold
configured"). This is moot in practice today — CASH-003 stays `active = false` (unchanged by this
migration) and `scripts/security-rules-run.mjs:281` only fetches `active = true` rows at all, so
this rule evaluates nothing until a deliberate reactivation. The real threshold gets set from a live
re-measurement **after** the next `qsrsoft-register-audit-pull.yml` run backfills real
`manual_ref_cnt` values and the batch job (once reactivated) has real counts to score against.

## The threshold guard, widened from one file to the whole family

`security-rules-thresholds.test.js` previously only guarded `phase1c.sql`'s z-score pair
(`min_value`). PR #481's own merge commit framed CASH-003's bug as "the same defect class, live" —
so the guard needed to cover the class, not just add a third case to the same narrow check.

Added `extractInsertRules()` alongside the existing `extractUpdateRules()` (renamed from
`extractLogicExpressions`, now also captures `threshold`): the seed files (`schema-security-
rules.sql`, `schema-security-rules-phase1.sql`) use `INSERT ... VALUES (...)` with a positional
tuple, not `UPDATE ... SET`, so they need a different parser. The column order is fixed across every
INSERT this file family uses — `data_required` is always a `[...]` JSON ARRAY (skipped, since the
extractor only matches `{`-opening objects), so the first `{...}` in a values tuple is always
`logic_expression` and the second is always `threshold`, regardless of what
`corroboration_rules`/`exoneration_rules` (Postgres `{...}` array literals, not JSON) do further
down — only the first two matches are read.

Now guards `threshold.default` (the actual comparator for `ratio`/`threshold` rules) the same way it
already guarded `min_value` (the materiality floor for `z-score` rules) — one `comparatorValue()`
helper picks the right field per rule. Measured live 2026-08-20, all from `security_findings`:

| rule | threshold | measured max | verdict |
|---|---:|---:|---|
| CASH-001 | 5 | 38.887 | reachable (median 0.59) |
| CASH-002 | 15 | 80 | reachable (median 2.39) |
| CASH-004 | 100 | 162.15 | reachable (median 25.9) |
| CASH-003 (old, `phase1.sql`) | 8 | 0.7702 | **unreachable — the bug this dispatch fixes** |
| CASH-003 (new, `phase1e.sql`) | *(unset)* | *(no data yet)* | correct — see above |

CASH-001/002/004 needed no fix — included because the guard is only real protection if it covers
every rule that sets an absolute comparator value, not just the two that already broke.

## Verification

- 13 new tests: 2 in `register-audit-pull.test.js` (`manualRefCnt` maps from `manOverringQty`,
  distinct from `manualRefAmt`; null — not 0 — when the API response omits it, `num()`'s existing
  honest-missing contract), `mapAuditRow()`'s existing test extended with `manual_ref_cnt`, 4
  CASH-003 wiring tests in `security-rules-run.test.js` through `computeFindingsForRule()` (the real
  call site, not just the engine, per the #366 standing rule) — a real count produces a real rate, the
  `min_denominator` floor still applies now that the denominator changed fields, a genuinely
  zero-count subject rates exactly `0` (not `null` — distinct from "no exposure"), and with no
  threshold configured the verdict is an honest `undetermined`/`null`, never fabricated — plus 5
  net-new threshold-guard tests (parses all 4 source files, confirms `phase1.sql`'s old CASH-003
  threshold really was 8/unreachable so a revert can't drift silently, confirms `phase1e.sql`
  explicitly clears it, confirms CASH-001/002/004 all sit inside range).
- Full suite: 1718/1718 passing (159 files). `npm run build` clean, no entry-chunk budget impact
  (512.81 KB eager / 850 KB budget, unchanged from PR #481's own number).
- `node --check` clean on both touched `.mjs` scripts.
- Loader field map regenerated (`node scripts/gen-loader-emits.mjs --write`) after touching
  `audit_rows`'s save/load pair in `src/lib/supabase.js`, per CLAUDE.md's standing rule.
- **Not verified / explicitly deferred**: an actual live pull run. This sandbox has no
  `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` credentials, so `manual_ref_cnt` cannot be backfilled or
  measured from here — the next scheduled `qsrsoft-register-audit-pull.yml` run (with the real
  secrets) picks up the new column automatically once this merges; `phase1e.sql`'s ALTER TABLE must
  run against live Supabase first (handed back below, not assumed applied, per the standing SQL
  protocol). CASH-003 stays deactivated until a deliberate reactivation decision, made after a real
  count distribution exists to set a threshold from.
- **#43 Phase 2 (triage state)** — named in the same follow-up message, explicitly NOT started this
  pass. Scope (a new `security_finding_status` table + reviewed/dismissed/escalated UI) is
  substantial enough to warrant its own dispatch, consistent with dispatch #43's own stated
  intention to keep it a separate PR.

## SQL to run against live Supabase — handed back, not assumed applied

```sql
-- supabase/schema-security-rules-phase1e.sql — see the file for full comments/reasoning
alter table public.audit_rows add column if not exists manual_ref_cnt numeric;

update public.security_rules
set logic_expression = '{"numerator": {"field": "manualRefCnt", "agg": "sum"}, "denominator": {"field": "drawerGC", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 25}'::jsonb,
    threshold = '{}'::jsonb,
    description = 'Manual refund/override COUNT (manualRefCnt, dispatch #44), normalized per 1,000 transactions -- same shape as CASH-002''s posOverCnt/drawerGC ratio. Replaces the original manualRefAmt/drawerSales dollar rate (dispatch #39), which was unreachable: measured 2026-08-20, 659 of 660 non-null subjects sat at exactly 0.0000 (manual overrings are a genuinely rare event, owner-confirmed), so no dollar threshold in this rule''s own range could flag the one real subject without being trivially gameable. No threshold is set yet -- manual_ref_cnt has never been pulled (see this migration''s header); stays active=false until re-measured against real counts.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-003';
```

After running: `manual_ref_cnt` exists but is `null` for every existing row (no history to
backfill from — the field was never in any prior API pull). The next
`qsrsoft-register-audit-pull.yml` run starts populating it going forward. CASH-003 stays
`active = false`. A real threshold should be set only after a live batch run produces a genuine
`manualRefCnt`/`drawerGC` distribution to measure against — not before.
