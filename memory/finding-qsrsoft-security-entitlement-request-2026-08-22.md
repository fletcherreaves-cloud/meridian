---
name: finding-qsrsoft-security-entitlement-request-2026-08-22
description: ⚠️ RE-OPENED 2026-08-23. The 08-22 supersede concluded SOURCE-IP after a table that never contained the deciding cell. That cell now exists: our minted token, run from the owner's OWN Mac mini, 403s -- same machine and network where curl with the owner's browser token returns 200. Same network, different token, different answer. The variable looks like the TOKEN after all, so the original entitlement reading may be right. Read the 08-23 block first; send nothing until the one-variable probe has run.
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

## Next step

Send this to QSRSoft support (or whatever the account's usual support channel is) as an
entitlement request for the automation account, referencing the org id and route above. No further
code investigation in this repo will resolve it — see `memory/dispatch-63.md`'s resolution section
for the full measurement trail if support asks for more detail.
