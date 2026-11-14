# Finding: `schema.sql` wasn't actually safe to re-run in full (96 missing guards)

**Hit live, 2026-11-14**, by the owner re-running `supabase/schema.sql` on his own database
after the `profile_id`/`store_loc` backfill fix (2026-11-13, commit `0c16dc18`). That fix only
covered the two bare `UPDATE` statements that had already failed for him — it did not audit the
rest of the file for the same class of problem.

## What broke

`ERROR: 42710: policy "qsr-reports: public read" for table "objects" already exists` — a `create
policy` statement with no guard, on a policy that had already been created by an earlier (partial
or full) run.

## Root cause

The file's own header claims it's safe to "run this in the Supabase SQL editor" (i.e., re-run in
full, idempotently) and backs that up for table/column DDL (`create table if not exists`, `alter
table add column if not exists`), but **Postgres has no `CREATE POLICY IF NOT EXISTS`**, and most
of the file's policy statements were never given the `drop policy if exists "<name>" on <table>;`
guard that 19 of them (now 17 after accounting for 2 that are inside a dynamic `EXECUTE format()`
loop, already self-guarding) already used. The other **96 `create policy` statements had no guard
at all** — every one of them would fail identically, one at a time, on any second run, exactly
the same whack-a-mole shape as the `profile_id`/`store_loc` bug, just at 48x the scale.

## Fix

Mechanically inserted `drop policy if exists "<name>" on <table>;` immediately before all 96
unguarded `create policy` statements, matching the exact convention the other 17 already used.
Verified via script: `grep -c '^create policy'` (113) now equals the count of `drop policy if
exists` lines whose extracted `(name, table)` matches a create (115 total guards — 113 1:1 with
literal creates, +2 pre-existing for the dynamic-loop block which uses `%s`/`%I` placeholders and
was correctly left untouched since it already drops before creating on every iteration).

Not a hypothesis — reproduced the exact error class by inspection of every `create policy` in the
file against every `drop policy if exists` already present, not by assuming the pattern held.

## Verification

- `grep -c '^create policy' supabase/schema.sql` → 113, unchanged (no statements added/removed,
  only guards inserted).
- Ran the 6 existing tests that read `schema.sql` directly (`schema-drift.test.js`,
  `review-locked-actuals-override.test.js`, `dispatch-jan-mar-reconstruction-flag-2026-10-02.test.js`,
  `dispatch-qsr-field-dict.test.js`, `sage-memory-kb.test.js`, `permissions.test.js`) — all 96
  pass, unaffected (none of them assert on policy-guard presence, only on table/column text).
- Did **not** run the SQL against a real Postgres instance (no live credential in this
  environment) — the fix is mechanical and matches an already-proven convention exactly, but the
  owner's own next full run on his database is the real verification.

## Why this matters going forward

The file's own "idempotent, safe to re-run in full" framing was false for 96 of 113 policies, and
nobody had actually tried a full second run end-to-end until the owner did it live, twice, from
his phone. **Any new `create policy` added to this file from now on needs its own `drop policy if
exists` immediately before it** — there is no `IF NOT EXISTS` form for policies in Postgres, so
this has to be hand-added every time, unlike table/column DDL.
