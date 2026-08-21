---
name: project-forms-dashboard-slice3
description: Forms dashboard Slice 3 of 3, done -- the pull script. scripts/qsrsoft-forms-completion-pull.mjs pulls completionDetail (POST, token-only auth confirmed via the owner's DevTools request-header panel, no Playwright needed for the primary path) and writes qsr_forms_completion. Also fixes two real bugs the owner reproduced in PR #537's already-shipped Slice 1/2 code: a "noLocation" sentinel producing the garbage loc "0000NaN", and a fixed UTC-5 offset misbucketing every row by a day for the CST half of the year. Both fixed with regression tests, plus a DST-aware rewrite of the pull script's own request-window builder (apiWindowForDays), which had the identical flaw and hadn't shipped yet.
metadata:
  node_type: memory
  type: project
---

# Forms dashboard — Slice 3: the pull script

**2026-08-21.** Third and last slice, per the three-slice plan in
`memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md`. This was the one slice
explicitly gated on the owner's own capture — auth for `forms.home.myqsrsoft.com` was
unverified going in, and this sandbox has no QSRSoft credentials to probe it blind. The
owner supplied the DevTools request-header panel for a live `completionByForm` POST, which
settled it: **token-only, no session cookie** (same auth shape as `api.security.myqsrsoft.com`,
not the DAR host's Playwright requirement). That finding is what unblocked this slice; see the
finding file's own "RESOLVED 2026-08-21" section for the header-list evidence.

## Two real bugs fixed before the pull script, not after

Before writing the pull script, the owner reproduced and supplied verified fixes for two bugs
already shipped in PR #537's Slice 1/2 code (`src/engine/forms-completion.js`):

**1. `"noLocation"` normalized to the garbage loc `"0000NaN"`.** `"noLocation"` is a real,
documented member of every `completionDetail` request's `locations` array (28 entries for 27
stores in the finding file's own capture) — it catches submissions with no store attached, and
the finding is explicit these are worth surfacing, not dropping. The old normalizer did
`String(parseInt(raw.location, 10)).padStart(7, '0')`; `parseInt('noLocation', 10)` is `NaN`,
and `isUsableRow()` only checked `location != null`, so the row sailed through with a loc that
*looked* like a real 7-digit key but wasn't. Fixed with an explicit `'NOLOC'` sentinel
(`normalizeLoc()`), distinguishable from every real zero-padded NSN, so a consumer can
special-case it rather than silently mis-grouping it with an actual store. **Not fixed by
dropping the row** — that would have thrown away real completions the finding explicitly said
matter.

**2. A fixed 5-hour offset misbucketed every row by a day for the CST half of the year.** The
original `localDayKey()` subtracted a hardcoded `5 * 60 * 60 * 1000` ms from every timestamp —
correct only during Central Daylight Time (UTC-5, roughly March–November). During Central
Standard Time (UTC-6), a row like `2026-12-21T04:30:00Z` (22:30 CST on **Dec 20**) got bucketed
into **Dec 21** — a silent day-of misattribution: a real completion reads as a miss on one day
and a phantom completion on the next. The finding file's own caveat 5 had already named this
risk ("the offset is hardcoded CDT, so a literal `05:00Z` silently shifts by an hour under
CST") but the code hadn't been fixed to match. Would have surfaced roughly 10 weeks after
shipping (the next CST transition), exactly the kind of silent-until-a-season-changes bug
nobody would think to check for in August.

Fixed by asking the real IANA timezone (`Intl.DateTimeFormat` with `timeZone:'America/Chicago'`)
instead of hardcoding either UTC offset — `localDayKey()` now formats an instant directly through
`Intl`, DST-aware by construction. **America/Chicago is correct for the whole estate, not just
Oklahoma** — worth stating explicitly because "Florida" reads as Eastern: all seven FL stores are
Panhandle, west of the Apalachicola, and therefore Central (per CLAUDE.md's own Organization
Context section).

**My own `apiWindowForDays()` — added this session, not yet pushed — had the identical flaw.**
It reused the same fixed-offset math to construct the completionDetail *request* window (the
reverse direction: given a calendar day, what UTC instant is that day's local midnight). Since
no plain-JS primitive constructs an instant from an IANA-zoned wall-clock time, this needed a
small helper (`chicagoMidnightUTC()`) that tries both US Central offsets (−05:00 CDT / −06:00
CST) for a given calendar day and keeps whichever one round-trips back through the *same*
`Intl` formatter `localDayKey()` uses — one owner for "what counts as this day," in both
directions. Midnight is never the ambiguous/skipped hour on a US DST transition (that's 2am),
so exactly one of the two candidates always matches, transition days included. The window's END
boundary is resolved the same way for the day *after* the requested range, rather than
`start + 24h`, which is wrong by an hour on either transition day (a "day" is 23h or 25h of
real elapsed time on exactly two days a year, never a clean 24).

Regression tests added for both: a CST bucketing case (`2026-12-21T05:30:00Z` → `2026-12-20`,
which fails on the old fixed-offset code and passes on the fix), a `noLocation` → `'NOLOC'`
case, and a four-point sweep straddling both 2026 US DST transitions (spring-forward
2026-03-08, fall-back 2026-11-01) verified against real `Intl` output before being hardcoded
into the test, not assumed.

## The pull script: `scripts/qsrsoft-forms-completion-pull.mjs`

Not to be confused with `scripts/qsrsoft-forms-pull.mjs`, which pulls **blank form templates**
(`public/forms/*.json`) for the separate Forms Library / Printable Forms feature — a
pre-existing, unrelated script hit by name collision risk only, no data overlap. This script
pulls the **live completion records** those templates get filled out against.

**Endpoint:** `POST https://forms.home.myqsrsoft.com/api/forms/reports/completionDetail?orgId=…`
— `{ startDate, endDate, locations }`, no `formIds` (the server already knows what's assigned
to each store, which is why `completionDetail` and not its `completionByForm` sibling: a
hardcoded formId list silently misses every form created afterward, and a missing form is
*omitted* from that endpoint's response rather than zeroed — invisible failure).

**Auth: `getFreshToken()` (`scripts/lib/qsrsoft-auth.mjs`), not `qsrsoft-forms-pull.mjs`'s older
pattern.** The user pointed at `qsrsoft-forms-pull.mjs` as the precedent to copy, but that
script's last fix (2026-08-07) predates `qsrsoft-auth.mjs`'s creation (#312, 2026-08-15) — it's
technical debt, not a deliberate choice. `getFreshToken()` mints a fresh Cognito ID token
per run via direct `USER_PASSWORD_AUTH` against Cognito, in-process, expiry-aware — **no
Playwright needed for the primary path at all**, already proven for the identical Cognito
ID-token / `X-Auth-Token` mechanism against `api.reports.myqsrsoft.com` (`qsrsoft-ops-pull.mjs`,
converted under #312 scope 3). Since `forms.home` now confirmed token-only, the same mint
directly satisfies it — no host-specific browser scrape required. A Playwright fallback (login,
sniff `x-auth-token`) is kept as a defensive second path, mirroring `qsrsoft-ops-pull.mjs`'s own
`viaPlaywright()` structure, invoked only if the direct mint-and-fetch path throws.

**Row mapping is exactly Slice 1's `normalizeFormsCompletionRow()`, called once per raw API
row** — the pull script does no field mapping of its own. The polymorphic `status` field, the
null-`scheduledAt` key fallback, and the `completedBy` PII drop are all handled in the one
place already covered by `forms-completion.test.js`; this script only has to get the row shape
*to* that function and the mapped output *into* Supabase.

**Range caution, explicit and unresolved:** the finding file's own open question 4 — a single
capture of 3 days × 27 stores returned 4,714 rows with no pagination envelope observed, but the
response cap is genuinely unmeasured; a naive full-year backfill could silently truncate. This
script requests `CHUNK_DAYS`-sized windows (default 3, matching the one measured-safe capture
size) rather than the whole range in one call, upserting after each chunk so a truncation or a
mid-run failure doesn't lose chunks that already landed. **This is a real limitation, not
resolved here** — before attempting any backfill beyond the default rolling window, the actual
cap needs to be measured (a deliberately small `QSRSOFT_FORMS_COMPLETION_CHUNK_DAYS` override on
a `workflow_dispatch` run, watching for a truncated count against the known-good 3-day/4,714-row
baseline), not assumed safe at a larger chunk size.

**Manual-upload fallback: deliberately not built.** CLAUDE.md's standing "always keep manual
upload as fallback" rule exists to protect a workflow real people already relied on — FOB,
Ops Report, and Controls all replaced an existing spreadsheet practice. Form-completion tracking
has no such predecessor: nobody has ever hand-logged "did store X complete its Travel Path
today" outside QSRSoft itself. If this pull goes dark, the Slice 2 panel's own honest "no data
synced yet" state is the correct failure mode, backstopped by `sync-failure-watch.yml` below —
not a new Excel-upload UI for data that was never on paper. Recorded as an explicit scope
decision, not a silent omission.

## Standing checklist (CLAUDE.md "Adding a new automated pull")

1. **Watched.** `QSRSoft Forms Completion Pull` added to `sync-failure-watch.yml`'s
   `workflows:` list, matching the new workflow's exact `name:`. `sync-failure-watch.test.js`
   enforces the pairing both directions.
2. **Per-stream staleness, not pooled.** This stream isn't (and shouldn't be) folded into
   `src/engine/stream-freshness.js`'s `STREAMS` array — that module drives At-A-Glance's
   pooled-but-per-stream-checked banner, and Forms Completion has its own dedicated panel, not a
   tile there. Instead, `FormsCompletionPanel` now computes and renders its **own** freshness
   reading directly from its loaded rows (`freshnessOf()` in `forms-panel.js`) — "Synced today"
   / "Last synced Nd ago" in the panel header, colored by the same `WARN_GRACE_DAYS`/
   `CRIT_GRACE_DAYS` calibration every other daily stream uses (reused, not re-derived). Never
   pooled with any other stream's freshness — the whole point of #171.
3. **Supabase table with `tenant_id` + RLS.** Already shipped in Slice 1
   (`schema-qsr-forms-completion.sql`).
4. **Manual upload fallback.** Deliberately not built — see above.
5. **Two-path auth.** `getFreshToken()` direct mint → Playwright fallback, as described above.

## New workflow: `.github/workflows/qsrsoft-forms-completion-pull.yml`

Same shape as `qsrsoft-ops-pull.yml`: twice-daily cron (~5am and ~2pm CDT, matching every other
QSRSoft daily pull's cadence), `workflow_dispatch` inputs for `days_back`/`days_recent`/explicit
`start_date`/`end_date`/`chunk_days`/`debug`, installs the Playwright Chromium browser for the
fallback path even though the primary path doesn't need a browser at all.

## Verification

`src/__tests__/forms-completion.test.js` and `forms-completion-rollup.test.js` extended with the
two bug-fix regressions plus the DST-transition sweep and the `apiWindowForDays()` window tests
(matching the finding file's own captured 3-day request verbatim, a single-day window, and a
round-trip through `computeFormStoreDayRollup`'s own bucketing). `node --check` on the new pull
script (no live credentials in this sandbox to run it end-to-end — same constraint as every
other "gated on owner capture" piece of this dashboard).

1952/1952 tests. Build clean, entry chunk unchanged at 511.12 KB gzip (the freshness-line
addition lives inside the already-lazy `forms-panel` chunk).

## Status

All three slices done. `forms-completion` stays `kind:'test-kitchen'` in
`panel-registry.js` — promoting it to `kind:'nav'` (two edits: flip `kind:`, delete the
`navPBeta('forms-completion')` line in `shell.js`, per the standing promotion caveat) is a
decision for the owner to make once real data has synced and the panel has been seen live, not
something this session should do unprompted.
