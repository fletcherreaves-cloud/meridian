---
name: incident-reveal-rpc-null-role-bypass-2026-08-20
description: Security incident — reveal_employee_identity() shipped with a role-gate bug that let an anonymous caller bypass authorization and reach the token->name lookup. Found same-day via live probing, fixed same-day, verified fixed live.
metadata:
  node_type: memory
  type: incident
---

# Incident: `reveal_employee_identity()` anonymous role-gate bypass (2026-08-20)

**Status: FOUND and FIXED same day, both confirmed by live measurement against production, not
by re-reading the code.** No known real-name exposure occurred — see "Actual exposure" below.

## Timeline

1. `supabase/schema-identity-vault.sql` (dispatch #37, PR #459) merged and the owner ran it
   against production. Owner confirmed "sql done clean."
2. Owner ran `scripts/backfill-identity-vault.mjs`, populating `employee_identity_vault` with
   real employee names for the first time and back-filling `audit_rows.emp_token`.
3. Independent verification (this session, per CLAUDE.md's "measure it, don't reason about it"
   standing rule — never trust a "done" report without probing the live system) ran a series of
   `curl` probes against the live Supabase REST endpoint using **only the public anon key, no
   login, no Authorization bearer**:
   ```
   POST .../rpc/reveal_employee_identity  {p_token: "<nonexistent uuid>", p_reason: "probe"}
   → HTTP 400 {"message":"reveal_employee_identity: token not found"}
   ```
   That response is only reachable **after** the function's role gate — meaning a fully
   anonymous, unauthenticated caller got past authorization and reached the vault lookup.
   Reproduced twice with different token values; the separate reason-required guard was
   independently confirmed still working (empty reason correctly rejected), isolating the bug to
   the role check specifically.
4. Root cause identified from the function source, not guessed: a classic Postgres NULL trap.
   `get_my_role()` returns `NULL` for an anonymous caller (`auth.uid()` is null →
   `select role from profiles where id = null` matches no row). The shipped gate was:
   ```sql
   if v_role = 'manager' then ...
   elsif v_role not in ('admin', 'supervisor') then
     raise exception ...
   end if;
   ```
   `NULL not in ('admin','supervisor')` evaluates to `NULL`, and PL/pgSQL treats a `NULL`
   `ELSIF` condition as false (same as skipping it) — with no trailing `ELSE`, a null role fell
   through the entire `IF/ELSIF` untouched and continued straight into the token lookup.
5. Hotfix written and handed to the owner as a single `create or replace function` statement
   (idempotent, no data impact) restructuring the gate so the reject path is an unconditional
   trailing `ELSE` — which a `NULL` condition can never skip, because it isn't a condition.
   Owner ran it in the Supabase SQL Editor, confirmed "ran it clean."
6. Re-verified live, same method as the original find: the same two anon-key probes (different
   nonexistent tokens) now correctly return
   `{"message":"reveal_employee_identity: role none is not permitted to reveal identities"}` —
   rejected at the role gate, never reaching the lookup. The reason-required guard was
   re-confirmed working. **Fix confirmed live, not just re-read.**
7. A second, related finding surfaced during the same probing: `revoke all ... from public` in
   the original file did **not** stop the anon key from invoking the function at all (the P0001
   exception is only reachable from inside the function body — a true permission failure returns
   a different, 42501-style error, which the probes never saw at any point, before or after the
   fix). Working hypothesis, not independently re-tested against a second function: Supabase's
   project-level default privileges likely grant `EXECUTE` directly to the `anon` role on newly
   created functions in this schema, and a direct grant to a named role is untouched by
   `revoke ... from public` (which only removes the implicit everyone-pseudo-role grant). Added
   an explicit `revoke execute ... from anon` as a second, independent layer — the restructured
   role gate is the real backstop either way, but closing "can invoke at all" is worth doing
   regardless of the exact mechanism. **Flag for later: audit whether this project has a
   schema-level `alter default privileges ... grant execute on functions to anon` and, if so,
   whether every other `SECURITY DEFINER` function in this repo needs the same explicit
   `revoke ... from anon` treatment — not confirmed, not yet checked.**
8. `supabase/schema-identity-vault.sql` updated in the repo to match the live hotfix exactly (PR
   pending as of this file's commit), so a future fresh run of the full schema file reproduces
   the safe version, not the original bug.

## Actual exposure — what could and could not have happened

- **`employee_identity_vault` and `identity_reveal_log` both correctly reject anon reads at the
  RLS layer** (zero policies / admin-only policy respectively) — confirmed by probe, unaffected
  by this bug. A true outsider (not a logged-in Meridian user) cannot discover a real token value
  from either table directly.
- **`audit_rows` also correctly rejects anon reads** (tenant-scoped RLS via the multitenant
  migration) — confirmed by probe. So an anonymous, non-user attacker had no path to learn a real
  `emp_token` value to feed into the buggy RPC in the first place, during the window this bug was
  live.
- **The real risk was a logged-in but lower-privileged app user** (e.g. a GM without
  `org_config.gm_identity_reveal_enabled`, or any authenticated role) who can already see
  `emp_token` values in the Register Audit panel's API response (dispatch #38's reveal UI hasn't
  shipped yet, so the UI itself shows `'Unknown'`, but the underlying JSON payload the client
  receives already carries the token) — such a user could have called the RPC directly (e.g. via
  browser devtools or a raw fetch) using the public anon key baked into the client bundle,
  supplying a real token, and gotten a real name back without ever passing the role gate.
- **No confirmed instance of this actually happening.** This was caught same-day, between the
  backfill populating real data and any reveal-UI existing for a user to discover token values
  through in the first place (dispatch #38 is still an unimplemented brief as of this writing).
  Nothing in this incident implies an actual name was disclosed to an unauthorized party — only
  that the mechanism to do so was live and reproducible for a window of roughly the same session.

## What this changes going forward

- **Never write a PL/pgSQL role/permission gate as a rejecting `ELSIF` condition.** Structure it
  as allow-branches followed by an unconditional trailing `ELSE raise exception`. A `NULL`
  condition is not "false" in the sense of triggering a negative branch — it is silently skipped,
  which is exactly backwards for a security check where "we don't know the role" must mean
  "reject," not "fall through."
- **This bug shipped through both the dispatch brief and the independent PR verification without
  being caught** — the PR verification for #459 read the function and reasoned about its logic
  correctly-looking IF/ELSIF shape, but did not actually probe it live against a NULL-role caller.
  Static reading is not enough for an authorization gate; a security-sensitive RPC needs a live,
  adversarial probe (anon key, no session) as part of its own verification, not just a code read.
  Add this to how any future `SECURITY DEFINER` function touching PII gets verified.
- **`revoke ... from public` is not proven sufficient to block `anon` on this project** — treat
  every future security-sensitive function the same way: explicit `revoke execute ... from anon`
  in addition to `revoke ... from public`, don't rely on the PUBLIC-only revoke pattern the rest
  of this repo uses for less sensitive functions.
