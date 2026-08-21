---
name: finding-qsrsoft-time-punches-endpoint-2026-08-21
description: Owner-captured QSRSoft time-punches-matched endpoint - actual clock punches with shift/meal split, paid-break flag, and punch-EDIT flags. Two things dominate - it returns SSNs and full names and must never be pulled with ssn selected, and its geid resolves the identity vault's emp_id question by matching every audit_rows emp_id length band exactly.
metadata:
  node_type: memory
  type: finding
---

# `people/time-punches-matched` — punches, punch edits, and the geid answer

**Logged for later.** Owner capture, 2026-08-21, store 3708, one day.

---

# 🔴 THIS ENDPOINT RETURNS SOCIAL SECURITY NUMBERS

`selectCols` on the captured request included **`ssn`**, and the response carries a **full nine-digit
SSN plus full legal name for every employee**. That is the most sensitive category of data in this
entire system — well beyond the plaintext names the identity vault was built to protect.

**No SSN, name, or employee identifier from this capture is recorded in this file.**

**Rules for any pull built on this endpoint, none of them optional:**

1. **Never put `ssn` in `selectCols`.** `selectCols` is caller-chosen, so this is solved at the
   request — the field simply never has to leave QSRSoft. Do not fetch-then-drop; do not fetch it
   "for matching."
2. **Never persist it.** Not in Supabase, not in a scratch table, not in a log line, not in a test
   fixture.
3. **Names route through `get_or_create_employee_token()` on ingest**, exactly as the Register Audit
   pull already does. `security_findings` subjects stay `emp_token`.
4. **A pull script that touches this endpoint should assert `ssn` is absent from its own
   `selectCols`** — a guard in the script, so a future edit that adds it fails loudly rather than
   silently exfiltrating.

⚠️ **The capture itself lives in the session transcript**, which I cannot retract. Worth treating
that transcript as containing live PII, and worth knowing that a browser DevTools copy-as-curl of
this report will do the same again.

---

## What it is, minus the PII

```
GET https://api.reports.myqsrsoft.com/reporting/v2/people/time-punches-matched
    ?catalogType=timePunchesMatched&nsd=d&nsn=3708&orgId=a546d4ef-…
    &startDate=2026-08-20&endDate=2026-08-20&selectCols=…
Referer: https://v3.myqsrsoft.com/reports/mcd/people/punch-extract
```

Note the **different path family** — `/reporting/v2/people/`, not `/data_layer/v1/service/` — and
**one store per call** (`nsn=3708`), unlike the service endpoints that take all 27 at once. A pull
loops stores. No `compType` parameter appears, so **the business-day boundary is unconfirmed here**
— though punches starting 04:00/04:01/04:15 and running to 23:50 are at least consistent with the
4am day rather than contradicting it. Verify before joining to anything `compType=trading`.

**Safe fields** (no `ssn`, no name):

| field | note |
|---|---|
| `geid` | the person key — see below |
| `storeNum` | unpadded, as everywhere else |
| `punchType` | **`shift` or `meal`** — one row per punch, so an employee appears more than once |
| `isPaidBreak` | `0` on meal rows, `null` on shift rows |
| `startDateTime` / `endDateTime` | actual clock times, minute resolution |
| `inModified` / `outModified` | **punch was EDITED** — see below |
| `jobTitleCode` | 647 / 650 / 671 in this sample |
| `timeCardNumber` | often `null`; not a reliable key |
| `badgeType` | `Primary` throughout this sample |

## 🎯 `geid` answers the identity-vault question

**Every `geid` in this capture falls inside the matching `audit_rows.emp_id` length band**, measured
against the distribution the owner ran earlier:

| digits | `audit_rows.emp_id` range | geids in sample | all inside? |
|---|---|---:|---|
| 7 | 2,575,898 – 7,902,187 | 5 | ✅ |
| 8 | 12,027,066 – 26,264,015 | 6 | ✅ |
| 9 | 200,082,946 – 200,584,190 | 21 | ✅ |

**Two consequences:**

**1. It corrects my own earlier speculation.** In the G=2 correction I wrote that the 6/7/8/9-digit
bands "don't look like one numbering scheme — more like several systems or eras." That reads as
wrong now: they look like **one global `geid` space that has grown over time**, older employees
holding shorter numbers. One scheme, not several. *(Consistent with 32 geids from one store on one
day — worth confirming across stores before treating it as settled.)*

**2. `audit_rows.emp_id` is almost certainly the `geid`**, which gives the vault a real, stable,
system-of-record person key — and this endpoint is the authoritative **name ↔ geid** mapping.
That is exactly what Phase 2 reconciliation needs. It also sharpens the `'0'` sentinel: `'0'` is not
a short geid, it is a placeholder where no geid was captured.

**Still true and still required:** the badge from `event_details` (`"Name - 91"`) is **not** this.
Two-digit badges sit nowhere near these bands, so badge and geid remain separate namespaces.

## Why it is worth a dispatch later

- **`inModified` / `outModified` are a loss-prevention signal.** A punch that was *edited* after the
  fact is precisely the kind of thing the security rules exist to surface, and Meridian has no
  visibility into it today. One row in this sample carries `outModified: 1` on a **meal** punch.
  Rate of edited punches by store, by manager, over time is a real rule candidate — and it belongs
  in the same framework as the cash rules, with the same honest-null and materiality gates.
- **Meal-break compliance** becomes measurable: `punchType='meal'` with real start/end and
  `isPaidBreak`, against shift length. That is a labour-compliance question no current stream
  answers.
- **Actual punches vs scheduled** — `lifelenz_schedules` holds the schedule; this holds what
  happened. The gap between them is the VLH conversation with real evidence under it.

## Open questions

- **Business-day boundary** — no `compType`; confirm before joining to `trading`-aligned data.
- **`jobTitleCode`** — 647 / 650 / 671 seen; the code→title mapping is unknown, and guessing which
  is "manager" would be exactly the kind of assumption that produces a confident wrong answer.
- **`badgeType`** — only `Primary` in this sample. Other values presumably exist.
- **Whether `geid` is stable across stores** for an employee who works at more than one.
