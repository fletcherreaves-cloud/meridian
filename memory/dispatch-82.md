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
