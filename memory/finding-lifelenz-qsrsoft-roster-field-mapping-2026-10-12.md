---
name: finding-lifelenz-qsrsoft-roster-field-mapping-2026-10-12
description: Field-name mapping between a LifeLenz "Employee Roster Report" CSV export and a QSRSoft "Employee Roster" xlsx export (both pulled manually for Seminole, 31357, as a one-off comparison). Pure field-name correspondence -- no employee data (no SSNs/DOBs/addresses/emails/phones) is recorded here, per this repo's standing PII rule.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# LifeLenz ↔ QSRSoft employee-roster field mapping

**Owner-provided, 2026-10-12** — a LifeLenz "Employee Roster Report" CSV and a QSRSoft
"Employee Roster" xlsx (6 tabs: Employee Roster, Contact, Birthday, Anniversary, Review Due,
Signature — the other 5 are just slices of the same roster) were compared field-by-field, for the
same store (Seminole, QSRSoft loc `31357`). This records the mapping so a future roster-reconciliation
or dual-source-ingest task doesn't have to re-derive it from scratch.

**No PII values from either file are recorded here** — field names only, per the standing PII rule
(see `finding-qsrsoft-employee-roster-endpoint-2026-08-21.md` and CLAUDE.md's PII section). If this
mapping is ever used to build a real pull, that finding's `selectCols` allowlist discipline (never
request/persist `ssn`, DOB, address, `nationalOrigin`, `gender`, etc.) applies here too — LifeLenz's
own CSV export carries the same SSN/DOB/address columns QSRSoft's does, header-for-header.

## Matched fields

| LifeLenz (CSV) | QSRSoft ("Employee Roster" tab) | Notes |
|---|---|---|
| Home Store NSN | Loc / Home Location | **Different numbering schemes** — LifeLenz's NSN is 7-digit zero-padded (e.g. `0010915`); QSRSoft's Loc is its own shorter code (e.g. `31357`). Not directly joinable without a lookup table — `src/constants.js`'s store-identity mapping is the candidate for that lookup if this is ever automated. |
| First Name | First Name | |
| Last Name | Last Name | |
| DOB | Date Of Birth | PII — never persist (see above). |
| SSN | SSN | PII — never persist. |
| Street Address | Street Address | PII. |
| City / State / Zip Code | City / State / Zip Code | PII. |
| Home Phone | Home Phone Number | PII. |
| Cellphone | Cell Phone Number | PII. |
| Emergency Contact | Emergency Contact Name | LifeLenz has one combined field; QSRSoft also splits out EC Home/Cell/Work Phone Number separately. PII. |
| Email | Email Address | PII — also note the existing finding's trap #5: some QSRSoft `emailAddress` values are synthetic `@noop.lifelenz.net` placeholders, not real addresses. |
| Hire Date | Org Start Date | Overall/company hire date — confirmed by the existing `orgStartDate` finding (dispatch #56 Part B). |
| Restaurant Start Date | Start Date | Start date **at this location** — confirmed by the existing `storeStartDate` finding. These two diverge for transferred employees in both systems; keep them as two separate fields, never collapse to one "start date". |
| Primary JTC | Primary Job Title Code | QSRSoft additionally carries `Job Code Type` and `Primary Job Title Code Description` (human-readable label); LifeLenz only gives the bare code. |
| Pay Rate | Primary Hourly Pay Rate | Pay data — narrower audience per the existing finding's point 4; no current panel calls for it. |
| Last PR Date | Last Review Date | |
| Next PR Due Date | Next Review Date | Per the existing finding's trap #3, QSRSoft's version of this field is widely stale/unmaintained — don't trust it as a real schedule. |
| Status | Employment Status | |
| Termination Date | Termination Date | |
| Termination Reason | Termination Reason | |

## Unmatched on each side

- **LifeLenz-only:** Nickname, Minor Age, Emergency Contact Consent, Date of Consent, LOA Start
  Date, LOA Proposed End Date, Last PR Rating (no performance-rating field exists on QSRSoft's
  roster tab at all).
- **QSRSoft-only:** GEID (QSRSoft's own identity key — see the existing finding's "key on `geid`"
  rule), Apt Number (LifeLenz folds this into Street Address or leaves it blank), Job Code Type,
  Primary Job Title Code Description, Has Punched / Last Punch Date, National Origin (protected-class
  attribute — never ingest, per the existing finding).

## Join key

Neither export carries a shared numeric employee ID across the two systems, and the store-number
schemes differ (NSN vs Loc). The only usable join keys across LifeLenz and QSRSoft are **(First
Name, Last Name)** — fuzzy, name-change-fragile — or **SSN**, which per the standing PII rule must
never be pulled or persisted. **This is an open gap**, not solved here: a real cross-system
reconciliation would need either a owner-approved SSN-based match done outside the app (never
stored) or a different stable identifier neither export currently carries.
