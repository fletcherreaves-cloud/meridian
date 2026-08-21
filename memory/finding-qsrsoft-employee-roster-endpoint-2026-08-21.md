---
name: finding-qsrsoft-employee-roster-endpoint-2026-08-21
description: Owner-captured QSRSoft employee-roster endpoint. ANSWERS dispatch #56 Part B - storeStartDate and orgStartDate are the hire dates, and they are DIFFERENT things. Also resolves the time-punches jobTitleCode mapping. Returns the most sensitive payload in this system - SSN, home address, DOB, race, gender, pay rate - so the selectCols allowlist here is a hard security control, not a preference.
metadata:
  node_type: memory
  type: finding
---

# `people/employee-roster` — Part B answered, and the most dangerous endpoint yet

**Owner capture, 2026-08-21, store 3708, ~60 active employees.**

---

# 🔴 THIS ENDPOINT RETURNS SSN, HOME ADDRESS, DOB, RACE, GENDER AND PAY

Worse than `time-punches-matched`, which "only" returned SSN and name. The captured `selectCols`
requested **every** field, and the response carries, per person:

`ssn` · `fullEmployeeName` + first/middle/last · `address`/`streetAddress`/`aptNumber`/`city`/`state`/
`zipCode` · `dateOfBirth`/`birthday` · `nationalOrigin` (**race**) · `gender` ·
`federalMaritalStatus` · `hourlyPayRate` · `emailAddress` · `homePhoneNumber`/`cellPhoneNumber` ·
`emergencyContactName` + three contact numbers.

**No value from any of those fields appears in this file.**

`nationalOrigin`, `gender`, `dateOfBirth` and `federalMaritalStatus` are **protected-class
attributes**. Beyond the breach risk, ingesting them next to performance data would let the app
compute a metric split by race, age or sex — by accident. Do not ingest them at all.

## ✅ The `selectCols` allowlist — this IS the control

`selectCols` is caller-chosen, so **nothing sensitive ever has to leave QSRSoft.** A pull built on
this endpoint requests exactly these and nothing else:

```
homeLocation, geid, storeStartDate, orgStartDate, employmentStatus, locationType,
jobTitleCode, jobTitleCodeDescription, jobTitleCodeStartDate, jobCodeType,
terminationEntryDate, terminationReason, hasPunched, lastPunchDate,
lastReviewDate, nextReviewDate
```

Note what is absent and deliberately so: **no `ssn`, no name, no address, no DOB, no
`nationalOrigin`, no `gender`, no `federalMaritalStatus`, no contact details, no `hourlyPayRate`.**
`geid` alone identifies the person, and the vault already maps geid ↔ identity.

**Rules, none optional:**

1. **Never put `ssn` in `selectCols`** — and extend the `time-punches` guard: the pull script must
   assert that its own `selectCols` contains **none** of the denied fields, so a future edit fails
   loudly instead of silently exfiltrating.
2. **Never persist any denied field** — not Supabase, not scratch, not a log, not a test fixture.
3. **Key on `geid`.** Names route through `get_or_create_employee_token()` only if a name is ever
   genuinely needed, which with `geid` available it should not be.
4. `hourlyPayRate` is excluded not because it is unusable but because it needs its own decision —
   pay data has a narrower audience than ops data, and no current panel calls for it.

---

# 🎯 Dispatch #56 Part B is ANSWERED — but "start date" is two different fields

The previous status report said *"still no hire-date field anywhere."* That is now resolved, and the
answer is more useful than a single date:

| field | meaning |
|---|---|
| **`orgStartDate`** | when the person joined **the organization** |
| **`storeStartDate`** | when the person started at **this store** |

**They diverge often, and by a lot.** In this one store's roster, one employee shows
`storeStartDate` 2026-06-17 against `orgStartDate` 2018-11-30 — **eight years with the org, two
months at the store.** Several others show gaps of three to nine months.

⚠️ **So "employee start date" is ambiguous and the owner has to pick per use case:**

- **Tenure / experience / "should they know better"** → `orgStartDate`. A transfer is not a new hire.
- **Time in this restaurant / attributing a store's results to its crew** → `storeStartDate`.
- Showing one and labelling it "start date" will be wrong for every transferred employee, and the
  transfers are exactly the people whose tenure is most often misjudged.

**Supporting fields that come free:** `jobTitleCodeStartDate` (time in current role — arguably the
most relevant tenure for a coaching conversation), `lastReviewDate`/`nextReviewDate`,
`terminationEntryDate`/`terminationReason`, and `employmentStatus` (`active` is a request filter, so
terminated staff are reachable by changing it).

---

## 🎯 It also resolves the `time-punches` jobTitleCode unknown

`finding-qsrsoft-time-punches-endpoint-2026-08-21.md` lists `jobTitleCode` 647/650/671 as unknown
and warns against guessing which is "manager". The roster carries the mapping directly:

| code | description |
|---|---|
| 45 | GENERAL MANAGER W/ MGR PUNCHES |
| 647 | CERT. SWING MGR. |
| 648 | CREW TRAINER |
| 650 | CREW PERSON |
| 671 | PRIMARY MAIN. PERSON |
| 846 | DEPARTMENT MANAGER II |

**This is one store's roster, so the list is partial** — other codes certainly exist estate-wide.
Pull `jobTitleCode` + `jobTitleCodeDescription` together and build the mapping from the data rather
than hardcoding this table.

**Why it matters beyond tidiness:** it is the missing piece for the **forms dashboard's manager
attribution**. `completionDetail` gives a `userId` per completed form but nobody on a *missed* one;
the roster says which `geid`s are managers, and the punches say who was on shift. Roster + punches +
`scheduledAt` is the join that turns "total-day" into "manager on duty".

---

## ⚠️ Measured traps

**1. `"0000-00-00"` is the null sentinel for dates — not `null`, not empty.** It appears on
`storeEndDate` and `terminationEntryDate` for every active employee, and on `nextReviewDate` for
many. **It will crash or silently corrupt any date parse that expects ISO or null.** Third sentinel
family in this system after `emp_id = '0'` and `completedBy = '--'`; normalise all of them to null
on ingest.

**2. `hasPunched` is the string `"Yes"`/`"No"`, not a boolean** — and it does **not** mean "has ever
punched". Records exist with `hasPunched: "No"` alongside a real `lastPunchDate` months earlier, so
it reads as "punched within the requested window". Do not use it as an employment-status proxy;
`employmentStatus` is the field for that.

**3. `nextReviewDate` is widely stale and cannot be trusted as a schedule.** Records show
`nextReviewDate` years in the past while `lastReviewDate` is recent — e.g. a next-review of
2019-02-28 sitting beside a last-review of 2025-04-21. **The field is not being maintained.**
Treat `lastReviewDate` as real and `nextReviewDate` as unreliable; deriving "reviews overdue" from
it would flag nearly everyone and mean nothing. *(That said, "review actually overdue" computed from
`lastReviewDate` + a policy interval is a genuine candidate metric — the data supports it, the
stored field does not.)*

**4. `payrollID` is almost always null.** Not a usable key. `geid` is.

**5. Some `emailAddress` values are synthetic** `@noop.lifelenz.net` placeholders generated by the
LifeLenz integration, not real addresses. Another reason not to ingest the field.

**6. `storeNum` is unpadded** (`3708`), as everywhere else in this API. Meridian's `loc` is
zero-padded to 7.

**7. One store per call** (`nsn=3708`), like `time-punches-matched` and unlike the service
endpoints. A pull loops stores.

---

## Request shape

```
GET https://api.reports.myqsrsoft.com/reporting/v2/people/employee-roster
    ?catalogType=employeeRoster&nsd=d&nsn=3708&orgId=a546d4ef-…
    &startDate=2026-08-01&endDate=2026-08-31&weekStart=3
    &locationType=home&employmentStatus=active
    &selectCols=<allowlist above>
Referer: https://v3.myqsrsoft.com/reports/mcd/people/employeeRoster
```

DAR host (`api.reports.myqsrsoft.com`) → the Playwright constraint from
`project-qsrsoft-daily-activity.md` presumably applies; the token-only finding for
`api.security` does **not** transfer. Confirm on the first real call.

`locationType=home` and `employmentStatus=active` are both filters — `home` vs borrowed staff, and
active vs terminated. Both are worth varying deliberately rather than accepting the defaults.

## Open questions

1. **Which start date does the owner want, where?** A product decision, not a data one (above).
2. **Auth** — DAR host, so assume Playwright, but verify.
3. **The full `jobTitleCode` vocabulary** across all 27 stores — build from data, never hardcode.
4. **Does `geid` follow a person across stores?** The `time-punches` finding raised this; a roster
   pull across all stores answers it directly, and it determines whether the vault key is global.
