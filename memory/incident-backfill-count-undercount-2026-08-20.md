---
name: incident-backfill-count-undercount-2026-08-20
description: scripts/backfill-identity-vault.mjs logged "0 row(s) updated" for all 449 employees on its first live run — a broken row-count report, not a failed write (confirmed live). Root-caused against the actual installed postgrest-js source, fixed and confirmed same day.
metadata:
  node_type: memory
  type: incident
---

# Incident: `backfill-identity-vault.mjs` reported 0 rows updated (2026-08-20)

**Status: CLOSED, same day — root cause identified against the real installed library source
(`@supabase/postgrest-js@2.108.2`), fixed, and the live-data outcome confirmed by the owner.**
Read-only check run in the Supabase SQL Editor:
```
tokenized: 21929, still_untokenized: 0
```
Confirms the hypothesis below exactly: the 449 `PATCH` updates all actually succeeded on first
run — every `audit_rows` row with a non-null `emp` now carries an `emp_token`, zero left behind.
The "0 row(s) updated" log was purely a broken count-reporting bug, never a failed write. No data
re-run needed; the code fix (already merged) prevents the misleading log on any future run.

## What happened

Owner ran `node scripts/backfill-identity-vault.mjs` for the first time against production
(after the vault schema + the same-day `reveal_employee_identity()` role-gate fix, see
`memory/incident-reveal-rpc-null-role-bypass-2026-08-20.md`). Output:

```
[backfill-identity-vault] 449 distinct untokenized employee name(s) found
[backfill-identity-vault] 449 token(s) resolved via get_or_create_employee_token()
[backfill-identity-vault] done — 0 row(s) updated across 449 employee(s), 0 failure(s)
```

449 new tokens were successfully created in `employee_identity_vault` (the RPC calls
unambiguously succeeded — `tokenMap.size` matched `names.length` exactly). But the final line
claims **zero** `audit_rows` were actually updated with those tokens, despite **zero** reported
failures either — an internally inconsistent result (if all 449 update calls truly wrote 0 rows
with no errors, that's not a partial failure, it's the update clause never matching anything,
which would be a different, more serious bug than what was actually found).

## Root cause — confirmed against the installed library source, not assumed

`scripts/backfill-identity-vault.mjs`'s update call was:

```js
const { error, count } = await supabase
  .from('audit_rows')
  .update({ emp_token: token })
  .eq('emp', name)
  .is('emp_token', null)
  .select('*', { count: 'exact', head: true });
```

Read `node_modules/@supabase/postgrest-js/src/PostgrestQueryBuilder.ts` and
`PostgrestTransformBuilder.ts` directly (installed version 2.108.2) rather than reasoning from
memory of the API surface:

- `PostgrestQueryBuilder.update(values, { count })` is where the `count` option actually lives —
  it appends the `Prefer: count=exact` header at the time the `PATCH` request is built.
- `.select()` called **after** `.update()` resolves to `PostgrestTransformBuilder.select(columns?)`
  — a *different* method than the one on `PostgrestQueryBuilder` that backs
  `supabase.from(x).select(...)`. This one's real signature takes only `columns`; it does not
  accept a second `{count, head}` argument at all.

Because this file is plain `.mjs` (no TypeScript enforcement at runtime), passing
`{count:'exact', head:true}` as an unsupported second argument to that method is not an error —
it's silently ignored. So:
- No `Prefer: count=exact` header was ever sent → PostgREST never returned a count → supabase-js's
  `count` field on the response was `null` for every one of the 449 calls.
- `head: true` was similarly a no-op on this code path (it only changes behavior on the primary
  `PostgrestQueryBuilder.select()`, which was never reached here) — the request stayed a normal
  `PATCH`, `Prefer: return=representation` still got added by `.select()`'s own unconditional
  header append, so the request itself very likely still executed as a real update.
- `updated += count || 0` then added `0` on every iteration, regardless of how many rows the
  `PATCH` actually touched — producing a misleading "0 updated" log even in the case where every
  single write succeeded.

**This means the most likely real-world outcome is that the 449 updates actually happened and
only the script's own count-reporting was broken** — but this is inferred from library source,
not yet confirmed against live data. Treat "the backfill silently did nothing" as unconfirmed
until checked directly (see below), not as ruled out.

## The fix

```js
const { error, count } = await supabase
  .from('audit_rows')
  .update({ emp_token: token }, { count: 'exact' })
  .eq('emp', name)
  .is('emp_token', null);
```

`count: 'exact'` moved to where it actually belongs — `update()`'s own options argument — and the
trailing `.select('*', {...})` (which was never doing what it looked like it was doing) removed
entirely, since nothing in this script consumes the row representation, only the count.

## What was confirmed — CLOSED

Owner ran this read-only check in the Supabase SQL Editor (safe from a phone browser, no
Mac/terminal needed), same day:

```sql
select count(*) as tokenized,
       count(*) filter (where emp_token is null and emp is not null) as still_untokenized
from public.audit_rows;
```

- **`still_untokenized` near 0** → the backfill worked; this was purely a broken log message, no
  further action needed beyond the code fix already made.
- **`still_untokenized` still close to the original 449-employees'-worth of rows** → the writes
  genuinely didn't happen and needs a fresh diagnosis (a different bug from the one found here) —
  re-run `node scripts/backfill-identity-vault.mjs` with the fix in place; it's idempotent
  (`is('emp_token', null)` on both the read and write sides), safe to re-run regardless of which
  case this turns out to be.

## Standing lesson

Don't trust a script's own printed summary as proof of what it did, even when it reports zero
errors — an internally inconsistent result (0 successes, 0 failures, but 449 attempted writes) is
itself a signal to verify against the live system, not to read the exit code and move on. This is
the same "measure it, don't reason about it" discipline that caught the same-day
`reveal_employee_identity()` role-gate bug — both were found by treating a "looks done" report as
a hypothesis to test, not a fact.
