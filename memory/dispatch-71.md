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
