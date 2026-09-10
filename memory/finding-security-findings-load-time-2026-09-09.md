# Security panel load time — root cause, view + index applied, verified fast (2026-09-09)

## Report
Owner (v5.409): "I can't get security data to load. It is taking quite a while. It's been
several minutes at this point." Resolved on its own a few minutes later — this was a real,
measured slow load, not a hang.

## ✅ STATUS 2026-09-09, late evening — DONE. View + index both applied, real speedup measured.
Part 1 (v5.410, payload trim) and Part 2 (v5.411, the view + lazy per-subject history) are merged
to `main`. The owner applied `supabase/schema-security-findings-latest-view.sql`, then — after
the view alone measured barely faster (below) — `supabase/schema-security-findings-latest-
index.sql`. Re-timed the identical `fetchAll` shape `loadSecurityFindings()` actually uses, after
the index:

| | rows | pages | total | avg/page |
|---|---|---|---|---|
| base table (v5.410, no view) | 92,740 | 93 | 66,085ms | ~0.71s |
| view, no index | 19,723 | 20 | 59,975ms | ~3.0s |
| **view, WITH index** | 19,723 | 20 | **9,708ms** | **~0.49s** |

**The index took the view from 1.1x faster than nothing to 6.8x faster than nothing** (6.2x
faster than the view alone). First page still costs ~2.7s (query planning / cold cache); every
page after that ran 270–500ms. This is a genuinely fixed problem now, not an optimistic one —
both halves measured against live production before being called done.

⚠️ **Two same-day measurements in this file were wrong, both corrected only by re-measuring
against the live system instead of trusting a calculation:**
1. The original "3,669 distinct combinations / 25x reduction" figure came from a dedup key that
   omitted `loc` — `wrin` (an item's code) is a shared product identifier, not store-specific, so
   it wrongly collapsed one item's findings across all 27 stores into one row. Corrected to
   19,723 rows / ~4.7x once the live view existed to check the claim against.
2. That corrected row-count figure was then assumed to predict speed — it didn't. The view alone
   was only ~1.1x faster wall-clock, because an unindexed `DISTINCT ON` forces Postgres to Sort
   the whole base table on every paginated request. Only the index (above) delivered the real win.
Both are left visible here, not scrubbed out, because the pattern — a plausible number standing
in for a measurement — is the thing worth remembering, not just the final correct figures.

## Root cause (measured live against production Supabase, not assumed)
`loadSecurityFindings()` (`src/lib/supabase.js`) has no date/loc bound — every Security panel
open fetches the ENTIRE `security_findings` table via `fetchAll`'s sequential pagination.

- **Table size measured 2026-09-09: 92,740 rows**, growing ~4,600 rows/day since the batch
  went live 2026-08-20. The daily rolling-window design writes a FRESH row per (subject, rule)
  on every batch run, whether flagged or not — one real employee token alone carried 21
  consecutive daily rows for a single rule (CASH-002).
- **PostgREST here hard-caps a page at 1000 rows regardless of the Range header asked for** —
  confirmed live: requesting `Range: 0-4999` still returned `content-range: 0-999/92740`. So
  92,740 rows forces **~93 sequential paginated requests**, `fetchAll`'s `while` loop `await`s
  each one before starting the next (no parallelism).
- **Measured ~1.4s for a single 1000-row page** in isolation. 93 × ~1.4s ≈ 130s — directly
  matches "several minutes," with `loadSecurityRules()` and React render on top.
- `baseline_context.values` — a 26–42-element float array on every row — is **read nowhere in
  `security-panel.js` or `security-drilldown.js`** (grepped both files; only `.mean`/`.stdev`/
  `.n` are ever used). Pure dead weight on every one of those 93 pages.
- **The real lever is row count, not bytes**: 92,740 raw rows collapse to **19,723 distinct
  (loc, subject, rule) combinations** (measured via a full-table dedupe that correctly includes
  `loc`) — a ~4.7x reduction sitting right there, unexploited.

## Shipped now (this dispatch, low-risk, no schema change)
`loadSecurityFindings()`'s select list now asks PostgREST for `baseline_context->mean`,
`->stdev`, `->n` individually instead of `select('*')`, dropping `.values`/`.memberCount` from
the wire entirely. Measured **~27% smaller payload per page** on the live table
(539,734 → 391,306 bytes for a 500-row sample). Zero behavior change — every consumer of
`baselineContext` already only reads `.mean`/`.stdev`/`.n` (confirmed by grep, and every
existing test fixture already shapes `baselineContext` as `{mean, stdev, n}` or `{}`, so no
test needed updating). This alone will NOT fully fix "several minutes" — row count, not
payload size, is the dominant cost — but it's a safe, immediate, measured partial win.

## Part 2 (v5.411) — the real row-count fix, shipped and applied
Cutting 93 pages down to ~20 needs a server-side `DISTINCT ON (tenant_id, loc, subject_key,
rule_id)` — PostgREST has no client-side way to express that. Four pieces:

1. **The DB view** — `supabase/schema-security-findings-latest-view.sql`. `security_invoker =
   true` (PG15+) makes it re-run `security_findings`' own RLS policy as the querying role — no
   policy duplication needed. Measured live, post-apply: **19,723 rows**, one per (loc, subject,
   rule) — a spot-check of 1,000 fetched rows confirmed zero duplicate keys. ✅ **Applied** by the
   owner 2026-09-09 evening.

2. **`loadSecurityFindings()` probes for the view, once per session, and falls back safely.**
   ⚠️ The probe itself needed a real fix mid-build, caught only by testing the ACTUAL
   `@supabase/supabase-js` client against live production before shipping (not assumed from the
   raw-REST curl testing Part 1 used): a `{ head: true }` select against a relation that flat-out
   does not exist came back `status 204, success: true, error: null` on this Supabase project —
   confirmed against both a fabricated table name and this view before it existed. A HEAD-only
   probe would have made the loader believe the view was always present and send every real page
   request into a guaranteed failure the moment this shipped, with the panel showing zero
   findings until the migration was applied — the opposite of graceful. Fixed by probing with a
   real, data-returning `select('id').limit(1)` instead, and checking for PostgREST's own
   schema-cache-miss code `PGRST205` ("Could not find the table ... in the schema cache") — not
   the raw Postgres `42P01` originally assumed, also wrong, also caught by the same live test.
   Both corrections are recorded in `loadSecurityFindings()`'s own comment.

3. **Chronic/trend classification is preserved, not traded away.** The view only ever holds one
   window per (subject, rule) — exactly what `groupFindingsBySubject()`'s `verdicts` already
   reduces to even today, so the closed/list view renders identically either way. What the view
   can't supply is the ≥2-window history `classifySubjectTrend()` / `classifySubjectShape()` /
   `buildSubjectTimeline()` need. Fixed with a new lazy per-subject loader,
   `loadSecurityFindingsForSubject({loc, empToken, wrin})` (mirrors the existing
   `loadQsrSecurityEventsForSubject` pattern in the same file, always reads the base table, never
   the view), fired once per subject on row-expand and cached via a ref (an empty result still
   counts as "attempted," or a subject with no recoverable extra history would re-fetch on every
   re-expand forever). `buildHistoryByRule()` was factored out of `groupFindingsBySubject()` so
   both the bulk path and this lazy path build the identical shape — one history-shaping rule,
   not two that can drift. Covered by dedicated tests in `security-panel.test.js` (a subject that
   looks like a single-window "first flag" from the bulk load renders Chronic once its real
   history resolves; the fetch never re-fires once cached; an empty lazy-fetch result never blanks
   out the bulk-loaded single window).

4. **Full suite (4664 tests) + build both clean** after the fix; the exact new `supabase-js`
   query shapes (the JSON-path `select`, the probe, the per-subject query) were also verified
   live against production directly through `@supabase/supabase-js` (not just raw REST) before
   any of this was called done — and again, post-apply, against the real live view.

5. **✅ The supporting index.** `supabase/schema-security-findings-latest-index.sql`, applied by
   the owner after the view alone measured only ~1.1x. Re-timed after: **9,708ms for the full
   20-page fetch, ~6.8x faster than the original 66,085ms base-table load.** See the STATUS table
   at the top of this file for the full before/after/after-index numbers.

## Growth trajectory — this is not a one-time fix
At ~4,600 rows/day, the base table will be ~185K rows in 3 more weeks and ~370K in 6. The view's
own row count grows much more slowly — only when a genuinely NEW (loc, subject, rule) combination
first appears, not on every daily re-evaluation of an existing one — so it should stay roughly
flat. Its per-page TIME should also stay flat now that the index is in place (an index scan cost
tracks the RESULT size, not the base table's), but that assumption is itself worth re-measuring
in a few weeks rather than trusted on faith — same standing rule this file demonstrated twice on
itself tonight.
