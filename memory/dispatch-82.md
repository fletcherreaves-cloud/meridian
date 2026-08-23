---
name: dispatch-82
description: Two independent work items. A) Convert the 11 QSRSoft scripts still reading the dead static QSRSOFT_TOKEN onto the shared getFreshToken() lib. B) Fix the VLH gap field that made SAGE report "+141 hours/day over-staffed" for a top-quartile-labor store, twice. Neither needs owner input. Queued after: metric-registry numerator/denominator, then tolerance bands.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #82 — two independent items, neither needs owner input

Do them in either order; they touch nothing in common. **A is mechanical, B is a one-field
correctness fix with a hypothesis you must verify first.**

---

## Part A — convert the 11 scripts still reading the dead `QSRSOFT_TOKEN`

### Why this is not the ~3-day "QSRSoft Cognito auth" item on the roadmap

That entry assumed the auth work still had to be designed. **It doesn't** — `#312` built it on
2026-08-15 and five scripts already run on it. This is now a mechanical conversion against a
working reference.

### The problem, measured

`QSRSOFT_TOKEN` is a Cognito ID token with a **~1 h TTL**. From `scripts/lib/qsrsoft-auth.mjs`'s
own header, verbatim:

> a token STORED as a GitHub secret is expired **~23 of every 24 hours**, and every scheduled pull
> that reads one has been falling straight through to its Playwright fallback, **by construction,
> no matter how often the secret is rotated.**

Observed live in `QSRSoft Daily Activity Pull` run `32660801315` (2026-08-23 19:18 UTC):

```
[auth] trying direct server-side fetch with QSRSOFT_TOKEN…
[auth] QSRSOFT_TOKEN rejected (401/403) — falling back to Playwright
```

So the direct path is dead on arrival every run. **Nothing is broken** — the fallback works, which
is exactly why nobody noticed — but every one of these pulls downloads and launches Chromium
(~25 s of browser install plus a full SPA login) for a request that should be a plain `fetch`. It
also spends the safety margin the two-path design exists to provide: when Playwright breaks, there
is no working primary behind it.

⚠️ **Do NOT "fix" this by rotating the secret.** That was advised twice on 2026-08-23 and was
wrong both times; the correction is in `memory/finding-macmini-login-not-credentials-2026-08-23.md`
and CLAUDE.md. Rotating buys about an hour.

### The 11 scripts

```
qsrsoft-dar-pull.mjs              qsrsoft-pmix-pull.mjs
qsrsoft-digital-app-pull.mjs      qsrsoft-pull.mjs
qsrsoft-ebos-pull.mjs             qsrsoft-roster-stats-pull.mjs
qsrsoft-employee-roster-pull.mjs  qsrsoft-shift-manager-pull.mjs
qsrsoft-explore.mjs               qsrsoft-variance-pull.mjs
qsrsoft-mcdelivery-pull.mjs
```

### The 5 already converted — read one before writing anything

```
qsrsoft-ops-pull.mjs          ← THE reference: backfill-capable, so it exercises
qsrsoft-register-audit-pull.mjs   the expiry-aware re-mint path the others don't
qsrsoft-turnover-pull.mjs
qsrsoft-forms-completion-pull.mjs
qsrsoft-event-details-probe.mjs
```

### Requirements

1. **Call `getFreshToken()` per unit of work, not once at the top.** `qsrsoft-ops-pull.mjs`'s
   header explains why: a backfill can run ~1.5 h against a ~1 h token, so a single mint sails past
   expiry and starts 401ing partway through. The lib is expiry-aware (re-mints when the `exp` claim
   nears) and has a reactive `forceRemint` for a 401 that the `exp` claim didn't predict — but only
   if you actually call it per request/date.
2. **Keep the Playwright fallback.** It stops being the only path; it does not stop being a path.
   ⚠️ Except in `qsrsoft-security-events-pull.mjs`, which is **not on this list** and must stay
   in-browser-only — `api.security` fingerprints the client, so a Node fetch can never reach it
   regardless of token. Do not "helpfully" convert it.
3. **Three of these hit `api.sso.myqsrsoft.com`, not `api.reports`** — `qsrsoft-ebos-pull.mjs`,
   `qsrsoft-variance-pull.mjs`, `qsrsoft-onhand-pull.mjs`. ⚠️ **Confirm the minted token is
   accepted by that host before converting them**, rather than assuming one token works everywhere.
   If it is not, say so and leave those three alone — a partial conversion that is correct beats a
   complete one that is guessed.
4. **`qsrsoft-explore.mjs` is a dev/probe script**, not a scheduled pull. Convert it last, or skip
   it and say why.

### Verification bar

A conversion is proven by the **absence of the fallback line**, not by a green run — the fallback
already makes every run green. The bar is a live `workflow_dispatch` on one converted pull whose
log shows the direct fetch **succeeding**, with no `falling back to Playwright`. Record the
wall-clock before and after; the whole point is skipping a browser launch.

⚠️ You cannot run these from the sandbox (no QSRSoft creds/network). Convert, verify by inspection
against the reference, and **say plainly in the PR that the live confirmation is outstanding** —
the way dispatch #81's PR did. Do not claim it works.

---

## Part B — `gap_vlh` has no period in its name, and SAGE read it as a daily rate

### The symptom, twice

Asked which stores to visit, SAGE reported from its LifeLenz tool:

- Run 1: *"**Ada-Country Club (6972) is +141 hours/day over-staffed**"* — and SAGE itself flagged
  this as impossible, noting Ada's labor runs **21.23%, 4th-best in the district**, and that
  ≈12 extra FTEs daily cannot coexist with top-quartile labor. It **excluded** LifeLenz from its
  recommendation as a result.
- Run 2: *"Madill (13113) … **71.6h/day over-scheduled**"* — different store, same shape.

Two stores, two runs. Systematic, not a one-off.

### The hypothesis — VERIFY BEFORE FIXING

`query_lifelenz_labor` (`supabase/functions/sage-chat/index.ts:336`) returns **both**:

```js
gap_vlh:       +(s.schVLH - s.needVLH).toFixed(1),           // SUM over the whole window
avg_daily_gap: +((s.schVLH - s.needVLH) / (s.days || 1)).toFixed(1),
```

`gap_vlh` is a **window total**. Its name contains no period, and the `note` explains only the
**sign** (`Positive = over-scheduled`), never that it is a sum over `days`. So the field that reads
like "the gap" is the larger number, and nothing in the payload says over what span.

**Arithmetic consistent with a 30-day window:**

| store | SAGE reported | ÷ 30 |
|---|---|---|
| Ada (6972) | 141 h/day | **4.7 h/day** |
| Madill (13113) | 71.6 h/day | **2.4 h/day** |

Both land on entirely plausible daily gaps. Two independent figures fitting the same divisor is
decent evidence — **but it is still a hypothesis.** Confirm it by calling the tool for a known
window and checking `gap_vlh ÷ days == avg_daily_gap`, before changing anything. If the numbers
don't reconcile, the cause is something else and this dispatch's fix is wrong.

### The fix

Make the period impossible to misread. Options, in the order I'd try them:

1. **Rename to `gap_vlh_total`** (or `gap_vlh_window_total`) so the name carries the period, and
   extend the `note` to state that it is a sum over `days` while `avg_daily_gap` is the per-day
   rate.
2. Consider whether `gap_vlh` should be dropped from the payload entirely. If the per-day rate is
   what any answer actually wants, two fields differing by a factor of `days` is a trap that will
   catch the next reader too.

⚠️ **Whatever you choose, the tool's own `note` is the contract SAGE reads.** A rename with a stale
note fixes nothing. This is the standing *"say the number AND its window"* rule applied to a tool
payload rather than a panel.

### Why this matters more than its size

SAGE caught it and refused to use the data — **this time**. That is not a control you can rely on;
it depended on Ada's labor being visibly good in another tool. A store where the wrong number
looked plausible would have gone straight into a visit recommendation.

### Verification bar

A test that calls the tool's aggregation over a known multi-day fixture and asserts the daily
field is the total ÷ days, plus an assertion that the `note` names the period of every field it
describes. **Revert-sensitive**: reverting the rename must fail it.

---

## Queued after this — do not start until #82 is merged

1. **Numerator/denominator in the metric registry** (~2-3 d). Ratio metrics averaged instead of
   summed; measured **4.5% gap**, affects **10 of 16** leaderboard metrics and every future ratio
   rollup. Already specified: `memory/dispatch-77.md` + `notes-57-metric-registry-plan` §4.
2. **Tolerance bands** (~2 d). **Half-built already — verify before building:** 24 metrics carry a
   `tol:` field and nothing reads it. Natural home is beside `direction` in `METRIC_SOURCES`, which
   is why it follows item 1 rather than preceding it.

Both are Band 3 in `memory/roadmap-2026-08-23.md`.

---

## Resolution (2026-08-23)

Both parts shipped in one PR, per the dispatch's own framing (independent, touch nothing in
common).

### Part A — converted, with two corrections to the dispatch's own file list

**10 of the dispatch's 11 named scripts converted**: `qsrsoft-dar-pull.mjs`,
`qsrsoft-digital-app-pull.mjs`, `qsrsoft-ebos-pull.mjs`, `qsrsoft-employee-roster-pull.mjs`,
`qsrsoft-mcdelivery-pull.mjs`, `qsrsoft-pmix-pull.mjs`, `qsrsoft-pull.mjs`,
`qsrsoft-roster-stats-pull.mjs`, `qsrsoft-shift-manager-pull.mjs`, `qsrsoft-variance-pull.mjs`.
**`qsrsoft-explore.mjs` deliberately skipped** — it's a bare manual probe
(`QSRSOFT_TOKEN=xxx node scripts/qsrsoft-explore.mjs`, hand-run with a DevTools-pasted token),
top-level code with no `main()`/async wrapper and **no Playwright fallback to fall through to**.
Converting it would remove its only auth path with nothing to fall back on — not the same shape
as every other script here, so left untouched per the dispatch's own "don't force it" guidance.

Same mechanical pattern everywhere: `getFreshToken()` (`scripts/lib/qsrsoft-auth.mjs`, already
built by #312) resolved **per unit of work** — per date, per store, or per report period,
whichever a script's natural loop already was — via a small `resolveToken(token, forceRemint)`
helper (`typeof token === 'function' ? await token({forceRemint}) : token`), with exactly one
forced re-mint-and-retry on an `AUTH_FAILED`-prefixed rejection before the error propagates to
the script's **existing, completely untouched** Playwright fallback. `qsrsoft-pmix-pull.mjs` and
`qsrsoft-pull.mjs` had 2-3 distinct call sites each (a district-mode probe, a per-date fetch, a
per-store fallback loop; an upfront validation ping plus the main per-date loop) — all converted
consistently, not just the first one found. Requirement 2 (keep Playwright, don't touch
`qsrsoft-security-events-pull.mjs`) and requirement 4 (`explore.mjs` last-or-skip) both held.

**Correction 1 — the dispatch's own "hits `api.sso`, not `api.reports`" list named the wrong
third script.** Measured, not assumed: `qsrsoft-onhand-pull.mjs` defines a
`getEbosTokenViaSso()` function but **never calls it** — `resolveEbosToken()`'s own comment says
outright *"the SSO /token/ebosByOrg exchange is a confirmed 403 dead end. The ONLY reliable path
is a fresh Playwright login"* — so onhand-pull never reads a reporting-API token in any live path
and needed no conversion. It was correctly excluded from the 11-script list already (dispatch
requirement #3 named it as one of three api.sso scripts, which was itself imprecise — see below);
leaving it alone here is consistent with that, just for the more precise reason that its SSO path
is dead code, not merely "worth confirming before touching."

**Correction 2 — a genuinely live, affected script was missing from the dispatch's own
inventory.** `scripts/lib/ebos-auth.mjs` — the shared eBOS auth ladder extracted 2026-08-14 (PR
#273) — has its own `resolveEbosToken()` that read
`process.env.QSRSOFT_COGNITO_TOKEN || process.env.QSRSOFT_TOKEN` directly, and
`qsrsoft-inventory-history-pull.mjs` already imports and calls it. That script was carrying the
exact bug this dispatch exists to fix, silently, because a grep for direct
`process.env.QSRSOFT_TOKEN` reads (how the original 11-script inventory was almost certainly
built) can't see a script that only reads it *indirectly* through a shared lib —
`memory/project-qsrsoft-cognito-auth-312.md` itself flagged this exact miss once already, for the
same file, during #312's own housekeeping pass, and it recurred here. Fixed: `ebos-auth.mjs`'s
`resolveEbosToken()` now calls `getFreshToken()` for the SSO exchange's cognito value, which
fixes `qsrsoft-inventory-history-pull.mjs` (and any future script that adopts the shared lib)
without a direct edit to that file.

**Requirement 3, confirmed by inspection, not by a live probe (which this sandbox cannot run).**
`scripts/lib/qsrsoft-auth.mjs`'s own header states the minted token *"is the SAME shape
QSRSOFT_TOKEN/QSRSOFT_COGNITO_TOKEN always were"*, and `#312`'s finding chain (owner-confirmed
2026-08-15) independently establishes `QSRSOFT_TOKEN`/`QSRSOFT_COGNITO_TOKEN` as literally the
same Cognito ID token. `qsrsoft-variance-pull.mjs`'s own (pre-existing, unedited-in-substance)
comment on `getEbosTokenViaSso()` says the exchange host authenticates with exactly that Cognito
ID token — and its ladder already fell back from `QSRSOFT_COGNITO_TOKEN` to `QSRSOFT_TOKEN`
interchangeably, i.e. this exact interchangeability was already relied on in shipped code before
this dispatch. That is code-level evidence the minted token is the right *type* for the
`api.sso.myqsrsoft.com` exchange, not a guess — but it is still not a live 200, which no sandbox
here can produce. `qsrsoft-ebos-pull.mjs` and `qsrsoft-variance-pull.mjs` (the two real api.sso
scripts) were converted on that basis; `qsrsoft-onhand-pull.mjs` needed no conversion per
Correction 1 above.

**Verification bar** — the dispatch is explicit that a green run proves nothing (the fallback
already makes every run green) and that this sandbox cannot log in to QSRSoft at all. Met the
adjusted, sandbox-realistic bar instead: `node --check` clean on all 11 touched files, structural
match to the proven reference (`qsrsoft-ops-pull.mjs`'s `resolveToken`/re-mint-once/catch-all
pattern) confirmed by direct reading of every diff, full suite **2143/2143** passing (up from
2137 pre-dispatch — the 6 new Part B tests, see below), build clean, no bundle impact (none of
these are client-imported). **Live confirmation — a real `workflow_dispatch` run whose log shows
no `falling back to Playwright` line, with before/after wall-clock recorded — is outstanding and
needs the owner or the self-hosted runner**, exactly as dispatch #81's PR handled the same
sandbox constraint.

### Part B — `gap_vlh` → `gap_vlh_total`, hypothesis confirmed by inspection then fixed

**The hypothesis was correct.** Read `query_lifelenz_labor`'s actual (pre-fix) code directly:
`gap_vlh: +(s.schVLH - s.needVLH).toFixed(1)` is a straight sum across every row pulled into
`byStore[loc]`, one row per day in the queried window — a window total with no period in its
name, exactly as the dispatch described, sitting beside `avg_daily_gap` which divides that same
numerator by `s.days`. No alternate cause was found; the fix is exactly what the dispatch
specified (option 1: rename so the name carries the period).

**Fix**: `gap_vlh` → `gap_vlh_total` at the one field definition, the sort key, and the tool's
`note`, which now states both fields' periods explicitly (*"gap_vlh_total = … SUMMED ACROSS THE
WHOLE date_range (days field). avg_daily_gap = gap_vlh_total ÷ days, the PER-DAY rate…"*) instead
of explaining only the sign. Confirmed by repo-wide grep that `gap_vlh` had exactly one consumer
(this tool) — no other call site needed updating.

**Extracted to a shared, testable module** rather than fixed in place, mirroring dispatch #80's
`memory-kb.js` precedent (the only existing example of testing SAGE tool logic in this repo, since
`index.ts` is a Deno edge function with no Deno test runner wired into CI and top-level
`Deno.env.get(...)!` calls that make it unimportable from Vitest as-is): new
`supabase/functions/sage-chat/lifelenz-labor-agg.js` (plain JS, no TypeScript) exports
`aggregateLifelenzLabor(rows, storeNames)` and `LIFELENZ_LABOR_NOTE`, imported by `index.ts`
verbatim — the exact code that runs in production is what the test exercises, not a
re-implementation of it.

**Verification**: `src/__tests__/sage-lifelenz-labor-agg.test.js`, 6 tests — a 30-day fixture
reconciling to the dispatch's own arithmetic (`+4.7 VLH/day × 30 days = 141.0 total`, matching
SAGE's reported "+141 hours/day" for Ada-Country Club), a second store on an **different**
day-count (18, not 30) to prove the fix divides by each store's own `days` rather than a borrowed
constant, an explicit assertion that `gap_vlh_total` exists and the old `gap_vlh` name does not, a
sort-order test (worst absolute gap first, unchanged behavior), and two assertions on the note
text itself (`/gap_vlh_total/`, `/summed across/i`, `/date_range/`, `/avg_daily_gap/`,
`/per-day/i`) — the "note names the period of every field it describes" bar the dispatch asked
for specifically, not just a passing number. **Confirmed revert-sensitive**: temporarily reverted
every `gap_vlh_total` occurrence back to `gap_vlh` and re-ran — 4 of 6 tests failed exactly as
predicted (the field-existence check and all three note-content checks that reference the new
name), then restored.

### Verification (both parts together)

Full suite **2143/2143** passing (203 files), `npm run build` clean, eager-payload 517.79 KB gzip
(budget 850 KB) — no client bundle impact from either part (Part A is Node scripts, Part B's new
module is imported only by the Deno edge function and its own Vitest test, not by any
client-side panel).

### Explicitly not done this pass

- **Live `workflow_dispatch` confirmation for any of the 11 converted scripts** — this sandbox has
  no QSRSoft credentials or network access (checked first, consistent with dispatch #81's own
  session). Needs the owner or the self-hosted runner, per the dispatch's own verification-bar
  language.
- **Wall-clock before/after measurement** — same reason; the dispatch explicitly wants this
  recorded once a live run is possible, to confirm skipping the Playwright browser launch is the
  actual win it should be.
- **Deleting the `QSRSOFT_TOKEN`/`QSRSOFT_COGNITO_TOKEN` GitHub secrets** — per #312's Scope 4
  (already-standing hold), not touched here either; they cost nothing to leave as a last-ditch
  fallback until the converted scripts have run green on their real schedules for several
  consecutive days.
- **`qsrsoft-explore.mjs`** — left on the old static-token pattern, for the structural reason
  above, not an oversight.
