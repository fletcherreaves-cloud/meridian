---
name: project-forms-dashboard-slice1
description: Forms dashboard Slice 1 of 3, done -- schema (supabase/schema-qsr-forms-completion.sql) + a pure normalizer (src/engine/forms-completion.js) for QSRSoft's completionDetail endpoint. Fully testable with no live QSRSoft access, per the three-slice plan that isolates the one unverifiable piece (the pull script's auth) last. Handles the polymorphic status field, the three real states (missed/open/completed -- "--" is NOT a miss), the nullable scheduledAt on ad-hoc rows, timeToComplete as active-time milliseconds, and keeps completedBy (a plaintext name) out of the table entirely -- userId is the person key.
metadata:
  node_type: memory
  type: project
---

# Forms dashboard — Slice 1: schema + normalizer

**2026-08-21.** First of three slices building the forms-completion dashboard specced in
`memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md` (PR #534, merged). Structured per
the owner's own instruction: isolate the one piece this session cannot verify (live auth against
`forms.home.myqsrsoft.com`) and ship it last, so slices 1–2 can be built and fully tested with zero
live access.

## Why `completionDetail`, not `completionByForm`

The finding file already settled this: `completionByForm` is an aggregate with no date, no
submitter, and — critically — **no denominator**, so "completed vs missed" is not computable from
it at all. `completionDetail` returns one row per **scheduled occurrence** and takes no `formIds`
(the server already knows what's assigned), so it can't silently miss a form created after a pull
script's hardcoded list goes stale. This table stores `completionDetail` rows only; `completionByForm`
may get its own table in a later slice if within-form thoroughness (answered/total questions) turns
out to need its own view.

## The schema: `supabase/schema-qsr-forms-completion.sql`

One row per `(loc, form_id, occurrence_key)`, `tenant_id`-scoped RLS from day one, matching
`schema-product-mix.sql`'s pattern (the current canonical shape for a new QSRSoft-sourced table —
checked before writing a new one, since `qsr_variance_stat`/`qsr_onhand`/`sales_ledger_daily` all
predate tenant_id and use a looser "public read/write" policy that is NOT what a new table should
copy).

**`occurrence_key`, not `scheduled_at`, is the primary-key column.** `scheduled_at` can be null — 32
of the captured rows are ad-hoc completed submissions with no scheduled occurrence behind them, so
`(loc, form_id, scheduled_at)` drops or collides all of them. `occurrence_key` is `scheduled_at`,
falling back to `completed_on` for those ad-hoc rows — `completed_on` is guaranteed present whenever
`scheduled_at` is not (every non-completed row IS scheduled), so the coalesce is always defined.
Computed once, in the normalizer, so exactly one code path owns the fallback.

**`status_state` is a real three-value column** (`missed`/`open`/`completed`), never the raw
polymorphic `status` field. That field is a string enum ("MISSED"/"--") OR a float depending on the
row, and reading `"--"` as a miss over-reports by 13% on the captured week (599 of 4,714 rows) — it
means "scheduled, window not yet passed," not "missed." Guarded by a `check` constraint at the
database level, not just convention.

**`completed_by` is deliberately not a column.** The finding file's PII section is unambiguous:
`completedBy` is a plaintext employee name, and `user_id` (a stable QSRSoft UUID, 40 distinct people
in the capture) is the safer, sufficient person key. Rather than build tokenization infrastructure
for a stream that doesn't need it, the schema simply never stores the name — there is nothing to
leak because there is no column for it.

`time_to_complete_ms` is kept as its own column, explicitly documented as **active time, not
wall-clock elapsed** (the capture's own floor case: 28.97 days elapsed against 109 seconds of active
time on a form left open and finished later) — a future consumer must not try to derive it from
`completed_on - started_at`.

`score`/`reviewed_with` are kept even though they're always null/`'N/A'` estate-wide today, per the
finding file's own caution not to conclude the fields are permanently unused.

## The normalizer: `src/engine/forms-completion.js`

Pure functions, no Supabase, no fetch — `normalizeFormsCompletionRow(raw)` and
`normalizeFormsCompletionRows(rawRows)`. This is the **one place** the raw payload's polymorphic
`status` field gets read; every future consumer (the Slice 2 panel, a Slice 3 pull script) works off
`statusState`/`completionRatio`, never the raw value again — matching this repo's own standing
pattern (`verdictState()` in `security-panel.js` is the one place `pass`/`lifecycleCategory` get
mapped to a verdict; this is the same discipline for a different polymorphic field).

`classifyStatus()` branches on `missed`/`hasResponse` **before** ever touching `status` as a number
— the finding file measured `missed === (status === 'MISSED')` holding on all 4,714 captured rows
with zero disagreements, so that boolean is the reliable branch, never a `switch` on the raw value.

A malformed or unkeyable row (missing `formId`/`location`/`formTitle`, or neither `scheduledAt` nor
`completedOn` present) returns `null` rather than fabricating a placeholder key; the batch function
filters those out rather than throwing, so one bad row from a live pull can't take down the whole
ingest.

## Verification

`src/__tests__/forms-completion.test.js`, 22 tests, all synthetic fixtures — **the hard constraint
stated explicitly for this slice**: nothing from the real captured `completionDetail` response
(which carries plaintext names) goes into a test file. Fixture names ("Fixture Employee," "Another
Fixture Person") and UUIDs are made up for this test only; the one number echoed from the real
capture is the illustrative 93/94 completion ratio (`0.9893617021276596`), a public arithmetic fact
already published in the finding file, not PII.

Covers: all three `status` states including the "--"-is-not-missed case; the null-`scheduledAt`
ad-hoc-row fallback to `completedOn`; the case where neither is present (row dropped); fields that
exist only on completed rows staying `null` on a missed row; `timeToCompleteMs` passed through
verbatim rather than derived (asserted against a fixture where the two values deliberately differ);
**a dedicated PII test asserting the output object has no `completedBy` key at all, and that the
fixture's synthetic name never appears anywhere in the serialized output** — the concrete,
automatable form of "the name never needs storing"; `loc` padding; `formTitle` trimming without
`formId` being affected; `assignedTo` defaulting safely; missing-required-field handling; and the
batch function's drop-bad-rows and non-array-input behavior.

1926/1926 tests (22 net new). Build clean, entry chunk unchanged — the new module isn't imported
anywhere yet (dormant until Slice 2 wires it into a panel).

## Next

**Slice 2** (separate PR): the panel — per-form threshold defaulting to 80%, store-day judged on
resolved occurrences only (`open` excluded from both numerator and denominator, or the current day
always reads red), pass-rate shown beside the bar, total-day attribution only (measured: 0 of 3,886
missed rows in the capture carry a person — a miss has nobody attached, so manager attribution isn't
possible from this data alone; the owner's own stated fallback). Needs a `loadQsrFormsCompletion()`
reader in `src/lib/supabase.js`.

**Slice 3** (separate PR, last): the pull script. The only slice gated on the owner's own capture —
auth for `forms.home.myqsrsoft.com` is still unverified (`sec-fetch-site: same-site` on the captured
request means a cookie could be attached invisibly, so a curl transcript can't settle it the way it
settled `api.security.myqsrsoft.com`'s token-only auth). Two-path auth per the standing pattern
(direct token, Playwright fallback), plus the standing new-pull checklist: `sync-failure-watch.yml`
entry, per-stream staleness (not pooled `Math.max`, #171's own lesson), manual-upload fallback. If
auth surprises the capture, only the transport in Slice 3 changes — the schema and normalizer built
here don't move.
