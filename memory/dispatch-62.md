# Dispatch #62 — make the register-type dimension actually do something

**Status:** ready to start. Step 0 is a measurement that decides the shape of Part A.
**Depends on:** #59 (shipped v5.103, live data flowing since 2026-08-22).

---

## The gap

Dispatch #59 collected the two-thirds of the Register Audit that `registerType: 'cashier'` had
been discarding. First production run (2026-08-22, run `32570136852`):

```
cashier :  871 rows
manager :  406 rows      <- new
preparer:  439 rows      <- new
                 1716 rows, 27/27 stores, 5 days
```

**845 rows in five days that the database structurally could not hold before.** The dimension
reaches the app — `loadAuditRowsWindow` selects `register_type` and maps it to `registerType`
(`src/lib/supabase.js:989,992`).

**And nothing reads it.** Verified by grep, 2026-08-22:

- No rule, panel, or engine branches on `registerType`. The only non-loader mentions are
  *comments* explaining the grain change.
- `opportunity_factor` has **zero runtime readers** — confirmed independently by #59's own
  changelog (`5.103.js:30`), which says so in as many words. CASH-004 flipped it to `true` as
  documentation metadata, not behaviour.

So a daily pull is now collecting 49% more audit data than it did on Wednesday, and not one
number on one screen has changed. Per the standing rule: **a number nobody acts on is not a
shipped feature.** This dispatch closes that.

## Step 0 — MEASURE FIRST (this decides Part A's shape)

**Do not skip this and do not reason about it.** One query, service-role:

```sql
select count(*) from (
  select loc, date, emp
  from public.audit_rows
  where date >= current_date - 7
  group by loc, date, emp
  having count(distinct register_type) > 1
) t;
```

**How many employee-days appear under more than one register type?**

- **Zero or near-zero** → managers only ever ring on manager registers. The sets are disjoint,
  no blending is occurring, and Part A is an *enhancement* (a useful new breakdown), not a bug
  fix. Scope it accordingly and say so.
- **Materially non-zero** → `analyzeRegisterAudit` is **already blending authority contexts
  today**, in production, on the live panel. See below. Part A becomes a correctness fix and
  takes priority over Part B.

Report the number in the PR body either way. It is the fact the rest of this dispatch hinges on,
and it is cheap.

## Part A — make the dimension visible

`analyzeRegisterAudit` (`src/utils/register-audit.js:12`) keys on `loc::emp`, deliberately, and
#59 correctly left the dollar and count sums summing across register types — separate drawers
genuinely sum, and that decision was audited and is right for *totals*.

But the consumer is a **per-employee risk panel**: `analyzeRegisterAudit` → `ds.empRisk` →
`store-analytics.js:1354`'s Register Audit table. And **no view anywhere surfaces register type**
(grepped `src/views/`, `src/features/` — zero hits). So if step 0 comes back non-zero, an
employee's displayed promo rate, refund count and T-Red counts are a *blend* of their crew-register
and manager-register behaviour, with nothing on screen saying so.

That is precisely the distinction #59 existed to create, being averaged away one layer above the
data.

**Ship:** register type visible and filterable in the Register Audit panel — a per-type breakdown
for an employee who appears under more than one, and a filter/pill on the table. Follow the
existing selector standard (`memory/feedback-selector-ui-standard.md`); do not invent a new
control idiom.

**Do NOT change `analyzeRegisterAudit`'s existing totals.** They were audited under #59 and are
correct. This is an added dimension, not a re-derivation. If a per-type breakdown is needed,
compute it alongside, keyed `loc::emp::register_type`, leaving the existing shape untouched so
every current caller is unaffected.

**Voice-by-role — the default surface states the decision.** Per the standing rule, the panel's
face says what to do in restaurant words, with the number and its window beside it. A register-type
column that only an analyst can interpret does not clear that bar.

## Part B — make it actionable (MEASURE, then bring the threshold back)

`opportunity_factor` is currently inert metadata. The intent, written into
`schema-security-rules-cash004-authority.sql`, is that *"a manager's own drawer showing an
elevated promo/discount rate is closer to the plan's 'manager-meal abuse' framing than a routine
crew discount."* That is a real and sound distinction. It is also **not implemented**.

Two candidate designs — pick after step 0, and say why:

1. **Register-scoped rule variant** — a CASH-004 sibling whose population is manager-register rows
   only, with its own threshold. Cleanest, but doubles the rule count.
2. **`opportunity_factor` as a real engine input** — the rules engine reads it and applies a
   different threshold or severity when the subject's rows are on a privileged register. Fewer
   rules, but it makes a metadata field load-bearing across every rule that carries it, so the
   blast radius is wider than it looks.

⚠️ **Do not invent a threshold.** This project's thresholds are measured, never chosen because
they felt right — the swing alarm's -10% came from 676 store-weeks, the count-completeness 75%
from a measured bimodal distribution. There is now **five days** of manager-register data. That is
not enough to set a threshold against. Either backfill the history first (standing authorization —
`QSRSOFT_AUDIT_START_DATE`/`END_DATE`, the pull already honours them, and the ops-pull proved a
27-month backfill is routine) or **bring the measured distribution back and let the owner set the
number.** Do not ship a guessed threshold behind a security flag that names a person.

## Privacy posture — unchanged, and check it rather than assume it

This is person-attributable detection. The existing posture holds: `security_findings` is
role-gated, subjects stay `emp_token`, plaintext names only via the logged
`reveal_employee_identity()` path. A manager-scoped flag inherits all of that — but **confirm it
inherits, don't assume it.** A new rule variant or a new panel column is exactly where a gate gets
missed. Pay rate stays surfaced in no panel; role-gating of metrics is still deferred and is not
this dispatch's business.

## Out of scope

- Any change to `audit_rows`' grain, PK, or the two consumers #59 fixed. That work is done and
  audited; leave it alone.
- Meal-signal rules on `employee_meal` / `manager_meal`. Still gated on #58's pull, which is still
  blocked on the `api.security` 403.
- Backfilling manager/preparer history — *unless* Part B needs it for a threshold, in which case
  it is authorized and in scope.

## Verification bar

- **Step 0's number in the PR body.** Non-negotiable; it is the dispatch's premise.
- Part A: a test that renders the **actual panel** and asserts the register-type surface — per the
  standing revert rule, an engine-level test cannot tell "added" from "added but not wired in".
- Cashier-only employees must render **behaviourally identically** before and after.
- `npm run build` clean; entry-chunk before/after in the commit body.
- **Check `node -v` against `ci.yml`'s `[20, 22]` matrix before trusting a local green** (#60).
