---
name: dispatch-53
description: Close Phase 0's 48-day backfill tail, re-measure row 5, and then - only if it clears a decision rule stated in advance - execute Phase 1 of the identity re-key. Carries a hard pacing constraint because the endpoint began returning volume-triggered 403s, and an explicit self-gate so the engineer does not have to guess whether the numbers justify proceeding.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #53 — close the tail, then re-key

**Read first:** `finding-phase0-identity-match-rate-2026-08-21.md`, then `dispatch-49.md` (Phases
1–3). This executes #49's remainder.

**Owner has approved the direction.** Rows 3–4 settled it: **40 names currently resolve to multiple
employee IDs**, so the vault merges distinct humans into one token today, co-mingling their findings
in a system that names people. Plus 14 IDs split across name variants. **54 live identity defects.**
The re-key is a correction, not an optimisation.

---

## Phase A — close the tail (pacing is a hard constraint, not advice)

Backfill **2026-07-05 → 2026-08-21**, ~48 days.

**⚠️ The endpoint started returning a 403 explicit-deny IAM policy after ~6 of 9 chunks.** That is a
**third, distinct** failure mode — not the 401 cached-token rejection, not the intermittent
`token captured: false`. It is the only **volume-triggered** one, which means **retrying harder
makes it worse**.

So:
- **Do not run this as one job.** Split it into **separate workflow runs** of roughly two weeks each,
  with real time between them. Three runs beats one nine-chunk job.
- **One retry per run, then stop for the day.** Not per chunk — per run.
- **Do not start before 2026-08-22.** Let the trip clear. Nothing here is urgent.
- Repeated Playwright logins run against the **owner's own QSRSoft account**; a lockout takes the
  daily DAR and eBOS syncs down with it.

If a run 403s again after this pacing, **stop and report**. That would mean the limit is lower than
assumed and the plan needs rethinking, not more attempts.

## Phase B — re-measure row 5 only

Rows 1–4 are already measured and will not move materially. **Only row 5 was ambiguous**, and only
because of coverage.

Re-run row 5, plus the same boundary check that resolved it the first time: for any name still
lacking an `emp_id`, does it have rows inside the now-covered window? A name with covered rows and
still no ID is **genuinely ID-less**. A name still only in an uncovered gap is still an artefact.

**Report row 5 as: total, genuinely ID-less, still-uncovered.** That three-way split is the number
the decision needs — not the headline count.

## Phase C — the gate, with the rule stated in advance

**This threshold is a POLICY choice, not a measurement** — which is exactly why it is written before
the number exists. Stating it now is what stops it being rationalised afterwards.

Let **G** = genuinely ID-less names (Phase B's middle figure), against 1,140.

| G | action |
|---|---|
| **≤ 25 (~2%)** | **Proceed to Phase D.** Small enough to carry as explicit unreconciled exceptions. |
| **26–57 (~2–5%)** | **STOP and report.** Owner decides. Do not proceed on your own judgement. |
| **> 57 (~5%)** | **STOP. This is option B territory** — a mapping table, not a re-key. Report and stop. |

**Landing in the middle or upper band is a legitimate result, not a failure.** #49 records that
taking the option-B fallback is a success. Do not tune anything to get under a threshold.

## Phase D — Phase 1 of the re-key (only if G ≤ 25)

Per `dispatch-49.md` Phase 1, and **nothing beyond it**:

- `employee_identity_vault` gains `employee_id`. **Additive.** The vault becomes the one place a
  person's identifiers live — eID, name, token — behind the same role-gated logged reveal.
- `get_or_create_employee_token()` gains an eID-aware path. **Keep the name-keyed path working
  unchanged** — legacy callers must not break and existing `audit_rows` tokens must keep resolving.
- **Do NOT start Phase 2 (reconciliation) or Phase 3 (key switch).** Those are separate, and Phase 2
  in particular can attribute one person's findings to another if rushed.

**⚠️ Adversarially probe every new or changed `SECURITY DEFINER` function with the anon key before
calling it done** — and with a role holding no entitlement. `reveal_employee_identity()` shipped
with a NULL-role bypass that a green test suite did not catch
(`incident-reveal-rpc-null-role-bypass-2026-08-20.md`). A trailing unconditional `ELSE` that raises
is the shape that fixed it.

**Never log or return a name** in an error message, console line, or test fixture.

## Report back

The three-way row-5 split, which band it lands in, and — if Phase D ran — the probe results. Then
stop. Phases 2 and 3 need the owner's eyes on Phase D first.

## Standing rules that bite here

- **Pacing is the constraint.** The 403 is volume-triggered; hammering makes it worse.
- **The gate rule was written before the number.** Do not move it.
- **An unresolvable identity is an honest null, never a guess** — the contract everywhere else here.
- **Would this pass if reverted?** Exercise the real call path, not a helper's shape.
