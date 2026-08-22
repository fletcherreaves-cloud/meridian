---
name: finding-peak-cfv-api-2026-08-22
description: peak.mcd.com is a SECOND, separate McD site from propel.mcd.com and it carries CFV and RGR visits. A captured RoipSurvey response gives per-QUESTION scores and TimerData score bands the current PDF parser does not have, plus a cycle handle that may make the owner's prior-year backfill a pull. Includes a correction — daypart/weekpart/channel are NOT new; Meridian already parses and stores all three, so the matched Model Check re-measure needs no new pull at all.
metadata:
  node_type: memory
  type: finding
---

# PEAK (`peak.mcd.com`) — CFV / RGR visits have an API, and it carries daypart + channel

Owner-captured 2026-08-22. **No credentials are recorded in this file; see the security note.**

> **PEAK is not Propel.** Owner, verbatim: *"the last I sent you is for PEAK site > another site
> for CFV and RGR and other reports."* `propel.mcd.com` = **EcoSure third-party food safety**
> (`memory/finding-ecosure-propel-api-2026-08-22.md`). `peak.mcd.com` = **CFV, RGR and other
> visit reports**. Two hosts, two APIs, two auth sessions. Do not conflate them — an earlier
> reading of this session's captures nearly did.

---

## 🔴 CORRECTION — checked the codebase before shipping this claim

My first draft of this file said the capture "unblocks" the daypart/channel-matched Model Check,
on the reasoning that `finding-cfv-2026-visit-rules.md` had named daypart and channel as the two
missing fields. **I then read the code, and that claim was wrong.** Recorded here rather than
quietly edited out, per the standing measure-don't-reason rule — this is the second time in this
session that a confident inference about an external system survived until someone checked.

**Meridian already has daypart, weekpart and channel on every graded visit, today:**

| where | evidence |
|---|---|
| PDF parser | `src/parsers/graded-visits.js:80,81` — `daypart: _after(L,'Day parts')`, `weekpart: _after(L,'Weekpart')` |
| channel | `channelOf()` (`:67`) — *"the FIRST module listed under the Score Calculator … 'Behind the Counter' is the always-present companion module, not the order method"* |
| Supabase | `graded_visits` carries `daypart` / `weekpart` / `channel` columns (`src/lib/supabase.js:2653,2654,2660`) |
| already rendered | `VisitPatterns` (`src/views/visit-readiness.js:266`) breaks actual outcomes down by day-of-week, **daypart**, **weekpart** and **channel** |

Note that `channelOf()`'s rule — first module that is not "Behind the Counter" — is **exactly** the
structure the PEAK payload exposes as `RootCategories` (`"Curbside"` + `"Behind the Counter"`). The
PDF and the API are two renderings of one object. That is corroboration, not new information.

### What this correction is worth

**Good news, and better than the wrong version.** The daypart/channel-matched re-measure that
`notes-visit-readiness-backlog-2026-08-22.md` item 2(b) proposes **needs no new data pull at all.**
It can be run against the existing `graded_visits` rows today. The backlog note framed 2(b) as
windowing the *model side* to 11:00–17:00 (`hour_slot` 12:00–17:00); the visit side can now be
matched exactly, per visit, rather than assumed from the policy window — and it can be done for the
old regime too, where the policy window did not apply. **That moves 2(b) from "cheap" to "cheapest
thing on the list."**

⚠️ Still unmeasured: **how populated those columns actually are.** `_after(L,'Day parts')` returns
null when the PDF layout differs, RGR sets `channel: null` by design (`:158` — whole-restaurant, not
single-channel), and the anon key returns zero rows on `graded_visits` (tenant-scoped RLS), so I
could not count them from here. **Check per-visit fill rate before relying on the match** — a column
that exists is not a column that is populated, which is the same trap `section:` fell into.

## What PEAK genuinely adds

Setting the daypart/channel claim aside, four things here are real:

1. **An API in place of a manual PDF drop.** Graded visits are currently a manual upload. The
   standing **API-over-email/manual** rule points straight at this: an API takes a range and can
   re-pull to correct itself; a PDF drop cannot.
2. **Backfill.** `ProgramCycleDescription: "Customer First Visit 2026"` suggests prior cycles are
   addressable. That is precisely the owner's *"I can backload data from last year"* plan, and it is
   the only route to a powered Model Check inside this calendar cycle. **Unverified — see open
   questions.**
3. **Per-QUESTION detail, which the PDF path does not have.** `parseModules()`
   (`src/parsers/graded-visits.js:47`) extracts module-level `{pct, ach, pos}` only. PEAK gives
   `ShortCode` / `Text` / `Score` / `PossibleScore` / `SelectedReasons` / `Comment` per question.
   Genuinely new resolution.
4. **`TimerData` score bands — the most actionable item in the capture.** Also absent from the PDF
   path. See below.

⚠️ It does **not** fix sample size. ρ=0.23, CI [−0.16, 0.56]; direction 51.9%, CI [34.0%, 69.3%].
Matching on daypart and channel *sharpens* each pair; it does not create more of them. Max 3
visits/store/year × 27 ≈ 81/year. Backfilling last year's cycle remains the only route to a powered
check this cycle.

## The endpoint

```
POST https://peak.mcd.com/API/Visit/RoipSurvey/<VisitId>
```

`<VisitId>` observed: `8721634`. Auth is **cookie-based** (`GlobalAS_SessionId`, plus SharePoint
federation `rtFa` and Akamai cookies) — same shape as Propel, a different session.

Companion endpoint captured the same day:

```
GET/POST https://peak.mcd.com/API/Stores/Paged/
```

→ the store list. Its `ID` is the join key: **PEAK `ID` = Propel `hierarchy-node`.** That single
fact links the two systems and is why the PEAK store list was worth capturing (recorded in the
Propel finding as the solution to the hierarchy-node mapping problem).

## The payload

### Visit envelope

| field | observed / meaning |
|---|---|
| `SurveyType.TypeId` | **`3801`** — the CFV discriminator |
| `SurveyType.Description` | `"Customer First Visit"` |
| `SurveyType.ShortDescription` | `"CFV Visit"` |
| `ProgramCycleDescription` | `"Customer First Visit 2026"` — the annual cycle, so a prior-year backfill is addressable by cycle |
| `VisitId`, `AuditId` | visit identity |
| `StoreId` | = PEAK `ID` = Propel `hierarchy-node` |
| `StoreCode` | the store number |
| `IsComplete`, `VisitCompleteTime` | completion state |

### `VisitDetails` — confirms, but does not add, the daypart/channel fields

| field | observed |
|---|---|
| **`VisitDaypart`** | **`"Snack"`** |
| **`VisitWeekpart`** | **`"Weekday"`** |
| `VisitDate` | visit date |
| `VisitDoneByName` | shopper name — **PII, tokenize on ingest** |
| `Supervisor`, `RestaurantManager` | **PII, tokenize on ingest** |
| `Comment` | free text — may contain names |

### `RootCategories` — a nested question tree

The **root node is the channel**: `"Curbside"` observed, alongside `"Behind the Counter"`. So the
channel is not a field — it is the tree's top level. Ingest must read it from the root name, not
look for a `channel` key.

This is the **same structure** `src/parsers/graded-visits.js:67`'s `channelOf()` already reads out
of the PDF (*"the FIRST module listed … 'Behind the Counter' is the always-present companion
module"*). Two renderings of one object — so an API ingest can reuse that rule verbatim rather than
inventing a second one, and the two paths cannot drift on channel.

Per question:

`ShortCode` · `Text` · `Score` · `PossibleScore` · `SelectedReasons` · `Comment` ·
`AllowableValues` · `Reasons`

### `TimerData` — banded service-time scoring

Timed questions carry their own score bands. Observed for `CU5-US`:

| time | points |
|---|---|
| ≤ 135 s | 8 |
| 136–162 s | 7 |
| 163–188 s | 5 |
| 189–214 s | 3 |
| 215–240 s | 1 |
| 241 s+ | 0 |

Measured on this visit: **110 s → 8 pts.**

📌 **These bands are a finding in their own right.** Visit Readiness currently grades Speed
against `DEFAULT_TARGETS`, i.e. *our* internal targets. CFV grades it against *these* bands. If
the model is meant to predict a CFV score, the Speed component should be graded on the bands the
CFV actually applies — that is a scoring-fidelity improvement independent of sample size, and it
does not require a single extra visit to implement.

⚠️ Do not assume these bands are global. They were observed on one question (`CU5-US`) on one
visit in the 2026 cycle. `TimerData` is per-question, so read the bands from the payload rather
than hardcoding them.

---

## Open questions (do NOT assume — measure)

1. **Is there a visit-LIST endpoint?** `RoipSurvey/<VisitId>` needs an id you already have. The
   equivalent gap exists on Propel (its visit-list endpoint is likewise still unfound). Without
   one, neither a backfill nor an ongoing pull can enumerate. **This is the single highest-value
   next capture on either host.**
2. **Does `SurveyType.TypeId` enumerate RGR?** `3801` = CFV. RGR/RGRV presumably has its own id
   on the same `RoipSurvey` shape — unverified.
3. **Can a prior `ProgramCycleDescription` be requested?** If the 2025 cycle is reachable, the
   owner's backload plan is a pull, not a re-key. Untested.
4. **`compType`/business-day boundary** — `VisitDate` vs the 4am business day. A visit at
   00:30 belongs to the previous business day. Check before joining to any daily metric.

---

## Constraints inherited from the Propel finding (they apply here too)

- **SSO + MFA.** Owner confirmed both. Headless automation is ruled out; the persistent
  authenticated Chromium profile on the **#65 Mac mini runner** is the automation path if one is
  built. Manual capture first — the cadence (≤81 visits/year) does not justify a fragile pipeline.
- **Akamai is present and did not challenge.** Do not over-engineer for it; handle a challenge if
  one is observed.
- **PII.** `VisitDoneByName`, `Supervisor`, `RestaurantManager` route through
  `get_or_create_employee_token()`. No plaintext name in a table, log, fixture, or memory file.
- **A new stream means the full checklist**: Supabase table with `tenant_id` + RLS,
  `sync-failure-watch.yml` registration, per-stream `STREAMS` freshness, manual fallback.

## 🔒 Security note

The captures were shared as full cURLs including live session cookies (`GlobalAS_SessionId`,
`rtFa`, Akamai `_abck`/`bm_sz`). **None of it is recorded here.** The session should be treated as
disclosed-by-sharing and re-authenticated. For future captures the URL, header *names*, and the
response body are sufficient — the cookie jar never needs to leave the browser.
