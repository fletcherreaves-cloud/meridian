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

## ⚠️ PHASE A SUPERSEDED 2026-08-21 — the 403 is not a rate limit

**The pacing plan below was built on a wrong diagnosis and must not be followed.** Reading the
actual failing run (`32483239002`) instead of the summary:

```
12:45:23  2026-03-01..03-21   3717 rows ✓      12:47:50  2026-05-03..05-23   3767 ✓
12:46:10  2026-03-22..04-11   3789 rows ✓      12:48:39  2026-05-24..06-13   3790 ✓
12:46:58  2026-04-12..05-02   3789 rows ✓      12:49:26  2026-06-14..07-04   3815 ✓
12:49:27  403: "User is not authorized to access this resource
                with an explicit deny in an identity-based policy"
```

**That is AWS IAM authorization language, not throttling.** A WAF rate rule returns a WAF body; API
Gateway throttling returns 429. **An IAM explicit-deny is deterministic — policies do not tighten
with request volume.**

**The timing is the tell.** Started 12:43:22, died 12:49:27 — **six minutes, six chunks**.
Yesterday's 80-day backfill succeeded in **three** chunks (~3 min). This morning's 1,781-row pull
succeeded because it was short. **Short runs succeed; long runs die around six minutes.** That is a
**session-token expiry** signature.

Both look like "fails after N chunks," but the fixes are opposite: a rate limit needs **waiting**;
an expiry needs **re-minting mid-run**. The pacing plan treats the wrong one.

### Revised Phase A

1. **Run the tail NOW as a single job.** 48 days ≈ **3 chunks ≈ 2.5 minutes** — comfortably inside
   the window that has been working all along. No multi-day pacing. **Cancel any scheduled run.**
2. **Fix the real bug, separately:** on a 403 mid-run, **re-mint the session token and continue**
   rather than aborting. That is what makes long backfills possible at all. Consider a proactive
   re-mint every ~4 chunks.
3. If the tail still 403s inside 3 chunks, the expiry theory is wrong — **stop and report**, do not
   fall back to grinding.

**PM note, recorded because it is the reusable part:** the original Phase A accepted "403 = anti-abuse
trip" from a summary and built a multi-day plan on it. One look at the log said otherwise. That is
the second time in two days a characterisation was taken instead of the output — same class as the
shallow-clone `git log -S` error in the email-parse attribution.

## ~~Phase A — close the tail (pacing is a hard constraint, not advice)~~ (superseded, see above)

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
