# Dispatch #124 — Actual punch times: QSRSoft pull + table (backend only, no panel work)

**Context.** Companion to dispatch #123 (Crew Schedule Lookup). The owner asked, as a "bonus," to
see punched (actual clock) times alongside scheduled shifts, and chose the full-build option.
This dispatch is scoped strictly to the **data pipeline** — a new pull script and a new Supabase
table — deliberately kept separate from #123's panel work so the two can be built and reviewed in
parallel without touching the same files. **Wiring this data into the Crew Schedule panel as a
"Punched" column is explicitly a later, separate dispatch, once both #123 and this land.**

## 🔴 Read `memory/finding-qsrsoft-time-punches-endpoint-2026-08-21.md` IN FULL before writing
## a single line of code. This is not optional context — it is the spec for what NOT to do.

That finding documents a live, owner-captured example of the exact endpoint this dispatch needs
(`GET https://api.reports.myqsrsoft.com/reporting/v2/people/time-punches-matched`), and states
plainly: **the captured request's `selectCols` included `ssn`, and the response carried full
nine-digit Social Security Numbers plus full legal names for every employee.** That capture was
deliberately never recorded in the finding file. The finding lays out non-negotiable rules,
repeated here because they are the actual scope of this dispatch, not a footnote to it:

1. **Never put `ssn` in `selectCols`.** This is caller-chosen, so it is solved entirely at the
   request — the field must simply never be asked for. Do not fetch-then-drop; do not fetch it
   "for matching" and discard it after.
2. **Never persist an SSN.** Not in Supabase, not in a scratch table, not in a log line, not in a
   test fixture, not in a debug screenshot artifact.
3. **The pull script must assert `ssn` is absent from its own `selectCols`** before making the
   request — a guard IN the script, so a future edit that adds it back fails loudly at run time
   rather than silently exfiltrating SSNs into a GitHub Actions log or a Supabase table.
4. **Employee names route through the SAME identity vault dispatch #123 uses**
   (`src/engine/identity-vault.js`'s `getOrCreateToken`/`tokenizeRows`, the
   `get_or_create_employee_token()` RPC) — a name goes in, a stable `emp_token` UUID comes out,
   and the stored punch rows carry `emp_token`, never a raw name. If this endpoint's response
   includes a name field even when `ssn` is excluded from `selectCols`, that name must be
   tokenized the same way before it ever reaches a Supabase table — do not persist it raw on the
   theory that "at least it's not the SSN."
5. **The finding's `geid` field is the real person key for this endpoint** (safe — no SSN, no
   name) and, per the finding's own analysis, is very likely the same identifier space as
   `audit_rows.emp_id` used elsewhere in this codebase's identity work — but that is stated in
   the finding as "almost certainly," not fully proven, and only checked against one store on one
   day. **Verify this independently before relying on it** — if `geid` and `audit_rows.emp_id`
   turn out NOT to be the same space after all, tokenizing by `geid` directly (rather than by
   name, once a name is available) could create a SEPARATE identity token per person from the
   one dispatch #123's employee-name-based tokenization creates, silently breaking any future
   join between schedule and punch data by person. Resolve this explicitly and document what you
   found.

## Also unresolved, per the finding — confirm before shipping, don't assume

- **Business-day boundary**: the finding notes no `compType` parameter on this endpoint, so
  whether its punch timestamps align to the 4am business day (like the DAR does) or the calendar
  day is **unconfirmed**. This matters a lot — CLAUDE.md's own standing rule is explicit that any
  metric dividing one atom by another needs both legs on the same boundary. Do not assume either
  way; check real punch times against known store-close patterns (a punch ending well after
  midnight local time is a strong signal either way) or find another way to confirm, and state
  your finding plainly.
- **`badgeType`**: only `Primary` was seen in the one-day sample. Other values presumably exist;
  don't hardcode logic that assumes `Primary` is the only one.

## Scope — build

1. A new pull script (`scripts/qsrsoft-punch-times-pull.mjs` or similar, following this repo's
   existing QSRSoft pull scripts' auth/pagination conventions) hitting
   `people/time-punches-matched`, looping stores (the finding notes this endpoint takes **one
   store per call**, unlike the service-layer endpoints that take all 27 at once — budget for
   that in the pull's runtime/rate limiting).
2. A **hard-coded, reviewable `selectCols` allowlist in the script itself** that does not include
   `ssn` (or any of the other sensitive fields the sibling `people/employee-roster` endpoint is
   documented to return — home address, DOB, race — if this endpoint happens to expose any of
   those too, check its actual field list, don't assume it's limited to what the one sample
   showed) — plus the run-time assert-guard from rule 3 above.
3. A new Supabase table (`tenant_id` + RLS, matching every other stream in this codebase) storing,
   per the finding's documented safe-field list: `geid` (or `emp_token` if you resolve rule 5
   above to tokenize immediately), `loc`, `punchType` (shift/meal), `isPaidBreak`,
   `startDateTime`/`endDateTime`, `jobTitleCode`, `inModified`/`outModified` (the punch-edit
   flags — real signal, worth keeping even though this dispatch doesn't build anything on top of
   them yet), `badgeType`. No `ssn`, no name, no `timeCardNumber` if it's genuinely unreliable per
   the finding ("often null; not a reliable key").
4. Full "Adding a new automated pull" checklist per CLAUDE.md's Dev Rules: watched in
   `sync-failure-watch.yml`, per-stream staleness visible, two-path auth, manual fallback
   considered (likely not applicable — state why if skipped).

## Do NOT

- Do not touch `src/views/` or add any panel/UI — this dispatch is the pull + table only.
- Do not touch dispatch #123's LifeLenz schedule work.
- Do not request, log, or persist `ssn` under any circumstance, at any point, even temporarily.
- Do not persist a raw employee name if the endpoint happens to return one alongside `geid`.

## Verification bar

- The pull script's own `selectCols` (or equivalent field-selection mechanism) is inspectable in
  the PR diff and demonstrably excludes `ssn` and any other identified sensitive field.
- A test asserting the script throws/refuses to run if `ssn` (or another blocked field) is ever
  added back to its field list — the "guard that fails loudly" from rule 3, actually exercised by
  a test, not just described in a comment.
- State plainly in the PR: what you found for the business-day-boundary question, what you found
  for the `geid`/`audit_rows.emp_id` identity-space question, and how you resolved (or explicitly
  deferred) the tokenization approach.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean (should be a no-op on the build/bundle side — this is a backend-only pull + table).
