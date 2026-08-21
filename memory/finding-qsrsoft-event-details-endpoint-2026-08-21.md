---
name: finding-qsrsoft-event-details-endpoint-2026-08-21
description: Owner-captured QSRSoft security event_details endpoint - event-level controls data with time, register, cashier name+badge, manager, daypart and tender. This is the source for dispatch #56 Part E (register worked / time of event) and it is richer and better-shaped for that ask than the previously-captured transaction_detail. Includes the confirmed response schema and the open questions a pull must settle first.
metadata:
  node_type: memory
  type: finding
---

# `event_details` — the event-level controls endpoint (owner capture, 2026-08-21)

**Why this matters:** `audit_rows` is a **daily per-employee aggregate** (PK `(loc, date, emp)`) with
no register and no timestamp. Dispatch #56 Part E was scoped around `transaction_detail`
(`dispatch-34-phase0a-findings.md:145`), which returns one order's full itemisation. **This endpoint
is a better fit for the actual ask** — it returns a *list of events* already carrying time, register,
cashier and manager, which is precisely "drawer worked and time of event."

The two are complementary, not competing: **`event_details` is the list; `transaction_detail` is the
drill-in** on a single `order_key` from it.

## The request

```
POST https://api.security.myqsrsoft.com/security/event_details/v1/{orgId}/{storeRef}?orgId={orgId}
Content-Type: application/json
x-auth-token: <token>
Origin:  https://v3.myqsrsoft.com
Referer: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit

{"event_token":"all_promo","start_date":"2026-08-14","end_date":"2026-08-14",
 "registers":[13],"time_slices":[],"cashiers":[91,0],"mgr_code":null}
```

- `orgId` = `a546d4ef-684a-4f25-8bc0-6580af068875` — same org id already recorded for
  `transaction_detail`, so it is stable across the security API.
- **It is a POST with a JSON body**, unlike the DAR's GET-with-query-params. Note the org id appears
  **both** in the path and as a query param.
- Referer is the **Register Audit** report — this is the drill-in behind the panel Meridian already
  pulls daily as `audit_rows`. So this is the event-level layer *under* a stream we already have.

## The response — confirmed fields (38 rows, one store/date/register/cashier)

| field | example | note |
|---|---|---|
| `event_dt` / `event_tm` | `2026-08-14` / `23:44:07` | **the time of event** — the owner's ask |
| `reg_num` | `POS0013` | **the register worked** — the owner's ask |
| `crew` | `Aaden W - 91` | **cashier name + badge**, one string |
| `mgr` | `Kristina O - 100` / `Unavailable` | **manager attached to the event** |
| `mgr_code` | `true` / `Unknown` | present only where `mgr` is named, in this sample |
| `daypart_name` | `Dinner`, `Evening` | daypart, free |
| `tender_type` | `Cash` / `Cashless` / `no tender` | |
| `event_name` / `event_display` | `Mobile Promo`, `Other Promo` | event subtype |
| `event_amt` | `3.89` | the promo/discount amount |
| `remaining_amt` | `5.21` | **semantics unconfirmed** — do not assume |
| `order_key` | `POS0012:118844703` | joins to `transaction_detail` |
| `pos_session_start_dt` / `_tm` | | also a `transaction_detail` parameter |
| `store_busn_dt` | `2026-08-14` | **business date** — 4am ABC boundary, presumably |

## ⚠️ Open questions a pull MUST settle before it is designed

1. **`event_token` is the whole game.** The capture uses `"all_promo"`. **Enumerate the other
   values** — refunds, voids, over-rings, T-Reds before/after, cash over/short. Every metric
   `audit_rows` carries as a daily count almost certainly has an event token behind it, and that is
   the difference between "12 refunds that day" and twelve rows with times, registers and names.
   This is the single highest-value unknown here.
2. **~~What is `29760` in the path?~~ ✅ RESOLVED 2026-08-21 — it IS the unpadded NSN. Store
   `29760` = Duncan-Hwy 81 (`src/constants.js:294`), and it appears in the QSRSoft Forms
   `locations` list alongside the other 26 NSNs (`finding-qsrsoft-forms-completion-endpoint-2026-08-21.md`).**
   My earlier "not the NSN, a QSRSoft internal store id presumably" was simply wrong — I asserted it
   without checking `STORE_NAMES`, which answers it in one `grep`. **No `loc → storeRef` mapping
   needs discovering:** `storeRef` is `String(Number(loc))`, the same unpadded-NSN conversion the DAR
   pull already performs. Reuse it; do not write a second one.
3. **~~Auth shape.~~ ✅ RESOLVED 2026-08-21 — token-only, NO session cookies. This host is not
   the DAR host.** The owner supplied the DevTools **request-header panel** for the live call, which
   shows what the browser actually sent: an alphabetical list running `Accept` → `User-Agent` with
   **no `Cookie` header** (it would sort between `Content-Type` and `Host`; `Host` follows
   `Content-Type` directly). `x-auth-token` sorts after `User-Agent` and is below the fold.

   This matters more than it looks. `api.reports.myqsrsoft.com` (the DAR host) **rejects a
   server-side fetch carrying only a token** and forces the Playwright `page.evaluate()` workaround
   — the reason those pull scripts are slow and fragile (`project-qsrsoft-daily-activity.md`).
   `api.security.myqsrsoft.com` apparently does not: a plain Node `fetch` with `x-auth-token`
   should work, so **the Part E pull is substantially simpler than it was scoped as.** Confirm on
   the first real call rather than treating this as settled beyond doubt — but design for token-only
   and treat a Playwright fallback as the contingency, not the default.

   **Method note worth keeping:** my earlier reading of the same call said the missing cookie was
   *"suggestive but not proof, since a browser attaches cookies invisibly."* That was right about
   the **curl** transcript and wrong about the **DevTools request-header panel** — the panel reports
   what was actually transmitted, invisible attachments included. Two different artifacts, two
   different evidentiary weights.
4. **`remaining_amt`** — unknown. Do not build anything on it until someone confirms what it means.
5. **`order_key`'s register prefix does not match `reg_num`.** Rows show `order_key`
   `POS0012:…`/`POS0014:…`/`POS0015:…` while `reg_num` is `POS0013` throughout. For a *Mobile* promo
   an order originating elsewhere and being fulfilled at POS0013 is a plausible reading — **but that
   is a hypothesis, not a finding.** It matters because joining `event_details` to
   `transaction_detail` on the wrong register would silently mis-attribute. Settle it.

## 🆕 Its parent report: `regAudit` — and a possible correction to the DAR-host auth rule

Owner capture, 2026-08-21, of the **Register Audit report itself** — the screen `event_details`
drills down from, and the source behind Meridian's `audit_rows`.

```
GET https://api.reports.myqsrsoft.com/reports/mcd/controlsCash/regAudit
    ?nsn=3708&orgId=a546d4ef-…&enterpriseName=McDonalds
    &startDate=2026-08-12&endDate=2026-08-18&dsd=d&nsd=d&weekStart=3
    &resultType=byDateEmployee        <- enumerable
    &registerType=cashier             <- enumerable
Referer: https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit
```

**Two more enumerable knobs, in the same spirit as `event_token`.** `resultType=byDateEmployee`
plainly implies siblings (`byDate`, `byEmployee`, `byRegister`?) and `registerType=cashier` implies
at least a manager variant. **`byRegister` — if it exists — could answer Part E's "which drawer"
without the `event_details` drill-down at all.** Cheap to enumerate: change the value in the URL and
re-run the report.

### 🔴 No `Cookie` header — on the DAR host

The request-header panel lists `Accept-Language` → `Origin` adjacent, and `Cookie` sorts between
them. **It is absent.** Only `x-auth-token` (below the fold), plus `Origin` and `Referer`.

**This sits uneasily with an established rule.** `CLAUDE.md` and
`project-qsrsoft-daily-activity.md` state that `api.reports.myqsrsoft.com` *"requires browser
session cookies — server-side Node.js fetch with token alone returns 401"*, which is why both pull
scripts carry the slow, fragile Playwright path.

⚠️ **Do NOT record the DAR rule as refuted — this is a hypothesis and it has not been tested.**
Note there are at least **three different path families on this one host**:

| path family | example | our auth belief |
|---|---|---|
| `/data_layer/v1/service/…` | `dt-timer`, `mobile`, `statistics` | Playwright (assumed, inherited) |
| `/reporting/v2/people/…` | `employee-roster`, `time-punches-matched` | untested |
| `/reports/mcd/…` | **`regAudit` (this capture)** | **browser sent no cookie** |

So the Playwright requirement may be **path-specific**, or the original 401 may have had a different
cause. **The most interesting candidate: the DAR fetch may have been missing `Origin`/`Referer`,
not a cookie.** Both are present here, both are trivial to set in a Node `fetch`, and a server that
rejects a request lacking them would produce exactly the observed 401 — which would have looked like
"needs a session".

**If that is right, the DAR pulls could drop Playwright entirely** — faster, less fragile, and it
would retire the "LifeLenz Playwright fallback is itself unreliable, so a token expiry is a full
outage" problem noted in the standing rules.

**The measurement that settles it, in one command:** a server-side `fetch` to any DAR endpoint with
`x-auth-token` **plus** `Origin: https://v3.myqsrsoft.com` and the matching `Referer`. If it returns
data, the cookie rule was wrong and the Playwright path is removable. If it 401s, the rule stands and
this note should say so. **Not runnable from the Claude Code sandbox** (no `QSRSOFT_TOKEN`, and the
host is egress-blocked), so it needs the owner or a GitHub Action.

## ⚠️ Do not read a pattern into this sample

The request filters `cashiers:[91,0]` and `registers:[13]`. **Every row being one cashier on one
register is a property of the query, not a discovery.** Likewise, `mgr: "Unavailable"` on 37 of 38
rows is interesting — promos clearing without manager attribution is exactly the kind of thing a
controls rule would want — but it is *one filtered day at one store*, and the estate baseline is
unknown. It is a question to measure, not a finding to report.

## ⚠️ PII — this endpoint returns plaintext names and badge numbers

`crew` and `mgr` are real people. Everything the identity-vault rules already require applies
unchanged:

- **`security_findings` subjects stay `emp_token`/`wrin`.** Never persist a plaintext name from this
  endpoint into a findings row.
- Route names through `get_or_create_employee_token()` on ingest, exactly as the Register Audit pull
  does.
- **Never log a name, badge, token, or `x-auth-token` value** — key names and shapes only.
- A name reaches the UI only via the logged `reveal_employee_identity()` path.

**The badge number is new and worth deciding about deliberately.** `crew` is `"Name - 91"` and the
request filters `cashiers:[91,…]`, so badge ↔ name is available here. A badge is a stable
per-person identifier — potentially a better vault key than a name, and possibly the same identifier
as dispatch #51's `emp_id`. **Check whether `empID` and the badge are the same number before either
is used as a key.** If they are, that is a meaningful simplification for the vault's Phase 2; if
they are not, treating them as interchangeable would merge two different people.
