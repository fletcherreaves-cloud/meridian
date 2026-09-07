---
name: finding-rls-phase2-my-locs-2026-09-06
description: RLS multi-tenant/multi-user readiness check, 2026-09-06 — corrects project-rls-hardening-plan.md's 2026-08-20 "Phase 2 confirmed NOT applied" claim. A newer, redesigned Phase 2 (public.my_locs(), replacing the abandoned public.can_see_loc() design) is live in production today. What's still genuinely unverified: whether the per-loc RESTRICTIVE policies from schema-rls-phase2-loc.sql are actually attached, and — separately — that no real profile is restricted enough to exercise them even if they are.
metadata:
  node_type: memory
  type: finding
---

# RLS Phase 2 readiness check — 2026-09-06

Requested as a backlog follow-on ("RLS multi-tenant readiness check — populate `accessible_locs`
on a test profile, verify RLS scoping, re-measure query performance"). Per CLAUDE.md's own
"measure it, don't reason about it" and "a live-data claim must name the credential and the
observation" rules, this is what was actually measured this session, with the exact credential
and result for each — not a re-read of the existing plan docs.

## Headline correction

**`project-rls-hardening-plan.md`'s 2026-08-20 note says "Phase 2 (`can_see_loc()`, per-loc
isolation) genuinely has not shipped — confirmed not applied."** That was true of the
`can_see_loc()` design it was written about. **It is no longer the current state.** A newer,
different-named redesign exists in the repo (`supabase/schema-rls-my-locs.sql` +
`supabase/schema-rls-phase2-loc.sql`, `public.my_locs()`) with header comments describing a real
measured performance incident (a per-row correlated `can_see_loc()`-style check timing out
production, "the timeout that emptied the tiles today") and a fix (`(select public.my_locs())`
wrapped as an InitPlan, 590ms → 13.8ms). **This redesign is live in production, not just written
to a file:**

| Probe | Credential | Result |
|---|---|---|
| `POST /rest/v1/rpc/my_locs` | service-role key | `HTTP 200`, body `null` — the function exists and executes |
| `POST /rest/v1/rpc/can_see_loc` (the old design, `p_loc:"3708"`) | service-role key | `HTTP 404`, `PGRST202` — "Could not find the function... in the schema cache" |

A function only appears in PostgREST's schema cache if it actually exists in the live database —
this isn't inferable from the repo alone. **`my_locs()` was run in production at some point after
2026-08-20; `can_see_loc()` either was never applied or was applied and later dropped in favor of
`my_locs()`.** Either way, the plan doc's "not applied" line is stale and should not be repeated.

## What's still unconfirmed, and why

This environment has no direct Postgres or Supabase Management API credential — only the REST API
via service-role/anon keys (CLAUDE.md's own standing note, re-confirmed here). `pg_policies` is
not queryable through PostgREST, so **whether `schema-rls-phase2-loc.sql`'s 51 RESTRICTIVE
per-loc policies are actually attached to their tables cannot be checked from here** — only the
helper function's existence could be probed indirectly (via RPC), and policies have no equivalent
RPC-shaped probe. The file's own "VERIFY" block (`select count(*) from pg_policies where
schemaname='public' and permissive='RESTRICTIVE'` → expect 51) has to be run by someone with
direct SQL access — the owner, via the Supabase SQL editor.

## The more important finding: nobody can test it live today, applied or not

Measured live (service-role read of `profiles`, count + role/`accessible_locs` shape only, no
names/emails):

- **3 total profiles exist** (`content-range: 0-0/3`).
- **1 of the 3 has a non-null `accessible_locs`** (`content-range: 0-0/1`) — but its value is the
  **complete 27-store list** (`["3708","5183",...,"38609","43701"]`), not a genuine subset.
- The other 2 profiles have `accessible_locs: null` (unrestricted, by design — owner/admin).

**No real profile today is actually restricted to a subset of stores.** Even if the RESTRICTIVE
policies from `schema-rls-phase2-loc.sql` are fully applied and correctly written, per-loc
isolation has never been exercised against a genuinely restricted account in production —
`accessible_locs` is either `null` or the full store list, both of which are functionally
"see everything." This matches `schema-rls-phase2-loc.sql`'s own header note ("SAFE TODAY: both
live profiles have accessible_locs = NULL... it only takes effect once someone is restricted") —
except there are now 3 profiles, not 2, and the third one's "restriction" doesn't restrict
anything.

**Also confirmed, incidentally:** `accessible_locs` is a native Postgres `text[]` (the `my_locs()`
RPC call succeeded with `unnest()`/`cardinality()` in its body — those fail on a `jsonb` column),
not the `jsonb` type `project-rls-hardening-plan.md`'s original 2026-07-27 draft assumed. That
draft is superseded on this point too.

## Why this session didn't go further

Verifying live per-loc scoping needs an authenticated session for a genuinely restricted user —
either logging in as a real existing account after narrowing its `accessible_locs` (touches a real
production user's access, however briefly) or minting a new auth user via the Admin API (a write
to the production Auth system). Both are the kind of production-affecting action CLAUDE.md's
standing rules ask to route through the owner rather than do unilaterally in an autonomous pass,
and neither is reversible-by-inspection the way a read-only measurement is. This is a genuine
judgment call, not a code question — flagged rather than guessed at.

## Recommended next step (concrete, ~2 minutes of the owner's time)

1. In the Supabase SQL editor, run `select count(*) from pg_policies where schemaname='public'
   and permissive='RESTRICTIVE';` — expect 51 per the migration file's own comment. This settles
   whether `schema-rls-phase2-loc.sql` actually ran, independent of the function-existence proof
   above.
2. Pick one existing non-owner profile (or create a throwaway one), set its `accessible_locs` to
   2-3 real store codes, log in as that user, and confirm every panel now shows only those stores
   — the exact test `project-rls-hardening-plan.md` always specified for Phase 2. Revert the
   profile's `accessible_locs` back to `null`/full-list afterward if it's a real account.
3. If step 2 shows cross-store data leaking through, the RESTRICTIVE policies aren't attached
   despite `my_locs()` existing — a real gap, not a false alarm, since the two are meant to ship
   together per the migration file's own design.

Do not re-run this session's own measurements without a reason — the two RPC probes and the
profile counts above are dated and credentialed; a future session should re-measure fresh rather
than trust this file's numbers indefinitely, per CLAUDE.md's own standing rule.

## Update 2026-09-07 — Step 1 of the recommended next step, done

Owner ran `select count(*) from pg_policies where schemaname='public' and permissive='RESTRICTIVE';`
in the Supabase SQL editor: **68**, not the 51 `schema-rls-phase2-loc.sql`'s own header comment
names. **This is not a discrepancy to chase — it's expected and confirms the policies are real.**
51 was that one migration file's own count, written when it shipped; roughly 10 more schema files
have landed since (e.g. `schema-dispatch-141-retention-marks.sql`'s `sched_retention_marks_loc`,
plus qsr-menu-items/qsr-menu-item-recipe/org-events-scope and others), each attaching its own
`my_locs()`-scoped RESTRICTIVE policy on top of the original 51. A repo-wide grep for the
`my_locs()) is null` pattern this session found ~10 files beyond `schema-rls-phase2-loc.sql`
itself, consistent with a total north of 51.

**So Step 1 (the migration actually ran) is now confirmed, not just inferred from the `my_locs()`
RPC's existence.** Step 2 — set a real/throwaway profile's `accessible_locs` to a genuine subset
and confirm every panel scopes to just those stores when logged in as that user — is the one that
proves isolation actually works end-to-end, and is still open as of this update.
