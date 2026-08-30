# Dispatch #218 — `fetchAll()`: retry a transient page failure before surfacing DATA INCOMPLETE

## Context — a real banner, a real cause, a cheap fix

Owner-observed (2026-08-29, screenshot): a "DATA INCOMPLETE — 1 page(s) failed to load...
qsr_raw_item_detail... UNDERSTATED" banner. Live-measured during triage: the table itself is
healthy (3,107 rows) and a fresh page fetch succeeds in ~1.4s — this was a one-off transient
failure (this exact table has hit statement timeouts under concurrent load before, per
`loadQsrRawItemDetail`'s own 2026-08-07 comment in `src/lib/supabase.js`, which is WHY its page
size is already tuned down to 200 rows). Today, `fetchAll()` (`src/lib/supabase.js:146`, the ONE
shared pagination helper ~37 loaders call) treats ANY page error as fatal: it warns, marks the
result `_partial`, records a `DataErrorBanner` entry, and stops — the only recovery is a full
manual page reload. This dispatch adds a bounded, cheap retry for a page that LOOKS transient,
before falling through to that existing (correct, keep-it) behavior.

**High blast radius, be careful**: `fetchAll()` is shared by ~37 callers per its own comment.
This dispatch changes its INTERNALS only — same function signature, same return shape, same
`_recordDataError`/`_partial` contract when retries don't help. Nothing about the 37 callers
changes. Regression risk is the primary concern here; the verification section below reflects
that.

## Design — retry a FAILED PAGE, not the whole pagination, and only when it looks transient

On a page error inside `fetchAll()`'s loop:
1. **Classify the error** — retry only when it looks transient, never when it looks structural/
   permanent (retrying a permanent error just delays an accurate failure by a few seconds for no
   benefit, and this repo already has a real classification precedent to reuse, don't invent a
   new one):
   - **Do NOT retry** (identical to today's immediate fail-fast behavior): `error.code === '42703'`
     (bad column), `'42P01'` or `'PGRST205'` (missing table/relation — see this same file's own
     `_isMissingTableError`-shaped checks elsewhere, e.g. line ~546, for the exact pattern to
     match), or any other 4xx-shaped PostgREST error that isn't a timeout. These mean "this query
     is wrong" or "this table isn't migrated yet" — retrying never helps.
   - **DO retry**: `error.code === '57014'` (Postgres statement-timeout SQLSTATE — this repo's own
     CLAUDE.md names this exact code for this exact class of large-table read, `qsr_daily_activity`
     scans), or a thrown/network-shaped failure with NO `.code` at all (a fetch-level failure —
     connection reset, timeout, "a free-tier egress/throttle cutoff" per this file's own existing
     comment on this exact function). When in doubt (an error shape you don't recognize), treat it
     as retryable — a wasted retry costs a second or two; a permanent-looking classification that's
     actually transient costs a real DATA INCOMPLETE banner for no reason.
2. **Retry the SAME page** (same `from`/`to` range) up to 2 times, with a short backoff between
   attempts (e.g. 500ms, then 1500ms — enough to ride out a brief timeout/throttle without making
   the user wait long, and increasing rather than flat so a real throttle isn't hammered
   immediately again).
3. **If a retry succeeds**, continue pagination normally — no `_recordDataError`, no banner, the
   caller never knows a retry happened (this is the whole point: make a transient blip invisible,
   exactly like this repo already does at the individual-item level in other pull scripts).
4. **If retries are exhausted (or the error was classified as permanent from the start)**, fall
   through to TODAY's exact existing behavior unchanged — same warning log, same `_recordDataError`
   call, same `_partial` marker, same `break`. Do not change what gets recorded or how the banner
   reads in the give-up case; only the earlier automatic-recovery path is new.

## Task — implement in `src/lib/supabase.js`

- A small `_sleep(ms)` helper if one doesn't already exist in this file (check first).
- A small `_isRetryablePageError(error)` helper implementing the classification above — exported
  or at least directly unit-testable, so its logic isn't buried inline where a test can't reach it
  without going through the full `fetchAll()` retry loop.
- Modify `fetchAll()`'s error branch (around line 155) to attempt the classify→retry→re-fetch-same-
  page sequence before reaching today's existing warn/record/break code. Keep that existing code
  path completely intact as the "retries didn't help" fallback — don't restructure it, just gate
  entry to it behind the new retry attempt.

## Verification — this is the part that matters most given the blast radius

- Unit tests directly on `fetchAll()` (it's an internal, non-exported function today — either
  export it for testing the same way this file exports other internals when a dispatch needs to
  test them, or test it via one real existing caller, your call, but the retry behavior itself
  must be exercised directly, not just asserted indirectly):
  - A page that fails ONCE with a retryable error (e.g. no `.code`, generic network-shaped
    message) then succeeds on retry → full data returned, NO `_recordDataError` call, no
    `_partial` marker. (Use `dataLoadErrors()`, already exported, to assert nothing was recorded.)
  - A page that fails with `error.code === '57014'` then succeeds on retry → same as above.
  - A page that fails ALL retry attempts (still retryable-shaped every time) → falls through to
    TODAY's exact existing behavior: `_recordDataError` called, `_partial` set, pagination stops
    with whatever rows loaded before the failure — assert this is byte-for-byte the same shape as
    the CURRENT (pre-dispatch) failure behavior, not just "some error got recorded."
  - A page that fails with a NON-retryable error (`42703`, `42P01`, `PGRST205`) → fails
    IMMEDIATATELY, no retry delay, identical to today's behavior — this is a regression guard:
    prove the classification actually skips retrying these, don't just assert the end state.
  - A page that succeeds on the FIRST try (the overwhelmingly common case) → byte-for-byte
    identical behavior/timing to before this dispatch (no artificial delay introduced for the
    happy path).
- At least one existing test file that already exercises a real `fetchAll()`-backed loader (e.g.
  whatever covers `loadQsrRawItemDetail` or a similar loader, if one exists — check before
  assuming none does) must still pass unchanged, proving a real caller's contract is untouched.
- Full existing test suite must still pass — this function is load-bearing for ~37 callers, a
  suite regression here is a big deal, read any failure carefully rather than patching around it.
- `npm run build` must pass clean.
- Version bump (re-check `origin/main`'s current highest changelog version fresh immediately
  before committing).

## Out of scope

- Any change to `fetchAll()`'s public contract (signature, return shape, `_partial` marker
  semantics, `DataErrorBanner`'s own rendering) — internals only.
- Retrying anything OTHER than the page-fetch loop inside `fetchAll()` itself (e.g. the separate
  single-row error path at this file's line ~164, `_recordDataError(label || 'a data table', 1, 0,
  ...)`) — that's a different code path for a different kind of read, not in scope here unless you
  find it's trivially the same shape (state your call either way, don't silently skip mentioning
  it).
- Increasing the page size back up for `qsr_raw_item_detail` or any other table — the 200-row
  tuning from 2026-08-07 stays as-is; this dispatch is about resilience to an occasional failure,
  not about avoiding failures by shrinking pages further.
- A user-visible "retrying..." indicator — the whole point is this recovers silently and fast;
  a retry indicator is unnecessary UI noise for a sub-2-second recovery.
