# Dispatch #63 — settle the `event_details` 403: same email, possibly two principals

**Status:** ready to start. **Task 1 needs nothing from the owner** and may resolve this outright.
**Context:** `memory/dispatch-58.md`'s "403 narrowed by measurement" section. Read it first.

---

## Where this stands

Every structural variable has been controlled by measurement. The browser's **successful**
`event_details` call and our **403** probe are identical on:

| | browser (200) | our probe (403) |
|---|---|---|
| URL `/security/event_details/v1/{org}/29760?orgId={org}` | ✅ | identical |
| method `POST`, body `{event_token,start_date,end_date,registers,time_slices,cashiers,mgr_code}` | ✅ | identical |
| credential carried in `x-auth-token`, **no cookies** (`credentials:"omit"`) | ✅ | identical |
| Cognito app client | `2vt4qrqcakbeo9sh0ivli3lbui` | **same** (`scripts/lib/qsrsoft-auth.mjs:43`) |
| `permissionsAccess` | `["org-a546d4ef-…"]` | **same** |
| `orgAdmin` | `["org-a546d4ef-…"]` | **same** |
| `valid_eID` | `"false"` — **and still returns 200** | unknown |

Sending **no** credential returns **401**; ours returns **403** with an IAM explicit-deny body. So
the route reads the token, ours is a valid credential, and it is refused at the **authorization**
layer — not authentication, not request shape, not the app client, and not the claims we can see.

### The hypothesis this dispatch tests

**Same email, two different Cognito principals.** `QSRSOFT_USERNAME` is the owner's own address,
but the owner also has **an SSO login**. A federated/SSO user is a *distinct* Cognito user from a
native username+password user: different `sub`, potentially different `eID`, and therefore
different server-side entitlements — while every claim we compared stays structurally identical,
which is exactly what we observe.

If the browser session captured above is the SSO identity, then `USER_PASSWORD_AUTH` is
authenticating **a different principal that happens to share an email address**, and that is the
entire bug.

## Task 1 — retry with a Playwright-captured token (DO THIS FIRST, needs no one)

`scripts/qsrsoft-register-audit-pull.mjs` already logs in through the real SPA with Playwright and
captures the token the SPA itself mints (`[auth] ✓ token captured (1475 chars)`). The probe does
**not** use that — it uses `getFreshToken()`, a bare Cognito `USER_PASSWORD_AUTH` call.

**Reuse the existing Playwright capture and retry `event_details` with that token.**

- **200** → done. The fix is "use the auth path we already have," the pull is unblocked, and no
  QSRSoft-side change is needed. Write the pull.
- **403** → the SPA-login-as-`QSRSOFT_USERNAME` principal is *also* denied, which strongly implies
  the owner's working browser session is a **different identity** (the SSO one). Then it is an
  entitlement question, not a code question — go to Task 3.

This runs in **GitHub Actions**, where the pull scripts already have working QSRSoft egress.
⚠️ **This sandbox cannot reach QSRSoft at all** (`CONNECT tunnel failed, response 403`; the egress
allowlist is `*.supabase.co` only). Do not try to reproduce locally.

## Task 2 — is it the same principal? (a privacy-safe comparison)

Do **not** print, log, or commit `sub`, `eID`, `email`, or `cognito:username`. Compare **hashes**:

```js
// print for OUR minted token, inside the probe
const h = v => require('crypto').createHash('sha256').update(String(v)).digest('hex').slice(0, 12);
console.log('sub#', h(claims.sub), 'eID#', h(claims.eID), 'eID.len', String(claims.eID||'').length,
            'valid_eID', JSON.stringify(claims.valid_eID));
console.log('allClaimNames', Object.keys(claims).sort().join(', '));
```

`describeToken()` already computes `allClaimNames` and never prints it — surface it. The owner runs
the same hash in the browser console against their token; equal hashes mean the same principal.

**Owner's token, for reference (measured 2026-08-22):**
`aud, auth_time, cognito:username, custom:authorName, eID, email, email_verified, event_id, exp,
iat, iss, jti, lastOrgId, orgAdmin, origin_jti, permissionsAccess, sub, token_use, valid_eID`
— `valid_eID: "false"`, `eID` is 36 chars (a UUID).

A claim present in the owner's list and **absent** from ours is a finding on its own.

## Task 3 — only if Tasks 1–2 say the principal differs

Then the automation identity lacks the security-module entitlement and **nothing in this repo fixes
it.** Write up what to ask QSRSoft for — org id, the account, the exact route, the IAM deny message
— and stop. Do not add retries, do not widen scope, do not fall back to scraping the UI.

## ❌ Eliminated — do not re-test (full detail in dispatch-58.md)

1. Bad/expired credential — same token gets 200 from `api.reports/data_layer/v1/service/statistics`.
2. Wrong token type — ID and access tokens fail byte-identically.
3. Not an admin — `orgAdmin` present.
4. Host/account rejected outright — `POST /security/video_provider/29760` returns **200**.
5. "Send no token," the `regAudit` fix — **false here**: no token returns **401**.
6. Cookies / browser session — `credentials:"omit"` on both captures.
7. Different Cognito app client — **identical**, `2vt4qrqcakbeo9sh0ivli3lbui` both sides.
8. `valid_eID` gates access — it is `"false"` on the token that **succeeds**.

## Method traps already paid for

- **JWT prefix comparison proves nothing.** `eyJraWQiOi` is base64 for `{"kid":"` and opens every
  Cognito JWT. Compare trailing signature characters, or hashes.
- **"Provisional headers are shown"** means DevTools never captured the real request headers. Use
  right-click → **Copy as fetch**.
- **Confirm which request you copied.** A capture first read as `event_details` was
  `video_provider` — tell them apart by the body: `{}` vs the real event parameters.

## Verification bar

- Report the **actual HTTP status** from Task 1, with the response body's first ~200 chars.
- No token value, `sub`, `eID`, or email in any log, commit, test fixture, or memory file. Hashes
  and lengths only.
- If Task 1 returns 200, the pull still does **not** get written in this dispatch — dispatch-58's
  empty-`registers`/`cashiers` question is still open and decides whether the pull is
  27 stores × 8 tokens or something much larger. Answer that first.
