# Dispatch #71 — Form Completions is empty because the pull silently no-ops. The fallback can't catch it.

**Status:** ready to start. Owner-reported live bug, 2026-08-22.
**Reads:** `memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md` (the measured
`completionDetail` response), `memory/project-forms-dashboard-slice3.md`.

---

## The report

Owner: *"Form Completions not populating."* Panel shows **"No form completions synced for this
window yet."** on the 7d window.

**The panel is not the bug.** `src/views/forms-panel.js:160` renders that string only when the
loader returns zero rows, which is honest. The data isn't there.

## Measured, in this order

1. **The pull workflow has run exactly twice — both today, both FAILED.**
   `qsrsoft-forms-completion-pull.yml`, runs at 10:15 and 19:16 UTC.
2. **It is not an auth error and not a crash.** All five date chunks complete in <1 s each and
   return **zero rows**:
   ```
   [forms-completion] 2026-08-08..2026-08-10: 0 row(s) -> 0 saved
   ...
   [forms-completion] 2026-08-20..2026-08-22: 0 row(s) -> 0 saved
   [forms-completion-pull] per-store: 0/27 store(s) had at least one row upserted.
   [forms-completion-pull] ✗ zero rows saved across 5 requested unit(s) -- a quiet no-op, not a success.
   ```
   ✅ **The no-op guard worked and exited non-zero.** That is the only reason this is diagnosable.
   The workflow is also correctly registered in `sync-failure-watch.yml`.
3. 🔴 **The same window returns thousands of rows by hand.** The finding file measured
   `2026-08-19T05:00:00.000Z → 2026-08-22T04:59:59.999Z` at **4,714 rows, 3 days × 27 stores, 13
   forms.** The failing run's last chunk is `2026-08-20..2026-08-22` — **inside that window** — and
   returned 0.
4. 🔴 **The owner's own `Completion_Details.xlsx` export confirms live submissions**, e.g.
   `Travel Path No Play Place / Tasks · 13113 · submitted 8/19/2026 9:00:52 AM · 3m 19s`. Owner
   confirmed verbally: *"do your stores actually use QSRSoft Forms? > yes."*

**So the data exists, the dates are right, and the request returns nothing.** Not a data gap.

## The hypothesis — strong, and NOT yet proven

**`forms.home.myqsrsoft.com` likely returns HTTP 200 with an empty array for a token-only
server-side request, instead of 401.**

Why this fits:
- `fetchWindow` (`scripts/qsrsoft-forms-completion-pull.mjs:115-119`) throws on 401/403 and on any
  non-`ok` status. **Neither fired**, so the server returned a 2xx with an empty body.
- The script authenticates with `getFreshToken()` + `X-Auth-Token` from Node; the 4,714-row capture
  came from a **browser session**.
- **CLAUDE.md already documents exactly this class for the sibling host:** *"`api.reports.
  myqsrsoft.com` requires browser session cookies — server-side Node.js fetch with token alone
  returns 401. Must use Playwright in-browser fetch."*
- The finding file marks this host's auth **"UNKNOWN — assume nothing"**, while the pull script's
  own header (`:14`) assumed *"fetch works, same auth SHAPE as api.reports"*. That assumption was
  never tested against a populated window.

**The difference from `api.reports` would be that this host fails SILENT (200 + `[]`) where the
sibling fails LOUD (401).**

⚠️ **Do not implement on this theory. Test it first** — this thread has already produced several
confident, wrong auth diagnoses, and the standing rule is that a reviewer's root cause (including
mine) is a hypothesis until reproduced.

**The test, one run:** force the Playwright path for a single chunk over the known-good window
(`2026-08-19..2026-08-22`) and log the row count. Rows appear → confirmed. Still zero → the theory
is dead and the next measurement is the raw response body and status, not another guess.

⚠️ **Also rule out the cheap alternative first:** log the exact `startDate`/`endDate` the script
builds and diff them byte-for-byte against the capture's
`"2026-08-19T05:00:00.000Z"` / `"2026-08-22T04:59:59.999Z"`. `apiWindowForDays()` is the only other
thing between the chunk dates and the request. That is a `console.log`, not a run.

## 🔴 The structural defect — real regardless of which theory wins

**The Playwright fallback cannot be reached from this failure mode.**

`:238` — `if (String(e.message).startsWith('AUTH_FAILED')) throw e; // let the caller fall back`

The fallback triggers **only** on a thrown `AUTH_FAILED`, i.e. only on 401/403. A 200 carrying an
empty array is not an error, never throws, and so **never escalates** — the script iterates every
chunk, saves nothing, and only the end-of-run no-op guard notices.

**Fix this whether or not the auth theory holds:** when every chunk returns zero rows and the pull
is not *expecting* an empty period, escalate to the Playwright path and retry before declaring the
run a failure. A silent-empty 200 from an auth-gated host is a normal API behaviour and the
two-path auth rule exists precisely to survive it.

📌 This is the same lesson as #66's swallowed navigation error, one layer out: **two very different
conditions — "authorized, genuinely nothing scheduled" and "not really authorized" — currently
produce byte-identical output.** They must be distinguishable in the log.

## Also fix while in here

- **`src/views/forms-panel.js:20-21` carries a stale comment**: *"Table is empty until Slice 3's
  pull script ships."* Slice 3 shipped — script, workflow and watch entry all exist. Same
  stale-comment rot as #68's `actVsNeed` note. Correct it to describe the real state.
- **Consider whether the empty state should distinguish "synced, nothing scheduled" from "never
  synced."** Today both render the same sentence. The panel already computes per-stream freshness
  (`freshnessOf`) and deliberately does *not* pool it — use it: a stream that has never delivered a
  row is a different message from one that is current and quiet.

## Verification bar

Per the standing revert-sensitivity rule, the fix has an ENGINE half (the pull) and a CONSUMER half
(the panel). A test that only exercises the escalation logic would pass with the panel still empty.

- **Pull:** a test where the first fetch returns `200 []` and asserts the Playwright path is
  attempted — not merely that a flag flips.
- **End to end:** the real check is a `workflow_dispatch` run over `2026-08-19..2026-08-22` landing
  non-zero rows in `qsr_forms_completion`, then the panel rendering them. **Do not close this on a
  green unit test.** The bug is that a green-looking run saved nothing.
- Standard bar otherwise: full suite, `npm run build`, entry-chunk numbers in the commit body.

🔒 `completedBy` is an employee name and `userId` a person UUID — the ingest already routes names
appropriately per Slice 1/3; do not widen that while fixing the fetch.

---

## Resolution (2026-08-22) — shipped as v5.109/v5.110

**Verified live end-to-end**: `workflow_dispatch` over `2026-08-19..2026-08-22` now upserts
**2,993 rows across 27/27 stores**:
```
[forms-completion] 2026-08-19..2026-08-21: 4720 row(s) -> 2238 saved
[forms-completion] 2026-08-22..2026-08-22: 1581 row(s) -> 755 saved
[forms-completion] done -- 2993 row(s) upserted for 2026-08-19..2026-08-22.
[forms-completion-pull] per-store: 27/27 store(s) had at least one row upserted.
```
Workflow run: `qsrsoft-forms-completion-pull.yml` run #8 (`c457ed8`), conclusion `success`.
This took **8 live `workflow_dispatch` runs** to reach, across **two genuinely distinct defects**
plus one incomplete fix. Honest accounting, in order:

### 1. The structural escalation-trigger bug — real, fixed, verified, but NOT the blocker

The brief's structural finding was correct: `runDirect()` only threw `AUTH_FAILED` on 401/403, so
a silent-empty 200 could never escalate to the Playwright fallback. Fixed with a new
`pullWithEscalation(chunks, tracker, {runDirectFn, viaPlaywrightFn})`: retries via Playwright when
the direct path saves exactly 0 rows with no thrown error, before trusting the zero. **Verified
live** (run #3→#4): the very next run showed the escalation firing for the first time —
`"escalating to the Playwright fallback to check before trusting the zero"` — where it previously
never attempted Playwright at all. This was a real defect and the fix is correct. It did not,
however, change the outcome: the underlying zero was not caused by a denied/wrong token, as the
next two findings show.

### 2. Playwright's own login was ALSO broken — a second real, independent bug

Once escalation could fire, the live log showed Playwright itself failing to capture a token:
`"[auth] ✗ could not capture x-auth-token via Playwright"`. Diffing against the sibling script that
already pulls successfully from this same `forms.home.myqsrsoft.com` host
(`scripts/qsrsoft-forms-pull.mjs`, form templates) found two concrete bugs, both already diagnosed
and fixed there:
- `waitForLoadState('networkidle')` as the login-complete signal races the SPA's auth request
  (documented in that script as its own v4.853 fix) — replaced with the password-field-detach
  signal.
- The API wants the Cognito **ID token** (`token_use:"id"`), persisted to
  `localStorage`/`sessionStorage` under a `.idToken`-suffixed key — header-sniffing an
  `x-auth-token` off a `*.home.myqsrsoft.com` request is a weaker proxy for the same value.

Mirrored `qsrsoft-forms-pull.mjs`'s `captureToken()` pattern. **Verified live** (run #4→#5): the
next run logged `"[auth] ✓ captured ID token (via header sniff) (1475 chars)"` — a genuine,
freshly-authenticated token.

### 3. The auth-denial hypothesis is REFUTED by direct measurement

With that genuinely valid token, the Playwright path **still returned 0 rows** for the known-good
window. A denied/wrong token cannot explain a zero from a session that just authenticated
successfully — this directly refutes the dispatch's own leading hypothesis ("silent 200+[] on a
denied token"). It is also inconsistent with
`memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md`'s own already-**RESOLVED**
conclusion that this host is token-only, no session cookies needed. Per the brief's own fallback
instruction — *"still zero → the next measurement is the raw response body and status, not another
guess"* — added temporary raw-body logging on any 2xx-that-parses-to-zero-rows.

### 4. The actual root cause: `results` vs `result` key mismatch

The very next live run (#5→#6) showed it immediately: `completionDetail` returns real, fully
populated data on every request — `{"results":[{...MISSED row...}, ...]}` — but
`parsed?.result || []` (singular) read a key that never existed on the response, so **every**
response, on **every** auth path, silently parsed to an empty array regardless of whether auth was
good or bad. This was never an auth problem. `fetchWindow()` (now exported for testing) reads
`results` first, falling back to `result` for safety, on both the direct and Playwright branches.
Diagnostic logging removed once its job was done.

### 5. A second real bug surfaced immediately after: Postgres `ON CONFLICT` batch collision

With real rows finally flowing (run #6→#7), the upsert itself failed: `"ON CONFLICT DO UPDATE
command cannot affect row a second time"` — Postgres rejecting a single upsert statement whose
`VALUES` contain two rows mapping to the same conflict target
`(tenant_id, loc, form_id, occurrence_key)`. Root cause: `scheduledAt` can be null (ad-hoc
completions fall back to `completedOn` as `occurrenceKey` — the schema file's own documented
caveat), and Travel Path alone is scheduled 27–45×/store/day, so two distinct API rows landing on
the same `(loc, formId, occurrenceKey)` within one pull window is a real, expected collision, not
corrupt data. Fixed with `dedupeByConflictKey()`: collapses same-batch duplicates by the actual
upsert conflict key (last one kept), logging the count collapsed rather than dropping silently.

### 6. That first dedup was incomplete — string equality wasn't enough

Run #7's dedup collapsed a large, real chunk of duplicates (1,840 + 612 rows, logged) but the
**same** `ON CONFLICT` error fired again immediately after on run #7 itself. `occurrence_key` is a
`timestamptz` column and `form_id` a `uuid`; Postgres's conflict check compares the **cast** value,
not the source text — two API rows carrying the same instant in different textual forms (differing
sub-second precision), or the same UUID in different letter case, are one conflict target to
Postgres but were two distinct `Map` keys under plain string equality. Fixed by canonicalizing
`occurrence_key` (via `Date` parsing, falling back to the raw string only if unparseable) and
lowercasing `form_id` before building the dedup key, so the JS-side grouping matches what the
database actually treats as identical. Run #8 (this fix) is the one that finally landed real rows.

### Also fixed while in here
- `src/views/forms-panel.js`'s stale "Table is empty until Slice 3's pull script ships" comment,
  corrected to describe the real (shipped, scheduled) state, per the brief's "also fix while in
  here" item.
- Two independent latent bugs found while making the module testable: an unguarded
  `createClient()` call (threw immediately without env vars, inconsistent with every sibling pull
  script's guarded pattern) and a missing `import.meta.url` direct-execution guard (`main()` ran
  unconditionally on import).

### Deliberately deferred (not started)
- **Distinguishing "synced, nothing scheduled" from "never synced"** in the panel's empty state.
  `freshnessOf()` returns `null` whenever `rows` is empty regardless of cause; genuinely
  distinguishing the two states would need a new, unbounded loader call outside this panel's
  current data model. Judged out of scope for a "Consider" item — documented here as a deferral,
  not silently dropped.

### Verification bar — met
- Pull-level tests: `pullWithEscalation` (4 cases), `fetchWindow` response-shape parsing (2 cases),
  `dedupeByConflictKey` (4 cases) — 10 new tests total, all revert-sensitivity confirmed
  (stashing each fix reproduces its exact original failure).
- **End-to-end, live, not a green unit test**: `workflow_dispatch` over `2026-08-19..2026-08-22`,
  run #8, conclusion `success`, 2,993 rows upserted across 27/27 stores. The panel itself was not
  separately browser-verified this session (no browser access to the live QSRSoft-gated app from
  this environment) — the loader (`loadQsrFormsCompletion`) and rollup engine
  (`computeFormStoreDayRollup`) are unchanged from Slice 1/2 and already tested against this exact
  row shape in `src/__tests__/forms-completion.test.js`.
- Full suite: 2040/2040 passing (10 new). `npm run build` clean, entry chunk gzip 512.03 KB
  (unchanged — none of this touches the client bundle).
