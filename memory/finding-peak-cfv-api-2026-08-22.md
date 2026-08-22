---
name: finding-peak-cfv-api-2026-08-22
description: peak.mcd.com is a SECOND, separate McD site from propel.mcd.com and it carries CFV and RGR visits. A captured RoipSurvey response contains the full per-question CFV tree AND — critically — VisitDaypart, VisitWeekpart and the visited channel, which are exactly the two fields the Visit Readiness Model Check needs for a like-for-like comparison.
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

## Why this matters more than the endpoint itself

The Visit Readiness **Model Check** (owner item #2 in
`memory/notes-visit-readiness-backlog-2026-08-22.md`) is currently underpowered *and*
structurally mismatched. `memory/finding-cfv-2026-visit-rules.md` named three mismatches
between what the model predicts and what a CFV actually measures:

| mismatch | what was missing | PEAK supplies |
|---|---|---|
| **Daypart** | model scores an all-day store; a CFV is one daypart | `VisitDetails.VisitDaypart` (`"Snack"` observed) |
| **Channel** | model blends DT/FC/curbside; a CFV shops one | `RootCategories[].Name` root (`"Curbside"` observed) |
| **Selection** | "greatest growth opportunity" daypart is not random | `VisitDaypart` + `VisitWeekpart` make the realised selection observable |

That file's stated requirement was, verbatim: *"capture the actual daypart and channel of each
visit. If every pair records what was really visited, we compare like-for-like and the selection
rule — followed or not — stops mattering."*

**This capture supplies both.** The daypart/channel-matched comparison is unblocked — it is now a
data-pull problem, not an unanswerable one.

⚠️ It does **not** fix the sample size. ρ=0.23, CI [−0.16, 0.56]; direction 51.9%, CI
[34.0%, 69.3%]. Matching on daypart and channel *sharpens* each pair; it does not create more of
them. Max 3 visits/store/year × 27 ≈ 81/year. The owner's own proposal — **backload last year's
visits** — remains the only route to a powered check inside this calendar cycle, and PEAK is
plausibly the source for that backfill too (unverified: see open questions).

---

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

### `VisitDetails` — the fields that unblock the Model Check

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
