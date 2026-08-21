---
name: finding-qsrsoft-forms-completion-endpoint-2026-08-21
description: Owner-captured QSRSoft Forms completionByForm endpoint - shift-checklist / travel-path form submissions per form per store, with an answered-vs-total question count. Logged toward an owner-requested forms dashboard. A NEW third host family (forms.home.myqsrsoft.com). Records the measured gap between what the owner asked for and what this endpoint can answer - it cannot say "missed" and does not name the submitter - plus the store-ref cross-finding that corrects the event_details note.
metadata:
  node_type: memory
  type: finding
---

# `forms/reports/completionByForm` — shift-checklist completion (owner capture, 2026-08-21)

**Owner's ask, verbatim:** *"I will want to create a dashboard for reporting > these are form
completions and i want to be able to see how many forms completed vs missed per day per store. Also,
manager submitting and completion percent."*

**Logged toward a dispatch, not scoped as work yet.**

🎯 **Build the dashboard on `completionDetail`, not `completionByForm`.** Two sibling endpoints were
captured. `completionByForm` (documented first below, because its caveats are measured and several
still apply) is an aggregate that **cannot** answer the owner's central ask. Its sibling
**`completionDetail` answers all three asks directly** — it returns one row per *scheduled
occurrence* with `status`/`missed`, `scheduledAt`, and `completedBy`. Jump to the
`completionDetail` section for the recommendation; read `completionByForm`'s caveats anyway, since
the unit, boundary and sentinel traps carry across the host.

## 🆕 A THIRD host family (both endpoints share it)

```
POST https://forms.home.myqsrsoft.com/api/forms/reports/completionByForm?orgId=a546d4ef-…
Content-Type: application/json
x-auth-token: <token>
Origin:  https://v3.myqsrsoft.com
Referer: https://v3.myqsrsoft.com/

{"startDate":"2026-08-15T05:00:00.000Z","endDate":"2026-08-22T04:59:59.999Z",
 "locations":["3708","5183",…,"noLocation"],     <- 27 unpadded NSNs + a "noLocation" bucket
 "formIds":["7db78fc4-…", …]}                    <- 61 explicit form UUIDs, caller-supplied
```

Same `orgId` as the DAR and security hosts, so the org id is stable estate-wide. But this is a
**third host**, and the auth findings for the other two do **not** transfer:

| host | auth | note |
|---|---|---|
| `api.reports.myqsrsoft.com` | **Playwright required** — token-only gets 401 | DAR / service endpoints |
| `api.security.myqsrsoft.com` | **token-only confirmed** (DevTools header panel, no `Cookie`) | controls / register audit |
| `forms.home.myqsrsoft.com` | **UNKNOWN — assume nothing** | this endpoint |

⚠️ **Do not read the curl as proof of token-only.** A curl transcript never shows cookies the
browser attached invisibly — the distinction I had to make for `event_details`, where only the
DevTools *request-header panel* settled it. And here the odds actually favour a cookie: the capture
carries **`sec-fetch-site: same-site`**, meaning the browser itself classified `forms.home` and `v3`
as same-site, which is exactly the condition under which a `.myqsrsoft.com`-scoped `SameSite=Lax`
cookie *is* attached. Get the header panel for this host before designing the pull.

## 🎯 It corrects an open question on dispatch #56 Part E

`finding-qsrsoft-event-details-endpoint-2026-08-21.md` open question 2 asks *"What is `29760` in the
path? It is not the NSN and not our zero-padded `loc`."* **That is wrong.** `29760` appears in this
request's `locations` list, and `src/constants.js:294` has `'29760': 'Duncan-Hwy 81'`.

**The security host's `storeRef` is simply the unpadded NSN.** No `loc → storeRef` mapping needs
discovering; it is the same `String(Number(loc))` conversion the DAR pull already does. Corrected in
that file in the same commit as this one.

## `completionByForm`: 86 rows of `(formId × location)`

```json
{"submissions":5, "totalQuestions":470, "answeredQuestions":470,
 "pointsPossible":0, "pointsReceived":0,
 "formId":"03b62c8f-…", "title":"Breakfast Pre-Shift", "location":"6178"}
```

No date. No submitter. No question-level detail. One aggregate row per form per store per range.

## ⚠️ Gap analysis — which endpoint answers which ask

| ask | `completionByForm` | `completionDetail` |
|---|---|---|
| **completion percent** (within-form: answered/total) | ✅ **only here** | ❌ no question counts |
| **completed … per day per store** | 🔶 only by looping — no date in the response | ✅ `scheduledAt` per row |
| **…vs missed** | ❌ **impossible** — no expected count exists | ✅ `status` / `missed` |
| **manager submitting** | ❌ no submitter field | ✅ `completedBy` |

**So the dashboard needs both**, and they are not redundant: `completionDetail` carries compliance
(was it done, when, by whom) and `completionByForm` carries thoroughness (how much of it was filled
in). The 10034 Bonifay outlier below is exactly why the second one still earns its place — a form can
be `COMPLETED` in `completionDetail` while being 20% blank.

### 🔴 `completionByForm` alone cannot answer "missed" — and its absences are invisible

It reports **only what was submitted**. No schedule, no assignment, no expected cadence, so
*"completed vs missed"* is not computable from it at any date granularity. Worse, the absence is
invisible in two directions at once:

- **49 of the 61 requested forms returned no row at all.** Forms with zero submissions are
  **omitted**, not returned as zero.
- **5 of the 27 stores returned no row at all** — 5183 Chickasha, 18213 Lindsay, 29760 Duncan,
  34222 Harrah, 38609 Freeport. Zero forms of any kind, for a full week.

Those five stores are almost certainly the most interesting rows in the dataset, and **they are not
in the response.** Any pull must reconstruct the full grid from the *request* list, not the response.

**What "missed" actually requires** is the forms **assignment/schedule** — which forms are assigned
to which store at what cadence. ✅ **Found: that is `completionDetail`**, below. Do not build a
compliance percentage on `completionByForm`; it has no denominator.

⚠️ **And do not eyeball a compliance rate from the pre-shift counts.** Over the 7-day window,
3 dayparts × 7 days = 21 naively "expected" pre-shifts per store, and the measured totals run
**1 to 14**:

| store | Bkf | Lun | Din | total |
|---|---:|---:|---:|---:|
| 11657 Purcell | 7 | 2 | 5 | **14** |
| 20475 OKC-I240 | 5 | 6 | 1 | 12 |
| 33704 Tecumseh | 4 | 6 | 2 | 12 |
| … | | | | |
| 24471 Ardmore-Cooper | 0 | 1 | 0 | **1** |
| 33222 Elgin | 0 | 1 | 0 | **1** |

Reading that as "Elgin missed 20 of 21" is the trap. **The denominator is unknown** — not every store
necessarily runs all three pre-shifts daily, and the FL stores run a parallel form set (below).
Until the assignment source is found this table is a question, not a scorecard.

## ⚠️ Measured caveats

**1. `totalQuestions` is per-submission-summed, and NOT a form constant.** It is
`Σ questions asked across submissions`, so it scales with `submissions` — for most forms
`totalQuestions/submissions` is a clean integer (Breakfast Pre-Shift 94, Travel Path w/ Playland 19,
Red Bull 6). **But `EA Breakfast PS` gives 71 over 2 submissions at store 6178 and 36 over 1 at 6838
— 35.5 and 36.** So the same form asked a different number of questions on different submissions:
conditional branching, or a form revision mid-window. **Never divide `totalQuestions` by
`submissions` and treat the result as the form's length.**

**2. "Completion percent" is ambiguous and the two readings are different metrics.** Within-form
completeness (`answered/total`, what this endpoint gives) is **not** the same as form-compliance
(`submitted/required`, which it cannot give). Both are naturally called "completion percent." The
dashboard must label them distinctly or it will be actively misleading.

**3. Never average the averages.** Estate within-form completion is **98.76%** dollar-weighted
(17,199 / 17,415 questions) vs **99.21%** as an unweighted mean of the 86 row rates — 0.45pp apart on
one week. Sum numerator and denominator, per the standing rule.

**4. The one real outlier is invisible in the mean.** Store **10034 Bonifay, Breakfast Pre-Shift:
374 of 470 answered = 79.6%**, when every other row in the dataset is 96.8–100%. The 96 unanswered
questions ≈ **one entire 94-question form left blank**. That single row is the best argument for
building this dashboard — it is precisely the "submitted but not actually done" case a submissions
count cannot see.

**5. Window boundary is LOCAL MIDNIGHT, not the 4am business day.** `05:00:00.000Z → 04:59:59.999Z`
is midnight-to-midnight at UTC−5. So **this is not `compType=trading`** and does not line up with the
DAR. Joining form completions to a business-day sales or labour figure crosses boundaries — decide
deliberately which one the dashboard uses. Two further notes: the offset is **hardcoded CDT**, so a
literal `05:00Z` silently shifts by an hour under CST; and it is a single offset for the whole
estate, which happens to be correct today only because the FL stores are all Panhandle-west-of-the-
Apalachicola and therefore **Central, not Eastern**.

**6. `pointsPossible`/`pointsReceived` are 0 on every row.** These 12 forms are checklists, not
scored audits. **Do not conclude the fields are always unused** — a scored form presumably populates
them, and a dashboard that drops the columns will need them back.

**7. Titles are dirty; key on `formId` only.** `"Dinner Pre-Shift "` and `"EA Dinner PS "` carry
**trailing spaces**, and `"Reb Bull Tracking Form"` is a typo for Red Bull. Grouping by title would
split or mislabel. Trim for display, group by UUID.

**8. `"noLocation"` is a real request member** (28 entries for 27 stores) and returned **0 rows**
here. It presumably catches submissions with no store attached — worth keeping in the request so
they surface rather than vanish.

**9. `formIds` must be supplied explicitly — and this is why `completionByForm` is the *secondary*
source.** 61 UUIDs, caller-enumerated. **A pull that hardcodes this list silently misses every form
created afterwards**, and since a missing form is omitted rather than zeroed, that failure is
invisible. ✅ **`completionDetail` takes no `formIds` at all**, so use it to enumerate which
`(formId, location)` pairs are actually assigned, then ask `completionByForm` for exactly those.

## 📌 An operational observation worth a question, not a conclusion

**All five FL stores using the "EA" form set also submit the legacy pre-shift set.** EA Breakfast /
Lunch / Dinner PS appear only at 6178, 6838, 10034, 35242, 37566 — all Emerald Arches, confirming
`EA` = Emerald Arches — and **every one of those five also files the 94-question
Breakfast/Lunch/Dinner Pre-Shift** in the same week. (43701 Ponce de Leon is the one FL store on the
legacy forms only.)

The EA forms are ~35 questions against the legacy ~94. Whether that is a **transition in progress**
or **the same shift being logged twice** is unresolved, and it matters for the dashboard: if a store
runs two parallel pre-shift sets, a naive per-form compliance view double-counts its workload and
understates each form's rate. **One week, one snapshot — measure it before calling it duplicate
work.**

## ⭐ `completionDetail` — the endpoint to build on (owner capture, same session)

```
POST https://forms.home.myqsrsoft.com/api/forms/reports/completionDetail?orgId=a546d4ef-…
{"startDate":"2026-08-15T05:00:00.000Z","endDate":"2026-08-22T04:59:59.999Z",
 "locations":["3708",…,"noLocation"]}          <- NO formIds. That is the point.
```

**No `formIds`.** Identical host, path family, org id, window and `locations` array to
`completionByForm`, but the 61-UUID list is simply absent — the server already knows what each store
is assigned. This **defeats caveat 9 outright** (a hardcoded form list going stale invisibly) and
means no forms-list endpoint has to be found.

### The response — one row per SCHEDULED OCCURRENCE, not per submission

```json
{"formTitle":"Breakfast Pre-Shift", "formId":"03b62c8f-709c-4b11-ab90-5ffaa03fa989",
 "location":"10034",
 "status":"MISSED", "missed":true, "hasResponse":false,
 "scheduledAt":"2026-08-15T11:00:00Z",
 "completedBy":"--", "reviewedWith":"N/A", "score":null,
 "assignedTo":[{"name":"General Manager","type":"group"},
               {"name":"Shift Manager","type":"group"},
               {"name":"Department Manager","type":"group"},
               {"name":"Floor Supervisor","type":"group"}]}
```

**This is the schedule and the outcome in one row**, which is what makes the owner's dashboard
possible:

| field | answers |
|---|---|
| `scheduledAt` | **"per day"** — the occurrence's own timestamp, no per-day loop needed |
| `status` / `missed` / `hasResponse` | **"completed vs missed"** — the denominator is the row itself |
| `completedBy` | **"manager submitting"** |
| `assignedTo` | which *role groups* the form was assigned to |
| `location` / `formId` | the grid keys, same unpadded NSN convention |

Because a **missed occurrence is a returned row**, this endpoint does not have `completionByForm`'s
omission problem: nothing has to be reconstructed from the request list.

### ⚠️ Caveats on `completionDetail`

**A. `completedBy: "--"` and `reviewedWith: "N/A"` are STRING SENTINELS, not null.** Exactly the
`emp_id = '0'` trap from the identity-vault work, which cost a wrong count once already. Never treat
`"--"` as a name; never let `"N/A"` reach a UI as a reviewer. Normalise both to null on ingest, and
**do not assume these are the only sentinels** — the captured slice is all-MISSED, so the completed-
row vocabulary is unseen.

**B. 🔴 `completedBy` WILL carry a plaintext employee name on completed rows** — that is the entire
point of the field. **The identity-vault rules apply unchanged and are not optional:** route through
`get_or_create_employee_token()` on ingest, `security_findings`-style subjects stay tokenised, never
persist a plaintext name, never log one, never put one in a test fixture, and surface a name only via
the logged `reveal_employee_identity()` path.

**C. `assignedTo` is ROLE GROUPS, not people** (`type:"group"`). It says who *could* have done it, not
who did. `completedBy` is the person. Conflating them would attribute a miss to four managers at once.
`type` being present implies a non-`group` variant (individual assignment) exists — unseen here.

**D. `scheduledAt` is UTC; convert before bucketing by day.** `2026-08-15T11:00:00Z` = **06:00 CDT**,
a plausible breakfast pre-shift time. Bucketing on the raw UTC string puts late-evening occurrences on
the wrong day. And per caveat 5 above, decide deliberately whether the dashboard's day is the local
calendar day (what this endpoint's own window uses) or the **4am business day** (`compType=trading`,
what every DAR-sourced number uses) — they are not the same day.

**E. `score: null` on every captured row, and `completionByForm` gave `pointsPossible: 0`.** Consistent
with these being unscored checklists. A scored audit form presumably populates both; don't drop the
field.

**F. ⚠️ The capture is TRUNCATED — it ends mid-object on the fifth row.** Row count, the full status
vocabulary, and what a COMPLETED row looks like are all **unseen**. In particular, store 10034 appears
in rows 1 and 5 for the same form, and row 5's `scheduledAt` is cut off, so **whether rows duplicate
is unknown** — do not read the repeat as a duplicate-row bug or as two occurrences. Get a complete
response before designing the ingest key. A plausible PK is `(location, formId, scheduledAt)`, and
that is a guess.

### 📌 It sharpens the FL duplicate-forms question into something urgent

All four fully-captured MISSED rows are **Breakfast Pre-Shift at 10034, 37566, 6178, 6838** — every one
a **Florida** store, and every one of them is in the set that submits the **EA** pre-shift forms
instead (see below). The obvious reading is that FL stores are still *assigned* the legacy
94-question pre-shift after moving to the 35-question EA version, so they are scored as MISSED for a
form they were never meant to file.

**That is a hypothesis on four rows of a truncated response, not a finding** — but it is the highest-
stakes one here, because it inverts the dashboard's meaning: those MISSED rows would be a **stale
assignment**, not an operational failure, and shipping them as a compliance score blames GMs for
following the rollout. **Settle this before the dashboard shows anyone a miss rate.** Per the
`CLAUDE.md` voice rule, a number that names a decision must be a number that is right.

## Open questions a pull must settle

The two that blocked the dashboard — the assignment/schedule denominator and the submitter — are
**both answered by `completionDetail`**. What remains:

1. **🔴 A COMPLETE `completionDetail` response.** The capture is truncated at ~4½ rows, all `MISSED`
   at FL stores. Unseen: the full `status` vocabulary, what a completed row's `completedBy` and
   `score` look like, the row count, and whether occurrences can repeat. **This is the one blocker**
   — the ingest key cannot be chosen without it.
2. **Is the FL legacy-pre-shift assignment stale?** Decides whether MISSED means a failure or a
   rollout artifact, and therefore whether the dashboard is trustworthy at all. Highest stakes.
3. **Auth shape for `forms.home`** — get the DevTools request-header panel; do not infer from curl.
   `sec-fetch-site: same-site` makes an invisible cookie genuinely plausible on this host.
4. **The rest of the sibling family** — `completionByForm`/`completionDetail` confirm the naming
   pattern; a `completionByLocation` or per-user variant may exist and may be cheaper for rollups.
5. **Range limits and paging.** One week × 27 stores already produced a large `completionDetail`
   response. Check for a cap or cursor before attempting a backfill — and per the standing rule,
   depth is not a limiter, so plan the backfill rather than scoping around it.
6. **Overlap with anything Meridian already has** — nothing today covers shift checklists, so this is
   probably net-new rather than redundant, but check per the auto-first rules before adding a stream.
