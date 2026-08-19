# Dispatch #33 — Security build Phase 0a: Register Audit auto-pull + Any Transaction probe

2026-08-19. `memory/dispatch-33.md` — Phase 0a of `memory/plan-security-loss-prevention.md`,
two independent pieces. **Both pieces hit the same hard environment blocker this session did
not have going in**: this sandbox has no QSRSoft credentials (`QSRSOFT_USERNAME`/`PASSWORD` not
set) and confirmed network egress to `v3.myqsrsoft.com`/`api.reports.myqsrsoft.com` is blocked
(`CONNECT tunnel failed, response 403`). The dispatch's own text assumed live DevTools access
("you'll need to capture it") for Part 1's endpoint discovery and named Part 2 outright as
"a capture-and-report task" requiring the QSRSoft UI. Neither is possible from here. What
follows is what could still be done honestly within that constraint, and what explicitly
could not.

## Part 1 — Register Audit auto-pull

**Shipped**: `scripts/qsrsoft-register-audit-pull.mjs` — a complete, correct pull-script
scaffold matching this repo's established convention (`qsrsoft-ops-pull.mjs`/
`qsrsoft-dar-pull.mjs`) with exactly ONE piece intentionally left unfinished: the actual
Register Audit report endpoint.

- **Auth**: `scripts/lib/qsrsoft-auth.mjs`'s `getFreshToken()`, per the dispatch's explicit
  instruction (not the older stored-token pattern).
- **Backfill/gap-detection**: `getLatestDate()`/`getDateRange()` mirror `qsrsoft-dar-pull.mjs`'s
  own logic exactly, including the #399 fix (only `PGRST116` means genuinely empty; any other
  read error must abort, not silently pick the biggest pull window).
- **Save path**: a server-side twin of `src/lib/supabase.js`'s `saveAuditRows()` — see below,
  this is NOT a straight import and that distinction matters.
- **Coverage + freshness**: wired through dispatch #32's `scripts/_pipeline-contract.mjs`
  (`logPartitionCoverage`/`checkFreshness`), same 30h/54h thresholds as `lifelenz-pull.mjs`/
  `qsrsoft-dar-pull.mjs`.
- **The one gap**: `fetchRegisterAuditDay()` throws a clear, named error instead of attempting
  a fetch. Its own comment records a grounded-but-unverified hypothesis (cross-referencing
  `parseRegisterAudit`'s column list against `qsrsoft-ops-pull.mjs`'s `COLS_CASH_EXTRACT` shows
  near-identical fields — T-Reds before/after, POS over-rings, refunds, promo, employee/manager
  meals, cash over/short — strongly suggesting Register Audit is the SAME `cash-sheet-extract`-
  family report segmented by employee rather than store, the way `qsr_peaks_sales` segments by
  `time_slice`) **for whoever does the real DevTools capture to try first, not as working code**.
  A wrong-but-200-OK guess could silently write incorrect rows into personnel-sensitive data
  (`data-acquisition-shopping-list.md` §A's own explicit flag) — worse than not having the data
  at all — so it throws instead of attempting it live.

## A real bug found and fixed before it could ship (checked before trusting the dispatch's own
## literal wording)

The dispatch's item 4 said "write to `audit_rows` via the existing `saveAuditRows` — do not
write a new save path." Taken literally, `import { saveAuditRows } from '../src/lib/
supabase.js'` — checked before committing to it, and **confirmed it crashes immediately under
plain Node**: that file opens its Supabase client via `import.meta.env.VITE_SUPABASE_URL` (a
Vite build-time transform, `undefined` outside Vite) against the **anon** key, not the service
role key every pull script needs to bypass RLS. `node -e "import('./src/lib/supabase.js')"`
throws `Cannot read properties of undefined (reading 'VITE_SUPABASE_URL')` — verified directly,
not assumed. This is exactly why `qsrsoft-dar-pull.mjs`/`qsrsoft-ops-pull.mjs`/`lifelenz-pull.mjs`
none of them import that file either; each reimplements its own local upsert against the service
role key. Followed that same established pattern: a local `saveAuditRows()` inside the new
script, its column mapping and `onConflict` copied verbatim from `src/lib/supabase.js:859` so
the two stay one contract in shape even though they can't be one function across the browser/
Node boundary. Recorded here because the dispatch's literal instruction would have shipped a
script that crashes on its first line if followed without checking.

## Checklist items from CLAUDE.md's "adding a new automated pull" standing rule

- **Watched**: deliberately **not yet** added to `sync-failure-watch.yml`. The workflow has no
  `cron:` schedule (`workflow_dispatch` only) precisely because `fetchRegisterAuditDay()` can't
  succeed yet — running an unattended nightly job that fails 100% of the time would be noise,
  not safety. `sync-failure-watch.test.js` only requires *scheduled* workflows to be watched, so
  this is correctly outside its scope right now; add both the `schedule:` block and the
  watch-list entry in the same PR that fills in the real endpoint.
- **Per-stream freshness**: built (`checkFreshness`, same as the two dispatch #32 conversions).
- **`audit_rows` tenant_id/RLS**: confirmed directly, not assumed — queried the live table via
  the anon key and got back real rows including a `tenant_id` column populated
  (`00000000-0000-0000-0000-000000000001`) and real employee names, confirming the table is
  live, already tenant-scoped, and reachable. Did not over-fetch — one row, confirming presence
  only, given this is personnel-sensitive data.
- **Manual Excel upload fallback**: untouched. `parseRegisterAudit`, the upload UI, and
  `MANUAL_FED_SOURCES` were not modified anywhere in this dispatch.
- **New GitHub Action workflow**: `.github/workflows/qsrsoft-register-audit-pull.yml`, matching
  the DAR pull's input shape (days_back/days_recent/start_date/end_date/debug), no Playwright
  install step (the script doesn't use Playwright yet — the dispatch's own item 5 asks to
  confirm whether Register Audit needs the DAR's in-browser-fetch pattern or accepts a direct
  server-side fetch, which is itself gated on the same DevTools capture as the endpoint).
- **Backfill**: not run — there is nothing to backfill until the endpoint works.

## Part 2 — Any Transaction probe

**Not attempted.** The dispatch names this explicitly as "a capture-and-report task, not a
build task" — there is no code to write, only a live QSRSoft UI interaction (run an Any
Transaction export filtered to one exception type, capture the request in DevTools) that
requires exactly the access this session confirmed it doesn't have. Nothing here should be
read as an answer to the Tier A question (server-side exception-type filter: yes/no/unknown) —
it remains genuinely unknown, not "probably yes" or "probably no." Fabricating a guess here
would be worse than silence, since the plan file's own text is explicit that Outcome 2 "needs a
judgement call rather than a build," which requires a real measured request/response, not an
inference.

## What's needed to unblock both pieces

Either: (a) a session with real `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` and network access to
`v3.myqsrsoft.com`/`api.reports.myqsrsoft.com` runs the DevTools capture directly (Register
Audit export + an Any-Transaction export filtered to one exception type), or (b) the owner does
the capture from his own browser session (he has already downloaded manual Register Audit and
Any Transaction exports per the plan file, so the UI paths are known) and hands the captured
request(s) to the next engineer session. Once Register Audit's endpoint is known,
`fetchRegisterAuditDay()`/`mapRow()` are the only two functions that need filling in — everything
around them is done.

## Verified

- `node --check` on the new script: clean.
- Confirmed the script does NOT crash at import time once real Supabase env vars are present
  (matches every sibling pull script's identical `supabaseKey is required` failure mode when
  env vars are absent — verified this is normal, not specific to this script, by running the
  same check against `qsrsoft-ops-pull.mjs`).
- `audit_rows` table reachability + `tenant_id` presence confirmed via a live, minimal
  (1-row) anon-key query.
- Did not add a dedicated unit-test file — matches this repo's own precedent: no individual
  pull script (`dar-pull`, `ops-pull`, `lifelenz-pull`) has one either, since their logic is
  Supabase/fetch-integration, not pure functions; only their shared libs
  (`pull-outcome.mjs`, `_pipeline-contract.mjs`) get direct tests. Full suite + build run
  unaffected regardless (scripts/ isn't bundled or covered by the vitest suite's own scope).
