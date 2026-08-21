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

1. **~~`event_token` is the whole game.~~ ✅ ENUMERATED 2026-08-21 — see the section below.**
   Eight tokens captured across three stores; two metrics confirmed to have no drill-down at all.
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

### ✅ `registerType` and `resultType` vocabularies — enumerated from the UI

The Register Audit page's own controls settle both knobs:

- **`registerType`: `Cashier` · `Manager` · `Preparer`** — three values.
- **`resultType`: BY LOCATION · BY EMPLOYEE** — two. **There is NO `byRegister` option.**

❌ **Retracting a suggestion I made in chat.** I proposed trying `resultType=byRegister` as a cheap
route to Part E's "which drawer worked", ahead of the `event_token` capture. **The UI offers no such
value**, so it was speculation dressed as a shortcut. It might exist as an undocumented API value,
but nothing supports that and it should not displace the `event_token` work. **Part E still needs
`event_details`.**

### 🔴 We pull `registerType=cashier` ONLY — Manager and Preparer are not collected at all

`scripts/qsrsoft-register-audit-pull.mjs:295` hardcodes `registerType: 'cashier'`. So `audit_rows`
contains **one third of this report**, and the missing two thirds are the loss-prevention-relevant
ones: **manager** over/short, promo and discount activity is precisely what a controls rule most
wants to see, and it is invisible to every security rule we have shipped.

**This is a real gap, not a nicety.** Adding it is a small change — loop the three values and carry
`registerType` as a column — but it is not free: it changes `audit_rows`' grain, so the PK, the
security rules' subject grouping, and any existing per-employee aggregate all need checking first.
**Do not just add a loop.** Scope it as its own piece of work.

### ⚠️ The DAR-host auth question — mostly already answered, in the script, and I missed it

I first wrote this section up as a possible correction to the "DAR host needs Playwright" rule.
**It was already settled a day earlier and is documented in the pull script**, more precisely than I
had it — `scripts/qsrsoft-register-audit-pull.mjs:335-342`, from a complete capture of a **working**
(200 OK) request:

> *"There is NO x-auth-token, NO cookie, and NO authorization header. This endpoint is not
> authenticated by a credential we were failing to supply — it is scoped by the orgId/nsn params and
> validated against Origin/Referer."*

So for `regAudit`: not just cookie-less, **credential-less**. My "no Cookie, so maybe the 401 was a
missing Origin/Referer" read was a weaker version of a conclusion already reached and shipped.
**Standing rule, violated: check whether the answer already exists before deriving it.** A `grep` of
`scripts/` for `regAudit` would have found it in seconds.

**What genuinely remains open** is narrower than I claimed, and still worth knowing:

- The same script notes **`qsrsoft-ops-pull.mjs` works with a direct minted token against this same
  host.** So "the DAR host requires browser cookies/Playwright" is *already* known to be too broad —
  at least two paths on it don't need one, by two different mechanisms (ops: token; regAudit: no
  credential at all, Origin/Referer scoping).
- **Unverified: `/data_layer/v1/service/…`** — the `dt-timer`/`mobile`/`statistics` family, and the
  DAR endpoint the Playwright requirement was originally written about. That one path family is the
  only place the blanket rule may still hold, and it is the one a service-times pull would need.
- Worth a look either way: `CLAUDE.md`'s blanket statement that the host "requires browser session
  cookies" is now contradicted by two shipped scripts and should be narrowed to the path family it
  actually describes.

## ✅ `event_token` ENUMERATED — 8 tokens, 5 families (owner sweep, 2026-08-21)

Captured from the Register Audit drill-downs via the DevTools **Payload** tab (no token, no
credential in the body — the cheapest possible capture, and the method to reuse).

| family | tokens |
|---|---|
| promo | `all_promo` |
| T-Reds | `t_red_before` · `t_red_after` |
| refunds | `cash_refund` · `cashless_refund` |
| meals | `employee_meal` · `manager_meal` |
| POS | `pos_overring` |

**The vocabulary is global, not per-store** — `cash_refund` appeared from both 10915 and 33109.
Naming is snake_case and descriptive, and **four of the five families are paired**
(before/after, cash/cashless, employee/manager). Two of the eight — the meal pair — were **not
predicted from `audit_rows`' metric list**, so the sweep found categories that guessing would have
missed. Do not extrapolate the remainder from the pattern; capture it.

**Request body shape** (constant across all eight):

```json
{"event_token":"<token>", "start_date":"YYYY-MM-DD", "end_date":"YYYY-MM-DD",
 "registers":[13], "time_slices":[], "cashiers":[21,0], "mgr_code":null}
```

`registers` / `cashiers` are the clicked row's context, not part of the token vocabulary.

### 🔴 Two NEGATIVE results — these are constraints on Part E, not gaps in the capture

- **Cash over/short is a listed column but has NO clickable drill-down.** Measured, not assumed.
  The likely reason is structural: over/short is a **computed variance**, not a discrete event, so
  there is nothing for an event list to enumerate. **So Part E cannot deliver "which drawer, what
  time" for cash over/short** — the single biggest controls metric. It stays a daily aggregate in
  `audit_rows`. **Say this plainly in the panel** rather than letting a user infer that the absence
  of detail means the absence of a problem.
- **Discount is not a column on this report at all** — distinct from promo, and not reachable here.
  If discount detail is wanted it lives in another report; check the catalog
  (`finding-qsrsoft-report-menu-map-2026-08-21.md`) rather than assuming it does not exist.
- **Voids: unconfirmed.** No void drill-down was found, but the sweep did not establish whether a
  void column exists and is unclickable, or is simply not displayed. `pos_void` is a plausible
  sibling to `pos_overring` — **plausible, not found.**

### 🎯 `employee_meal` / `manager_meal` may be a signal we are entirely blind to

Neither appears in `audit_rows`' metric set. Meal-comp abuse is a classic loss-prevention category,
and **the role split is the interesting half**: a manager comping their own food carries no second
signature, which is exactly the pattern a controls rule exists to catch. Splitting employee from
manager also lets a rule hold them to different bars instead of one blended rate.

**Same shape as the `registerType=cashier` gap** recorded above — a whole class of controls activity
that no shipped rule can currently see. Worth scoping alongside it rather than separately.

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
