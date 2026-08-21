---
name: finding-phase0-gate-result-2026-08-21
description: Dispatch #53 Phases A-C, closed. The 403 was session-token expiry, not a rate limit -- the 48-day tail closed in one 3-chunk job (8,507 rows, 27/27 stores) inside the ~5-6 minute working window. Row 5 re-measured to 0, then CORRECTED to 2 the same day -- emp_id='0' is a sentinel, not a null, shared by 8 names of whom 2 have nothing else. G=2 still clears the <=25 gate, so nothing that shipped changes; Phase 2 must treat '0' as null.
metadata:
  node_type: memory
  type: finding
---

# Phase 0's gate, closed — G = 2 (corrected from 0), proceed to Phase D

**2026-08-21**, same day as `finding-phase0-identity-match-rate-2026-08-21.md`. Executes dispatch
#53 Phases A–C after the owner's own correction to Phase A's diagnosis.

## Phase A — the tail closed in one run, not three days

The 403 (`"explicit deny in an identity-based policy"`) was **session-token expiry**, not a volume
throttle — confirmed from the failing run's own timing (six uniform ~48s chunks, then a
deterministic cliff at ~5 minutes from token capture; IAM denies don't tighten with request
volume, and a WAF/throttle would return a different body/status). Ran the remaining 48-day tail
(`2026-07-05 → 2026-08-21`) as a **single 3-chunk job** (default 21-day chunking naturally
produces 3 chunks for a 48-day window) — **8,507 rows saved, 3/3 chunks, 27/27 stores**, finished
in ~2.5 minutes of actual fetch time, comfortably inside the working window. No multi-day pacing
needed. (The mid-run re-mint-on-403 code fix from the revised Phase A is not yet built — this run
succeeded without needing it, since it stayed under the expiry window. Still worth building
separately for future long backfills; not blocking this dispatch.)

## Phase B — row 5 re-measured

| | before (partial coverage) | after (tail closed) |
|---|---:|---:|
| Row 5 total | 123 | **0** |

Every one of 1,140 distinct names now resolves to at least one `emp_id`. No three-way split is
needed — total, genuinely-ID-less, and still-uncovered are all 0.

## Full picture, re-measured (not just row 5 — the population moved into rows 2–4 as coverage
completed)

| # | question | count | % |
|---|---|---:|---:|
| 1 | distinct names | 1,140 | — |
| 2 | name → exactly one `emp_id` | 1,089 | **95.5%** |
| 3 | name → multiple `emp_id`s (merged) | 51 | 4.5% |
| 4 | `emp_id` → multiple names (split) | 16 of 1,173 | 1.4% |
| 5 | name → no `emp_id` anywhere | 0 | 0.0% |

Sanity: 1,089 + 51 + 0 = 1,140. ✅ Live identity defects (rows 3+4): **67** — up from the
partial-coverage estimate of 54, now that the full 5.7-month window is counted.

## Phase C — the gate, applied

> ### ⚠️ CORRECTED 2026-08-21 (same day): **G = 2, not 0.** The gate still clears.
>
> `G = 0` below was measured with a query that asked *"which names have no `emp_id`?"* — and
> **`emp_id = '0'` is not a missing value to that query, it is a value.** Measured afterwards
> against the same table: `'0'` sits on **4,646 rows (15% of all rows with an `emp_id`)** and is
> shared by **8 distinct names**. Of those 8, **6 also carry a genuine `emp_id`** elsewhere (so
> `'0'` is incidental noise on some of their rows) and **2 have nothing but `'0'`** — those two are
> the real ID-less population.
>
> **`G = 2` still clears `G ≤ 25` comfortably, so Phase D was authorized either way and nothing
> that shipped needs revisiting.** The correction matters for the record and for Phase 2, not for
> the decision.
>
> **The generalizable miss: a sentinel is not a null, and only a value-distribution check tells
> them apart.** Row 5 counted `null`s. Nothing counted *values that mean null*. The distribution
> query that found it (`group by length(emp_id)`) took one minute and would have caught this on the
> first pass — and the same query also showed `emp_id` is **not one numbering scheme**: lengths 6
> (18 ids), 7 (57), 8 (532) and 9 (565), with non-overlapping ranges. **Phase 2 must not assume a
> uniform ID format.**
>
> **Phase 2 requirements this creates**, none of them optional:
> - **Treat `'0'` as NULL on read.** Keying on it would collapse 8 real people into one token —
>   the exact merge-two-people failure dispatch #49 warns against, and the largest instance of it
>   in the data. (Phase 1's split-identity fallback already fails safe here by accident of design:
>   the partial unique index lets only one vault row hold `'0'`, and every later one degrades to a
>   name-keyed token with `employee_id` null rather than merging.)
> - For the **6 names with both**, `'0'` rows must not outvote their real id.
> - For the **2 with only `'0'`**, there is no id to reconcile to. They stay name-keyed.

`G` (genuinely ID-less) = **2** (was reported as 0 — see the correction above).

| G | action |
|---|---|
| **G ≤ 25** ✅ | **Proceed to Phase D.** |
| 26–57 | stop, owner decides |
| > 57 | option B |

**G = 2 clears the gate with room to spare.** Proceeding to Phase D (dispatch #49's Phase 1
only — vault gains `employee_id`, additive, name-keyed path unchanged; NOT Phase 2/3).

## Phase D — dispatch #49's Phase 1, additive only

`supabase/schema-identity-vault-employee-id.sql`:

- `employee_identity_vault.employee_id text`, nullable. Partial unique index on
  `(tenant_id, employee_id) where employee_id is not null` — protects future correctness (a real
  eID should never end up on two different name-keyed rows) even though nothing populates the
  column yet, so it rejects nothing today.
- `get_or_create_employee_token(text, text)` — a new **overload**, not a signature change. The
  existing single-argument `get_or_create_employee_token(text)` is byte-for-byte unchanged and
  remains every live caller's path (the auto-pull, the manual-upload path) — Postgres resolves by
  argument count, so nothing had to change at any call site. The new overload is **opportunistic
  enrichment only**: `on conflict ... do update set employee_id = coalesce(existing, new)` — a row
  that already has an `employee_id` keeps it even if a later call carries a different one; a row
  with none yet gains the one supplied. Nothing calls this overload yet — Phase 2/3 (not this
  dispatch) would be what starts passing a real eID through it.

**Not started, per dispatch #53's own "nothing beyond it":** Phase 2 (reconciling existing
name-keyed vault rows against an eID) and Phase 3 (switching `audit_rows`' write key). No
reconciliation, no merge, no read of `audit_rows.emp_id` from this migration — that column
(dispatch #51) and this one (`employee_identity_vault.employee_id`) are on separate tables and
this migration does not connect them.

**Adversarially probed against a real local Postgres 16 instance**, not read as SQL — 15 probes,
all as designed:
- anon **can** call the new 2-arg overload (matches the 1-arg version's deliberate broad-expose
  posture — it never returns `employee_name`, confirmed via `pg_get_function_result`: both
  overloads return `uuid`, nothing else).
- The legacy 1-arg call and the new 2-arg call for the **same name** resolve to the **same
  token** — the overload didn't fork identity.
- A second 2-arg call with a **different** eID for a name that already has one does **not**
  overwrite it — opportunistic-only enrichment confirmed, not assumed.
- A name enriched later (no eID → eID via a subsequent call) correctly gains it.
- Empty name still rejected; whitespace-only eID normalizes to `NULL`, not `''`.
- **The unique index genuinely rejects a real eID collision** across two different names — not
  just declared, exercised.

### Review finding — the collision probe was right, its verdict was wrong (PM pass, same day)

That last probe was run and passed, but it was scored as *protection working* when the same PR's
own row 4 says it is a **guaranteed hard failure on 1.4% of the real population**: 16 of 1,173
eIDs already carry more than one name. Reproduced against the same local Postgres 16 instance
rather than argued — calling the overload with an eID already held by a different name raised
`unique_violation` out of the function body uncaught, so the caller got **no token at all** for a
person the 1-arg path tokenizes fine. The overload was strictly more fragile than the path it
exists to supersede, and only escaped notice because nothing calls it yet — Phase 2 is precisely
what would have walked into it.

Fixed in review: the insert is wrapped in a `begin … exception when unique_violation` that falls
back to the exact name-keyed insert the 1-arg signature performs, leaving `employee_id` null on
the new row and the incumbent mapping untouched. **Enrichment is optional; a token is not.**
Re-probed, nine checks, all revert-sensitive against the failure captured above: split identity
now returns a token with `employee_id` null; the incumbent `employee_id` is unchanged; a repeat
call returns the *same* token; a direct table insert of a duplicate eID is **still rejected**, so
nothing was loosened; normal enrichment, the 1-arg path, empty-name rejection, whitespace-eID
normalization, and `uuid`-only return types on both overloads all unaffected.

Deciding *which* name owns a split eID stays Phase 2's job, deliberately not attempted here —
guessing is exactly how one person's findings get attributed to another.

### One risk the local probing structurally cannot cover — verify it after applying

All 15 probes ran through `psql`, which resolves overloads **by argument count**. The only live
caller does not: `src/engine/identity-vault.js:24` goes through **PostgREST**
(`supabase.rpc('get_or_create_employee_token', { p_employee_name: name })`), which resolves by the
**set of JSON keys** in the body. A green psql probe says nothing about that path, so the overload
is unproven exactly where it matters most — this RPC is the single write path for *every*
tokenization, server-side auto-pull and browser manual-upload alike.

The design is right: with no `DEFAULT` on `p_employee_id`, a `{p_employee_name}` body matches the
1-arg signature and nothing else. **Never add one** — a default makes both signatures candidates
for that same body, which is PostgREST's *"Could not choose the best candidate function"*, and it
would break tokenization everywhere at once, at runtime, with nothing in the JS suite to catch it.
Recorded as a `⚠️` at the function in the migration itself, where a future editor will actually
see it.

**Post-apply check — ✅ DONE 2026-08-21. Applied and verified; do not re-raise.** Probed live
through PostgREST with the anon key, side-effect-free (empty name, so the guard fires before any
insert — no rows written). `{p_employee_name}` — the app's exact call shape — returns P0001
`employee_name is required`, identical to the pre-apply baseline. `{p_employee_name,
p_employee_id}` returns the same P0001, a RAISE from inside the function body, which proves the
overload exists and executed: that key set matched nothing before the migration. No PGRST203 in
either direction. Resolution is unambiguous and the 1-arg caller path is unaffected.

**The generalizable miss:** a constraint firing is not self-evidently a pass. The probe list
scored every check against *did the mechanism behave as written*, and the mechanism did; what it
never asked was *what happens to the caller when it fires* — a question this PR's own Phase 0
table already had the number for, two screens up. When a probe exercises a rejection path, score
the rejection's blast radius, not just that it rejected.
- `reveal_employee_identity()` re-verified unaffected by this migration: admin reveals
  successfully and the reveal is logged; anon is rejected at the grant level (never reaches the
  function body); a no-entitlement role (`office_staff`) is rejected by the role gate; **the exact
  NULL-role-bypass incident shape (an `authenticated` caller with no `profiles` row) is still
  correctly rejected by the trailing unconditional `ELSE`** — confirms the 2026-08-20 fix still
  holds after this change; manager gate correctly enforced both ways via `org_config`.
- `identity_reveal_log`'s columns confirmed to carry no `employee_name`/`employee_id` — schema
  check, not assumption.

One test-harness bug caught and fixed mid-probe: an early pass computed the token-to-reveal via a
live subquery against `employee_identity_vault` executed **under the impersonated role**, which
correctly failed on table permissions before ever reaching the function — a probe artifact, not a
finding. Fixed by fetching the token as superuser first (mirroring how a real caller already holds
a token, e.g. from `audit_rows.emp_token`) and passing it as a literal. A second harness bug
(`set_config(..., true)` scopes to the transaction, and each unwrapped `psql` statement
auto-commits its own transaction, so the session-config role reset before the next statement ran)
was fixed by using `set_config(..., false)` for session-level persistence — both are recorded so a
future probe session doesn't re-lose the same afternoon to either one.
