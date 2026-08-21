---
name: dispatch-49
description: Re-key the identity vault on employee ID instead of name, so one human is one token across cash and inventory. Owner-approved 2026-08-20 with an explicit gate - Phase 0 measures the name-to-eID match rate against five months of manual history before any migration starts, and a bad match rate falls back to a mapping table rather than forcing the re-key.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #49 — one human, one token

**Owner-approved 2026-08-20: "Go with C, measure the match rate first."**

**Phase 0 is a gate, not a warm-up.** Nothing in Phases 1–3 starts until its numbers exist and the
owner has seen them. If the match rate is poor, the correct outcome is the *fallback*, not a harder
push at the re-key.

---

## Why

`employee_identity_vault` has `unique (tenant_id, employee_name)` — **a name IS the identity.** Three
consequences, all live today across 21,929 tokenized `audit_rows`:

1. **A typo creates a second person.** One bad upload silently splits someone's history.
2. **A name change splits a history in two.** Marriage, legal change, a middle initial appearing.
3. **Two real people who share a name merge into one token.** The pull script's own comment concedes
   this: *"a same-name collision at one store is an existing, unchanged risk."*

And it produced the wall dispatch #48 found: `qsr_waste.manager` is an **eID**, `audit_rows.emp` is a
**name**, both tokenize through the same RPC keyed on the raw string, so the same human lands as
**two unrelated tokens**. When INV-004 ships, a manager's waste findings will not group with that
person's cash findings — which breaks the Security panel's central premise, since subject-major
grouping exists precisely so convergence across signals is visible.

**The eID already exists on the cash side.** `scripts/qsrsoft-register-audit-pull.mjs:25` records
that `emp = empName (NOT empID)` was a deliberate choice — the manual-upload path
(`parseRegisterAudit`) has only names, and switching would *"split-brain the (loc,date,emp) history
for the same real person across manual vs auto rows."* That reason was correct and is still live.
It is the whole cost of this dispatch, and Phase 0 exists to size it.

## Phase 0 — measure, then stop (GATING)

**Prerequisite: confirm the eID field's real name in the Register Audit response.** ✅ **DONE,
2026-08-21.** Dispatch #47's DEBUG-gated key-name log had never produced output before this —
the one prior triggered run (`32418915409`, on this branch, pre-merge) failed before reaching it,
and a first retry today (`32431187442`, single-day window `2026-08-20`) returned 0 rows for that
day and so never hit the `rows[0]` guard either. A wider window (`32431369072`,
`2026-08-10`→`2026-08-20`, all 27 stores, 1,781 rows) finally produced it. Full key list, names
only, no values, straight from the run log:

```
busnDt, nsn, empID, empName, allNetSales, transactions, overShortAmt, promoAmt, promoQty,
tRedBeforeQty, tRedBeforeAmt, tRedAfterQty, tRedAfterAmt, drawerOpens, overringQty, overringAmt,
manOverringAmt, refundCashQty, refundCashlessQty, refundCashAmt, refundCashlessAmt,
empMealDiscQty, empMealDiscAmt, mgrMealDiscQty, mgrMealDiscAmt
```

**The eID field is `empID`** — measured, not inferred from the `empID` name already used
elsewhere in this codebase's comments, which is exactly the inference that cost a day on
`manOverringQty`. It sits immediately next to `empName` in the response, confirming this endpoint
does carry both identifiers per row, which Phase 0's own measurement plan below assumes.

Phase 0 itself (the match-rate measurement across `audit_rows` history) has **not** been run —
that's the next step, not done here.

Then pull one window carrying **both** `empName` and the eID, and measure:

| # | question | why it decides the outcome |
|---|---|---|
| 1 | distinct `emp` names in `audit_rows` (all history) | the denominator |
| 2 | names resolving to exactly **one** eID | the clean core |
| 3 | names resolving to **multiple** eIDs | real same-name collisions — people currently **merged** into one token |
| 4 | eIDs resolving to **multiple** names | typos / name changes — one person currently **split** across tokens |
| 5 | names with **no** eID anywhere in the API | manual-only history; likely departed staff. **The hard part** |

**Row 5 is the one that decides this.** Five-plus months of manually-uploaded rows may name people
the API window no longer returns. Those cannot be re-keyed from data that no longer exists, and how
many there are determines whether the migration is clean or a swamp.

**Report all five as counts and percentages. Do not start Phase 1.** Rows 3 and 4 are independently
valuable — they quantify a defect nobody has measured, and they are worth reporting even if the
re-key never happens.

**Decision shape, named in advance to prevent post-hoc rationalisation** (no threshold number here
on purpose — that is the defect class this build keeps hitting):
- A large clean core (row 2) with small rows 3/4/5 → **proceed to Phase 1**.
- A substantial row 5 → **fall back to option B**, a mapping table beside the vault. Same PII
  retention, worse ergonomics, but it does not require re-keying history that cannot be recovered.
  **Taking the fallback is a success, not a failure.**
- Large rows 3/4 → the defect is worse than assumed and the re-key is *more* justified, but the
  reconciliation needs its own design pass first. Report and stop.

## Phase 1 — the vault holds both identifiers

Additive only. `employee_identity_vault` gains `employee_id`; the vault becomes the single place a
person's identifiers live — eID, name, token together — and stays the only thing that can map
between them, behind the same role-gated logged reveal.

`get_or_create_employee_token()` gains an eID-aware path. **Keep the name-keyed path working
unchanged** — legacy callers must not break, and `audit_rows`' existing tokens must keep resolving.

**Security-sensitive, and this file has a live incident behind it:** the vault's own
`reveal_employee_identity()` shipped with a NULL-role bypass that anon could exploit
(`incident-reveal-rpc-null-role-bypass-2026-08-20.md`). **Probe every new or changed
`SECURITY DEFINER` function adversarially with the anon key before calling it done.** A passing test
suite did not catch that one.

## Phase 2 — reconcile, without destroying anything

Link existing name-keyed vault rows to their eID where Phase 0 found a clean 1:1. **Merge tokens
only where the evidence is unambiguous.** A wrong merge attributes one person's findings to another
— the worst failure this system can produce, and it points at named people.

Leave rows 3/4/5 cases **explicitly unreconciled and flagged**, not force-matched. An honest
"unknown" is the standing contract everywhere else in this build (`pass: null`) and it applies here.
`security_findings` written against old tokens must keep resolving.

## Phase 3 — switch the keys

New `audit_rows` writes key on eID; `qsr_waste` already carries `emp_token` from #48. **Do not
rewrite the PK until Phase 2's reconciliation is verified against real rows** — `(loc, date, emp)`
carries five months of manual history and freshest-wins continuity depends on it.

**Manual upload must keep working.** It has only names, it is the standing last-resort fallback, and
it cannot be dropped. Name-keyed manual rows resolve through the vault to the same token — which is
the entire point of putting the reconciliation in the vault instead of the PK.

## Out of scope

- INV-004 itself (blocked on this, plus a day-part sales denominator — dispatch #48).
- Any new PII pull. The Employee Roster deliberately discards `fullEmployeeName`; **that decision
  stands unless the owner revisits it separately.**
- #46 Parts C/D.

## Standing rules that bite here

- **Measure before deciding** — Phase 0 is the whole gate.
- **Never infer a field name** — one clean key-name run, values never logged.
- **Adversarially probe every SECURITY DEFINER change with the anon key.**
- **An unresolvable identity is an honest null, never a guess.**
- **Commit every `memory/` file with the work that cites it.**
