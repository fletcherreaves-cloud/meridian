---
name: dispatch58-part-e-status-2026-08-21
description: Dispatch #58 (#56 Part E) status. Everything that doesn't depend on the empty-registers/cashiers answer is built and shipped -- schema (qsr_security_events, role-gated RLS), the event_details row parser (src/engine/security-events.js), and the panel wiring (SubjectDrilldown's "Matching events" section, reusing the existing Part D surface). The one piece explicitly gated on a live measurement -- the daily pull script's request-construction logic -- is deliberately NOT written; a workflow_dispatch-only probe script is built instead, following the exact pattern the dispatch itself asked for ("test this with one request before writing any pull logic"). This sandbox has no QSRSoft credentials to run that probe.
metadata:
  node_type: memory
  type: finding
---

# Dispatch #58 (#56 Part E) — what shipped, what's still blocked, and why

**2026-08-21.** `memory/dispatch-58.md` opens with a five-minute check that "decides whether the
pull is cheap or infeasible": does `event_details` treat empty `registers`/`cashiers` arrays as
"all," or are they required filters? Every capture to date came from clicking one populated
drill-down cell, so nobody has tested the empty case. This session has **no QSRSoft credentials**
(checked: no `QSRSOFT_TOKEN`/`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` anywhere in the environment,
same constraint that gated the Forms dashboard's Slice 3 auth question until the owner's own
capture) — so that check cannot run from here.

Per the same "report before building" discipline the Forms dashboard's Slice 3 followed (and
dispatch #56 Part E/B before it): **everything that does not depend on the answer is built now.**
The one piece that does — the daily pull script's actual request-construction logic — is not
written blind. A runnable probe is built instead, so the answer becomes a five-minute Action run
away rather than another round of guessing.

## What shipped

**Schema — `supabase/schema-qsr-security-events.sql`.** One row per event: time, register,
daypart, tender, amount, plus tokenized crew/manager attribution. RLS is **role-gated**, copied
from `security_findings` (admin/supervisor always; manager only when
`org_config.gm_identity_reveal_enabled`) — explicitly **not** the plain tenant-only policy the
ordinary QSRSoft data tables use, per the dispatch's own correction of an earlier draft that got
this wrong. The upsert key (`loc, event_token, event_dt, event_tm, order_key`) is flagged in the
schema comment as the dispatch's own **candidate**, unverified against real data — the only
capture to date is 38 rows from one store/date/register/cashier, not enough to trust a uniqueness
claim. If the first live pull hits a genuine collision, the key widens; it must never silently
drop or overwrite a real row.

**Parser — `src/engine/security-events.js`.** Pure `parseSecurityEventRow()`/`Rows()`, mirroring
`normalizeFormsCompletionRow()`'s own contract (drop an unkeyable row, never fabricate a
placeholder key). `parseNameBadge()` splits `"Name - 91"` into `{name, badge}`, with
`"Unavailable"`/`"Unknown"` treated as honest nulls rather than fabricated placeholders — a third
sentinel family, after Forms' `completedBy='--'` and `emp_id='0'`. `crewName`/`mgrName` stay
**plaintext in this module's own output** by design (documented loudly in the function's own
comment): tokenization needs a live Supabase RPC (`get_or_create_employee_token()`, via the
existing `tokenizeRows()` helper in `src/engine/identity-vault.js`), which a pure sync function
can't do — the pull script's own upsert step is where that call happens, exactly mirroring how
`src/lib/supabase.js`'s `saveAuditRows()` already splits the same two concerns. `remaining_amt`
passes through opaquely (semantics unconfirmed per the finding file); nothing is computed from it
anywhere in this codebase.

**A real bug caught by the parser's own tests before it ever ran against real data:**
`isUsableRow()`'s first draft checked `raw.loc != null` — but `loc` isn't on the raw
`event_details` row at all (the caller supplies it, since a row belongs to whichever store the
request was scoped to, per the function's own design). Every single row would have been silently
dropped. Caught immediately by `parseSecurityEventRow(BASE_ROW, { loc: '0006178' })` returning
`null` in the first test run, fixed by removing the `raw.loc` check (the caller-supplied `loc` is
still validated separately). The same shape of bug — a field-name mismatch that silently drops
every row — is what the owner caught in the Forms dashboard's Slice 2/3 code earlier tonight;
this one was caught by this session's own test suite before it shipped, not after.

**Panel — `SubjectDrilldown`'s new "6. Matching events" section, `src/views/security-panel.js`.**
Reuses the existing "🔎 Investigate further" click-to-load surface Part D already built (dispatch
#58's own explicit instruction — "do not create a parallel one"). For a cash-domain employee
subject, loading the drill-down now also fetches `qsr_security_events` rows for that subject/
window (`loadQsrSecurityEventsForSubject()`, new loader in `src/lib/supabase.js`, RLS-gated the
same way the table itself is) and renders time/register/daypart/tender/amount per event.

**The required caveat renders on every load, not just when a subject happens to have events**
(dispatch #58's own explicit instruction): cash over/short — the single biggest controls
metric — has no event-level drill-down at all, because it's a computed variance, not a discrete
event, so it can never appear in this list regardless of how large it is; discount isn't on this
report at all. Absence of an event below the caveat is never allowed to read as absence of a
problem.

## What's explicitly NOT built, and why

**`scripts/qsrsoft-security-events-pull.mjs` does not exist yet.** Its correctness literally
depends on the empty-array answer — dispatch #58's own framing: "it is the difference between a
straightforward stream and a redesign." Guessing wrong here doesn't fail loudly; it either
silently returns nothing (if empty arrays are a required filter that yields zero rows) or
silently drifts from what real registers/cashiers to enumerate, exactly the kind of failure this
codebase's own standing rules exist to prevent.

**Instead: `scripts/qsrsoft-event-details-probe.mjs` + `.github/workflows/qsrsoft-event-details-probe.yml`**
(workflow_dispatch-only, no cron — mirrors the existing `lifelenz-ta-probe.yml` precedent exactly,
including why it isn't in `sync-failure-watch.yml`: probe/exploratory workflows are deliberately
excluded from that watcher). Makes two `event_details` calls for the same store/date/token — one
with the finding file's own known-populated `registers`/`cashiers` (default `[13]`/`[91,0]`), one
with empty arrays — and prints a verdict:

- Empty returns a **superset** of populated → empty means "all," the straightforward daily pull
  (27 stores × 8 tokens) is safe to write.
- Empty returns **zero** while populated returns rows → registers/cashiers are **required
  filters**; the pull needs real enumeration first, not a naive loop.
- Anything in between → ambiguous, re-run against a different store/date/token before concluding
  anything (a single comparison is a signal, not proof, same "measure, don't reason" standard
  this repo holds everywhere else).

Auth: `getFreshToken()` (`scripts/lib/qsrsoft-auth.mjs`) — the endpoint is already confirmed
token-only with no session cookie (finding file, DevTools request-header panel), so the probe
makes a plain direct fetch with no Playwright fallback, matching the finding's own recommendation
to "design for token-only and treat a Playwright fallback as the contingency, not the default."

**No `event_token`/`crew`/`mgr` value from any real capture appears anywhere in this file, the
probe script, or the parser's test fixtures** — every fixture is synthetic, per this repo's
standing PII discipline.

## Verification

`src/__tests__/security-events.test.js` (18 tests, synthetic fixtures): all 8 event tokens
round-tripping, `storeRefFromLoc()`'s unpadded-NSN conversion, the `"Name - NN"` / `"Unavailable"`
/ `"Unknown"` / no-badge / empty-input cases, the PII assertion (no raw `crew`/`mgr` key survives,
no fixture name leaks into a batch result), `remaining_amt` passthrough (including a string-typed
value), and the honest-null / dropped-row cases.

`src/__tests__/security-panel.test.js` extended with two render-based tests (through the real
`SecurityPanel`, not the engine alone, per this repo's own "would this verification still pass if
the change were reverted?" standing rule): the events section renders time/register/daypart/
tender/amount and the required cash-over/short caveat when events exist, and renders an honest
"No matching events in this window" (never a blank section) when they don't. Every pre-existing
cash-drilldown test in the file kept passing unchanged (`loadQsrSecurityEventsForSubject` mocks
to `[]` by default), confirming the new fetch is additive, not disruptive to Part D's existing
surface.

1972/1972 tests. Build clean, entry chunk 511.40 KB gzip (+0.28 KB from the new `supabase.js`
loader — `SecurityPanel` itself stays lazy, so the panel's own additions cost nothing eager).

## Next

1. **Run the probe** (`workflow_dispatch` on "QSRSoft Event Details Empty-Array Probe", or
   locally with `QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` set) and report the verdict.
2. Once settled, write `scripts/qsrsoft-security-events-pull.mjs` — two-path auth
   (`getFreshToken()` primary, Playwright fallback per the dispatch's explicit instruction to
   model it on `qsrsoft-ops-pull.mjs`, not `qsrsoft-forms-pull.mjs`'s older pattern), the
   `sync-failure-watch.yml` entry, per-stream freshness (reusing `stream-freshness.js`'s pattern
   the way the Forms panel does), and the tokenization step via `tokenizeRows()` right before the
   upsert.
3. Verify the upsert key's uniqueness assumption against the first real multi-register,
   multi-cashier day's data — widen the key if a genuine collision surfaces.
4. Settle the two open questions the dispatch flagged for during the build, not after:
   `remaining_amt`'s semantics, and whether `order_key`'s register prefix mismatch with `reg_num`
   makes a `transaction_detail` join unsafe.
5. Explicitly out of scope here, per the dispatch: the `registerType=cashier`-only gap in
   `audit_rows` and the `employee_meal`/`manager_meal` signal-building — both dispatch #59.
