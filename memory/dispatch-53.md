---
name: dispatch-53
description: Executes dispatch #49's remainder. Phase A paces the remaining register-audit backfill (2026-07-05 -> 2026-08-21) into three ~2-week runs to avoid the volume-triggered 403, nothing before 2026-08-22. Phase B re-measures row 5 only, three ways. Phase C applies the pre-written gate rule (G<=25 proceed / 26-57 owner decides / >57 option B) to the genuinely-ID-less count. Phase D is #49's Phase 1 ONLY, gated on the number, additive to the vault, adversarially probed.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #53 — pace the backfill, re-measure row 5, apply the gate, then (maybe) Phase 1

Owner-approved. Read `memory/finding-phase0-identity-match-rate-2026-08-21.md` first — this
dispatch executes on that measurement's open item (row 5's genuinely-ID-less count, still pending
the unbackfilled tail).

## Why

Phase 0's rows 3–4 (40 names merged into one token, 14 tokens split across names) settled the
direction — that's a correction to the identity vault, not an optimization to weigh. And resolving
row 5's ambiguity directly (checking whether each no-`emp_id` name has a row inside the covered
window) rather than passing it up with a caveat is what made the numbers usable at all: real row 5
is currently 0 genuinely-ID-less, not the raw 123 — but that number is provisional until the
backfill's unbackfilled tail (`2026-07-05 → 2026-08-21`) is closed.

## Phase A — pace the remaining backfill (hard constraint)

The 403 that stopped the second backfill attempt (`"User is not authorized... explicit deny in an
identity-based policy"`) is **volume-triggered**, unlike the two earlier 401 auth-flakiness
failures. Retrying harder makes it worse, not better.

- **Three separate ~2-week runs**, not one big pull:
  - Run 1: `2026-07-05 → 2026-07-20`
  - Run 2: `2026-07-21 → 2026-08-05`
  - Run 3: `2026-08-06 → 2026-08-21`
- **One retry per run**, same limit discipline as dispatch #51's backfill.
- **Nothing before 2026-08-22.** Today's (2026-08-21) two attempts already happened; pacing means
  waiting a full day before the next one, not immediately trying again with a smaller window.
- **If a run 403s again after this pacing, STOP and report — do not attempt a fourth structural
  change to the approach.** That outcome means the real limit is lower than assumed and the plan
  itself needs rethinking, not another workaround.

## Phase B — re-measure row 5 only

Rows 1–4 are settled and do not need re-running. Once Phase A's runs land (however many succeed),
re-run the row-5 SQL check from the finding doc and report it **three ways**:

1. **Total** row-5 count (names with no `emp_id` anywhere in `audit_rows`)
2. **Genuinely ID-less** (has a row inside the now-covered window, still no `emp_id`)
3. **Still-uncovered** (every row still falls in whatever backfill gap remains)

**Only the middle number (genuinely ID-less) decides anything.** Report all three so the number is
legible, not just asserted.

## Phase C — the gate rule (written before the number, deliberately)

Applied to the genuinely-ID-less count from Phase B:

| genuinely-ID-less (G) | outcome |
|---|---|
| `G ≤ 25` | **proceed** to Phase D |
| `26 ≤ G ≤ 57` | **stop** — owner decides |
| `G > 57` | **option B** (fallback) |

Landing high is a legitimate result. Nothing gets tuned, re-scoped, or re-measured to clear a
threshold — dispatch #49 already records the fallback as a success, not a failure to route around.

## Phase D — dispatch #49's Phase 1 ONLY, and only if the gate passes

If `G ≤ 25`: implement Phase 1 as `dispatch-49.md` already specced it — the vault gains
`employee_id`, additive, the name-keyed path stays working unchanged. **Not Phase 2 (reconcile) or
Phase 3 (switch keys)** — rushing reconciliation risks attributing one real person's findings to
another, the worst failure class this system can produce.

**Adversarially probe every `SECURITY DEFINER` change with the anon key, plus a role with no
entitlement**, per this build's own standing incident precedent
(`incident-reveal-rpc-null-role-bypass-2026-08-20.md`) — a passing test suite alone did not catch
that bug.

## Independent, optional

Dispatch #52 is independent of this one — could run in parallel if preferred. Not started as part
of this dispatch; no `memory/dispatch-52.md` exists yet to read.
