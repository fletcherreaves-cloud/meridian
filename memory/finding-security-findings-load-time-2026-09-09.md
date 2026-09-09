# Security panel load time — root cause + shipped fix + real follow-up (2026-09-09)

## Report
Owner (v5.409): "I can't get security data to load. It is taking quite a while. It's been
several minutes at this point." Resolved on its own a few minutes later — this was a real,
measured slow load, not a hang, and it will keep getting worse until the follow-up below ships.

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
- **The real lever is row count, not bytes**: 92,740 raw rows collapse to **3,669 distinct
  (subject, rule) combinations** (measured via a full-table dedupe) — a 25x reduction sitting
  right there, unexploited.

## Shipped now (this dispatch, low-risk, no schema change)
`loadSecurityFindings()`'s select list now asks PostgREST for `baseline_context->mean`,
`->stdev`, `->n` individually instead of `select('*')`, dropping `.values`/`.memberCount` from
the wire entirely. Measured **~27% smaller payload per page** on the live table
(539,734 → 391,306 bytes for a 500-row sample). Zero behavior change — every consumer of
`baselineContext` already only reads `.mean`/`.stdev`/`.n` (confirmed by grep, and every
existing test fixture already shapes `baselineContext` as `{mean, stdev, n}` or `{}`, so no
test needed updating). This alone will NOT fully fix "several minutes" — row count, not
payload size, is the dominant cost — but it's a safe, immediate, measured partial win.

## The real fix — scoped, NOT shipped yet, needs a DB migration + a careful UI change
Cutting 93 pages down to ~4 needs a server-side `DISTINCT ON (loc, subject_key, rule_id)` —
PostgREST has no client-side way to express that. This requires:

1. **A DB view** (write-only from this session — no direct Postgres/DDL access available here,
   only the REST API; the owner has to run this by hand, same as every other `schema-*.sql`
   file in this repo):
   ```sql
   create or replace view public.security_findings_latest
     with (security_invoker = true) as
   select distinct on (tenant_id, loc, subject_key, rule_id)
     id, tenant_id, emp_token, wrin, loc, rule_id, window_start, window_end,
     value, threshold_used, pass, lifecycle_category, exoneration_share,
     baseline_context, explanation, computed_at, subject_key
   from public.security_findings
   order by tenant_id, loc, subject_key, rule_id, window_end desc, computed_at desc;

   grant select on public.security_findings_latest to authenticated;
   ```
   `security_invoker = true` (PG15+) makes the view re-run `security_findings`' own RLS policy
   as the querying role — no policy duplication needed. Measured this collapses 92,740 rows to
   3,669.

2. **`loadSecurityFindings()` needs to target this view for its default/list load** — but
   NOT a blind swap. `groupFindingsBySubject()`'s `historyByRule[ruleId]` today holds EVERY
   window for a rule, and `classifySubjectTrend()` / `classifySubjectShape()` /
   `buildSubjectTimeline()` (the chronic-vs-new / instance-vs-pattern-vs-trend classifiers —
   real, valuable detection, see `memory/` field-test notes from the same day: a genuine 21-day
   chronic signal was found live using exactly this history) all require ≥2 windows per rule to
   say anything. Pointing the list load at "latest only" would silently make every subject read
   as `insufficient-history` — a real regression in a feature that was just proven to catch a
   genuine finding, traded for a faster load. **Do not make that trade blind.**

3. **The correct pairing**: latest-per-subject view feeds the closed/list view (fast, ~4
   pages); a NEW lazy per-subject loader (matching the existing
   `loadQsrSecurityEventsForSubject` pattern already in this file) fetches that ONE subject's
   full row history from the base table only when its card is expanded, and `SubjectDetail`
   is rewired to use that fetched history instead of assuming it's already in the bulk-loaded
   `findings` array. This needs real UI testing (expand/collapse, trend labels, corroboration)
   that wasn't possible in this session — scope it as its own PR, not a rider on a load-time fix.

4. Until step 1 is applied, `loadSecurityFindings()` should degrade gracefully rather than
   error if pointed at a view that doesn't exist yet (check for Postgres `42P01` and fall back
   to the base table) — noted here for whoever picks this up, not yet implemented since the
   view isn't live.

## Growth trajectory — this is not a one-time fix
At ~4,600 rows/day, the table will be ~185K rows in 3 more weeks and ~370K in 6 — "several
minutes" becomes "many minutes" or an outright timeout unless the view + lazy-history change
above ships. The payload trim buys some time; it does not remove the underlying growth curve.
