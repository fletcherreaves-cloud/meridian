---
name: finding-qsrsoft-security-entitlement-request-2026-08-22
description: ✅ RESOLVED (diagnosis) 2026-11-09 -- the token-injection test this file called for finally ran. Identity hash is byte-identical across three independently-tested networks (cloud sandbox, GitHub-hosted ubuntu-latest, the self-hosted Mac mini) -- same account, same credential, same code -- yet only the cloud sandbox gets 200; both GitHub Actions paths get 403 AccessDeniedException. This is a network-origin block covering GitHub Actions' infrastructure broadly, not an entitlement gap, not account-specific, and not Mac-mini-specific (the Mac mini, historically the only place that worked, is now itself blocked too). Read the 2026-11-09 section at the bottom first. Not yet fixed -- the pull needs to run from a network GitHub Actions doesn't cover.
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

**Conclusion, now proven across three networks, not inferred:** this was never an entitlement gap,
an auth-flow difference, a CORS/fingerprint artifact, or a Referer bug (all four were real things
this investigation found and fixed along the way, and all four were real but **none of them was
the gate**). It is a **network-origin block on `api.security.myqsrsoft.com` that covers GitHub
Actions' infrastructure broadly** — both a residential/office network (the Mac mini, historically
the ONLY place that ever worked, now itself blocked) and GitHub's own hosted datacenter IP ranges
— while at least one other cloud network (the Claude Code Remote sandbox this test ran from) is
not on whatever blocklist this is. The most likely mechanism, consistent with every observation:
an AWS WAF / API Gateway resource policy on this one security-sensitive module that denies known
cloud/datacenter ASNs, or an anomaly-detection rule that flagged the Mac mini's IP specifically
after months of this pull's own repeated `403`s — either way, **not something any code change in
this repo can route around**, same as this file's original conclusion back in August, just now
with the actual mechanism narrowed instead of guessed at.

**This also means the Mac mini self-hosted runner — the pin every probe and the production pull
have carried since the beginning of this investigation on the theory that it was the only place
that worked — is no longer special.** Whatever blocked it is the same thing blocking GitHub's own
runners. Do not reach for "switch back to self-hosted" as a fix; that network is itself now denied.

**Real next step: run the pull from a network that isn't GitHub Actions.** Two live options,
neither yet shipped:
- **A scheduled Claude Code Remote session** — this environment supports owner-configured secrets
  (`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` added via the environment's own settings, not a GitHub
  Secret) and a cron-triggered session fires on the same network this test already proved works.
  Fastest to stand up, no new infrastructure — the real tradeoff is depending on an AI-agent
  platform's uptime/cost model for a daily production data pull, not a traditional server.
- **A small dedicated VPS** with its own static IP, running the pull on a plain cron job —
  conventional, disposable/swappable if its IP gets blocked too. **Not guaranteed to dodge the
  same block**: most VPS providers (DigitalOcean, AWS Lightsail, etc.) sit on well-known
  datacenter ASN ranges that a cloud/datacenter blocklist would likely also catch — this has NOT
  been tested, so don't assume it succeeds where `ubuntu-latest` failed just because it isn't
  GitHub-branded infrastructure.

**Filing the QSRSoft support ticket is still worth doing, now with much sharper evidence** than
the original 2026-08-22 ask: the identity-hash proof that it's the same account succeeding and
failing depending only on network, across three independently-tested networks. If this is a
blanket cloud/datacenter-ASN block, QSRSoft support may be able to allowlist a specific static IP
(whichever network ends up hosting the pull) in minutes — which would make either workaround above
unnecessary long-term.
