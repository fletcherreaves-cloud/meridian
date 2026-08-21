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
2. **What is `29760` in the path?** It is not the NSN and not our zero-padded `loc`. A QSRSoft
   internal store id, presumably. A pull needs a `loc → storeRef` mapping, and where that mapping
   comes from is unresolved.
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
