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

### ⚠️ UPDATED 2026-08-22, after the owner answered

**The captured browser session is `email+password`, NOT the SSO login.** The owner has an SSO
login as well, but it is not what produced the 200s above. So the "two principals" hypothesis
below is **demoted, not eliminated** — same email, same method, most likely the same native
Cognito user.

**What still differs is the auth FLOW.** Amplify's `Auth.signIn` defaults to **`USER_SRP_AUTH`**;
`getFreshToken()` uses **`USER_PASSWORD_AUTH`** (`scripts/lib/qsrsoft-auth.mjs:81`). Same user,
same app client, different flow — and a pre-token-generation Lambda can see the flow. This is
precisely what Task 1 tests, since the Playwright path signs in through the real SPA and therefore
through SRP.

**New cheap discriminator, run it alongside Task 1 (nobody needed):** send **our** token to
`POST /security/video_provider/29760?orgId={org}` with body `{}` — the route the browser gets a
**200** from.

- **our token → 200 on `video_provider`** → our principal is fine on `api.security` generally, and
  the denial is scoped to `event_details` alone. That is a route-level entitlement.
- **our token → 403 on `video_provider`** → our principal is denied across the whole security
  module, and the difference is the principal or the flow, not the route. Much more likely to be
  fixed by Task 1.

This single call splits the remaining space in half and costs one request.

### The hypothesis this dispatch tests (demoted — see above)

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

---

## Resolution (2026-08-22) — SETTLED. Both tasks 403. QSRSoft entitlement request written up.

Ran via `workflow_dispatch` on `.github/workflows/qsrsoft-event-details-probe.yml` (run
`32580752698`, ~19s of probe time). Extended `scripts/qsrsoft-event-details-probe.mjs` rather than
writing a new script (same host/org/store setup as the existing empty-array probe).

### Task 2 (video_provider discriminator) — 403

```
SAME token vs POST /security/video_provider/29760 → status 403
{"Message":"User is not authorized to access this resource with an explicit deny in an
identity-based policy"}
```

Byte-identical to `event_details`'s own denial. **Our principal is denied across the whole
`api.security` module, not scoped to one route.** Rules out a route-level entitlement gap in
favor of an account-level one — exactly the reading the brief called "much more likely to be
fixed by Task 1," which then also came back negative (below).

### Task 1 (Playwright SRP-login retry) — 403, and the principal comparison closes the loop

The Playwright login succeeded, and a token **was** captured — not from `api.reports` (the app's
own navigation to the register-audit report page didn't carry one this run) but from six other
hosts hit during login/session bootstrap: `api.sso.myqsrsoft.com`, `accounts.home.myqsrsoft.com`,
`chat.home.myqsrsoft.com`, `onboarding.home.myqsrsoft.com`, `api.datapass.myqsrsoft.com`, and
(eventually) `api.reports.myqsrsoft.com`. Retrying `event_details` with that SRP-minted token:

```
SRP-minted token vs event_details → status 403
{"Message":"User is not authorized to access this resource with an explicit deny in an
identity-based policy"}
```

**Same denial, same message, via the SAME auth flow the real SPA itself uses.** The auth-flow
hypothesis (`USER_SRP_AUTH` vs `USER_PASSWORD_AUTH`) is eliminated.

**And the privacy-safe principal comparison — done automatically, without needing the owner —
confirms it's genuinely the same Cognito user, not two principals sharing an email:**

```
bare sub#9378eb7a6502 eID#9378eb7a6502 eID.len 36 valid_eID "false"
srp  sub#9378eb7a6502 eID#9378eb7a6502 eID.len 36 valid_eID "false"
same principal (sub hash equal): true
claim NAMES identical between the two tokens
```

The `sub` hash is identical between the bare `USER_PASSWORD_AUTH` token and the SRP token — same
principal, confirmed by measurement rather than inferred. So the earlier "same email, two
principals" hypothesis (already demoted after the owner confirmed email+password, not SSO) is now
fully closed: it was never two principals sharing an email. It's one principal, denied.

### Verdict

Every hypothesis this repo can test is eliminated:

| hypothesis | status |
|---|---|
| Bad/expired credential | ❌ eliminated (works on `api.reports`) |
| Wrong token type | ❌ eliminated (ID and access tokens fail identically) |
| Not an admin | ❌ eliminated (`orgAdmin` present) |
| Wrong Cognito app client | ❌ eliminated (identical client both sides) |
| "Send no token" | ❌ eliminated (that returns 401, not 403) |
| `valid_eID` gates access | ❌ eliminated (`"false"` on the token that succeeds) |
| Route-scoped entitlement (this route only) | ❌ eliminated — `video_provider`, a second route in the same module, is also denied |
| Auth-flow difference (`USER_SRP_AUTH` vs `USER_PASSWORD_AUTH`) | ❌ eliminated — same principal, same flow as the SPA, still denied |
| Two different Cognito principals sharing an email | ❌ eliminated — `sub` hashes are identical |

What's left is not code-shaped: **the automation account is a genuine principal, correctly
authenticated, explicitly denied the entire `api.security` module by an IAM policy.** No auth
path, token type, or flow available to this repo changes that. Per the dispatch's own instruction,
stopping here rather than widening scope or falling back to UI scraping.

**Wrote up the request**: `memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md` —
org id, the exact denied routes, the IAM message, and the full elimination table, with no token
value, `sub`, `eID`, or email anywhere in it (only sha256 prefixes and claim-name lists, per the
standing privacy bar this dispatch set for itself).

### Not done, per the brief's own explicit scope

- **The pull was not written**, 403 either way. Even had Task 1 returned 200, dispatch-58's
  empty-`registers`/`cashiers` question would still be open and undecided — this dispatch never
  reached that fork.
- No retries, no widened scope, no scraping fallback.

### For whoever picks this up next

Everything above lives on `claude/project-orientation-clarify-x61o5r`, already the head of open PR
**#553** — read that PR (or this file, or `dispatch-58.md`'s own evidence section) directly rather
than working from a condensed summary; the eliminated-hypotheses tables are the part that save the
most time and are easy to accidentally re-litigate from a paraphrase. If PR #553 hasn't merged to
`main` yet by the time you start, either wait for it or cherry-pick this branch's commits — don't
redo the measurement work it already contains.

---

## 🔴 CORRECTION (2026-08-22, same day) — the conclusion above is WRONG. It is the SOURCE IP.

**Do not send the QSRSoft entitlement request drafted above.** Its premise is false.

### What the section above got wrong

It concluded "the automation account is a genuine principal, correctly authenticated and
explicitly denied the `api.security` module," and eliminated "two principals sharing an email" on
this evidence:

```
bare sub#9378eb7a6502   ← our USER_PASSWORD_AUTH token
srp  sub#9378eb7a6502   ← our Playwright SRP token
same principal (sub hash equal): true
```

**Both rows are our own credentials.** That comparison proves the two *auth flows* resolve to one
principal — a real result, and it does kill the auth-flow hypothesis. It says nothing about the
principal that actually succeeds, which is the owner's browser. That row was never captured.

### The measurement that settles it

| # | who | from | result |
|---|---|---|---|
| 1 | owner's browser token, `sub#9378eb7a6502` | browser, owner's network | **200** |
| 2 | our minted token, `sub#9378eb7a6502` | GitHub Actions | **403** |
| 3 | our Playwright SRP token, real Chromium, real SPA login | GitHub Actions | **403** |
| 4 | **the same request via `curl`, no browser** | **owner's network** | **200 + full data** |

The owner ran DevTools **Copy as cURL** in a terminal: **200, real rows.** Same token, same body,
no browser involved.

Row 4 against row 3 is decisive. Row 3 already controlled for browser-ness, User-Agent, the SPA
login flow, and the app client — a real Chromium doing a real login — and still failed. Row 4
removes the browser entirely and **succeeds**. And the owner's `sub` hash is `9378eb7a6502`,
**identical to ours** — so it is one principal, allowed and denied at the same time depending only
on **where the request originates**.

**`api.security` restricts by source IP. Cloud/datacenter runner IPs are denied.** Corroborated by
`api.reports` working fine from Actions all day (the Register Audit pull succeeded at 11:23 UTC on
the same runners), so this is specific to the security module — reasonable for a module whose
routes include `video_provider` (surveillance integration).

### ❌ Also now eliminated

9. **Account/entitlement.** One `sub`, allowed from one network and denied from another. There is
   no automation account to grant anything to; asking QSRSoft to entitle a principal that already
   has access would be bounced, correctly.

### What the pull actually needs

Not an entitlement — a **permitted network origin**. Options, roughly in order:

1. **Self-hosted GitHub Actions runner on a static IP**, with that IP allowlisted by QSRSoft.
2. **An egress proxy on a fixed IP** that only these `api.security` calls route through; the
   workflow stays on hosted runners.
3. Allowlisting GitHub's hosted ranges — **impractical**; they are large, Azure-owned and rotate.

⚠️ **Confirm the mechanism before requesting anything.** "Denied from a cloud IP" is inferred from
four measurements, not from QSRSoft telling us the rule. Ask them what the restriction actually
is — IP allowlist, geo, ASN, or something else — before anyone buys a VPS. The `x-amzn-requestid`
values from a 403 run will let them find the denial in their own logs.

### ⚠️ PII note

The successful `curl` response carries **plaintext employee names** (`"crew":"Aaden W — 91"`,
`"mgr":"Kristina O — 100"`). This is exactly why `schema-qsr-security-events.sql` stores
`crew_token`/`mgr_token` via `get_or_create_employee_token()` and never a name. That capture now
exists in a session transcript and cannot be retracted; it must not be copied into a fixture, a
test, or a memory file. The badge filter works as expected — `cashiers:[91,0]` returned badge 91.
