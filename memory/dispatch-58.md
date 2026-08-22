---
name: dispatch-58
description: Dispatch #58 - dispatch #56 Part E, event-level controls detail. Pull event_details for the 8 enumerated event_tokens into a new qsr_security_events table and surface register + time of event on a security finding. Every prior blocker is settled - endpoint, token-only auth, storeRef, and the token vocabulary. Deliberately excludes the registerType and meal-signal gaps, which change audit_rows' grain and are dispatch #59.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #58 — Part E: register worked and time of event

**Owner ask (dispatch #56):** *"Any other key info such as drawer (register) worked and time of
event."*

Today `audit_rows` is a **daily per-employee aggregate** — PK `(loc, date, emp)`, no register, no
timestamp. A finding can say "12 refunds that day" and nothing more. This dispatch turns each of
those counts into **timed, register-attributed rows**.

## Everything that used to block this is settled

| was unknown | now |
|---|---|
| `event_token` vocabulary | ✅ **8 tokens, 5 families** (below) |
| auth | ✅ **token-only** — no cookies, no Playwright, plain Node `fetch` |
| the path's `storeRef` | ✅ **the unpadded NSN**, confirmed at 29760, 10915, 33109 |
| endpoint + response schema | ✅ `finding-qsrsoft-event-details-endpoint-2026-08-21.md` |

```
POST https://api.security.myqsrsoft.com/security/event_details/v1/{orgId}/{storeRef}?orgId={orgId}
x-auth-token: <token>   Origin: https://v3.myqsrsoft.com
Referer: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit

{"event_token":"<token>","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD",
 "registers":[13],"time_slices":[],"cashiers":[21,0],"mgr_code":null}
```

**The 8 tokens:** `all_promo` · `t_red_before` · `t_red_after` · `cash_refund` ·
`cashless_refund` · `employee_meal` · `manager_meal` · `pos_overring`. Global, not per-store.

## 🔴 SETTLE THIS FIRST — it decides whether the pull is cheap or infeasible

**Every captured body carries populated `registers` and `cashiers` arrays**, because each capture
came from clicking one cell in a drill-down. **Nobody has tested what an empty array does.**

- If `"registers":[]` and `"cashiers":[]` mean **"all"**, the pull is 27 stores × 8 tokens =
  **216 calls per day**. Chunky but routine, and a date range may cover several days per call.
- If they are **required filters**, you must first enumerate every register and every cashier per
  store per day — which multiplies the call count by orders of magnitude and probably makes a
  daily estate-wide pull impractical.

**Test this with one request before writing any pull logic.** It is the difference between a
straightforward stream and a redesign, and it is a five-minute check. Note `time_slices:[]` is
already empty in every capture and evidently means "no time filter", which is weak evidence for the
"empty = all" reading — **weak evidence, not the answer.**

## 🔴 PROBE RESULT 2026-08-22 — 403 on BOTH calls. The pull is blocked on AUTH, not on the array question.

The empty-array probe ran (workflow_dispatch, ~9s) and **never got to compare row counts**:

```
[probe] populated → status 403   {"Message":"User is not authorized to access this resource
[probe] empty     → status 403      with an explicit deny in an identity-based policy"}
```

**Read the message precisely — this is NOT "invalid token".** *"Explicit deny in an identity-based
policy"* is AWS IAM language for: the credential **was accepted and resolved to a principal**, and
that principal is denied this resource. Authentication succeeded; authorization failed. Compare the
earlier manual `dt-timer` curl, which returned the literal string `Invalid token` — a different
failure entirely.

**Two facts that frame it:**

1. **Nothing in this repo has ever successfully called `api.security.myqsrsoft.com`.** `grep` for
   that host returns only the probe. Every working pull targets `api.reports.myqsrsoft.com`. So the
   security host's auth has never actually been exercised from a server — the "token-only, no
   cookie" finding was read off a *browser* request-header panel, which establishes what the browser
   sent, **not that our credential is accepted there**.
2. **`getFreshToken()` mints a Cognito ID token for `QSRSOFT_USERNAME`** via `USER_PASSWORD_AUTH`
   (`scripts/lib/qsrsoft-auth.mjs`, #312).

### The two candidate causes — and the cheap test that separates them

**(a) The security host wants a DIFFERENT token.** A separate authorizer/audience from the reports
host, so the Cognito ID token that works for `api.reports` resolves to a principal with no
entitlement here.

**(b) `QSRSOFT_USERNAME` lacks the security-module entitlement** that the owner's interactive login
has — a QSRSoft permissions question, not a code one.

**Decisive test, ~30 seconds, no token leaves the browser:** in one DevTools session on the Register
Audit page, compare the **first ~10 characters** of the `x-auth-token` header on a request to
`api.security.myqsrsoft.com` versus one to `api.reports.myqsrsoft.com`.

- **Different values → cause (a).** The security host issues/expects its own token, and the next
  question is how the SPA obtains it. Design the pull around that, not around `getFreshToken()`.
- **Same value → cause (b).** Our credential is the same one the browser uses, so the difference is
  the *account*. Then it is a QSRSoft entitlement request for the automation user, and no amount of
  code changes it.

⚠️ **Do not write the pull script until this is settled.** Both causes lead to materially different
designs, and one of them cannot be solved in this repo at all.

**The empty-array question remains genuinely open** — the probe was built correctly and will answer
it the moment auth works. Re-run it unchanged once the credential is sorted.

## The response — what to store

Confirmed fields (38-row sample, one store/date/register/cashier):

| field | note |
|---|---|
| `event_dt` / `event_tm` | 🎯 **the time of event** — the owner's ask |
| `reg_num` (`POS0013`) | 🎯 **the register worked** — the owner's ask |
| `event_name` / `event_display` | event subtype (`Mobile Promo`, `Other Promo`) |
| `event_amt` | the amount |
| `tender_type` | `Cash` / `Cashless` / `no tender` |
| `daypart_name` | free daypart attribution |
| `store_busn_dt` | business date — presumably the 4am ABC boundary; **confirm** |
| `order_key` | joins to `transaction_detail` for full itemisation |
| `pos_session_start_dt` / `_tm` | |
| `crew` · `mgr` · `mgr_code` | 🔴 **PII — see below** |
| `remaining_amt` | ⚠️ **semantics unknown — do not build on it** |

## 🔴 PII — `crew` and `mgr` are plaintext names

Non-negotiable, same as every other stream:

- **Route names through `get_or_create_employee_token()` on ingest.** `security_findings` subjects
  stay `emp_token`/`wrin`; this table's subject column does too.
- **Never persist a plaintext name**, never log one, never put one in a fixture.
- A name reaches the UI only via the logged `reveal_employee_identity()` path.
- ⚠️ **The badge number is a NEW identifier and is not `geid`.** `crew` is `"Name - 91"` and the
  request filters `cashiers:[91,0]`, so badge ↔ name is available here. Badges are two digits and
  sit nowhere near the `geid` length bands, so **badge and geid are separate namespaces** — do not
  key on badge as if it were the person id, and do not merge them without checking.

## ⚠️ Two open questions to settle during the build, not after

1. **`remaining_amt`** — unknown. Store it, surface nothing computed from it.
2. **`order_key`'s register prefix does not match `reg_num`.** Rows show `order_key` `POS0012:…`
   while `reg_num` is `POS0013`. For a *Mobile* promo, an order originating elsewhere and being
   fulfilled at POS0013 is a plausible reading — **plausible, not established.** It matters because
   joining to `transaction_detail` on the wrong register silently mis-attributes. Settle it before
   any join ships.

## 🔴 What Part E CANNOT deliver — and the panel must say so

**Cash over/short has no drill-down.** Measured: the column exists on the Register Audit report and
is not clickable. The likely reason is structural — over/short is a **computed variance**, not a
discrete event, so there is nothing to enumerate.

**So the single biggest controls metric gets no event detail.** It stays a daily aggregate in
`audit_rows`. **State this explicitly in the UI** wherever event detail is offered. On a
loss-prevention screen, absence of detail must not be allowed to read as absence of a problem —
that is the dangerous direction to be wrong in.

Likewise **discount is not a column on this report at all** (distinct from promo). If discount
detail is wanted, check the catalog — it is a different report, not a missing feature here.

## Delivery

**New table `qsr_security_events`** — grain is one row per event.

🔴 **RLS must mirror `security_findings`, NOT the ordinary `accessible_locs` pattern.** An earlier
draft of this dispatch said `accessible_locs` "like every other stream". **That is wrong for this
table**, and getting it wrong would make per-event controls activity readable by roles that cannot
see the findings those events belong to — a strictly worse leak than the findings themselves, since
these rows carry time, register and (pre-tokenisation) crew attribution.

Copy `schema-security-findings.sql:79-91`:

```sql
create policy "qsr_security_events: gated read" on public.qsr_security_events
  for select using (
    tenant_id = '…'::uuid
    and (
      get_my_role() in ('admin', 'supervisor')
      or (get_my_role() = 'manager'
          and coalesce((select (data->>'enabled')::boolean
                        from public.org_config
                        where key = 'gm_identity_reveal_enabled'), false))
    )
  );
```

**And no insert/update/delete policy at all** — writes come from the pull script's service-role key,
which bypasses RLS regardless. Same "writes are backend-only" pattern as `security_findings` and
`identity_reveal_log`.

⚠️ Note the ordinary QSRSoft data tables (`qsr_product_mix`, `qsr_forms_completion`) use a plain
tenant-only policy. **Both patterns exist in this repo and the choice is deliberate** — data volume
tables get tenant scoping, anything person-attributable gets the role gate. This table is the
second kind. Key on something stable across re-pulls; `order_key` +
`event_dt`/`event_tm` + `event_token` is the candidate, but **verify uniqueness against real data**
rather than assuming.

**New pull script + workflow**, and the full standing checklist in the same PR:

1. **Watch it** — add the workflow's exact `name:` to `sync-failure-watch.yml`.
2. **Per-stream freshness**, not pooled — reuse `stream-freshness.js` as the forms panel does.
3. **`tenant_id` + the role-gated RLS above** — not the tenant-only policy.
4. **Manual fallback** — there is no sensible manual upload for per-event controls data. Document
   the decision explicitly rather than silently omitting it, as Slice 3 did.
5. **Two-path auth** — direct token primary (`getFreshToken()` from `scripts/lib/qsrsoft-auth.mjs`,
   the #312 module), Playwright fallback. ⚠️ **Do not model this on
   `scripts/qsrsoft-forms-pull.mjs`** — that one predates #312 and browser-scrapes. Model it on
   `qsrsoft-ops-pull.mjs`.

**Panel:** on a flagged finding, show the subject's matching events — time, register, daypart,
amount, tender. Reuse the `SubjectDetail` surface Part D already built; do not create a parallel one.

## Explicitly NOT in this dispatch

- **`registerType=cashier` is hardcoded** in `qsrsoft-register-audit-pull.mjs:295`, so `audit_rows`
  holds one third of the report — Manager and Preparer are uncollected. Owner wants them.
  **Dispatch #59.** It changes `audit_rows`' grain, which touches the PK, the security rules'
  subject grouping and existing per-employee aggregates. Not a rider on this.
- **`employee_meal` / `manager_meal` as new signals.** Their event detail arrives here for free
  (they are two of the eight tokens), but neither appears in `audit_rows`' metric set, so no rule
  can currently fire on them. Building those rules is #59 territory too.

## Verification bar

- **Revert-sensitive at the call site.** A test that only exercises a parser would pass with the
  panel wiring deleted. Render through the actual finding surface.
- **Fixtures synthetic** — no real names, badges, order keys or amounts.
- Cover: all 8 tokens round-tripping; the tokenisation path (assert no plaintext name reaches the
  table); `storeRef` conversion from padded `loc`; and the honest-null case where a subject has no
  events.
- `npm run build` clean; the panel lazy so the entry chunk does not move.
