---
name: finding-qsrsoft-security-entitlement-request-2026-08-22
description: ✅ RESOLVED (diagnosis) 2026-11-09, CORRECTED same day -- the token-injection test this file called for finally ran. Identity hash is byte-identical across three independently-tested callers (cloud sandbox, GitHub-hosted ubuntu-latest, the self-hosted Mac mini runner) -- same account, same credential, same code -- yet only the cloud sandbox gets 200; both GitHub Actions runner flavors get 403 AccessDeniedException. NOT a raw network-origin block (corrected: the owner's own real browser on that SAME Mac mini loads Security Events fine right now, so the Mac's network/IP is not blocked) -- the actual common factor across every failure is specifically running AS A GITHUB ACTIONS JOB, mechanism still unconfirmed (candidates: Actions-specific egress path, runner-software request fingerprint -- not yet isolated). The GitHub-Actions-403 question above is STILL OPEN and this file's own diagnosis of it stands. But a SECOND, fully independent bug was found and fixed the same day (PR #1765, merged): src/engine/security-events.js's parseSecurityEventRow required raw.event_token, a field the real API never sends, so 100% of rows were silently dropped as "unkeyable" on every successful call regardless of auth/network -- qsr_security_events had been staying at zero rows for THIS reason too, hidden behind the 403 saga because nobody had gotten a real 200 back from an automated context before 2026-11-09. Fixed, and a real production pull with the fix landed 113,782 real rows, independently verified via service-role REST count. Read the final section at the very bottom first.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# QSRSoft entitlement request — `api.security` module, automation account

# ⚠️ RE-OPENED 2026-08-23 — the supersede below rests on a missing cell

**Still do not send the request yet.** But the 08-22 correction's conclusion (source IP) is now in
doubt, and the original reading (entitlement/identity) is back in play.

## What changed

The 08-22 elimination table has four rows. **Every 403 in it came from GitHub Actions, and every
200 came from the owner's network.** Source IP and token were never varied independently — the one
cell that would separate them was never captured:

| | owner's network | GitHub Actions |
|---|---|---|
| **owner's browser token** | 200 (row 1, row 4) | — |
| **our minted token** | ⬅ **never tested on 08-22** | 403 (row 2, row 3) |

**2026-08-23 filled that cell.** The security-events workflow ran on `mac-mini-qsr` — the owner's
own Mac mini, the same machine and network where the row-4 curl returned 200 — using a
`getFreshToken()`-minted token. **All 216 units returned 403**, with:

```
{"Message":"User is not authorized to access this resource with an explicit deny in an identity-based policy"}
x-amzn-errortype=AccessDeniedException
```

Same machine. Same network. Same header set. **Different token, different answer.** That is the
opposite of what a source-IP restriction predicts.

## The `sub` objection, and why it is not settled either way

The 08-22 correction's strongest point stands unchallenged: the owner's `sub` hash is **identical**
to ours, so rows 1 and 2 are nominally the same principal — and a single principal cannot be both
allowed and denied by IP-independent policy. That is a real tension with the 08-23 result, not
something to wave away.

Two ways both observations can be true, neither yet tested:

1. **Same `sub`, different authorization context.** IAM policy can key on more than the subject —
   `cognito:groups`, `amr` (how the user authenticated), `auth_time`, or a scope claim. The
   dispatch #67 comparison that found "identical claims" compared claim **NAMES**, never
   **VALUES**. Two tokens for one `sub` can carry different group membership and hit different
   policy branches.
2. **The runner's egress differs from the owner's shell.** A VPN or split-tunnel on one and not the
   other would make "same machine" false at the network layer despite being true physically.

⚠️ **Do not pick one of these from the armchair.** This investigation has now produced four
confident conclusions — auth-flow, source-IP, transport-fingerprint, and CORS — and the first three
were each overturned by the next measurement.

## The one-variable probe that settles it

`scripts/probe-security-token-identity.mjs` (added 2026-08-23). Run **from the Mac mini**, it makes
the identical request twice in one process — same machine, same shell, same headers, same moment —
varying **only** the token: `getFreshToken()`'s versus one pasted from the owner's browser session.

```
BROWSER_TOKEN=<paste> node scripts/probe-security-token-identity.mjs
```

It prints status, `x-amzn-errortype`, claim **names**, `cognito:groups` (group names are not
credentials, and are the likeliest thing to differ for one `sub`), and token **age/TTL** — the
variable that has misled this investigation more than once. **No token value is ever logged.**

| outcome | reading |
|---|---|
| minted 403, browser 200 | **Token is the variable.** Source-IP refuted; the entitlement ask below is right after all — but ask about the *policy condition*, not a blanket entitlement. |
| both 200 | Earlier 403s were transient or age-related. Nothing structural. |
| both 403 | Token is not the variable; the source-IP reading survives — **or the pasted browser token had expired.** Re-capture and re-run before concluding. |

## Also fixed 2026-08-23 — a self-inflicted second failure

The pull re-minted its token on **any** 401 *or* 403 and retried. With all 216 units returning
403 `AccessDeniedException`, that forced ~216 re-mints in under two minutes and **Cognito began
refusing `InitiateAuth` with `ForbiddenException`.** The run's tail therefore reported a Cognito
throttle rather than the AccessDenied that was the actual finding — the retry did not merely waste
calls, it **buried the diagnosis**. Re-mint is now gated to 401 and to 403s that are *not*
`AccessDeniedException`.

📌 Worth generalising: **a retry policy that cannot distinguish "your credential expired" from
"your credential is not allowed" will convert a clear diagnosis into a rate-limit.**

---

> # 🔴 SUPERSEDED — DO NOT SEND THIS REQUEST
>
> **Corrected 2026-08-22, hours after this file was written.** Its premise is false. There is no
> entitlement gap and no separate automation account: it is **one Cognito principal**, and the
> denial depends on **where the request comes from**.
>
> **What this file got wrong.** It closed "two principals sharing an email" by comparing the bare
> `getFreshToken()` token against the Playwright SRP token — **both of them ours**. Identical
> `sub` hashes there prove the two auth *flows* resolve to one principal (a real result, and it
> does kill the auth-flow hypothesis). They say nothing about the principal that actually
> succeeds. That row was never captured when this was written.
>
> **The two measurements that settle it**, taken afterwards by the owner:
>
> | # | token | from | result |
> |---|---|---|---|
> | 1 | owner's browser token, **`sub#9378eb7a6502`** | owner's network, browser | **200** |
> | 2 | our minted token, **`sub#9378eb7a6502`** | GitHub Actions | **403** |
> | 3 | Playwright SRP token, real Chromium, real SPA login | GitHub Actions | **403** |
> | 4 | **same request via `curl`, no browser at all** | **owner's network** | **200 + real rows** |
>
> The owner's `sub` hash is **identical to ours** — so rows 1 and 2 are the same principal,
> allowed and denied at once. And row 4 beats row 3: row 3 already controlled for browser-ness,
> User-Agent, the SPA login flow and the app client, and still failed; row 4 removes the browser
> entirely and **succeeds**. The only remaining variable is the **source IP**.
>
> `api.reports` works from those same runners all day (the Register Audit pull succeeded at
> 11:23 UTC), so the restriction is specific to the **security module** — reasonable for one whose
> routes include `video_provider` (surveillance integration).
>
> **What to ask QSRSoft instead:** not for an entitlement, but **what the network restriction on
> `api.security` actually is** — IP allowlist, geo, ASN, or something else — and whether a static
> egress IP can be permitted. Give them the `x-amzn-requestid` values from a 403 run so they can
> find the denial in their own logs. Everything below is still accurate as *evidence* (org id,
> denied routes, IAM message, elimination table); only the **conclusion and the ask** are wrong.
>
> **What the pull needs:** a permitted network origin — a self-hosted runner on a static IP, or an
> egress proxy for these calls only. Allowlisting GitHub's hosted ranges is impractical. Confirm
> the mechanism with QSRSoft **before** anyone provisions infrastructure.
>
> Full correction: `memory/dispatch-63.md`, "CORRECTION — it is the SOURCE IP".

**Status (as written, now superseded):** ready to send to QSRSoft. This repo has exhausted
everything it can test on its own.

## The ask

The automation account (`QSRSOFT_USERNAME` GitHub secret) needs whatever role/permission grants
access to the **`api.security.myqsrsoft.com`** module. It already has full access to
**`api.reports.myqsrsoft.com`** (same org, same login) — this is scoped to one module, not the
whole platform.

## Evidence to hand QSRSoft support

- **Org:** `a546d4ef-684a-4f25-8bc0-6580af068875`
- **Store used to test:** NSN `29760`
- **Exact route denied:** `POST https://api.security.myqsrsoft.com/security/event_details/v1/{orgId}/{storeRef}?orgId={orgId}`
  — also denied: `POST https://api.security.myqsrsoft.com/security/video_provider/{storeRef}?orgId={orgId}`,
  a second, unrelated route in the **same module**, ruling out a route-specific fix.
- **Response, byte-identical on every call and every credential tried:**
  ```
  403 {"Message":"User is not authorized to access this resource with an explicit deny in an
  identity-based policy"}
  ```
  This is AWS IAM language for *the credential was accepted and resolved to a principal, and
  that principal is explicitly denied.* Not an expired/invalid token (that returns 401 — verified
  by sending no token at all, which failed with a plain **401**, not 403).
- **The same credential works on `api.reports.myqsrsoft.com`** (`/data_layer/v1/service/statistics`,
  the same route this repo's daily ops pull already calls successfully on a schedule) —
  **200** on that host, **403** on `api.security`, same run, same token. So this is not a bad
  credential; it is a module the account isn't entitled to.
- **Both Cognito ID and access tokens were tried** against `api.security` — identical 403,
  ruling out "wrong token type for this authorizer."
- **Both auth flows were tried and are the same principal.** The automation normally mints its
  token via a bare `USER_PASSWORD_AUTH` Cognito grant; the real web app (v3.myqsrsoft.com) signs
  in via `USER_SRP_AUTH` through Amplify. Driving the actual SPA login with Playwright (so the
  token comes from the exact same flow the web app uses) still returns the identical 403 on
  `event_details`. **The two tokens' `sub` claim hashes to the same value** — genuinely the same
  Cognito principal, not two different accounts sharing an email. So this is not an
  auth-flow/SDK difference either.
- `orgAdmin` and `permissionsAccess` both carry this org, so the account is not a plain non-admin
  user being correctly refused — it is an org admin being denied one specific module.

## What this rules out (so QSRSoft support doesn't have to re-ask)

| would explain the 403 | ruled out by |
|---|---|
| Expired/invalid credential | Works on `api.reports` in the same run |
| Wrong token type (ID vs access) | Both tried, identical 403 |
| Not an admin | `orgAdmin` claim present |
| Wrong Cognito app client | Same client (`2vt4qrqcakbeo9sh0ivli3lbui`) as the browser |
| Auth flow (`USER_PASSWORD_AUTH` vs the SPA's `USER_SRP_AUTH`) | Same principal (`sub` hash equal) via both flows, still denied |
| Route-specific restriction | A second, unrelated route in the same module (`video_provider`) is also denied |
| Sending no credential at all | Returns 401, a materially different response |

## What is NOT included here, deliberately

No token value, `sub`, `eID`, `cognito:username`, or email appears anywhere in this file, in
`memory/dispatch-63.md`, or in the probe script's logs — only sha256 prefixes and claim-name
lists, per the standing privacy bar. Whoever files the QSRSoft ticket already has the actual
`QSRSOFT_USERNAME` account and org membership to reference; it does not need to be written down
here.

## 🔴 APPENDED 2026-08-24 — the last measurement, which lived only in a commit body

The probe work that followed this file (#616–#623) ended somewhere stranger than "entitlement,"
and the result was recorded **only in the `#623` commit body**. Anyone reading *this* file — the
one a future session would actually open — would not have found it. Captured here now.

**The final state: `fetchOne()` returns 200 from the probe and 403 from the pull's own loop.**
Same machine, same shell, seconds apart, on a byte-identical request. From `#623`'s commit body,
verified by computation rather than inspection:

- `storeRefFromLoc(String(3708))` is `'3708'` — identical in both paths.
- `EVENT_TOKENS[0]` is `'all_promo'` — identical.
- `dateList('2026-08-22','2026-08-22')` is `['2026-08-22']` — identical.
- `main()`'s preamble touches only Supabase before the first fetch.
- The probe **imports the pull module**, so it shares every module-level import and any side
  effect they carry — which is what makes the difference so hard to localize.

Case E — the probe calling the pull's *actual* `fetchOne`, not a reconstruction (`#622`) —
returned **200 with 87 rows**. The pull returned 403 seconds later with a wire dump showing the
same URL, the same body, the same token hash, age and TTL.

**Twelve hypotheses eliminated** across #616–#623, including: the `Origin`/`Referer` headers (the
DAR pull sets them too and works), body scope, rate limiting, the store, the date, token expiry,
`[object Object]` token stringification, and re-mint-on-403 (which was itself a real bug —
`#616` — that throttled Cognito with ~216 re-mints in under two minutes).

**Recommended next steps, in order, neither of which is more instrumentation:**
1. **A token-injection test** — run the pull with a token captured from the probe's own successful
   call, to establish whether the credential or the caller is the variable.
2. **A packet capture** — if injection does not separate them, the difference is below the code
   and only the wire will show it.

⚠️ **Do not add another round of logging.** Reading the source has been exhausted; `#623` was
already the "stop reading, dump the wire" step and it showed the two requests as identical.

## Next step

Send this to QSRSoft support (or whatever the account's usual support channel is) as an
entitlement request for the automation account, referencing the org id and route above. No further
code investigation in this repo will resolve it — see `memory/dispatch-63.md`'s resolution section
for the full measurement trail if support asks for more detail.

⚠️ **That recommendation predates the appended block above and is now in tension with it.** If
`fetchOne` can return 200 at all from this account, on this machine, with a minted token, then a
blanket entitlement gap is not the whole story. **Run the token-injection test before filing the
support ticket** — the answer changes what to ask them for.

## ✅ RESOLVED (diagnosis, not yet the fix) — 2026-11-09, the token-injection test from the
appended block finally ran, live, and settles the question this file has chased since August.

**Sequence of measurements, each one live, none guessed:**

1. The owner reset `QSRSOFT_PASSWORD` and shared it for a live test. A cloud-sandbox session
   (not a self-hosted or GitHub-hosted runner — an interactive Claude Code session) ran the
   production pull's own `getFreshToken()`/`fetchOne()` functions directly: **40/40 real 200s**
   across 6 stores × 3 dates × 6 event_tokens, zero failures. The real interactive browser login
   (`v3.myqsrsoft.com`) also loaded the Security Events page fine in the same session, hitting
   `api.security.myqsrsoft.com/security/suspicious_activity` (a different, newer route the real
   UI now uses) with real data — both routes, `event_details` (what the pull calls) and
   `suspicious_activity` (what the UI calls), returned 200 with the same minted token.
2. The owner updated the `QSRSOFT_PASSWORD` GitHub Secret to match and confirmed the save (exact
   same string, same source). The next `workflow_dispatch` run on the self-hosted Mac mini
   runner — same code, same moment — **still failed, 100%, `AUTH_FAILED:403`**, zero rows across
   3024 units.
3. **The decisive test: identity comparison.** The pull's own `identityFp()` (sha256 of
   `sub`+`cognito:username`, never raw claims — exactly the privacy-safe mechanism dispatch #91
   built for this) was pulled from the failing self-hosted run's log: `IDENTITY 3f73c22fba95`.
   The SAME value was independently computed from a fresh mint in the sandbox session, seconds
   later: `IDENTITY 3f73c22fba95`. **Byte-identical.** Same Cognito principal, same credential,
   same code — the only thing that differs between a 200 and a 403 is which network the request
   left from.
4. **To rule out "maybe it's specifically the Mac mini's flagged IP, not GitHub Actions in
   general"**, a one-off read-only probe ran the identical call from a GitHub-**hosted**
   `ubuntu-latest` runner (PR #1763, deleted after use). **Also `403`, also
   `AccessDeniedException`, also `IDENTITY 3f73c22fba95`.**

**⚠️ CORRECTED 2026-11-09, same session — the paragraph below originally said "network-origin
block." That overclaimed. The owner reports the Security Events page loads fine, right now, in
their own real browser on the SAME Mac mini whose GitHub Actions self-hosted runner fails —
meaning the Mac mini's network/IP itself is demonstrably not blocked at all. Read the corrected
reasoning, not a raw "it's the network" takeaway.**

**Conclusion, proven across three independently-tested CALLERS, not inferred, but narrower than
first written:** this was never an entitlement gap, an auth-flow difference, a CORS/fingerprint
artifact, or a Referer bug (all four were real things this investigation found and fixed along
the way, and all four were real but **none of them was the gate**). What the evidence actually
supports: a request made as a **GitHub Actions job** — whether the self-hosted Mac mini runner or
a GitHub-hosted `ubuntu-latest` runner — gets `403 AccessDeniedException` on
`api.security.myqsrsoft.com`, while the IDENTICAL non-interactive call made from a Claude Code
Remote cloud session gets `200`, AND a real interactive browser session (the owner's own, on that
same Mac mini) also gets `200`. **Raw network origin alone cannot explain this**, since the
self-hosted runner and the owner's own browser share that Mac mini's network and split 403/200.
The real distinguishing variable is still open — candidates, none yet tested against each other:
something GitHub Actions' runner software itself adds to outbound requests (a detectable
telemetry header, a specific proxy/NAT path for Actions-job traffic that differs from the same
machine's ordinary egress, a TLS/HTTP client fingerprint tied to how the Actions job invokes
Node vs. how an interactive shell does) rather than the physical network/IP itself. **Not
something any code change in this repo's own scripts can route around either way** — the one
thing this doesn't change is that running the pull as a GitHub Actions job, on any runner flavor,
is the one path proven not to work.

**The self-hosted Mac mini runner is no longer the "trusted" choice it was pinned as since the
start of this investigation** — not because its network is bad (it isn't), but because running
as a GitHub Actions job is itself now the common factor in every failure. Do not reach for
"switch back to self-hosted" as a fix.

**Real next step: run the pull somewhere that isn't a GitHub Actions job.** A scheduled Claude
Code Remote session is the one option already proven live — this environment supports
owner-configured secrets (`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` added via the environment's own
settings, not a GitHub Secret) and a cron-triggered session fires the identical pull code from
the exact caller this test already confirmed works. Set up 2026-11-09 as
`trig_013X4qsQhU8NPCE5aWqpA4yM`, daily 06:03 America/Chicago, `create_new_session_on_fire: true`.
The real tradeoff is depending on an AI-agent platform's uptime/cost model for a daily production
data pull rather than a traditional server — acceptable as the fast path while the real mechanism
stays unconfirmed. A dedicated VPS was considered too, but **since the evidence no longer points
at raw network/IP, there's no particular reason to expect a VPS succeeds any more than
`ubuntu-latest` did** — its own network wouldn't involve GitHub Actions' runner software either
way, so it might work, but that's a guess, not a measurement; don't reach for it as "the proper
fix" over the already-proven Claude-session path without testing it first.

**Filing the QSRSoft support ticket is still worth doing**, now with sharper evidence than the
original 2026-08-22 ask — the identity-hash proof that it's the same account, same credential,
succeeding and failing depending only on the caller. The honest framing for that ticket is
narrower than "block our IP": *"requests made through our CI/CD automation platform (GitHub
Actions) are denied with `AccessDeniedException`, while the identical credential succeeds from
both our own interactive browser session and a separate automated client — can you tell from your
own logs/WAF what's different about GitHub Actions traffic specifically?"* — not yet drafted as
an actual ticket.

---

# ✅ SECOND, INDEPENDENT ROOT CAUSE FOUND AND FIXED — 2026-11-09, same session as the above

**Everything above this line is about the GitHub-Actions-403 question, and it is still open** —
the mechanism behind why a GitHub Actions job (any runner flavor) gets `403` while a cloud
sandbox or a real browser gets `200` is still not isolated. Nothing below resolves that.

**But fixing the 403 would not, by itself, have produced a single real row either — because a
second, completely unrelated bug meant the pull had NEVER saved a row, even on its rare/local
200s, since the day it was written.**

## The bug

`src/engine/security-events.js`'s `isUsableRow(raw)` required `raw.event_token` to treat a row as
keyable, and `parseSecurityEventRow` read `eventToken: raw.event_token` straight off the raw row.
**A live-captured real `event_details` API response row never carries an `event_token` field at
all** — the event type is only known from which `event_token` value the *request itself* was
scoped to (`scripts/qsrsoft-security-events-pull.mjs`'s own loop variable,
`for (const eventToken of eventTokens)`), never echoed back per-row by the API. The call site
(line ~336) never even passed `eventToken` through to `parseSecurityEventRows(rows, { loc })` —
it was missing from the options object entirely.

**Net effect: 100% of rows were dropped as "unkeyable" on every single successful API call,
forever** — independent of, and hidden behind, the entire GitHub-Actions-403 investigation above.
Nobody had ever gotten a real `200` back from an automated/scriptable context before this
session's sandbox test succeeded (see the 40/40 measurement above) to notice `qsr_security_events`
was staying at zero rows for this second, unrelated reason too. The original dispatch #58 test
fixture (`src/__tests__/security-events.test.js`'s old `BASE_ROW`) had `event_token` baked in —
written and validated entirely against a guessed row shape, never a captured real response,
consistent with the #83 rebuild's own header comment that the live fetch path had "NEVER been run
against the real API from this workflow."

## The fix (PR #1765, merged to main `670c34d2`)

`eventToken` is now a **required caller-supplied option** on `parseSecurityEventRow`/
`parseSecurityEventRows`, threaded from the pull script's own request-scoped loop variable —
never read from the raw row, even if one happens to be present. `isUsableRow` no longer checks
for `raw.event_token`. Test fixtures rewritten to match the real API shape; new tests confirm a
stray `raw.event_token` is ignored and that one batch call tags every row with the same
caller-supplied token.

## Live-verified, twice

1. **Parsing fix, spot check**: a one-off script called `fetchOne` then the fixed
   `parseSecurityEventRows` against the real live endpoint — **66/66 rows parsed** (up from 0/66
   before the fix).
2. **Full production run, after merge**: ran `node scripts/qsrsoft-security-events-pull.mjs`
   directly (QSRSOFT_USERNAME/PASSWORD as inline env vars, never written to disk) — a 15-day
   backfill (2026-10-26 → 2026-11-09), 27 stores × 8 event tokens, 3,240 request units, 920s fetch
   phase. Result: **`113782 row(s) parsed, 113782 saved`, 27/27 stores had at least one row
   upserted.** Independently confirmed (not just trusting the script's own log) via a service-role
   REST count against `qsr_security_events`: `content-range: 0-0/113782` — exact match.

## What this means for the 403 investigation above

**Nothing above is now moot.** The GitHub-Actions-403 block is real and still unfixed — this
session's production run above succeeded because it ran from an interactive cloud session, not a
GitHub Actions job, same as the 40/40 sandbox test did. The scheduled Claude Code Remote session
(`trig_013X4qsQhU8NPCE5aWqpA4yM`) remains the one proven path to run this on a recurring schedule
without hitting the 403. What changes is the stakes of eventually resolving the 403: real data is
now flowing and being saved whenever the pull *can* run, so getting it running daily (via the
scheduled session, a VPS, or a resolved support ticket) is now worth doing — before this fix, a
403 fix alone would have produced zero rows anyway.
