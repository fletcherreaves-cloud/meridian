# QSRSoft pull "Failed to fetch" incident — measured, partially fixed, one open thread (2026-09-13)

Three independent QSRSoft pull workflows hit the identical failure signature the same day:
`QSRSoft McDelivery Pull` (#1231, failing since 2026-09-11), `QSRSoft Menu Item Activity Pull`
(#1248), `QSRSoft Menu Price Comparison Pull` (#1249). All three: after a valid auth token was
captured via the Playwright fallback, the script's own in-browser `fetch()` to
`api.reports.myqsrsoft.com` threw a bare `TypeError: Failed to fetch` — no HTTP status, no
diagnosable reason (browsers deliberately never expose the real network-level cause — CORS
denial, DNS hiccup, a blocked request — to page JS).

## What was measured (in order)

1. **A plain re-run of the exact failing McDelivery/Menu Item Activity runs, same commit, same
   day, succeeded outright with zero code change** — `27 store rows upserted to
   mcdelivery_monthly for 2026-09`. This rules out a deterministic code bug or a QSRSoft-side
   CORS-policy change (a real policy change would fail identically every time, on the same
   commit, seconds apart).
2. **Re-running Menu Price Comparison a second time showed a sharper pattern**: the report
   page's own passive navigation triggered 9 successful requests to the exact same
   `api.reports.myqsrsoft.com/reports/mcd/product/menuPriceComparison` endpoint (visible via a
   `page.on('request')` listener already in the script), and the token was captured cleanly.
   The script's own manual `fetch()` to that same host, fired immediately after, still threw
   "Failed to fetch."
3. **Added a bounded retry** (2 extra attempts, 3s apart) specifically on the `'Failed to
   fetch'` error string (never on a real HTTP error, which still returns immediately to the
   existing `AUTH_FAILED` re-mint path). Dispatched on a branch to verify:
   - `mcdelivery`: succeeded outright (didn't even need the retry to fire this time).
   - `menu-price-comparison`: the retry **engaged exactly as designed** — `fetch attempt 1
     failed`, `fetch attempt 2 failed`, both after the full 3s wait — but **all 3 attempts
     failed identically**, again immediately after the same page had already made several
     successful requests to the same URL.

## What this rules out, and what's still open

- **Not a hard CORS/policy block** — a real policy rejection would fail 100% of the time on an
  unchanged commit; two of three workflows recovered on a plain re-run with no code change.
- **Not cleared by a short retry** — Menu Price Comparison's variant survived 3 attempts across
  ~9 seconds, so whatever is happening here doesn't resolve on that timescale the way a brief
  network blip would.
- **The pattern "page's own requests to this exact URL succeed moments before the script's own
  fetch to it fails" reproduced twice, independently, on two different days' runs (2026-09-13
  16:34 and 21:31 UTC).** This is the strongest lead and is NOT yet explained. Candidate
  hypotheses, none confirmed:
  - The endpoint's report generation is polling-based (the page's 9 requests could be its own
    poll-until-ready loop), and a *new* request from a different call site (the script's
    `fetch()`, not the page's own JS) restarts that state machine rather than reusing the
    page's already-completed result — one theory, unconfirmed.
  - A rate limit or connection-pool exhaustion triggered by the burst of page requests
    immediately preceding the script's own call.
  - Something specific to the Menu Price Comparison endpoint's query length/shape (27-store
    NSN comma-list) that the shorter McDelivery/Menu Item Activity requests don't hit.
- **Do not re-diagnose this from scratch.** The next session hitting this should start from:
  the retry already in place recovers the McDelivery/Menu-Item-Activity class of failure
  automatically; Menu Price Comparison's variant needs either (a) reusing the page's own
  already-successful response instead of firing a second duplicate fetch, or (b) a longer/more
  patient retry window, or (c) real diagnostic output from the `page.on('requestfailed')` /
  `page.on('response')` listeners now present in both scripts, which have not yet fired with
  the failure this session was chasing (they only would have shown something if the
  *Playwright-level* request object itself failed — the failures caught so far were all inside
  `page.evaluate()`'s own `fetch()`, which these listeners cannot see, only the OUTER page
  navigation/requests can).

## What shipped

- `scripts/qsrsoft-mcdelivery-pull.mjs` — `page.on('requestfailed')`/`page.on('response')`
  diagnostic listeners (scoped to `api.reports.myqsrsoft.com`); a bounded retry (2 extra
  attempts, 3s apart) on the final data-fetch, specifically for a bare `'Failed to fetch'`
  string, never a real HTTP error.
- `scripts/qsrsoft-menu-price-comparison-pull.mjs` — the same retry in `fetchRows()`'s
  `evalPage` branch, and the same diagnostic listeners added to `viaPlaywright()` for parity
  (previously had `page.on('request')` only).
- Recovered the 3 already-failing production runs by re-running them on `main` directly
  (McDelivery and Menu Item Activity recovered outright; Menu Price Comparison did not — see
  above — and needs the retry-equipped code merged to actually help it going forward).

## Why this is documented rather than fully resolved

Per the standing "no second guesses: once a hypothesis is disproven, the next step is a
measurement, not another hypothesis" rule — the retry hypothesis was tested and only partially
confirmed (helped 2 of 3, not the third). Continuing to guess at increasingly speculative code
changes without new data would violate that rule. The safe, verified, zero-regression-risk
retry is shipped; the deeper "page succeeds, script's duplicate call fails" pattern is recorded
precisely enough that a future session with more time (or a live failure to inspect with the
now-present diagnostics) can pick it up without re-deriving any of the above.
