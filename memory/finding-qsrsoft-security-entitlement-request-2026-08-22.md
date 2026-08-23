---
name: finding-qsrsoft-security-entitlement-request-2026-08-22
description: SUPERSEDED 2026-08-22. The api.security 403 is a SOURCE-IP restriction, not an entitlement gap -- one Cognito principal, allowed from the owner's network and denied from GitHub Actions. Do not send the entitlement request below; see the correction at the top.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# QSRSoft entitlement request — `api.security` module, automation account

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
