# Dispatch #226 — SAGE tool: EOM recount impact on FOB (reuse the existing engine, no new pull)

**Origin:** owner SAGE prompt — *"For the EOM inventory and FOB for July, give me a summary
report on how stores that recounted their eom items impacted their final fob and food cost."*
SAGE answered that the data doesn't exist. **That answer was wrong**, and this dispatch is the
correction — not a new data-capture project.

## What actually exists (measured this session, not assumed)

- `src/engine/eom-ledger-baseline.js` already implements exactly the honest methodology SAGE
  itself said this needs: same-store, same-item, session-count vs. final-count within the EOM
  close window (the last 3 calendar days of the month) — not a between-store comparison, which
  would be confounded by self-selection (stores recount *because* they saw a bad number).
  `itemCloseWindowRecount()` grades each item helped/hurt/flat against a $25 materiality floor;
  `ledgerBaselineDiff()` rolls a store up; `ledgerScopeDiff()` rolls a whole scope up with a
  `storeEngagement()` verdict per store (improving / worsened / mixed / no-action).
- The data source, `qsr_raw_item_detail` (padded-NSN loc), is populated by
  `scripts/qsrsoft-variance-pull.mjs`, which has run daily/hourly since dispatch #177-179 — this
  is NOT a probe-only or backfill-needed stream (unlike the `inventory_history` retention
  question this session separately measured for a different ask). July 2026's data should
  already be sitting in Supabase.
- This engine is already wired into the EOM Dashboard's "🎥 Change Monitor → Baseline diff" tab
  (`src/views/eom-dashboard.js`'s `openMonitor()`), which — as of dispatch #225, merged this
  session — now has a real month picker (not capped to the last 4 months), so July should
  already be selectable there today with zero new engineering. **Have the owner confirm that
  first** — if the in-app panel already renders July correctly, this dispatch is purely about
  giving SAGE the same capability on demand, not about proving the underlying data exists.

## What's actually missing

1. SAGE has no tool that calls this engine — its tool list
   (`supabase/functions/sage-chat/index.ts`) has `query_daily_activity` /
   `query_lifelenz_labor` / `query_labor_summary` / `query_forecast_snapshots` /
   `query_promo_roi`, nothing that touches recount/FOB-impact data.
2. There's no shareable *report* — the in-app panel is a live interactive table, not something
   the owner can paste into a message or read as a narrative. (Lower priority — see Task 3.)

## Task 1 — verify the reuse path before writing a second implementation

`eom-ledger-baseline.js` is plain JS (`// @ts-nocheck`), imported client-side today. No edge
function in this repo currently imports anything from `src/engine/` (checked: zero matches for
`from '../../../src/`` across `supabase/functions/`) — this would be the first. Before writing
the SAGE tool, confirm directly (a local `supabase functions serve` invocation or an actual
deploy+call) whether `supabase/functions/sage-chat/index.ts` can import
`../../../src/engine/eom-ledger-baseline.js` and get the same functions Deno-side. If yes, use
it verbatim — zero drift between what the in-app panel shows and what SAGE reports, matching
this repo's own "same engine, zero drift" precedent (`scripts/qsrsoft-email-parse.mjs` reusing
`src/parsers` is the model to follow). If Deno's module resolution genuinely can't reach outside
`supabase/functions/` in this project's deploy setup, STOP and report that specific finding
before reimplementing anything — a second hand-written copy of `itemCloseWindowRecount()`'s
grading logic is a real, ongoing drift risk (exactly what the two-panels-disagree class of bug in
CLAUDE.md's Dev Rules warns about) and should be a deliberate, named fallback, not the default.

## Task 2 — new SAGE tool: `query_eom_recount_impact`

Add to the tool list in `supabase/functions/sage-chat/index.ts`, matching the existing
`query_forecast_snapshots`/`query_promo_roi` schema shape (`name`/`description`/`input_schema`
with a Claude tool-use JSON schema) and RBAC pattern (`applyScope(stores, allowed)`, same as
every other query tool — a caller's `accessible_locs` gates what comes back, never trust the
request alone).

- **Input:** `period` ('YYYY-MM', required — this is a monthly EOM-close concept, not a date
  range) and optional `locs` (defaults to every store the caller can see).
- **Behavior:** load `qsr_raw_item_detail` for that period + store scope, run it through Task
  1's chosen path (`ledgerScopeDiff`/`storeEngagement` or its verified equivalent), return the
  SAME shape the in-app Change Monitor's tiles already show: district totals (`improved`,
  `worsened`, `noAction`, `totalHelped`, `totalHurt` — "$ moved toward/away zero"), plus
  per-store `engagement.verdict`/`engagement.readLabel` and the top few recounted items each
  store's FOB movement is attributable to. Reuse `getStoreOrg`/`STORE_NAMES` etc. the same way
  the other tools already do for labeling.
- **Honesty requirement (the SAGE gap this dispatch exists to close):** this tool answers FOB
  impact, not total food cost %. `Base Food %`/total food-cost % is not in Meridian's data model
  anywhere — confirmed absent this session, not merely unchecked. The tool's own returned text
  (or the system-prompt guidance in Task 3) must make SAGE say so plainly whenever asked about
  "food cost" broadly, rather than silently answering only the FOB slice and letting the reader
  assume it covers total food cost. Do not attempt to build or approximate total food cost % in
  this dispatch — that's a real, separate, unclosed data gap, not something to paper over.
- **Empty/no-data path:** if a period has zero `qsr_raw_item_detail` rows for the requested
  scope, say that plainly (mirrors `query_forecast_snapshots`'s own "no snapshot data found"
  pattern) — never silently return an empty-but-successful-looking report.

## Task 3 — system prompt + tool description

Add `query_eom_recount_impact` to the system prompt's explicit tool documentation (CLAUDE.md:
"System prompt documents tools explicitly so SAGE calls them proactively") so a question shaped
like the owner's original prompt reliably triggers it. The tool `description` field itself
should carry the FOB-vs-total-food-cost distinction from Task 2 inline (matching how
`query_promo_roi`'s own description already carries its "discount ROI cannot be measured, don't
present it as a finding of zero" caveat directly in the tool description, not only in a code
comment) — so the caveat travels with the tool regardless of which part of the prompt SAGE reads
first.

## Task 4 (optional, lower priority, do only if Tasks 1-3 land cleanly) — shareable text report

A "Copy report" action on the EOM Dashboard's Change Monitor that formats the same
`ledgerScopeDiff` output as narrative markdown (district summary line, per-store table,
biggest-mover items), similar in spirit to `formatDiagnosisReport()`'s existing markdown output
elsewhere in this app. Not required for Tasks 1-3 to be complete and useful — skip it if it would
meaningfully widen this dispatch's scope, and say so plainly rather than quietly dropping it.

## Explicitly out of scope

- Building or approximating total food cost % / Base Food % — genuinely absent from Meridian's
  data model; naming that gap honestly (Task 2/3) is the deliverable, not closing it.
- Re-litigating dispatch #225's month picker or the EOM close-window definition (last 3 days) —
  both are already correct and shipped; this dispatch only exposes the existing engine to SAGE.
- Any change to `qsrsoft-variance-pull.mjs` or the `qsr_raw_item_detail` schema — the data
  source is already correct and running; this is a read-only consumer.

## Verification (required)

1. Task 1's actual measurement (import works / doesn't, with the real evidence either way).
2. A live call to `query_eom_recount_impact` for 2026-07 against real Supabase data (this
   session's Supabase incident from earlier today is resolved — verify reachability first,
   don't assume) — show the actual returned JSON, not a mocked fixture, so the numbers in the
   PR body are a real measurement, matching this repo's "a live-data claim must name the
   credential and the observation" standing rule.
3. RBAC check: call the tool as a scoped role (e.g. a single-patch supervisor) and confirm
   `hidden_stores`/`access:'restricted'` behaves the same way it does for the other query tools.
4. `supabase functions deploy sage-chat --no-verify-jwt` is required for this to go live — note
   in the PR body whether that was run, and if not, that it's the one manual step still needed
   (matches the standing pattern for every prior SAGE tool addition in this repo).
