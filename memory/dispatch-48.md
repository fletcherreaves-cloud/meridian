---
name: dispatch-48
description: The two inventory schemes buildable with data already pulled, plus the item-level waste rule they share a premise with. INV-003 (variance unmatched by logged waste) has measured evidence behind it already. INV-004 (waste-log padding) is the build's FIRST person-attributed inventory rule and needs the identity vault extended to qsr_waste.manager before it can ship. INV-005 (phantom gains) needs only the sign INV-001 currently discards.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #48 — the inventory schemes that need no new data

**Read first:** `finding-security-scheme-coverage-2026-08-20.md` (one of ten schemes built) and
`analysis-zscore-dry-run-2026-08-20.md`. Both on `main`.

Three rules. **All three use tables the batch job already loads** — no new pull, no new source. Two
were named in the coverage matrix as the cheapest real coverage available; the third (INV-003) is
their shared premise and has a measurement behind it already.

**Priority order is deliberate and is not "easiest first."** INV-003 first because the evidence
exists; INV-005 second because it is nearly free; INV-004 last because it is the most valuable and
also the only one carrying a hard prerequisite.

---

## INV-003 — variance unmatched by logged waste

**The plan's own strongest single signal, still unbuilt.** `plan-security-loss-prevention.md` §2.2:
flag TvA variance *"especially when not matched by a corresponding waste-log entry — an unexplained
variance with zero waste logged for that item is the strongest single signal."*

**The evidence is already measured.** Dispatch #45 Part C, against live data: of the unexplained
INV-001 flags, only **44.1% have any logged waste at all**, and only **4.2% have waste covering even
half the usage variance** (`|act_usage − exp_usage|`). That gap is exactly what this rule detects.

**Data:** `qsr_variance_stat` carries `raw_waste` and `comp_waste` per `(loc, period, wrin)` — the
same row the batch job already loads for INV-001/INV-002. Nothing new.

**Shape:** an *exoneration-weighted* variance rather than a second variance rule. Variance matched
by logged waste is largely explained (spoilage, documented dumps); variance with zero logged waste
is the unexplained kind. `security_findings.exoneration_share` already exists (added in #492) —
**use it rather than adding a column.**

This also delivers plan §1 principle 4 (a rule that automatically searches for its own
counter-evidence), which nothing in the build does yet, and it is the first rule whose output makes
a subject *less* suspicious as well as more.

**Measure before choosing thresholds** — the waste-coverage ratio's own distribution, reported as
deciles. Do not reuse INV-001's numbers; different metric, different scale.

## INV-005 — phantom gains (unexplained positive adjustments)

**Nearly free.** `qsr_variance_stat.variance` is signed; INV-001 discards the sign with
`"abs": true`. Positive variance — actual usage *below* expected — is the defensive move that
follows a shortage: falsified counts or fictitious returns creating artificial inventory gains that
mask a real loss (plan §2.2).

**Determine the sign convention by measurement, not by reading the column name.** Confirm which
direction of `variance` / `dol_diff` means "gain" against a handful of real rows before writing the
rule. Getting this backwards produces a rule that looks right and detects the opposite of what it
claims — and would be invisible in review.

**The plan's own qualifier matters:** flag positive adjustments *"especially on items with a recent
negative-variance history."* That sequencing is the signal; a lone positive month is noise. It needs
prior periods, and `qsr_variance_stat` currently holds **only `2026-08`** (measured, dispatch #45
Part C). **So this rule is data-blocked on a period backfill** — which is a work item, not a wall
(CLAUDE.md: data depth is never the limiter; the pull honours date-range overrides). Either backfill
first, or ship the single-period version and note plainly that the recent-history qualifier is
unimplemented.

## INV-004 — waste-log padding / spoilage masking

**The most valuable of the three, and the only one with a hard prerequisite.**

Scheme: intentionally over-producing under cover of "prep error," then removing product after close.
Plan §2.2's method: *"Group waste logs by item, day-of-week, and closing-manager; z-score
waste-weight-per-sales-dollar; flag Z > 3.0 sustained over a rolling window, especially concentrated
on one closing team/day-part combination."*

**`qsr_waste` is richer than the coverage matrix assumed** and most of it is unused:

| column | why it matters here |
|---|---|
| `manager` | **an eID** — the closing-manager attribution the method calls for |
| `busn_dt` / `busn_tm` | day-of-week AND time-of-day; "after close" is a time window, not a guess |
| `wtype` | `raw` vs `completed` — over-production is a *completed*-waste pattern |
| `reason` | reason-code concentration is its own signal |
| `edited` | an edited waste log is a signal on its own, and nothing reads this today |
| `wsource` | `BOS` vs `MobileApp` |

**⚠️ HARD PREREQUISITE — the identity vault does not cover this table.** `qsr_waste.manager` is a
plaintext eID and `qsr_waste` has **no `emp_token` column**. This would be the build's **first
person-attributed inventory rule**, and every person-attribution rule in this system goes through
the vault: pseudonymous by default, reveal role-gated and logged
(`schema-identity-vault.sql`, `incident-reveal-rpc-null-role-bypass-2026-08-20.md`).

**Do not ship INV-004 writing a plaintext eID into `security_findings.`** `security_findings`'
subject must be `emp_token` or `wrin`, never a plaintext identifier — that constraint predates this
dispatch and is not negotiable. Extend the vault to `qsr_waste.manager` first (same treatment
`audit_rows.emp` received: token column, backfill, RLS), then build the rule. **That extension is
part of this dispatch, not a follow-up** — a rule that names managers in plaintext is worse than no
rule.

**Note the join limit:** `qsr_waste` has **no `wrin`** — it is event-level (`loc`, `event_id`,
`$ amount`, `reason`), not per-item. So *"group by item"* from the plan's method **cannot** be done
from this table. Item-level waste lives in `qsr_variance_stat.raw_waste`/`comp_waste` instead, which
is INV-003's territory. Scope INV-004 as manager × day-part × store, and say so rather than
half-implementing the plan's sentence.

---

## Sequencing and coordination

- **INV-003 first.** Evidence exists, no prerequisite, and `exoneration_share` is already in the
  schema waiting for it.
- **INV-005 second** — cheap, but decide honestly whether to backfill periods first or ship without
  the recent-history qualifier. Do not silently ship the weaker version.
- **INV-004 last**, and only after the vault extension. If time runs short, **ship the vault
  extension alone** — it is independently valuable and unblocks any future person-attributed rule.
- **All three land inactive**, with thresholds measured from their own distributions, per
  `finding-unreachable-threshold-class-2026-08-20.md`. Three rules have already shipped with
  thresholds outside their own achievable range; the guard now covers `phase1.sql`'s ratio rules, so
  **extend `MEASURED_MAX` as each new rule lands** or the guard silently skips them.
- **Coordinate with #46 Part B** — lifecycle routing touches the same findings rows.

## Out of scope

- The blocked schemes (post-tender void, structuring, sweethearting) — all need `transaction_detail`,
  which has never been pulled.
- CASH-003 (dispatch #47 / the owner's manual report check).
- #46 Parts C-remainder and D.

## Standing rules that bite here

- **Measure the distribution before naming a threshold.** Three prior violations, all documented.
- **Determine the variance sign by measurement** (INV-005) — a reversed rule passes review.
- **Never a plaintext eID in `security_findings`** (INV-004).
- **A gap is a work item, not a finding** — the single-period `qsr_variance_stat` is a backfill.
- **Commit every `memory/` file in the same commit as the work that cites it.**
