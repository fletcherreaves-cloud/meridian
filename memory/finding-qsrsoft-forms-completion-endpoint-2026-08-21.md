---
name: finding-qsrsoft-forms-completion-endpoint-2026-08-21
description: Owner-captured QSRSoft Forms completionByForm endpoint - shift-checklist / travel-path form submissions per form per store, with an answered-vs-total question count. Logged toward an owner-requested forms dashboard. A NEW third host family (forms.home.myqsrsoft.com). Records the measured gap between what the owner asked for and what this endpoint can answer - it cannot say "missed" and does not name the submitter - plus the store-ref cross-finding that corrects the event_details note.
sensitivity: open
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

✅ **RESOLVED 2026-08-21 — token-only, NO session cookies. A plain Node `fetch` works; no
Playwright.** The owner supplied the DevTools **request-header panel** for a live
`completionByForm` POST, which reports what was actually transmitted rather than what a curl
reconstructs. The alphabetical header list runs `Content-Length → Content-Type → Origin` with
**`Cookie` absent** — it would sort between `Content-Type` and `Origin`. `x-auth-token` sorts after
`User-Agent`, below the fold, consistent with the curl.

This mattered because `sec-fetch-site: same-site` made a cookie genuinely plausible: the browser
classified `forms.home` and `v3` as same-site, exactly the condition under which a
`.myqsrsoft.com`-scoped `SameSite=Lax` cookie *is* attached silently. It wasn't. **So this host
behaves like `api.security` (token-only), not like the DAR host (Playwright required)** — and the
forms pull is substantially simpler than it was scoped as.

**Method note worth keeping:** a curl transcript and a DevTools request-header panel are two
different artifacts with two different evidentiary weights. The curl could not have settled this;
the panel did. Same lesson as `event_details`.

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
completeness (`answered/total`) is **not** the same as form-compliance (`submitted/required`). Both
are naturally called "completion percent." Label them distinctly or the dashboard misleads.
⚠️ **And `completionDetail`'s numeric `status` gives the ratio but NOT its denominator** — so it
cannot be aggregated correctly on its own (averaging ratios violates the never-average-averages
rule). `completionByForm`'s `answeredQuestions`/`totalQuestions` are the numerator and denominator
you need to roll thoroughness up across forms. **That is why both endpoints are still required.**

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

## ⭐ `completionDetail` — the endpoint to build on (FULL response measured, 2026-08-21)

```
POST https://forms.home.myqsrsoft.com/api/forms/reports/completionDetail?orgId=a546d4ef-…
{"startDate":"2026-08-19T05:00:00.000Z","endDate":"2026-08-22T04:59:59.999Z",
 "locations":["3708",…,"noLocation"]}          <- NO formIds. That is the point.
```

**No `formIds`.** The server already knows what each store is assigned, so this **defeats caveat 9
outright** — no forms-list endpoint has to be found and no hardcoded UUID list can go stale.

**Measured against the complete response: 4,714 rows, 3 days × 27 stores, 13 distinct forms.**

### One row per scheduled occurrence — the full field set

```json
{"formTitle":"Breakfast Pre-Shift", "formId":"03b62c8f-…", "location":"37566",
 "status":1, "missed":false, "hasResponse":true,
 "scheduledAt":"2026-08-19T11:00:00Z",
 "startedAt":"2026-08-19T10:09:24.638Z", "completedOn":"2026-08-19T10:16:49.097Z",
 "timeToComplete":444444, "completedBy":"<NAME>", "userId":"<uuid>",
 "score":null, "reviewedWith":"N/A", "assignedTo":[{"name":"General Manager","type":"group"}, …]}
```

### 🔴 `status` IS POLYMORPHIC — a string enum OR a float. This is the biggest trap in the payload.

| `status` | n | `missed` | `hasResponse` | meaning |
|---|---:|---|---|---|
| `"MISSED"` | 3,886 | `true` | `false` | scheduled, window passed, never done |
| `"--"` | 599 | `false` | `false` | **scheduled but still open — NOT a miss** |
| a **number 0–1** | 229 | `false` | `true` | **completed**, and the number is the completion fraction |

**Three states, not two.** Treating `"--"` as missed over-reports misses by 599 rows (13% of the
dataset). A dashboard must carry *done / missed / still-open* or it lies about the current day.

`missed === (status === "MISSED")` on **all 4,714 rows, zero disagreements** — so `missed` is a
reliable boolean, and the safe way to read this field is: **branch on `missed`/`hasResponse`, and
only then treat `status` as a number.** Never `String(status)`, never a `switch` on it.

**The numeric `status` is the within-form completion ratio.** `0.9893617021276596` = **93/94**, on
the 94-question Breakfast Pre-Shift. So per-submission thoroughness is available here after all —
but see the aggregation caveat below.

### Fields that exist ONLY on completed rows

`completedBy`, `userId`, `startedAt`, `completedOn`, `timeToComplete` are present on **all 229
completed rows and none of the other 4,485**. Any ingest must treat them as nullable, not optional-
in-principle-but-always-there.

- **`timeToComplete` is MILLISECONDS of ACTIVE time, not wall-clock elapsed.** Median ratio to
  `completedOn − startedAt` is 0.9999, but the floor is 0.0000: one Dinner Pre-Shift shows **28.97
  days elapsed against 109 seconds of `timeToComplete`** — a form left open and finished much later.
  So `timeToComplete` is the honest "how long did this actually take" (median **125 s**, p10 24 s,
  max 6,878 s) and the timestamp difference is not. **Do not derive one from the other.**
- **`score` is null on all 4,714 rows and `reviewedWith` is `"N/A"` on all 4,714.** Measured, not
  assumed — both fields are entirely unused by this estate's forms today. Keep the columns (a scored
  audit form presumably populates `score`), but no metric can be built on them now.
- **`userId` is a UUID — 229 present, 40 distinct people.** This matters for the vault: it is a
  **stable, non-identifying person key**, so ingest can key on `userId` and never store
  `completedBy` at all. Better than tokenising a display name, which is not guaranteed stable.

### 🔴 `scheduledAt` can be NULL — 32 rows, every one of them completed

These are **ad-hoc submissions**: someone filed a form with no scheduled occurrence behind it (6
Travel Path, 6 Lunch Pre-Shift, 6 Red Bull, 5 EA Lunch PS, and others). **This kills the obvious
primary key.** `(location, formId, scheduledAt)` drops or collides all 32, and they are real
completed work. Key on something that survives a null `scheduledAt`.

## 🔴 The headline number is a CADENCE ARTIFACT — do not ship it

Estate-wide the response reads **229 completed / 3,886 missed / 599 open = 4.9% completion.** That
number is worthless, and shipping it would tell every GM they fail 95% of the time.

**Travel Path is scheduled 27–45 times per store per day** and accounts for **4,096 of 4,714 rows
(87%)**. Nobody performs 27 travel paths a day; the schedule is a high-frequency window, not an
expectation of 27 completions. Decomposed by cadence:

| form group | median schedule | completed |
|---|---|---:|
| Daily pre-shifts (Breakfast/Lunch/Dinner, ±EA) | **1 / store / day** | **77 / 302 = 25.5%** |
| Travel Path (No Play Place / With Playland) | **27–45 / store / day** | 129 / 4,096 = 3.1% |
| Everything else (Red Bull 3/day, Cash Audit, Food Safety) | mixed | 23 / 316 = 7.3% |

**So the dashboard must segment by form cadence.** Only the ~1/day forms support a true
completed-vs-missed rate. High-frequency forms need "completions per day" against a realistic
target, never a percentage of the schedule.

**On the daily pre-shifts — where the denominator IS meaningful — 25.5% estate-wide is a real,
actionable number**, and it names a decision. Two forms were **never once completed** anywhere:
**Cash Audit** (8 scheduled, 4 stores) and **Food Safety Visit 2026** (36 scheduled, 1 store).

### 🎯 Seven stores completed ZERO daily pre-shifts in three days

**5183 Chickasha · 6972 Ada · 18213 Lindsay · 29760 Duncan · 33109 Marietta · 34222 Harrah ·
38609 Freeport.** All 27 stores *are* scheduled the pre-shifts, so these are genuine zeros, not
unassigned stores. This is a **superset** of the five that `completionByForm` returned no row for —
it adds 6972 and 33109, which `completionByForm` hid because they had *some* submission of *some*
other form. That difference is the clearest argument for `completionDetail` being the primary source.

## ❌ CORRECTION — my FL "stale assignment" hypothesis is REFUTED

The earlier draft of this file called it *"the highest-stakes hypothesis here"*: that Florida stores
had moved to the 35-question EA pre-shifts while still being assigned the 94-question legacy set, so
their MISSED rows were a rollout artifact rather than a failure. **The full response disproves it.**

- Legacy Breakfast Pre-Shift completion: **FL 17/45 = 38%** vs **OK/other 24/61 = 39%.** Statistically
  indistinguishable. FL is not being penalised relative to OK.
- **All 27 stores** are scheduled the legacy pre-shifts — this was never an FL-only assignment.
- The EA forms are **scheduled at essentially one store (35242 Cottondale)**. The EA completions at
  6178 and 6838 that made it look estate-wide were **ad-hoc rows with a null `scheduledAt`**.

I built that hypothesis on four rows of a truncated response and on a weekly aggregate that showed
*submissions* without showing *assignments*. It looked strong and it was wrong — the standing
measure-don't-reason rule, working as intended. **The MISSED rows are real; there is no artifact to
subtract.**

## 📐 Dashboard spec — owner-stated 2026-08-21

*"Maybe include an in-app threshold. Ideally they complete them all, realistically, they need to
complete at least 80%. Hopefully can be attributed to manager(s) on duty. If not, for now, total
day, and we can research tying to scheduled shifts and punched times by employee to measure."*

**Threshold: configurable in-app, default 80% of scheduled occurrences completed.** Note this is the
*compliance* reading (submitted ÷ scheduled), not within-form thoroughness — thoroughness already
runs ~98.8% estate-wide, so a threshold there would never fire.

**Judge a store-day only on RESOLVED occurrences.** `"--"` (still open) must be excluded from both
numerator and denominator — you cannot miss something that is not yet due. Including it would mark
every store red for the current day, every day.

### ⚠️ At 80%, almost everything is red on day one. That is a finding, not a reason to move the line.

| form | store-days | pass ≥80% | **% passing** |
|---|---:|---:|---:|
| Breakfast Pre-Shift | 81 | 28 | **35%** |
| Lunch Pre-Shift | 80 | 13 | 16% |
| Dinner Pre-Shift | 54 | 5 | 9% |
| Travel Path No Play Place | 87 | 6 | 7% |
| Red Bull Tracking | 81 | 5 | 6% |
| Travel Path With Playland | 21 | 0 | **0%** |
| Cash Audit · Food Safety · EA Lunch · EA Breakfast | 13 | 0 | **0%** |

Roughly **85% of all store-days fail an 80% bar today.** The owner set 80% as a *standard*, not a
prediction, so the honest move is to show it — but a panel that is uniformly red names no decision
and gets ignored (`CLAUDE.md`: *"a number nobody acts on is not a shipped feature"*).

**Therefore: make the threshold PER-FORM, not one global number.** A daily pre-shift (1/store/day)
and a Travel Path (27–45/store/day) are different commitments and cannot share a bar. Default every
form to 80%, let the owner tune each, and show the store-day pass rate beside the bar so a
mis-set threshold is visible rather than silently flagging everything.

### 🔴 Manager attribution is NOT possible from the forms data alone — measured

| | |
|---|---|
| completed rows carrying a person (`userId`) | **229 / 229** |
| **MISSED rows carrying a person** | **0 / 3,886** |

**A miss has nobody attached to it**, which is exactly the row a manager would be accountable for.
`assignedTo` is role *groups* (General Manager / Shift Manager / …), not individuals, and
`completedBy` is whoever *filed* the form — not necessarily the manager on duty. So the owner's own
fallback is the correct one: **total-day for now.**

**The research path he named is real and the data already exists.** Attribution needs
`scheduledAt` → who was on shift at that moment:

- **`lifelenz_schedules`** — scheduled shifts, already pulled daily. The cheaper first join.
- **`people/time-punches-matched`** — actual punches, endpoint captured
  (`finding-qsrsoft-time-punches-endpoint-2026-08-21.md`), not yet pulled. More accurate, since
  scheduled ≠ worked. 🔴 **Never put `ssn` in its `selectCols`.**

Encouraging for tractability: the median store-day has **1 distinct submitter** (max 3), and only
**40 distinct people** filed across 22 stores in three days. Attribution is a small join, not a
disambiguation problem.

⚠️ **Both joins need the boundary decided first.** `scheduledAt` is UTC on a local-midnight window;
LifeLenz and the punches are on their own boundaries, and the DAR is on the 4am business day. Per
`CLAUDE.md`, both legs of any such join must sit on the same boundary.

## 📌 Sibling endpoints seen in the same Network capture — leads, not findings

The header-panel screenshot showed other in-flight requests on the same page. **None were captured,
so these are addresses to probe, not confirmed behaviour:**

| request | why it might matter |
|---|---|
| `forms?orgId=…` | plausibly the **forms list** — would let a pull enumerate `formIds` for `completionByForm` instead of hardcoding 61 UUIDs (caveat 9) |
| `scheduled?orgId=…` | possibly the schedule/assignment source in its own right |
| `getHierarchyByUser?userId=…` · `getPeersByUser?userId=…` | an **org hierarchy** by user — potentially relevant to RBAC scoping and to the manager-attribution question |
| `locations?selectedFields=locationId…` | location metadata |

Also visible: a **`get_user_role` request that FAILED** (red in the Network list). Unrelated to the
forms work and possibly benign, but worth a glance if role-based behaviour ever looks wrong in
QSRSoft itself.

## Open questions a pull must settle

The dashboard is no longer blocked — the denominator, the submitter, the per-day date and the
completion ratio are all measured. What remains:

1. **The cadence question, and it is a product decision not a data one.** Travel Path is scheduled
   27–45×/store/day. What *is* the expectation? Until someone says, the panel can only report
   "N completed today," never a percentage. **Ask the owner before designing that tile.**
2. **Auth shape for `forms.home`** — still unverified. Get the DevTools request-header panel;
   `sec-fetch-site: same-site` means a cookie would be attached invisibly, so curl cannot settle it.
3. **The ingest key**, given 32 completed rows carry a null `scheduledAt`. `(location, formId,
   scheduledAt)` is not viable. A surrogate key plus a natural-key index is the likely answer.
4. **Range limits and paging.** 3 days × 27 stores = 4,714 rows with no pagination envelope visible.
   A year's backfill is ~570k rows — find the cap before attempting it. Depth is not a limiter per
   the standing rule; plan the backfill rather than scoping around it.
5. **Whether `userId` is stable across stores and over time.** If it is, it is the vault key for this
   stream and `completedBy` never needs storing.
6. **The rest of the sibling family** — `completionByForm`/`completionDetail` confirm the naming
   pattern; a per-user or per-location variant may be cheaper for rollups.
7. **Overlap with anything Meridian already has** — nothing today covers shift checklists, so this is
   net-new rather than redundant, but check per the auto-first rules before adding a stream.

## ⚠️ PII handling for this stream — not optional

`completedBy` is a **plaintext employee name**. The identity-vault rules apply unchanged: route
through `get_or_create_employee_token()` on ingest, never persist a plaintext name, never log one,
never put one in a test fixture, and surface a name only via the logged `reveal_employee_identity()`
path. **Prefer keying on `userId`** (a UUID) so the name never needs to be stored at all.

No name, `userId`, or other identifier from the captured response is recorded in this file.


---

## 🔴 UPDATE 2026-08-22 — the token-only server-side path returns NOTHING

The pull script built on this endpoint (`scripts/qsrsoft-forms-completion-pull.mjs`) has run twice
in production and returned **zero rows on every chunk**, including a window that OVERLAPS the
4,714-row capture recorded above. No 401, no 403, no non-2xx — a 200 with an empty array, in under
a second.

**This is the caveat in the host table above coming true.** That table says
`forms.home.myqsrsoft.com` auth is **"UNKNOWN — assume nothing"**; the pull script assumed the same
shape as `api.reports` and shipped untested against a populated window. The likely reality is that
this host fails **silently** (200 + `[]`) where `api.reports` fails **loudly** (401).

📌 **For anyone extending this finding: the 4,714-row measurement above was taken from a BROWSER
session.** Nothing here establishes that a server-side token-only request can read this endpoint at
all. Treat the response schema as measured and trustworthy; treat the *access method* as unproven.

Full diagnosis and the test that settles it: `memory/dispatch-71.md`.
