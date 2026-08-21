# Meridian Project Memory — Master Index

> Read this to discover what's documented. **Newest work is at the top.** When resuming a
> session, read the most-recent handoff first, then the relevant thread files.

## 🛑 BEFORE YOU THEORIZE ABOUT DATA — these questions are already answered

**Added 2026-08-16 because rediscovery, not bugs, was the largest single cost of that day's work.**
Three separate re-derivations in one day, each of an answer already sitting in this directory:
`#243` re-proposed from scratch what `#327` then built (four days apart, same two atoms); a PM
day-boundary theory was written into CLAUDE.md and refuted an hour later by a file from 08-07; and
`#330`/`#331` were filed twice, twelve seconds apart, by two agents who couldn't see each other.

None of that was carelessness. **`dar-vs-ops-reconciliation.md` was not in this index** — 43 of 124
memory files weren't. The answer existed and nothing pointed at it.

| If you are about to ask… | Read this FIRST | It already says |
|---|---|---|
| "Has the June McValue price increase been separated from the McValue traffic effect?" | [analysis-mcvalue-price-waves-2026-08-18.md](analysis-mcvalue-price-waves-2026-08-18.md) | **Yes — measured 08-18.** Price alone costs −1.17 to −1.46 pp of the full-window OK decline (gated, band-widened after a non-zero placebo). The clean six weeks (B1–B3, −3.14 pp) need no correction at all — lead with that number, not the full-window one |
| "Is the DAR aligned to the 4am business day?" | [dar-vs-ops-reconciliation.md](dar-vs-ops-reconciliation.md) | **Yes — measured 08-07.** `hour_slot` runs `05:00→28:00` = 04:00→04:00. Boundary RULED OUT as the cause of DAR-vs-Ops deltas. Also: deltas are ~0.01% **only on days with a complete 24 slots** |
| "Which labor % basis do we use, and does it include managers?" | [project-labor-pct-punched-vs-crew.md](project-labor-pct-punched-vs-crew.md) | Standardized on **Punched (all-hourly)** so FL and OK compare like-for-like. Crew Labor % silently includes salaried-manager $ where a store is configured that way (**FL is, OK isn't**). *"Read before touching any labor-basis code"* |
| "What's the 4am cutover helper?" | `src/utils/date.js:101,117` (code, not memory) | `businessDate()` / `lastClosedBusinessDay()`. Consolidated after recurring **five times** as signature #4 — see [plan-data-integrity-sweep.md](plan-data-integrity-sweep.md). Never re-derive inline |
| "Can I verify this from a sandbox session?" | [feedback-verification-in-sandbox.md](feedback-verification-in-sandbox.md) | The working Playwright/Chromium recipe, the CORS hard stop, and the merge-resolution class the suite does NOT catch |
| "Is this metric averaged correctly?" | [weighted-rollup-audit.md](weighted-rollup-audit.md) | Full average-of-averages sweep — what was fixed, what was already right, what was left alone and why |
| "Does the hourly projection have a known bias?" | [project-hourly-projection-accuracy.md](project-hourly-projection-accuracy.md) | Corroborates the 4am/`hour_slot` mapping independently (`:81`) |

**The discipline this encodes:** CLAUDE.md's *"check whether an affordance already exists before
adding one"* covers code. It applies just as hard to **explanations**. Search `memory/` and
`src/utils/` before writing a mechanism into any durable doc — the grep that refutes you costs
seconds, and the theory that survives one costs a PR.

### Dispatch files come in TWO naming conventions — grep for the NUMBER, not a filename

A missed pairing here reads as an unindexed file and invites a pointless "fix" (this exact
confusion cost a PM pass on 2026-08-21). Both shapes exist on purpose:

| Shape | What it is | Example |
|---|---|---|
| `dispatch-NN.md` | the **PM brief** — the spec handed to the engineer, written before the work | `dispatch-52.md` |
| `dispatchNN-topic.md` | the **engineer writeup** — what actually shipped, written after | `dispatch44-cash003-count-rule.md` |

Most briefs are linked from this index directly. **Measured 2026-08-21, exactly four are not**,
and each for a reason:

- **`dispatch-44.md` / `dispatch-45.md` / `dispatch-46.md`** — the engineer writeup carries the
  durable content and *is* linked (`dispatch44-…`, `dispatch45-…` + `dispatch45b-…`,
  `dispatch46-…`); the briefs are cited in prose instead. Not drift.
- **`dispatch-32.md`** — **superseded the day it was written**, deliberately kept with a
  correction notice on top. Read `dispatch32-pipeline-contract.md` instead.

Everything else, #20 through #54, has a linked entry. A few dispatches also carry a second file
for their implementation pass (`dispatch-48-inv003-inv005-identity-vault.md`,
`dispatch-50-implementation.md`).

**One genuine hole: dispatch #47 has NO memory file at all.** The number was used — #47 was the
Register Audit response-key diagnostic (the DEBUG-gated key-name log in
`scripts/qsrsoft-register-audit-pull.mjs`) and the CASH-003 manual-report check — and #48's and
#49's briefs both cite it, but its own brief was never committed, so those citations are dangling
pointers. This is exactly CLAUDE.md's *"never end a session with an uncommitted memory file"* rule
being violated once and the cost landing later. Recover #47's intent from
`dispatch-48-inv003-inv005-identity-vault.md:174`, `dispatch-48.md:151`, and `dispatch-49.md:44`
— not from a file, because there isn't one.

**So: `grep -rn "dispatch.\?NN" memory/` — never conclude a dispatch is undocumented, or that the
index has drifted, from one filename missing.**

## ⭐ READ FIRST — latest handoff & vision
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [PR #537 review — two reproduced defects in the forms normalizer](review-537-forms-slices-1-2.md)** —
  **(1) `"noLocation"` → the garbage loc `"0000NaN"`** — it is a genuine member of every request's
  `locations` array, `parseInt` gives `NaN`, and the usable-row guard only checks non-null. Fix with
  a sentinel (`'NOLOC'`), **not** by dropping the row — those are real unattached completions.
  **(2) `LOCAL_MIDNIGHT_OFFSET_MS = 5h` hardcoded misbuckets a day for the whole CST half of the
  year** — a completion at 23:30 local on Dec 20 lands on Dec 21, so a store shows a miss on day N
  and a phantom completion on N+1. Silent. Fix with `Intl.DateTimeFormat('en-CA', {timeZone:
  'America/Chicago'})`, verified across both DST transitions. **`America/Chicago` covers the whole
  estate** — the seven FL stores are Panhandle-west-of-the-Apalachicola and therefore Central, which
  is worth a comment since "Florida" reads as Eastern. Everything else passed: resolved-only
  judging, Σ/Σ aggregation, no `completedBy` in the output, `timeToComplete` not derived.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #57 — persist per-person employee tenure (Part B)](dispatch-57.md)** —
  **NEWEST.** 🔴 **Owner-approved reversal of a deliberate privacy decision**: the roster pull's own
  header says *"No individual-employee data is stored anywhere"* — it already FETCHES the hire dates
  and throws them away. Owner: *"reverse it… let's just do it all."* New `qsr_employee_tenure`
  (per-person, per-store, PK `(tenant_id, loc, geid)`, RLS via `accessible_locs`), added to the
  **existing** `qsrsoft-employee-roster-pull.mjs` — already watched, no new workflow.
  🔴 **`orgStartDate` is NOT currently in `SELECT_COLS` and is half of Part B** — add it, plus
  `hourlyPayRate`. **BOTH start dates, distinctly labelled** (owner: *"both are relevant"*); never
  render a bare "start date"; surface the gap where they diverge. **The fetch-side allowlist STAYS**:
  `ssn`, `dateOfBirth`, `nationalOrigin`, `gender`, `federalMaritalStatus`, address, contacts remain
  excluded — protected-class attributes beside performance data let a metric split by race or age by
  accident, which is not hypothetical in a system with an auto-correlating Scanner. Add a guard test
  asserting they stay out. Pay ships in the table but is **surfaced in no panel** (role-gating
  deferred by the owner — an unrendered column is easy to gate later, a rendered one is not).
  Watch `"0000-00-00"`, the date null sentinel.
- **🔴⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [`regAudit` — we pull ONE THIRD of the Register Audit](finding-qsrsoft-event-details-endpoint-2026-08-21.md)** —
  UI capture settles both knobs: **`registerType` = Cashier · Manager · Preparer**, and
  **`resultType` = BY LOCATION · BY EMPLOYEE only — there is NO `byRegister`** (retracting a
  shortcut I suggested for Part E; it still needs `event_token`). 🔴 **`qsrsoft-register-audit-pull.mjs:295`
  hardcodes `registerType:'cashier'`, so `audit_rows` is missing Manager and Preparer entirely** —
  and **manager** over/short, promo and discount activity is exactly what a controls rule most wants
  to see. Real gap, but **not a one-line loop**: it changes `audit_rows`' grain, so PK, subject
  grouping and existing aggregates all need checking. Scope it as its own work.
  ⚠️ **Also a method miss worth remembering:** I wrote up "no Cookie on the DAR host" as a possible
  correction to the Playwright rule — it was **already settled 2026-08-20 and documented in that
  same script** (lines 335-342), and more precisely: the working request carries **no cookie AND no
  token**, being scoped by `orgId`/`nsn` and validated on `Origin`/`Referer`. One `grep scripts/`
  would have found it. What IS still open and narrower: `/data_layer/v1/service/…` is the only path
  family where "needs Playwright" may still hold — `ops-pull` uses a direct token and `regAudit`
  needs no credential, so **`CLAUDE.md`'s blanket claim about that host is too broad** and should be
  narrowed to the path family it actually describes.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [The COMPLETE QSRSoft report catalog — 108 screens](finding-qsrsoft-report-menu-map-2026-08-21.md)** —
  From an **unauthenticated static `menu.json`** on a **fourth host** (`api.sso.myqsrsoft.com`;
  blocked by our egress proxy, so owner capture only). Every capture carries
  `Referer: /reports/mcd/<path>`, so this is **the complete index of which screen to open** to
  capture any endpoint — no more guessing whether a report exists. 🎯 **It lands directly on open
  roadmap items:** `product/productMixDrillDown` + `productMixTrend` + **`menuPriceComparison`** are
  the "Product Mix pull → Pricing Engine" candidate; **`service/voice`** could retire the MANUAL SMG
  VOICE upload (standing rule: manual sourcing is always temporary); **`shift/shiftManagerSummary`**
  is the missing leg of forms manager attribution and maybe cheaper than roster+punches;
  **`people/newHires`** is Part B purpose-built; **`people/rosterStatistics`** may give roster
  insight **without PII**, sidestepping the `employee-roster` allowlist problem — check it first.
  Also unclaimed: `laborExceptions`, `overtimeAudit`, `turnoverReport`, **`studentPermitStatusCheck`**
  (minor-labor compliance, a real legal-risk gap), `reportFinder`. ⚠️ **Overlaps to diff, not adopt:**
  **`controlsLabor/vlhOverUnder`** (we compute VLH ourselves — diff the formulas first),
  `scheduleVariance`, `laborSchedules`. And all three **emailed** streams (Glimpse / Sales Ledger /
  Cash Sheet) have **API screens here**, which is the API-over-email rule's case for migrating them
  since an API pull can backfill and email cannot.
- **🔴⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [`employee-roster` — Part B ANSWERED, and the most sensitive endpoint yet](finding-qsrsoft-employee-roster-endpoint-2026-08-21.md)** —
  **NEWEST.** 🔴 **Returns SSN, home address, DOB, race (`nationalOrigin`), gender, marital status
  and pay rate.** Worse than `time-punches`. The **`selectCols` allowlist is the security control** —
  request only `geid`/dates/job-title/status fields; the pull script must assert none of the denied
  fields are present, so a future edit fails loudly. Protected-class attributes must not be ingested
  at all: having them next to performance data lets a metric split by race or age *by accident*.
  🎯 **Dispatch #56 Part B is answered** — and "start date" is **two** fields: `orgStartDate` (joined
  the org) vs `storeStartDate` (joined this store), which diverge often and hugely (one record: eight
  years org, two months store). ✅ **Owner decision: "both are relevant" — ingest and surface BOTH,
  distinctly labelled; never render a bare "start date".** The divergence itself is worth showing
  ("8 years with the org, 2 months at this store" names a real coaching situation). `jobTitleCodeStartDate` (time in
  role) may be the most coaching-relevant of the three. 🎯 Also **resolves the `time-punches`
  `jobTitleCode` unknown** (45=GM, 647=Cert Swing Mgr, 648=Crew Trainer, 650=Crew, 671=Maintenance,
  846=Dept Mgr II — partial, build from data) which is the missing piece for the **forms dashboard's
  manager attribution**: roster says who is a manager, punches say who was on shift. Traps:
  **`"0000-00-00"` is the date null sentinel** (third sentinel family after `emp_id='0'` and
  `completedBy='--'`); `hasPunched` is a `"Yes"`/`"No"` string meaning "in the window", not ever;
  **`nextReviewDate` is widely stale** and unusable as a schedule (though overdue-from-`lastReviewDate`
  is a real candidate metric); `payrollID` is null — `geid` is the key.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [QSRSoft Forms — shift-checklist completion & the MISSED denominator](finding-qsrsoft-forms-completion-endpoint-2026-08-21.md)** —
  **Owner-requested dashboard**, and it is **no longer blocked** — the full 4,714-row
  `completionDetail` response is measured. A **third host family**, `forms.home.myqsrsoft.com`;
  ✅ **auth RESOLVED 2026-08-21: token-only, no cookie** (DevTools header panel — `Cookie` absent
  where it would sort, between `Content-Type` and `Origin`), so it behaves like `api.security`, **not**
  the DAR host: a plain Node `fetch`, no Playwright. ⭐ **Build on `completionDetail`** (no `formIds`, one row per *scheduled
  occurrence*, so a miss is a returned row); keep `completionByForm` as the denominator source, since
  `completionDetail` gives a completion *ratio* with no question counts and ratios cannot be averaged.
  🔴 **`status` is POLYMORPHIC — a string enum OR a float**, and there are **three** states, not two:
  `"MISSED"` (3,886), `"--"` = **scheduled but still open, NOT a miss** (599), and a **number 0–1**
  that is the completion fraction (229). `missed === (status==="MISSED")` on all 4,714 rows, so
  branch on `missed`/`hasResponse` and only then read `status` as a number. 🔴 **The 4.9% estate
  completion headline is a CADENCE ARTIFACT — do not ship it:** Travel Path is scheduled **27–45×
  per store per day** and is 87% of all rows. Segment by cadence — daily pre-shifts (1/store/day) run
  **25.5%**, a real and actionable number; **seven stores completed ZERO in three days** (5183, 6972,
  18213, 29760, 33109, 34222, 38609), a superset of what `completionByForm` could see. Other measured
  traps: **`scheduledAt` can be NULL** on completed ad-hoc rows (32), which kills the obvious
  `(location, formId, scheduledAt)` PK; `timeToComplete` is **ms of ACTIVE time**, not wall-clock (one
  row: 28.97 days elapsed, 109 s recorded); `score` and `reviewedWith` are unused on every row;
  `completedBy` is a **plaintext name** so vault rules apply, but **`userId` is a UUID** and is the
  better key. ❌ **My FL "stale assignment" hypothesis is REFUTED** — FL 38% vs OK 39% on the legacy
  pre-shift, all 27 stores are assigned it, and the EA forms are scheduled at essentially one store.
  The MISSED rows are real; there is no artifact to subtract. 🎯 It also **corrects the
  `event_details` finding**: the security host's `storeRef` **is** the unpadded NSN (`29760` =
  Duncan-Hwy 81), so dispatch #56 Part E needs no mapping hunt.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #56 Parts E and B — status after PR #534, nothing built this pass](finding-dispatch56-part-e-b-status-2026-08-21.md)** —
  PR #534 (merged) resolved two of `event_details`'s
  open questions: **`storeRef` is the plain unpadded NSN** (`29760` = Duncan-Hwy 81 — no `loc →
  storeRef` mapping to hunt, the original finding was simply wrong, unchecked against `STORE_NAMES`)
  and **auth is token-only** (no Playwright). Three more remain, and **none are answerable from
  inside this coding session** — no `QSRSOFT_TOKEN` exists in this sandbox, checked directly, and
  every `finding-qsrsoft-*.md` in this repo was an owner DevTools capture, never an agent's: the
  `event_token` vocabulary (only `all_promo` captured; refunds/voids/over-rings/T-Reds/cash-O-S are
  each presumably a different token and this is the finding file's own "single highest-value
  unknown"), `remaining_amt`'s meaning, the `order_key`-vs-`reg_num` mismatch (a hypothesis, not a
  finding), and camera/video linkage. Also unchecked: whether `event_details`' badge number is the
  same identifier as `emp_id`/`geid` (provisionally a separate namespace — badges are two digits,
  nowhere near the length bands — but unconfirmed). **Part B:** still no hire-date field anywhere;
  `/reporting/v2/people/` (the path `time-punches-matched` lives under) is a real neighbourhood but
  not yet a proven address — its own confirmed fields carry nothing hire-date-shaped. **No code
  shipped this pass** — extends Part B's own "report before building" discipline to Part E's
  remaining unknowns, since a pull built on a guessed `event_token` or an unconfirmed join key is
  exactly the class of confident-sounding wrong answer this repo's standing rules exist to prevent.
  Next step named concretely: one more owner capture round (refund/void/over-ring/T-Red/cash-O-S)
  closes most of Part E at once; opening QSRSoft's People report menu answers Part B.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #56 Part D — is this an instance, a pattern, or a trend?](dispatch56-part-d.md)** —
  *"A first-time flag and a fifth consecutive flag are completely different situations
  and the panel currently presents them identically."* Two engine functions, both extending
  `security-drilldown.js` (no new data source — everything from `security_findings` already
  loaded): `buildSubjectTimeline()` flattens a subject's per-rule window history into one
  oldest→newest cross-rule rollup ("flagged N of M evaluations since \<date\>"); `classifySubjectShape()`
  answers instance/pattern/trend — a DIFFERENT, more precise question than dispatch #46's existing
  `classifySubjectTrend()` (checked before building anything: that one only asks "is it still going
  on," a two-state chronic/new/improving/clear story; this one asks how many times and in what
  arrangement, with a 3-consecutive-window minimum before a directional "trend" claim is allowed —
  the "do not label a shape from two windows" case dispatch #56 itself warns against). Renders
  BESIDE the existing chronic/new line, not instead of it. Plus the corroboration_rules
  finding-level cross-link — Part A already mapped the field and surfaced the static directory
  half; `corroboratingFlags()` is the other half, showing when a corroborating rule ALSO fired for
  the same subject. 1900/1900 tests (20 net new), build flat. **Same-day follow-up fix:**
  `corroboratingFlags()` originally checked only whether a corroborating rule's LATEST verdict was
  flagged at all, ignoring `windowStart`/`windowEnd` — two rules on different evaluation cadences
  can have "latest" verdicts months apart, so a stale flag could look like it was corroborating an
  unrelated later one forever. Added a window-overlap check; 1904/1904 tests (4 more, including the
  stale-window regression case). Job C Batches 2+ deferred.
- **🔴⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [`time-punches-matched` — punch edits, and the geid answer (RETURNS SSNs)](finding-qsrsoft-time-punches-endpoint-2026-08-21.md)** —
  **🔴 THIS ENDPOINT RETURNS SOCIAL SECURITY NUMBERS + full legal names. NEVER put `ssn` in
  `selectCols`** — it is caller-chosen, so the field never has to leave QSRSoft. Never persist, never
  log, never fixture. Beyond that it is valuable: real clock punches with `shift`/`meal` split,
  `isPaidBreak`, and **`inModified`/`outModified` — a punch was EDITED**, a loss-prevention signal
  Meridian has no visibility into today. 🎯 **Its `geid` answers the identity-vault question**: every
  geid falls inside the matching `audit_rows.emp_id` length band, so those bands are **one global ID
  space grown over time, not several systems** (correcting my own speculation in the G=2 note), and
  `emp_id` is almost certainly the `geid` — a real person key for Phase 2, with an authoritative
  name↔geid mapping. Badge (`event_details`) remains a **separate** namespace.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [`service/statistics` — the one that supersedes `dt-timer`](finding-qsrsoft-service-statistics-endpoint-2026-08-21.md)** —
  Richest of the four service captures. **Build service-times work on this, not `dt-timer`** — it has
  the same DT segments *plus* a `*Trans` denominator per metric, a `*Masked` data-quality count,
  `ly.` twins, kitchen/beverage/front-counter/kiosk/RTP, and all 27 stores. `dt-timer` keeps only one
  edge: the OEPE distribution buckets. Caveats: **milliseconds** (so `dt-timer`'s seconds is the odd
  one out); **every metric has its own denominator** (33109: `dtTrans` 620 vs `dtServeTrans` 582 vs
  `ctpTrans` 605 — one global count is wrong); `*Masked` should be surfaced, not ignored; and a
  **negative cumulative time exists in real data** (10915 `bevRunTimeTotal` = −7.4M).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [`mobile` — MOP service times by channel and ROA](finding-qsrsoft-mobile-endpoint-2026-08-21.md)** —
  **Logged for later, owner capture.** Mobile-order service time split by **channel** (drive-thru /
  front counter / curbside / table service) × **ROA vs not-ROA**, all 27 stores in one request, with
  **`ly.` last-year twins built in**. 🔴 **THE UNIT TRAP: `mobile` is MILLISECONDS while its sibling
  `dt-timer` is SECONDS** — same host, same day, same request shape, 1000× apart; never share a
  parser. Also: `driveThruROA*`/`frontCounterROA*` are **structurally zero** (ROA is a curbside
  concept), and a store with no LY history returns `ly.*=0`, which is **absence, not a 100%
  decline**. ✅ It also **resolves `dt-timer`'s open question** — the 3 stores `dt-timer` omitted
  show mobile DT orders, so those are dead timers, not closed stores, making `mobile` a coverage
  cross-check.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [`dt-timer` — whole-estate DT segments + an OEPE distribution](finding-qsrsoft-dt-timer-endpoint-2026-08-21.md)** —
  **Logged for later, owner capture, not yet scoped.** Returns what today's DT averages cannot: an
  **OEPE distribution** (cars under 90/120/150/180/210s) plus per-**segment** times (greet, order,
  line, windows), **all 27 stores in ONE request**, already on the 4am business day
  (`compType=trading`). ⚠️ It is on the **DAR host**, so the Playwright constraint applies — the
  token-only finding for `api.security` does **not** transfer. Four measured caveats, each of which
  yields a wrong number if read naively: the time fields are **cumulative seconds, not averages**
  (÷ cars gives a plausible 123–190s); `lane2Cars=0` still posts `line2Time`, so line1/line2 are
  probably journey **segments not lanes** (hypothesis, settle before use); `greet == orderTime`
  exactly at **2 of 24** stores (instrumentation, exclude them); and **27 requested, 24 returned** —
  absent stores are **omitted, not zero**.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #56 Parts A and C — rule directory, and a name instead of a WRIN](dispatch56-parts-a-c.md)** —
  **NEWEST.** Two owner asks on the Security panel, both "cheap and independent" per the dispatch's
  own scoping. **Part A:** a rule directory in the Legend, collapsed by default, rendered ENTIRELY
  from the live `security_rules` array (never hardcoded — the anti-hardcode test adds a rule to
  the fixture that exists in no real schema file and asserts it renders). `loadSecurityRules()`
  gained `false_positives` plus the Part D "free win" — `corroboration_rules`/`exoneration_rules`,
  populated in the table, dropped by the loader until now. **Part C:** inventory findings showed a
  bare WRIN; now shows `qsr_variance_stat.descr` as the heading, joined on `(loc, wrin, period)`
  **never** `(loc, wrin)` alone (dropping period inflated a real join ~3.5x during the 0013113
  investigation). New `inventoryItemKey()` helper shared with dispatch #52's own drill-down so the
  two period derivations can't drift apart. **One real behavior change:** viewing the Inventory tab
  now fetches `loadQsrVarianceStat({period})` once per period present, before any click — a
  deliberate, small departure from dispatch #43's "nothing fetches before a click" rule (which
  governs the much heavier drill-down pull, still genuinely click-gated). The dispatch #52 pinned
  test was updated, not weakened, to prove both halves explicitly. 1880/1880 tests (6 net new),
  build flat. Parts B/D/E remain out of scope — B needs a hire-date-source investigation first, D
  is a real subject-history build, E needs an auth/endpoint investigation before any pull design.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #55 Part B — Job C Batch 1: six overlay-to-page conversions, done](dispatch55-part-b.md)** —
  Separate PR from Part A (built off `origin/main` before Part A merged, deliberately —
  see `dispatch-55.md`'s "ship as two PRs, do not combine them"). Converted Scheduling
  (`sched-hub`), Performance Reviews (`perf-reviews`), Food Cost (`fob-analysis`), End of Month
  (`fob-eom`), Inventory Control (`eom-dashboard`) and Count Cycle (`count-cycle`) from
  `ModalShell` popups to URL-addressable full-page views, using the EXISTING `route:true`
  infrastructure (`src/app/routing.js`, untouched) built for `dicompare`/`fcst-accuracy`/`proj`/
  `report` — this batch takes it from 4 route panels to 10. `fob-analysis`/`fob-eom` had no
  internal chrome (wrapped directly in `RoutePanelShell` at the App.js call site);
  `perf-reviews`/`eom-dashboard` swapped their own `h(ModalShell,...)` for `h(RoutePanelShell,...)`
  in place; `count-cycle-panel.js` hand-rolled its own backdrop/card/header from scratch (never
  used `ModalShell`) — refactored to `RoutePanelShell`, dropping the R7 hand-rolled-backdrop
  ratchet 78→77; `sched-hub` (`SchedulingHubPanel`, defined locally in App.js) also hand-rolled its
  own bottom-sheet chrome around six internal tabs — refactored with the tab-pill-bar relocated
  into `RoutePanelShell`'s `headerExtra`, all seven modal ids that funnel into it
  (`sched-hub`/`labor-analytics`/`scheduling`/`sched-summary`/`labor-analysis`/`labor-allocation`/
  `skills-matrix`) still set the right internal tab, only the modal-open half became
  `goRoute('sched-hub')`. The six `showX` booleans are removed entirely (declaration +
  `anyModalOpen` + Escape sweep), not just unused. **Verification bar actually reached:** the
  registry ratchet test now enumerates all ten route ids; the two existing generic regex tests
  (`goRoute(...)` call site exists, `routePanel===id` render gate exists) cover all ten
  automatically; a NEW dedicated test asserts no `setShowX(true)` call site and no `useState`
  declaration survives for any of the six removed booleans anywhere in App.js — the #366 shape
  (working render, stale call site) the dispatch specifically warned about. App.js has **no
  existing render-level test harness** (unlike `shell.js`'s `AppSidebar`), so that regex coverage
  is the verification ceiling actually available in this codebase, not a shortcut chosen over a
  render test that exists — stated explicitly rather than silently settled for. 1860/1860 tests
  (1 net new + one ratchet lowered). Build clean, entry chunk essentially flat (1717.36 KB /
  510.63 KB gz vs. 1717.88 KB / 510.61 KB gz pre-PR) since all six components were already lazy.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #56 — Security panel: five owner asks, scoped against the code](dispatch-56.md)** —
  Scoping changed what four of the five actually are. **A** rule directory in the legend
  — small, the text already exists as `security_rules.description` and the loader already fetches
  it. **B** employee start date — **not a UI change: no hire date exists anywhere** in `src/`,
  `scripts/` or `supabase/`, and the LifeLenz runbook documents no employee-master endpoint;
  investigation-first, and a derived "first seen" proxy is **never** labelled as an HR start date.
  **C** product name on inventory findings — **a real defect found while scoping**:
  `security-panel.js:400` renders a bare WRIN, while `qsr_variance_stat.descr` is already mapped by
  three loaders. **D** instance vs pattern vs trend + links to prior findings — buildable from
  `security_findings` alone; also notes `corroboration_rules`/`exoneration_rules` are populated and
  silently **dropped by `loadSecurityRules()`**. **E** register + time of event — `audit_rows` is a
  daily aggregate with neither, but `transaction_detail` was **already captured**
  (`dispatch-34-phase0a-findings.md:145-180`: register #, session times, POD, itemized lines, tender
  split, manager badge) and parked *"until an actual investigation needs it"* — **this is that
  moment** — and the owner then captured a **better-fitting endpoint** for it, `event_details`
  ([finding](finding-qsrsoft-event-details-endpoint-2026-08-21.md)): one row per controls event with
  time, register, cashier name+badge, manager, daypart and tender. `event_details` is the list,
  `transaction_detail` the drill-in. **Highest-value unknown: enumerate `event_token`** (the capture
  used `all_promo`) — that is what turns every daily count in `audit_rows` into timed, named,
  register-attributed events.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #55 Part A — the section-metadata standard, done](dispatch55-part-a.md)** —
  Part A of `dispatch-55.md` — Part B (Job C Batch 1) is a separate PR, not started as of this
  entry. Corrected the three wrong `section:` values (`proj`/`lfz-gap`/`lifelenz-bridge` →
  `forecasting`, taking that section to the owner's full 10), renamed the section label and
  LifeLenz Bridge → *Recommended WFM Forecast Adjustments* (the only user-visible change — also
  fixed a real label-clipping bug the rename would have hit, `navItem` had no overflow/ellipsis
  handling). Shipped the owner's standing rule's guard: the structural half was already covered by
  an existing test; added the **promotion test** (flips `kind` to `'nav'` on the live registry
  object, renders the real `AppSidebar`, asserts the panel lands under its actual section header —
  not a string-equality check). **Found and reported, not fixed:** the promotion test surfaced that
  ⚗ TEST KITCHEN is a hand-maintained literal list in `shell.js`, not `kind`-driven — a real
  promotion is still two edits, not the one the standing rule promises. Both owner-flagged bugs
  investigated: **Forecast Audit greyed-out is by design** (the only forecasting panel gated on
  `selStore`, disabled whenever browsing at district level). **Fcst Reference is confirmed stale**
  (static HTML, last touched 2026-06-26, footer still says v4.210+) — proposal only, not rewritten.
  1872/1872 tests, entry chunk +0.04 KB gz over the true pre-PR baseline (the `dispatch-55.md`
  1680 KB figure was already stale, predating PR #522/#524).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #54 Job B — the actual regroup, v2 sidebar finally adopted](dispatch54-job-b.md)** —
  `AppSidebar` now genuinely renders from `SECTIONS` + `panelsForSection()` (Job A kept
  the v1 hand-built list on purpose, since its own registry corrections were only truthful for
  today's ad hoc grouping, not the target IA). The owner's three answered decisions applied: Visit
  Readiness + Graded Visits → Operations; Calendar/Events & Tags/Event Impact folded into Planning
  **behind the hub** (hub first, five internal tabs NOT exploded); a new Inventory & Food Cost
  section giving `Inventory` its first-ever sidebar entry (Job A's own finding — it had none at
  all). Org Summary/Rankings → Reports, Forms Library/Printable Forms → Forms, a new (currently
  empty) Analysis section. Two items explicitly left open for a future pass: forecasting-section
  membership (references an owner list not available this session) and the help-vs-admin sidebar
  split. 1859/1859 tests, build clean.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #52 — the Security drill-down, and 15 real schema-drift instances](dispatch52-drilldown.md)** —
  Five measurements scoped from the real store 0013113 investigation (not Part C's
  wish list), generalized to both cash and inventory subjects, wired into the real panel behind an
  on-demand "🔎 Investigate further" button — new `src/engine/security-drilldown.js`. **The
  rider found far more than expected**: building the schema-drift guard test (per #510's review)
  turned up **15 columns across 7 tables** missing from `schema.sql`'s own `CREATE TABLE`,
  including **`audit_rows.emp_token` — the identity-reveal system's own key column** — silently
  drifted this whole time. All 15 fixed in the same change; the new test (mutation-tested against
  the real file) keeps the count at zero going forward. 1856/1856 tests, build clean.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #54 Job A — the registry now drives label/icon/perm](dispatch-54-job-a.md)** —
  `shell.js`'s sidebar reads label/icon/permission from `panel-registry.js` instead of
  duplicating them as literals (~44 nav items), via new `navP`/`navPBeta` lookups — pure refactor,
  verified by *rendering* `AppSidebar` and diffing its exact text output against a pre-refactor
  capture, not just asserting the registry's shape. Caught one real drift doing it: the Test
  Kitchen "Projections" entry's registry label/icon had gone stale ("Proj Workflow"/lock, from a
  pruned duplicate line) vs. the live "Projections"/▦ — fixed, today's UI wins. Also corrected
  `section:` on 21 panels so it stops implying a regroup (~60%) that is 0% done in the UI — this
  is Job B's real starting catalog, not a finished regroup; two items flagged for Job B's
  attention (Inventory has no sidebar entry at all; Forms Library/Printable Forms' corrected
  section is `analytics`, not their eventual `forms` target). 1817/1817 tests, build clean.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Phase 0's gate closed, G=2 (corrected from 0) — Phase 1 landed](finding-phase0-gate-result-2026-08-21.md)** —
  Dispatch #53 Phases A–D, same day as the Phase 0 measurement below. **Phase A**: the
  403 that stopped the prior backfill was **session-token expiry**, not a rate limit (six uniform
  ~48s chunks then a deterministic cliff at ~5 minutes — an IAM explicit-deny doesn't tighten with
  volume) — closed the remaining 48-day tail in **one 3-chunk job**, 8,507 rows, 27/27 stores, no
  multi-day pacing needed. **Phase B/C**: row 5 re-measured to **0** across the full 5.7-month
  window — every one of 1,140 names now resolves to an `emp_id`. Full picture: 1,089 clean
  (95.5%), 51 merged (4.5%), 16 split (1.4%) — **67 live identity defects**. Gate (`G≤25` proceed)
  applied to `G=0` — clears with room to spare. **Phase D**: dispatch #49's Phase 1 landed —
  `employee_identity_vault` gains a nullable `employee_id` (partial unique index), and
  `get_or_create_employee_token()` gains a 2-arg overload (opportunistic-enrichment only, never
  overwrites an existing `employee_id`) — the 1-arg signature every live caller uses is
  byte-for-byte unchanged. **Not Phase 2/3** — nothing calls the new overload yet, no
  reconciliation. Adversarially probed against a real local Postgres 16 instance, 15 probes —
  critically, the exact NULL-role-bypass incident shape is still correctly rejected after this
  change. **Owner action item:** apply `supabase/schema-identity-vault-employee-id.sql` to live
  Supabase.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #54 — the IA / URL-view conversion, scoped against real code](dispatch-54.md)** —
  The PM pass `notes-67-queue.md` §1 explicitly asked for. **Two findings reshape the
  work.** (1) **The routing infrastructure already exists** — `src/app/routing.js` does
  `pushState`+`searchParams`, dependency-free — but is deliberately scoped to `route:true` panels,
  **4 of 57**. Separately `App.js` has an **82-key `modal===` chain**, so most panels are
  *deep-linkable on load* but **not routed** (opening one doesn't change the URL). Not "build
  routing" — "extend a working mechanism." (2) **⚠️ The registry's `SECTIONS` and
  `panelsForSection()` are DEAD CODE — nothing consumes them**; the nav is hand-built in `shell.js`
  with hardcoded `navLabel`/`pi(...)` calls. **This nearly produced a wrong dispatch:** the
  `section:` values suggest the owner's regrouping is ~60% done (Org Summary/Rankings already
  `reports`, Calendar/Events already `planning`, a `forecasting` section exists) and **none of it is
  true in the UI.** Sequenced as three independent jobs: **A** wire `shell.js` to the registry (pure
  refactor, nav identical after, today's UI wins any disagreement), **B** the regrouping (then each
  change is a one-line `section:` edit), **C** overlay→page in batches of 5–6 — which is the owner's
  *actual* complaint, since it's presentation not addressability. Six panels stay right-side modals
  (SAGE, KB, About, Metric Lineage, Feature Requests, Local News; three need one built) and all
  popups need minimize+close. **All three open questions ANSWERED by the owner 2026-08-21:** Visit Readiness + Graded
  Visits → **Operations**; Calendar/Events/Event Impact → **fold into Planning**, which then needs
  internal sub-nav (**⚠️ no house idiom exists — `store-analytics.js` uses underline tabs,
  `security-panel.js` uses pills; **standardise on pills** per CLAUDE.md's selector convention and
  say so, or the next panel re-decides it); and Inventory & Food Cost takes **all six**
  inventory/food-cost panels including Inventory and Product Mix. **Owner also approved BUILDING**
  the three missing right-side modals (About, Metric Lineage, Feature Requests — SAGE is the
  reference). **Four more interruption candidates identified — Settings, Panel Manager, Help, Task
  Queue — and the rule behind them:** those four plus the owner's six are almost exactly the
  registry's `help` + `admin` sections, so rather than a hand-maintained exception list, **`help` and
  `admin` panels are interruptions (right-side modal); everything else is a destination (routed
  page)** — explainable, survives new panels, and falls out of the section metadata Job A wires up.
  One genuine ambiguity flagged rather than decided: **Data Manager** (in `admin`, but uploading is a
  task you go do). Forms panels are destinations, not candidates.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #53 — close the tail, then re-key](dispatch-53.md)** —
  **NEWEST, briefed.** Executes #49's remainder. Owner approved the direction on rows 3–4 (**54 live
  identity defects** — 40 names resolving to multiple employee IDs means the vault merges distinct
  humans into one token *today*). **Phase A: close the 48-day tail with PACING AS A HARD
  CONSTRAINT** — the endpoint began returning a **403 explicit-deny IAM** after ~6 of 9 chunks, a
  third distinct failure mode and **the only volume-triggered one, so retrying harder makes it
  worse.** Three separate ~2-week runs, one retry *per run*, not before 2026-08-22; repeated
  Playwright logins hit the owner's own account and a lockout takes DAR and eBOS with it.
  **Phase B: re-measure row 5 ONLY** (rows 1–4 are settled) and report it three ways — total,
  **genuinely ID-less**, still-uncovered — since only the middle figure decides anything.
  **Phase C: the gate, with the rule written BEFORE the number exists** (a policy choice, stated in
  advance precisely so it can't be rationalised after): G ≤ 25 → proceed; 26–57 → stop, owner
  decides; > 57 → option B, a mapping table. **Landing high is a legitimate result, not a failure —
  do not tune to get under it.** **Phase D: #49's Phase 1 only** — vault gains `employee_id`,
  additive, name-keyed path unchanged, **no Phase 2/3**, and adversarially probe every
  `SECURITY DEFINER` change with the anon key.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Phase 0 — the identity match rate, measured](finding-phase0-identity-match-rate-2026-08-21.md)** —
  **NEWEST. Dispatch #49's gate, measured.** 1,140 names → **977 clean 1:1 (85.7%)**, 40 merged,
  14 split, 123 with no `emp_id`. **Row 5 resolved as a coverage artefact, categorically:** zero of
  the 123 have any row on or before the backfill boundary (2026-07-04) — and those tail rows were
  pulled *before `emp_id` existed*, so the null is **structural**. Within the covered window the
  clean rate is **96.1%**. **Rows 3–4 are a finding in their own right and nobody had measured them:
  40 names currently resolve to MULTIPLE employee IDs — the vault is merging distinct humans into
  one token today, co-mingling their findings in a system that names people — plus 14 IDs split
  across name variants. 54 live identity defects.** They are not a reason for caution about the
  re-key; they are the strongest argument for it. **PM recommendation: proceed to Phase 1, after
  closing the 48-day tail** (2026-07-05 → 08-21, 2–3 chunks) — the gate was designed around row 5
  and a strong inference is not a measurement. **Not immediately:** the backfill tripped a **403
  explicit-deny IAM policy** after 6 of 9 chunks — a THIRD distinct failure mode on this endpoint
  (alongside 401-cached-token and `token captured: false`), and the only volume-triggered one, so
  retrying harder makes it worse. Chunk future backfills across separate runs.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #52 — the drill-down, specced from a real investigation](dispatch-52.md)** —
  **NEWEST, briefed.** Scopes dispatch #46 Part C from **evidence rather than a wish list**: the
  2026-08-21 store `0013113` dig took ~8 hand-written queries over an hour, five did the real work,
  and **three of those five are discriminators Part C never named** — `stores_flagging_item`
  (store-specific vs the estate-wide broken WRINs — *the* difference between a lead and noise),
  **item-class composition vs baseline** (82.1% paper vs 47.0% is what actually identified the
  problem, and a class skew is a mechanism hint), and **secondary-metric comparison** (count
  completeness, waste logged — which both ruled out skipped counts AND produced the replacement
  hypothesis). Plus normalised flag rate **run first, deliberately, because it can end an
  investigation early** — a drill-down that can't dissolve its own premise isn't an investigation
  tool. **The lesson built in, not just written:** two hypotheses died in that hour, and the second
  ("under-logs packaging waste") explained all four measurements and was still wrong — killed by
  splitting one number by class. So **every comparison shows the estate baseline beside the
  subject's value**, and **the panel displays the measurement, never the inferred cause** — the
  mechanism at `0013113` is *still unknown* after eight queries. **Rider:** close the schema-drift
  class (a test asserting migration `ADD COLUMN`s appear in `schema.sql`'s `CREATE TABLE`) — third
  "nothing checks that two files agree" instance in three days.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #51 — capture empID, then measure Phase 0 in SQL](dispatch-51.md)** —
  **NEWEST, owner-approved.** Phase 0 failed **twice** — both attempts used a **bespoke one-off API
  pull** written for the measurement, both hit the same auth flakiness, and the engineer correctly
  **flagged the resulting "row 5 = 1,140 (100%)" as an artefact of fetching zero rows, not a
  finding** — exactly the false row-5 population #49 warned about. **The problem is the approach:**
  a hardened production pull already exists (`qsrsoft-register-audit-pull.mjs`, proven at 80 days /
  14,528 rows / 27 stores) and the measurement script inherited none of it. So: add a **nullable**
  `emp_id` to `audit_rows`, populate via the existing pull, backfill `2026-03-01→today`, then run
  Phase 0 as **pure SQL with no API dependency** — and repeatable, which matters for future
  backfills. **Banked and real from the failed run:** 1,140 distinct names across 36,631 rows,
  2026-03-01→2026-08-20 — Phase 0's denominator, no re-measuring needed. **Scope boundary is
  explicit:** additive only, nothing reads the column, **do NOT touch the vault, token keying, or
  `audit_rows`' `(loc, date, emp)` PK** — five months of manual history ride on it. The gate on the
  re-key still holds. Also fixes a now-stale comment calling `manOverringQty` "UNVERIFIED" when it
  is confirmed absent three ways. One retry max on the backfill — repeated Playwright logins run
  against the owner's own QSRSoft account and a lockout would take DAR and eBOS down too.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #51 — make Phase 0 measurable, don't re-implement the pull](dispatch-51.md)** —
  **NEWEST.** Dispatch #49's Phase 0 gate (identity-vault re-key match-rate) needed a bespoke API
  re-pull that inherited none of `qsrsoft-register-audit-pull.mjs`'s proven two-path auth /
  Playwright fallback / retry handling, and it failed twice — the second failure correctly stopped
  and flagged a false 100%-row-5 population (zero API rows fetched, not "no employee has an
  empID") rather than passing it through. Fix: additive nullable `audit_rows.emp_id text`
  (`supabase/schema-audit-rows-emp-id.sql`), populated by the SAME proven pull going forward
  (`mapRow()`/`saveAuditRows()` in both the server-side script and its client-side twin
  `src/lib/supabase.js`) — `manualRefCnt`/`manOverringAmt` is the worked example of the identical
  round trip already in that file. Once backfilled, Phase 0 becomes one repeatable SQL query, no
  API. **Additive only — does not open Phase 1, does not touch the vault/token keying, does not
  change `audit_rows`' `(loc,date,emp)` PK.** Also fixed a stale "UNVERIFIED FIELD NAME" comment on
  `manOverringQty`, confirmed absent three ways as of dispatch #49/finding-cash003 — mapping left
  unchanged. **Backfill not yet run** — blocked on the schema migration, an owner action item (not
  yet applied to live Supabase, confirmed via direct read before writing any code). Full status in
  the dispatch file's own "Status" section.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Store 0013113 — a packaging counting problem, not loss](finding-store-13113-packaging-variance-2026-08-21.md)** —
  **The first operational finding this build has produced** — every prior inventory result
  described the build's own measurement error. Store `0013113` flags INV-001 at **14.4% (28/195) vs
  a 3.4–4.1% pack, 3.5×** — and it is NOT a size effect, since every store carries 193–208 subjects.
  The items are **store-specific** (16 of the top 25 flag at only this store, so not the 30
  broken-`exp_usage` WRINs that flag everywhere), and the flags are **82.1% paper against a 47.0%
  estate baseline** — ~23 paper items where ~13 were expected, about **3.7σ**. Chronic across all
  four periods (48.3 → 21.3%, no step change, and **improving**). **Ruled out and how:** store size
  (tight subject band), the estate-wide broken-WRIN set (`stores_flagging_item`), a datable event
  (flat period trend), skipped counts (not in the estate's top 10 for `act_usage = 0`), and theft
  (McFlurry cups at **2,245%** = usage 22× expected; no resale value, no way to move them).
  **Most likely: packaging counting practice** — cases and sleeves, partial sleeves, and a lot of
  `SMPLY DEL`/`MCCAFE REFRESH` transition SKUs where old and new packaging coexist. **It surfaced
  from a panel called "Security" and it is NOT a security finding** — a process conversation, not an
  investigation, and saying so plainly matters because the cost of the other framing is paid by a
  real person. **ANSWERED same day: it is BOTH** — median 21.3% vs an estate median of 15.5% (1.4×), so
  moderately elevated across the board AND paper-concentrated. `uncounted = 0` firmly kills the
  skipped-count theory. And a fourth measurement reframes the mechanism: **this store logs 42% less
  waste than the median store** ($3,173 vs $5,497) — elevated variance + complete counts + low waste
  logging is the signature of *product wasted but never logged*, which lands in variance by
  definition. **❌ REFUTED same day:** the confound-removing query shows **paper waste logging is NORMAL**
  (530 vs a 486 estate average, +9%) — the 42% gap is **entirely food** (−46%). The store logs
  packaging waste fine and its variance problem IS packaging, so the two don't connect. Flagged in
  advance as a live outcome, which is why the 42% was never cited. **What survives:** the entire
  finding — store-specific, 82% paper, 3.5×, chronic, complete counts, not theft. **What is
  unexplained again:** the mechanism — and note *waste logging* ≠ *counting accuracy*, so
  "packaging counting practice" still leads, just without a mechanism. Untested candidates:
  partial-sleeve counting, receiving/posting, transition-SKU handling. **Separate new thread:** the
  store's FOOD waste logging is 46% below average while food is only 5 of its 28 flags — genuine
  efficiency, or food under-logging feeding the elevated 21.3% median. Two findings; don't conflate. Visible only because of the
  #42 z-score conversion; under the old flat ratio this store was buried in 2,603 estate-wide flags.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #50 implemented — scroll fix, frictionless reveal, and INV-004](dispatch-50-implementation.md)** —
  **NEWEST.** Both parts of the brief below shipped: Part A's `minHeight:0` fix (both the root flex
  column and the body scroll div — structural CSS reasoning found the root, not just the body, was
  the one refusing to shrink), verified through the real `SecurityPanel` render across both tabs and
  an expanded finding. Part B's `reveal_employee_identities_bulk()` RPC, admin-only frictionless
  reveal, session-view log granularity (a real `identity_reveal_log.person_token` nullability
  change) — **adversarially probed against a real local Postgres 16 instance**, not just read as
  SQL: 11 probes including the exact NULL-role-bypass incident shape, all correct, no name ever
  leaks. **Also lands INV-004** (waste-log padding, manager × day-part × store) after the owner
  caught dispatch #48's "no day-part denominator" premise as wrong mid-session (`qsr_daily_activity`
  already carries hourly sales) — same failure shape as `manOverringQty`. Boundary (does `busn_dt`
  need a business-date shift before joining `qsr_daily_activity`?) settled by live measurement: 0 of
  26,443 `qsr_waste` rows fall in the one window that would show it, so the join is direct, no
  shift. New third subject grain needed a `security_findings` schema change (nullable `daypart`
  column, extended `subject_key`) — **also verified against a real local Postgres instance**
  (day-part collision-freedom, upsert correctness, backward compatibility, the untouched
  one-subject check constraint). Lands inactive, thresholds measured live (median 12.99,
  `min_denominator:250` clearing a real DAR data-quality tail of 23 non-positive-sales buckets,
  `min_stdev` built in from the start after a clean pre-check — unlike INV-005, this metric isn't
  degenerate). Stated limitation, not discovered later: INV-004's findings won't group with the same
  person's CASH findings until dispatch #49's re-key lands (not yet run, checked live).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #50 — Security panel scroll fix + frictionless reveal](dispatch-50.md)** —
  **Original brief (now implemented — see the entry above).** Two owner-reported items from real use of the shipped panel. **A: the modal
  doesn't scroll** — diagnosed to the line, not guessed. `security-panel.js:468` is
  `flex:1 + overflowY:'auto'` with **no `minHeight:0`**; a flex item defaults to `min-height:auto`
  so it won't shrink below its content, the column grows past `ModalShell`'s 88vh cap, and
  `overflow:'hidden'` clips instead of the child scrolling. Invisible until the list exceeds the
  viewport, which is why it shipped. Same shape likely recurs elsewhere in `src/views/`. **B: let
  Developer/Admin/Owner see names without the click.** The reasoning is the durable part: **the gate
  never restrained the owner** (service-role access means he can read the vault directly), so it is
  friction on the one person it cannot constrain — **but the gate and the log are separable and only
  the gate is theatre.** Keep the log, auto-resolve for the privileged tier with a synthetic reason.
  A second operator is a stated plan, these findings can lead to discipline (a record of who looked
  and when protects the owner), and it costs nothing once it isn't a click. New bulk RPC mirroring
  the existing role gate; `RevealName`'s cache is **already lifted to the parent** so the component
  needs no change. **Decide log granularity up front** — per-token writes ~100 rows per panel open;
  prefer one row per session-view. **Adversarial anon probe mandatory**: this exact function shipped
  with a NULL-role bypass that a green suite missed.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #49 — one human, one token (re-key the vault on eID)](dispatch-49.md)** —
  **NEWEST, owner-approved, gated.** `employee_identity_vault` is `unique (tenant_id,
  employee_name)` — **a name IS the identity**, across 21,929 tokenized rows. So a typo creates a
  second person, a name change splits a history, and two people sharing a name merge into one token
  (the pull script's own comment concedes the last). It also produced #48's wall:
  `qsr_waste.manager` is an **eID** and `audit_rows.emp` is a **name**, so the same human gets two
  unrelated tokens and INV-004's findings will never group with that person's cash findings —
  breaking the panel's whole subject-major premise. **The eID already exists on the cash side**:
  `qsrsoft-register-audit-pull.mjs:25` records that `emp = empName (NOT empID)` was deliberate,
  because the manual-upload path has only names and switching would split-brain five months of
  `(loc,date,emp)` history. That reason is still live and is the entire cost. **Phase 0 is a GATE:**
  measure five things (clean 1:1 names, names→multiple eIDs = merged people, eIDs→multiple names =
  split people, and **names with no eID at all** = manual-only history, the hard one), report, and
  **stop**. Decision shape named in advance to prevent post-hoc rationalisation; **taking the
  option-B fallback is a success, not a failure.** Phases 1–3 put both identifiers in the vault
  (additive, name path unchanged), reconcile only unambiguous matches — a wrong merge attributes one
  person's findings to another — and switch keys last. Requires one clean dispatch-#47 key-name run
  first: **do not infer the eID field name**, that is what cost a day on `manOverringQty`.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #48 — INV-003/INV-005 + qsr_waste identity-vault extension](dispatch-48-inv003-inv005-identity-vault.md)** —
  **NEWEST.** Implements two of dispatch #48's three rules (below) plus its INV-004 prerequisite.
  **INV-003** (`unexplainedVariance = max(0, |variance| - waste)`, dispatch #45 Part C's own
  evidence that only 44.1% of INV-001 flags carry any logged waste) and **INV-005** (`positiveVariance
  = max(0, variance)`, "phantom gains," sign confirmed live not assumed: `variance = exp_usage -
  act_usage` exactly). Both land inactive, both built `min_stdev` in **from the start** — an offline
  leave-one-out simulation found `positiveVariance`'s peer-baseline stdev distribution measurably
  degenerate (5.0% exact-zero baselines) BEFORE either rule ran live, pre-empting the same defect
  class INV-001/INV-002 had to fix after the fact (dispatch #45b). INV-003 reuses
  `security_findings.exoneration_share` automatically — proven through the real call site, not just
  asserted. **A correction made mid-build, same session:** dispatch #48's own brief (below) states
  `qsr_variance_stat` "holds only 2026-08" — re-measured live and found FOUR periods (2026-05 through
  2026-08, 23,154 rows) — the missing "recent negative-variance history" qualifier is a scope
  decision this pass, not a data gap (CLAUDE.md's "data depth is never the limiter"). Plus the
  **identity-vault extension** `qsr_waste.emp_token` (same mechanism as `audit_rows.emp_token`) —
  with a stated, unresolved limitation: `qsr_waste.manager` is an eID, `audit_rows.emp` is a name,
  so the two land in separate token spaces for the same real person; no eID↔name mapping exists
  anywhere in this codebase to close that gap (the Employee Roster pull deliberately discards names
  for privacy). **INV-004 itself (manager × day-part × store) is NOT built** — ships the vault
  extension alone per the dispatch's own sequencing note; `qsr_waste` has no `wrin` (event-level, not
  item-level) and a day-part sales denominator source isn't yet identified. Also adds CASH-003 to
  `MEASURED_MAX` per the engineer action the CASH-003-resolved entry below flagged.
- **⭐⭐⭐⭐ [McValue 2.0 FBP document — Draft 5, both publish gates closed](mcvalue-fbp-draft5.html)** —
  **NEWEST on this thread.** Draft 4 closed both publish gates: the pre-launch window's one
  remaining risk (March 2026's month-long free-item promo, tested directly via Query F in
  [analysis-mcvalue-price-waves-2026-08-18.md](analysis-mcvalue-price-waves-2026-08-18.md) §5 —
  March came back with **lower** traffic and **higher** check than the rest of the pre-window, the
  opposite of what that confound predicts) is closed. Draft 5 adds one thing on top, no figures
  changed: a plain-language callout defining what "Difference" means in the traffic tables (a
  difference-in-differences / DiD — matched-day vs-LY to cancel season, then after-launch vs
  before-launch to isolate the change) and clarifying that Oklahoma and Florida are each measured
  this way **separately**, not netted against each other — the one place a true two-group
  subtraction happens is the thirteen-day price test. A same-day freshness check (Query G) found no
  material change worth folding in either — tail −4.98% vs the already-documented B6–B8 baseline
  −4.32%, gap −0.66pp, inside the no-material-change band. **The only thing left before the 25
  August meeting is the ask** — what is actually being requested of the FBP. Three candidate
  framings (relief-not-blame / a specific ask tied to −3.14 pp / a joint-diagnostic framing) are
  offered for the owner to pick from; it is a business decision, not something a query resolves. See
  [project-mcvalue-2-fbp-document.md](project-mcvalue-2-fbp-document.md)'s 2026-08-20 update note
  for full detail. Branch `claude/mcvalue-2-did-callout-h7n3w` — no overlap with the security build
  below (different tables, different files).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #48 — the inventory schemes that need no new data](dispatch-48.md)** —
  **INV-003/INV-005 shipped (#498); INV-004 UNBLOCKED 2026-08-20 and dispatched.** The
  "no day-part sales denominator" blocker was **not real** — `qsr_daily_activity` carries
  `net_sales`/`product_sales`/`transactions` per `(loc, dt, hour_slot)`, an hourly denominator
  already pulled daily, finer than day-part. Same failure shape as `manOverringQty`: a
  reasonable-sounding "we don't have X" that one look at the schema refutes. **Owner directive on
  the boundary:** *"build it the same way as we have in place. it is universal"* — the 4am→4am
  business day is universal, use `businessDate()`/`lastClosedBusinessDay()`
  (`src/utils/date.js:101,117`), never a per-rule convention and never re-derived inline (that has
  recurred five times). **The real risk is DOUBLE-shifting:** DAR's `hour_slot` is measured
  business-aligned (`05:00→28:00`) and `qsr_waste`'s date column is named `busn_dt` — a *business*
  date — so the shift may already be applied. One query settles it (do any rows have `busn_tm` in
  00:00–03:59, and what `busn_dt` do they carry).

  **NEWEST, briefed, not implemented.** Three rules, all on tables the batch job already loads.
  **INV-003 (variance unmatched by logged waste)** is the plan's own *"strongest single signal"* and
  already has its evidence: dispatch #45 Part C measured that only **44.1%** of unexplained INV-001
  flags have any logged waste and only **4.2%** have waste covering half the variance. Uses
  `qsr_variance_stat.raw_waste`/`comp_waste` and the `exoneration_share` column added in #492;
  delivers plan §1 principle 4 (a rule that searches for its own counter-evidence), which nothing in
  the build does yet. **INV-005 (phantom gains)** needs only the sign INV-001 discards via
  `abs:true` — but **determine the sign convention by measurement**, since a reversed rule passes
  review invisibly, and note it is data-blocked on a period backfill (`qsr_variance_stat` holds only
  `2026-08`) for the plan's "recent negative-variance history" qualifier. **INV-004 (waste-log
  padding)** is the most valuable and the only one with a hard prerequisite: `qsr_waste` is far
  richer than assumed (`manager` eID, `busn_tm`, `reason`, `wsource`, `edited` — all unused), which
  makes this the build's **first person-attributed inventory rule** — and `qsr_waste` has **no
  `emp_token`**, so **the identity vault must be extended to `qsr_waste.manager` first**, as part of
  this dispatch, not after. Never a plaintext eID in `security_findings`. Also note `qsr_waste` has
  **no `wrin`**, so the plan's "group by item" cannot come from it — item-level waste is INV-003's
  territory; scope INV-004 as manager × day-part × store. All three land inactive with measured
  thresholds, and `MEASURED_MAX` must be extended per rule or the guard silently skips them.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [CASH-003 — the field didn't exist, and the fix was a different instrument](finding-cash003-manoverringqty-absent-2026-08-20.md)** —
  **✅ RESOLVED same day — CASH-003 is LIVE.** Three independent confirmations that no count field
  exists (API response, Excel parser headers, owner's eyes on the report). **Retirement was nearly
  the conclusion and would have been wrong:** `manualRefAmt` works, the event is just rare — 80 days,
  19,985 rows, 27 stores → **6 occurrences, 4 employees, $70 total** ($7 smallest, $26 largest, zero
  sub-dollar noise). For an event that rare a rate AND a count are both wrong; an **absolute dollar
  threshold** is right, needs no distribution, and the engine already supported it
  (`logic_type:'threshold'`, no denominator). Shipped at `threshold: 5`, `active = true` — earned.
  **The $70 is not the signal:** a manual over-ring is a privileged override, so a flag means
  *"verify this was approved,"* never *"this person took $10."* One or two subjects per window —
  **the first rule here whose output can be reviewed exhaustively.** ⚠️ Engineer: add CASH-003 to
  `MEASURED_MAX` — it was excluded for having no measured range, and now has one. **Standing lesson:**
  when a rule can't fire, the instincts are (1) find the missing data, (2) retire it. Both were wrong.
  Ask what shape the event actually has first.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [The degenerate-stdev guard — dispatch #45 §A, second cause, closed](dispatch45b-degenerate-stdev-guard.md)** —
  **NEWEST.** A real gap left over from this session's own earlier #45 work — the dispatch's own
  "SECOND, INDEPENDENT CAUSE" section was present when #45 was first implemented but only the
  materiality gap (`min_numerator`) got built, not this one. `evaluateZScoreRule()`'s exact-zero
  stdev guard didn't catch a stdev that's non-zero but negligible — a live subject rendered "0.04 vs
  threshold 2.50 — mean 0.00, stdev 0.00 — Flagged" (both non-zero, rounded away on screen), and
  z = (0.04 − ~0) / ~0 exploded. **Measured before choosing the mechanism**: a coefficient-of-
  variation floor was tried and rejected — the real `|z|>10` INV-002 cases have CVs (0.25–3.5)
  squarely inside the population's own normal range (median 0.66); raw stdev separates it instead.
  New `min_stdev` gate (`src/engine/security-rules.js`), same honest-null class as
  `n < MIN_BASELINE_N` — INV-001: `1` (near p10=3.3, essentially a no-op safety net); INV-002:
  `0.001` (near p10=0.00086, nulls 6 of the 10 worst measured offenders). SQL handed back
  (`schema-security-rules-min-stdev.sql`). **Folded into the still-open PR #492** (dispatch #46)
  rather than a new PR, so the guard lands before that PR's Part B merges — the user's own stated
  ordering ("degenerate-stdev guard → #46 A/B"). 5 new tests, mutation-tested, 1770/1770 suite
  passes. **Remaining engineer queue, not started**: the two buildable inventory schemes
  (waste-log padding, phantom gains — `finding-security-scheme-coverage-2026-08-20.md`), then #46
  Parts C (items 2–5) and D.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #46 — make the Security panel legible, then analytical, implemented](dispatch46-security-panel-legibility-analysis.md)** —
  **NEWEST.** Owner-requested after first real use of the shipped panel. Measured first: every rule
  in `security_findings` currently holds exactly **one window** — the daily batch job hasn't run
  long enough to accumulate a rolling history yet — which directly bounded what Part C's own named
  "highest value item" (trend, chronic vs. new) can honestly show today: nothing, on real data.
  **A** — dismissible legend (Flagged/Clear/**Undetermined**, the signal badge, the 4 baseline types,
  threshold-vs-σ, the ⏸ marker); `security_rules.description` rewritten to plain restaurant language
  for the 3 engineer-voice rules (`schema-security-rules-plain-language.sql`, handed back); units on
  every number via a small `RULE_UNITS` map. **B** — `buildDecisionSentence()`: derives the real
  multiple against baseline ("about 2.6× the peer average") rather than restating the number,
  surfaces `investigation_action` as "Next:", does not soften magnitude (a 49× measured variance
  renders as a real, stated 18×, matching the dispatch's explicit instruction), names item+store for
  inventory subjects and the person (or "This employee" pre-reveal) for cash ones. **C** — built the
  two pieces real data can support: item 1 (trend) — `groupFindingsBySubject()` restructured to
  dedupe each rule to its LATEST window (a real latent bug fix: a second window would've rendered as
  a duplicate chip) while keeping full `historyByRule` for `classifySubjectTrend()`, which honestly
  returns `insufficient-history` below 2 windows rather than guessing — starts working the moment
  tomorrow's run adds a second window. Item 6 (automatic exoneration) — `exoneration_rules`/
  `corroboration_rules` are unpopulated on every rule (reading them is a no-op), so built the real
  check instead: `computeWasteExoneration()` sums a flagged inventory subject's logged waste against
  its variance, new `exoneration_share` column (handed back), panel shows a note at ≥50% coverage.
  **Items 2 (change-point), 3 (shift/daypart attribution — explicitly the dispatch's own
  highest-risk item), 4 (cross-rule fingerprints), 5 (store-vs-person) deliberately deferred**, each
  with stated reasoning in the writeup, per the dispatch's own "not all of it needs to land at once."
  23 new tests, 1763/1763 suite passes, build clean. (Part D — visual analysis — was added to
  `dispatch-46.md` after this writeup; not yet implemented, see the scheme-coverage entry below.)
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Security scheme coverage — one of ten named schemes is built](finding-security-scheme-coverage-2026-08-20.md)** —
  **NEWEST.** Owner asked whether deposit lapping / skimming / inventory padding made it into the
  build. Answered by reading `plan-security-loss-prevention.md` §2.1–2.3 against the shipped rules:
  **one of ten is built** (TvA), one is partial and inactive (refund abuse / CASH-003), one is
  structurally blocked (deposit lapping — invisible in QSRSoft because a deposit counts as
  accounted-for the moment it is *entered*; needs a bank feed, owner exploring since 08-19), and
  seven are unbuilt. Three things worth knowing: **the plan's own most-cited scheme is unbuilt** —
  post-tender void skimming needs `transaction_detail` (**zero refs in schema.sql, never pulled**)
  plus the still-stubbed `sequence` LOGIC_TYPE; **CASH-001/002/004 are rate-outlier proxies, not
  scheme detectors**, so "six rules live" overstates coverage; and **two inventory schemes are
  buildable today with data already pulled** — waste-log padding (dispatch #45 Part C measured only
  **4.2%** of unexplained flags have waste covering half the variance, which IS that scheme's
  premise; `qsr_waste` + `raw_waste`/`comp_waste` already load) and phantom gains (INV-001 discards
  the sign with `abs:true`, so signed variance is already there). Those two are the cheapest real
  coverage available and are the natural home for the unbuilt `INV-003`. Does NOT say the build is
  behind — Phase 1's job was the machine, and it works; scheme coverage is the next phase, now
  written down instead of buried in a plan nobody re-reads. (Its own commit also added Part D —
  visual analysis — to `dispatch-46.md`; the fuller #46 "implemented" entry above predates that
  addition and does not yet cover Part D, which is unbuilt.)
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [The z-score dry run — bias cancellation worked, the remainder is unexplained](analysis-zscore-dry-run-2026-08-20.md)** —
  **NEWEST.** INV-001/INV-002 executed as z-score rules for the first time (run `32408929106`).
  **The conversion is validated:** max stores flagged per WRIN went **27 → 3** (estate-wide
  uniformity was the whole signature of the measurement problem), INV-001's flag rate **50.4% →
  4.1%** (2,603 → 188), max value 36,234 → 7,569, and `undetermined` rose 167 → 703 against a ~643
  prediction derived from a *separate* measurement. **But the survivors are still not shrink** —
  top items run 827–1,429% median variance (usage 8–14× expected). Two cautions recorded for future
  sessions: a PM hypothesis that **item lifecycle** explained the remainder was **refuted by its own
  follow-up query** (marked items are 26/188 = 13.8%, not the explanation — the error was
  generalising from a top-20 *sorted by magnitude*, where marked items cluster; a sorted head is not
  a sample), and **the `(loc, wrin)` period fan-out bug recurred for the third time**, hours after
  being written down — counts inflated ~3.5× (658 vs a true 188). `count(distinct)` and medians are
  immune, which is why the bias-cancellation conclusion survived it. **Open question:** 162 flags on
  ordinary, active, unmarked items at ~101% median variance, explained by neither mis-mapping nor
  lifecycle nor plausibly theft — scoped as dispatch #45 Part C. Also: **INV-002 flags 224
  financially trivial subjects** (max a few hundred dollars) for want of a numerator-level dollar
  gate the engine cannot express. (Dispatches #44/#45's own brief entries are dropped from this
  file — superseded by their fuller "implemented" entries further below; not repeated twice.)
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [The unreachable-threshold defect class — three rules that could not fire](finding-unreachable-threshold-class-2026-08-20.md)** —
  **NEWEST.** A rule whose threshold sits above its own metric's achievable range is
  indistinguishable from a working rule finding nothing — it returns `pass:false`, a definite
  **"clear," for every subject forever.** Worse than a false positive, and why it survived: a false
  alarm gets investigated, a false all-clear gets trusted. Three instances in one day, all from the
  same "carry the old threshold forward" policy: **INV-002** (10 vs measured max 0.0868, 115×;
  caught in PR #481 review pre-merge), **CASH-003** (8 vs 0.7702, 10× — **was `active=true` and
  emitting 636 unearned clears a night**), **INV-001** (20 vs a 21.25 median — a near-miss, correct
  only by luck, which is why it's counted). Became urgent when dispatch #43's panel started
  rendering passed rules beside failed ones as *exoneration evidence*. **The guard closes the case,
  not the class:** `security-rules-thresholds.test.js` parses the real seed SQL and is
  mutation-tested, but reads only `phase1c.sql`'s z-score pair — CASH-003's defect is `threshold`
  on a `ratio` rule in `phase1.sql`, outside its scope. **Open work item: extend it to every rule
  in `phase1.sql`.** CASH-003 is deactivated in production under the owner's explicit condition
  (*"only on the premise of looking for the unmapped header to add"*) — deactivated, NOT retired:
  manual over-rings are genuinely infrequent (owner-confirmed), so `p50`/`p95` of 0.0000 is
  **correct data** and the per-$1,000 rate is the wrong *instrument*. `manOverringAmt` is the only
  override category pulled without its `Qty` sibling and `audit_rows` has no `manual_ref_cnt`;
  re-express as a count rule once it's mapped. Standing lesson: **compare a threshold to the range
  of what it gates before shipping it**, and **treat a rule's zero findings as a question, not a
  result**.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [30 WRINs with broken expected-usage mapping — a data-hygiene work list](project-inventory-data-hygiene-2026-08-20.md)** —
  **NEWEST.** The answer to the analysis file's open (a)-vs-(b) question, and a genuinely valuable
  by-product. **It is (a) — the ruler is bent, decisively.** The top-30 items by median TvA
  variance are a catalogue of hard-to-count/unit-ambiguous stock (bag-in-box syrups, FCB mixes,
  bulk condiments, sprinkle-quantity freeze-dried toppings) plus **packaging in mid-promo
  transition** (`BIG MAC CRTN/2026 SUMMER BRAND`, `10PC NGT/2026 SUMMER BRAND REL`, McCrispy
  carton/pouch). Three independent tells: the magnitudes are **impossible as shrink**
  (`BREADED CHICKEN BREAST STRIP` at a **798% median** = actual usage ~8× expected, i.e. a
  unit-of-measure or recipe-coefficient error); many items show at **all 27 stores every period**
  (loss concentrates, this is uniform); and QSRSoft's own Inventory Analysis Report has dedicated
  topics for exactly this failure class (3/5/6/7 — items not in a recipe, duplicate WRIN
  suffixes, inactive-but-in-active-recipe, incomplete recipes). **Not a suspect list — a
  data-quality work list**, and its value isn't confined to the security build: `exp_usage`
  feeds FOB reporting, the EOM workflow, count-cycle completion, and the Inventory Analysis panel,
  so everything downstream inherits the error. Fix is mostly **QSRSoft config, not Meridian code**.
  Includes a triage order (chicken strips first — a rollout whose recipe was likely never set up),
  a **corrected query** (the original over-counted via a period fan-out: `store_count` read up to
  108 = 27 stores × 4 periods, *not* 108 stores; medians unaffected), and a recommended stopgap to
  **deactivate `INV-001`/`INV-002`** until dispatch #42 lands, so nobody works a queue of 2,603
  measurement artifacts and loses trust in the system on first contact. **Standing caveat:
  "predominantly measurement error" is not "entirely" — real loss can hide in a noisy signal.
  Do not cite this as evidence that inventory loss is absent.**
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Evaluating the first real detection run — the 21% median question](analysis-inventory-variance-baseline-2026-08-20.md)** —
  The first *business* read of the security build's output, as opposed to dispatch
  #42's calibration read of the same run. **INV-001's measured median is 21.25% variance across
  5,165 live store-item observations — 4–7× the plan's own §2.2 flag guidance of ">3–5%"**, which
  is itself the synthesis of three independent industry research passes. Median, not tail. Two
  explanations with *opposite* correct responses: (a) `exp_usage` isn't a trustworthy baseline in
  this org's data and/or counting practice is noisy — in which case **threshold tuning is the
  wrong response entirely**, you'd be calibrating an instrument against its own noise; or (b) real
  widespread inventory loss, in which case it's the most important operational finding this build
  has produced. **Explicitly NOT established as fact** — the median is uncontrolled for a known
  confound (low-volume items structurally inflate percentages; ~190–200 items/store means a long
  tail likely dominates), which makes dispatch #42's exposure floor a *prerequisite for
  measurement*, not just noise-suppression. Two concentration queries in the file separate (a)
  from (b): a measurement problem is uniform across stores, an operational one concentrates.
  **Also identifies a real gap in both shipped rules:** plan §2.2's own strongest-named signal is
  variance *"not matched by a corresponding waste-log entry"* — and `qsr_variance_stat` already
  carries `raw_waste`/`comp_waste` (`schema.sql:1367-1368`), loaded by the batch job on every run,
  used by neither rule. Buildable today with no new data source, and would be the build's first
  implementation of plan §1 principle 4 (exoneration — a rule that searches for its own
  counter-evidence). Scope as `INV-003` after #42.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #45 — min_numerator, lifecycle routing, and the unexplained flags](dispatch45-min-numerator-lifecycle-investigation.md)** —
  **NEWEST.** Three parts from the z-score dry run (`memory/dispatch-45.md`, PR #489, not on `main`
  when this started — read from that PR's diff). **Part A — `min_numerator`**: INV-002 was flagging
  224 subjects on pure 2.5σ with no materiality gate (`min_value` correctly removed post-PR-481, but
  nothing replaced it — a rate can be statistically unusual on a huge denominator while the raw
  dollars are trivial). New engine gate (`src/engine/security-rules.js`), built exactly like
  `min_denominator` (per-rule data, one shared choke point) but with the OPPOSITE asymmetry: unmet
  exposure floor → honest null; unmet numerator floor → real, decided `pass:false` — the rate WAS
  computed, it just isn't material. Set to **$15**, the measured population median of
  `sum(|dol_diff|)` (n=4,474, non-condiment, live 2026-08-20) — the exact "clears roughly half"
  methodology INV-001's own `min_value` used, not an invented number. `schema-security-rules-
  phase1f.sql`, handed back. **Part B — lifecycle routing**: `qsr_variance_stat.descr` carries
  `(Deactivated)`/`(Obsolete)`/`(New)` markers the batch job already loads but never read.
  `classifyLifecycle()` tags each finding without touching its real verdict; the Security panel's
  `verdictState()` now takes the category as a priority argument — a hygiene-classified finding
  reads as neither flagged nor cleared, and `groupFindingsBySubject()` excludes it from the security
  tally entirely (separate `hygieneCount`) so subject-major convergence still means independent
  SECURITY signals agreeing, not any verdict landing there. New `security_findings.lifecycle_category`
  column, handed back. **Part C — investigated, not built** (the dispatch's own instruction: the
  deliverable is a memory file). Re-measured live rather than trusting the dry-run doc's own
  numbers, and found a real, stated-not-hidden discrepancy: this run's lifecycle-marker share among
  flagged items (2.5%) shows NO enrichment over the population rate (2.6%), vs the dry run's cited
  ~5x enrichment (13.8%) — flagged as open, not reconciled. Of the still-unexplained flags: **one
  store accounts for 23.7% of them** (top 4: 48.3%) — the strongest actionable lead this pass
  produced — and **logged waste covers ≥50% of the usage variance for only 4.2%** of them, directly
  supporting the still-unbuilt `INV-003` as the right next rule. Recurrence-over-time is
  unanswerable — `qsr_variance_stat` holds only one period so far. 18 new tests (7 engine + 2 wiring
  for A, 5 unit + 2 wiring for B's `classifyLifecycle`, 4 Security-panel routing), mutation-tested.
  1740/1740 suite passes, build clean, no entry-chunk impact.

## SQL to run against live Supabase (dispatch #45) — handed back, not assumed applied

```sql
-- supabase/schema-security-rules-phase1f.sql — see the file for full comments/reasoning
update public.security_rules
set logic_expression = '{"numerator": {"field": "dolDiff", "agg": "sum", "abs": true}, "denominator": {"field": "storeMonthSales", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_numerator": 15}'::jsonb,
    description = 'Dollarized TvA variance (dol_diff), normalized per $1,000 of store-month product sales (qsr_fob.prod_sales_amt, joined), store baseline z-score (dispatch #42). min_numerator:15 (dispatch #45 -- measured 2026-08-20 population median of sum(|dol_diff|), non-condiment, n=4,474) is a materiality floor on the RAW dollar amount, independent of the rate: without it the rule flagged 224 subjects on pure statistical unusualness regardless of dollar size (max flagged amount ~a few hundred dollars, median ~a few tens) -- min_value was correctly removed post-PR-481-review since the inherited value (10) was unreachable on this rule''s tiny rate, but nothing replaced the materiality check it used to (incompletely) provide.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'INV-002';

-- supabase/schema-security-findings-lifecycle.sql — see the file for full comments/reasoning
alter table public.security_findings add column if not exists lifecycle_category text;
```

- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #44 — CASH-003 re-expressed as a count rule, threshold guard widened to the whole file family](dispatch44-cash003-count-rule.md)** —
  Scope came from PR #481's own merge commit ("KNOWN OPEN, not addressed here"), not a
  written `dispatch-44.md`. CASH-003 (manual refund rate) has been `active=false` since dispatch #42
  measured it: threshold 8 unreachable against a real max of 0.7702 — re-measured live 2026-08-20,
  **659 of 660 non-null subjects sit at exactly 0.0000**. Not a bent ruler — manual overrings are a
  genuinely rare event (owner-confirmed), so a DOLLAR RATE collapses to zero for nearly the whole
  population no matter the constant. Fix is the instrument, not the number: `manOverringAmt`'s API
  response has always carried an unpulled `manOverringQty` sibling, the same Amt/Qty pairing every
  other override category already has — CASH-002 already proved the count shape works
  (`posOverCnt`/`drawerGC`, 10.7% believable). `schema-security-rules-phase1e.sql` converts CASH-003
  to `manualRefCnt`/`drawerGC` (CASH-002's own shape), adds `audit_rows.manual_ref_cnt`, moves
  `min_denominator` from 250 (dollars, now meaningless) to CASH-002's 25 (same field now), and
  **clears `threshold` entirely** rather than guessing — no measured range exists yet since the
  field has never been pulled. Pulled through `qsrsoft-register-audit-pull.mjs`/`src/lib/
  supabase.js`/`security-rules-run.mjs`'s mapping trio; `src/engine/security-rules.js` needed **no
  change** (rules are data). Stays `active=false`, unaffected by this migration, until a real batch
  run produces counts to measure a threshold from. **Second item — the threshold guard, widened
  from one file to the family**: `security-rules-thresholds.test.js` previously only checked
  `phase1c.sql`'s z-score `min_value` pair; added `extractInsertRules()` (a second SQL parser for
  the seed files' `INSERT...VALUES` shape, alongside the existing `UPDATE...SET` one) so the guard
  now also checks `threshold.default` on every `ratio` rule across `schema-security-rules.sql`
  (CASH-001/002's original seed) and `phase1.sql` (CASH-004, and CASH-003's own now-superseded 8) —
  closes the defect class, not just the one instance. CASH-001 (max 38.887 vs threshold 5), CASH-002
  (80 vs 15), CASH-004 (162.15 vs 100) all measured live and confirmed reachable — included for
  coverage, not because they were broken. 13 new tests (2 pull-mapping, 4 CASH-003 wiring through
  `computeFindingsForRule()` — the real call site — 5 net-new threshold-guard, plus 2 assertions
  folded into `mapAuditRow()`'s existing test). 1718/1718 suite passes, build clean, no entry-chunk
  impact. **Not verified**: a live pull run — this sandbox has no QSRSoft credentials, so
  `manual_ref_cnt` can't be backfilled from here; the next scheduled Action run picks it up once
  merged. `phase1e.sql`'s SQL is handed back below, not assumed applied. #43 Phase 2 (triage state)
  was named in the same follow-up message and explicitly deferred — substantial enough for its own
  dispatch. Full writeup: [dispatch44-cash003-count-rule.md](dispatch44-cash003-count-rule.md).

## SQL to run against live Supabase (dispatch #44) — handed back, not assumed applied

```sql
-- supabase/schema-security-rules-phase1e.sql — see the file for full comments/reasoning
alter table public.audit_rows add column if not exists manual_ref_cnt numeric;

update public.security_rules
set logic_expression = '{"numerator": {"field": "manualRefCnt", "agg": "sum"}, "denominator": {"field": "drawerGC", "agg": "sum"}, "scale": 1000, "comparator": "gte", "min_denominator": 25}'::jsonb,
    threshold = '{}'::jsonb,
    description = 'Manual refund/override COUNT (manualRefCnt, dispatch #44), normalized per 1,000 transactions -- same shape as CASH-002''s posOverCnt/drawerGC ratio. Replaces the original manualRefAmt/drawerSales dollar rate (dispatch #39), which was unreachable: measured 2026-08-20, 659 of 660 non-null subjects sat at exactly 0.0000 (manual overrings are a genuinely rare event, owner-confirmed), so no dollar threshold in this rule''s own range could flag the one real subject without being trivially gameable. No threshold is set yet -- manual_ref_cnt has never been pulled (see this migration''s header); stays active=false until re-measured against real counts.',
    updated_at = now()
where tenant_id = '00000000-0000-0000-0000-000000000001'::uuid and rule_id = 'CASH-003';
```

- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #43 — the Security panel, Phase 1, implemented](dispatch43-security-panel.md)** —
  **Merged** (PR #481, same PR/branch as #42, single-branch constraint that session — confirmed on
  `main` at `9410f04`). Owner-requested UI for the security build: `security_findings` (dispatches
  #39/#40/#42) had zero references anywhere in `src/` before this — a working backend, no UI.
  Central design call: **grouped by SUBJECT, not by rule** — `groupFindingsBySubject()` collapses
  the batch job's rule-major output (4 cash rules × 670 subjects) to one row per subject carrying
  every rule's verdict, sorted by how many agree — a subject flagged on 3 signals is a lead, on 1
  is noise, and rule-major rendering destroys that convergence. Implements plan §1 principle 4
  (exoneration) for free — passed rules render next to the failed one, since every verdict is kept.
  `verdictState(pass)` is the honest 3-state mapping (true/false/null → flagged/clear/undetermined)
  — rendering null as clear was named a correctness bug, not a display nicety. **Permission gated
  to the EXACT RLS tier** in two layers: a static `permissions.js` key (`security.view`) only
  decides whether the nav entry shows; `securityPanelAccess()` inside the panel does the real,
  live check (admin/supervisor always; manager only if `org_config.gm_identity_reveal_enabled`,
  checked live) — since RLS returns `[]` to an unauthorized role, indistinguishable from "no
  findings" on the wire, and this panel never lets an empty read stand in for a permission check.
  **A real bug caught by a stricter test, not inspection**: the data-loading `useEffect` depended
  on `[permState, dataState]` while ALSO setting `dataState` itself — a classic React
  self-cancellation footgun (the dependency change re-runs the effect, React runs the PREVIOUS
  instance's cleanup first, that cleanup set `cancelled=true`, discarding the in-flight fetch's own
  result right before it would have flipped to 'loaded'). Stuck on "Loading findings…" forever. A
  weaker first test (just "loader was called") missed it; a stricter one pinning the actual end
  state caught it. Fixed by dropping `dataState` from the effect's own deps. Reuses `RevealName`
  (dispatch #38) and `ModalShell`, wired through `panel-registry.js`'s existing four-list
  convention (`panel-registry.test.js`, 20/20, unmodified, confirms it against live code). 15 new
  tests, 1705/1705 suite passes, build clean, `security-panel` is its own lazy chunk (8.33 KB /
  3.31 KB gzip). **Not verified**: live browser click-through — this sandbox's Supabase needs real
  magic-link auth this session can't complete headless, stated plainly. Phase 2 (triage state) and
  coexistence deep-links (Register Audit markers, `attention-now.js`) explicitly deferred per the
  dispatch's own scope. Original brief: [dispatch-43.md](dispatch-43.md), superseded by the
  implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #42 — baseline-relative detection, implemented](dispatch42-baseline-relative-detection.md)** —
  **Merged** (PR #481, same PR as #43 above). **Fixed post-review, 2026-08-20**: a
  PM review caught that `INV-002`'s `min_value:10` (carried forward from dispatch #40's old ratio
  threshold) was unreachable against its own measured range (max 0.087) — the z-score conversion
  changed `logic_type` and nothing observable. Fixed by removing `min_value` entirely for INV-002
  (no independent materiality number exists yet; reusing a percentile of the same distribution the
  z-score already ranks against isn't independent) and adding
  `src/__tests__/security-rules-thresholds.test.js`, which parses the REAL seed SQL and asserts
  every z-score rule's `min_value` sits inside a measured ceiling — confirmed to fail against the
  original broken file and pass against the fix. Also fixed `phase1d.sql`'s description column to
  be genuinely idempotent (was a plain `||` append that grew on every re-run). Two parts. **Part
  1 — the z-score `LOGIC_TYPE`**: both
  INV rules declared `baseline_type:'store'` and the batch job computed/persisted a real baseline
  into `baseline_context`, but `evaluateRule()` never read it — a flat `cmp(value, threshold)`, so
  an inherently high-variance item flagged at all 27 stores forever. `src/engine/security-
  rules.js` now implements `z-score` (stubbed since dispatch #36): `evaluateRule()` gains an
  additive `{loc, baseline}` option, `z = (value-mean)/stdev` compared against `threshold` (now
  SIGMA), two independent gates required to flag (statistically unusual via z, AND materially
  significant via an optional `min_value`), honest nulls for no-baseline/insufficient-n
  (`MIN_BASELINE_N=5`)/zero-stdev. Both call sites in `scripts/security-rules-run.mjs` reordered
  to compute the baseline BEFORE evaluating — **a real bug this surfaced and fixed before
  shipping**: `fieldsFromExpr()` branched only on `logic_type==='ratio'`, which a z-score rule
  also uses but would have silently fallen into the wrong branch. `INV-001`/`INV-002` converted in
  place (`schema-security-rules-phase1c.sql`): `threshold`→2.5σ, `min_value` carries FORWARD
  dispatch #40's original ratio threshold as a materiality floor for **INV-001 only** (20; Step 0's
  own "uniform / bent ruler" verdict made precise absolute calibration false precision).
  **INV-002 carries NO `min_value`** — PR #481's review caught that carrying its old threshold (10)
  forward was not permissive but *unreachable*: re-measured max is **0.0868**, so `materialityOk`
  would have been false for every subject in the estate and the z-score conversion would have
  changed the stored `logic_type` and nothing observable. Deliberately left with no floor rather
  than refitted to a percentile of its own distribution — p95 of the population the z-score already
  ranks against is not an *independent* second gate, just "top 5%" derived twice. Guarded by
  `security-rules-thresholds.test.js`, which parses the real seed SQL and fails if any z-score
  rule's `min_value` exceeds that rule's measured ceiling.
  **Part 2 — the exposure floor, widened mid-dispatch from an INV-001 special case to EVERY
  denominator-bearing rule**, for two reasons: (1) the engine already had ONE shared choke point
  for a zero denominator (`evalRatio`/`evalThreshold` both had the identical `!denominatorSum`
  guard), so the general version (`logic_expression.min_denominator`, per-rule data) is the
  *simpler* build, not extra scope; (2) `#487` landed **9,947 real `audit_rows` rows** the same
  day, so `CASH-001..004` — `active=true`, unlike the deactivated INV rules — were about to score
  real data for the first time with the identical tiny-denominator pathology already measured on
  the inventory side (owner's own check: a single `drawer_gc=1` day producing a stored
  `t_red_b_pct` of 172). A cash false positive puts a **person's name** in an investigation queue.
  All four floors **measured against live data 2026-08-20, none guessed**: INV-001 (`exp_usage`,
  floor 10) converts 423/5,302 subjects (8.0%) to an honest null. INV-002 gets **NO floor** —
  measured minimum `storeMonthSales` is $2.1M, four orders of magnitude from zero, so a floor
  would be dead configuration (stated explicitly, not added reflexively). CASH-001/003/004
  (`drawerSales`, floor 250) converts 24/670 (3.6%). CASH-002 (`drawerGC`, floor 25) converts
  23/670 (3.4%), including 2 real subjects whose raw rates (200, 1692.3) were direct garbage-ratio
  cases. None comes close to nulling the estate. New `schema-security-rules-phase1d.sql` adds the
  cash floors via an idempotent `jsonb` merge (its description append is idempotent too, via a
  marker-anchored `regexp_replace` — note it strips from its marker to end-of-string, so a future
  migration appending *after* that sentence would be eaten by a `phase1d` re-run) — CASH rules stay `logic_type:'ratio'`, NOT converted
  to z-score, only floor-protected. §5a's cash-mapping-is-sound finding re-confirmed, not
  re-litigated. 24 new tests (13 engine, 6 call-site **wiring** tests per the #366 standing rule,
  spanning both call sites, 5 seed-SQL threshold-sanity tests). 1690/1690 suite passes, build
  clean, no bundle impact (512.25 KB eager, 337 KB headroom). **`phase1c.sql`/`phase1d.sql` are
  applied in production** — confirmed live 2026-08-20: `INV-001` z-score/20/10, `INV-002`
  z-score/null/null, `CASH-001/003/004` floor 250, `CASH-002` floor 25.
  `INV-001`/`INV-002` stay `active=false` until a deliberate reactivation decision. Original brief:
  [dispatch-42.md](dispatch-42.md), superseded by the implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #41 — reconcile the two Model Health Score implementations, dispatched](dispatch-41.md)** —
  Not a security-build item — a separate, independently-discovered live correctness
  bug (`backlog-master-2026-08-19.md` §4). `modelHealthScore` and `computeModelHealth`
  (`forecast.js:847`/`:1868`) share the same 30/25/25/20 rubric shape but diverge for real —
  different day-thresholds, different MAPE-window priority, **and one function can never hit a
  true zero on 3 of 4 components** (verified line-by-line: `computeModelHealth`'s floors are
  6/3/5/3, `modelHealthScore`'s are all 0) — meaning a store dead for 900 days still banks 17/100
  points in one of the two. Both render **on the same store page, at the same time**
  (`store-analytics.js:1758` and `:1804`), so a user can see two disagreeing scores stacked
  vertically for one store. Also found a shared, independently-verified dead-field bug: both
  check a `settings._fp`/`settings._settingsFp` fingerprint that's **never assigned anywhere in
  the app** (grepped confirmed) — one function's version of this always fires its penalty, the
  other's never does. **Owner explicitly asked for external industry due diligence before
  finalizing this** (the same discipline the loss-prevention build used — ACFE/CISA/NIST, not
  reasoning from scratch) — research (43 cited sources: M4/M5 forecasting-competition methodology,
  AWS SageMaker/Vertex AI/Evidently/Arize/WhyLabs model-monitoring conventions, FICO/SLA/NPS
  composite-scoring precedent, SRE burn-rate alerting) confirmed the floor-masking bug is a known,
  named failure mode every recognized model-monitoring platform avoids, and surfaced a real,
  **deliberately deferred** finding: MAPE's asymmetry is real and industry practice has moved to
  WAPE, but `mape6w`/`mape4w`/`mape2w` are shared infrastructure computed once in
  `backtest.js`'s `_computePeriodMape` and consumed by `at-a-glance.js`/`analytics.js` too, with
  "MAPE" in rendered UI labels — swapping the underlying metric is a real, separate,
  higher-blast-radius dispatch, not a rename bundled into this one. This dispatch fixes the true
  bug (reconcile to one implementation, true-zero floors, a weakest-link override gate, the
  dead-field check, and wiring a red grade to actually default the store to the Simple/trailing
  model per this project's own v4.483 finding) without touching the shared MAPE computation.
  Persisting the score as a versioned time-series (also research-grounded, real gap: today it's
  recomputed live on every render with zero history) is flagged as a separate future dispatch, not
  bundled in. Not yet implemented — this is the dispatch brief.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #40 — security build Phase 1b, inventory-domain TvA rule, implemented](dispatch40-inventory-tva-rule.md)** —
  **Merged (PR #473, same PR/branch as #39).** The follow-through on the
  correction below: `INV-001` (item-level TvA variance rate, store baseline, plan §2.2's own
  formula, single-table) and `INV-002` (dollar-variance rate normalized against sales, store
  baseline — denominator is a real `qsr_fob` join, NOT `qsr_variance_stat.pct_sales`, whose
  semantics are unconfirmed from this sandbox). Subject is `(loc, wrin)`, never an employee —
  `storeBaseline()` is the only baseline function usable here (`personalBaseline`/`peerBaseline`/
  `networkBaseline` all hard-require `emp`). `security_findings` needed **zero migration** —
  dispatch #39 built its nullable-`emp_token`/co-equal-`wrin` shape in anticipation of this exact
  dispatch, before the table ever went live, off a same-day PM heads-up. `scripts/security-rules-
  run.mjs` extended with a second rule-type branch (still one job, one loop): `mapVarianceStatRow`
  (`date: r.period`, NOT `period + '-01'` — a real string-comparison correctness point, see the
  writeup), `joinStoreMonthSales`, `computeItemFindingsForRule` (same-item-only baseline
  population). Condiment-class rows excluded from BOTH rules uniformly. 11 new tests, 1663/1663
  suite passes. No UI, no recipe/BOM pull (confirmed not needed — `exp_usage` already IS the
  theoretical figure). Original brief: [dispatch-40.md](dispatch-40.md), superseded by the
  implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #39 — security build Phase 1, real cash-domain rules, implemented](dispatch39-phase1-cash-rules.md)** —
  **Merged (PR #473).** First dispatch in this build with real,
  `ACTIVE=true` output — everything before it was substrate. **Phase 1 as shipped is cash-domain
  only** (the TvA-exclusion theory was corrected same-day, see the entry above — TvA data exists
  and is already pulled, what's missing is employee attribution, a real Phase 2/3 follow-up, not
  a permanent cut): `supabase/schema-security-rules-phase1.sql` activates `CASH-001`/`CASH-002`
  and adds `CASH-003` (manual-refund rate, personal baseline, opportunity_factor=true) and
  `CASH-004` (promo/discount rate, peer baseline, opportunity_factor=false — examined, not
  assumed; threshold 100=10% is measured from `register-audit.js`'s own existing `discPct` amber
  band, not invented). `supabase/schema-security-findings.sql` — the first output table,
  token-keyed (`emp_token`, never plaintext `emp`), full explanation breakdown stored as jsonb,
  RLS gated to the same tier as `reveal_employee_identity()`, no write policy at all (service-role
  only). `scripts/security-rules-run.mjs` — the new scheduled batch job (this repo's first
  *compute* workflow, not a pull), own field mapping (does not import the browser-oriented
  `loadAuditRows()`), scheduled 11:00 UTC (one hour after the audit pull it depends on). **A real,
  non-obvious behavior found and verified by test**: an untokenized employee can never be a
  finding's *subject* but their row still anonymously contributes a rate to peers' baseline
  populations (`personalBaseline`/`peerBaseline` group by raw name, unmodified) — correct, not a
  bug, documented explicitly. A real test-fixture bug (missing `data_required`, silently zeroing
  every assertion) was caught by running the suite and fixed before it shipped. 13 new tests,
  1652/1652 suite passes. No UI — mirrors the #37→#38 split; a findings-viewer is the recommended
  next dispatch. Original brief: [dispatch-39.md](dispatch-39.md), superseded by the
  implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #38 — reveal-UI for the Register Audit panel, implemented, PR #465 superseded, 2026-08-20](dispatch38-reveal-ui.md)** —
  The `RevealName` component: click → required reason (`window.prompt`, matching
  `eom-dashboard.js`'s established pattern) → `reveal_employee_identity()` (dispatch #37's RPC,
  completely unmodified — no role-gating/logging duplicated client-side) → cached, shared-state
  reveal lifted to `RegisterAuditTab` so one reveal resolves everywhere in the same panel view.
  Wired into 4 mechanical table-cell sites + 5 narrative-paragraph sites that needed real
  restructuring (`text` changed from a flat string to a mixed string/`RevealName`-element array).
  A real, separate bug found and fixed along the way: `AITabInsight`'s AI-prompt builder still
  read `.emp`, a field dispatch #37 already removed — silently stale to always `'?'` since PR
  #459 merged; now reads `e.id`, deliberately still not wired to reveal (no click target).
  **PM verification caught something real before merge**: the implementing session's own PR
  (#465) carried a stale copy of `supabase/schema-identity-vault.sql` and
  `memory/dispatch37-identity-vault.md` that would have **reverted the same-day
  `reveal_employee_identity()` anonymous-bypass security fix** (see the incident entry below) —
  almost certainly a local checkout that predated that fix, landing in the same commit as the
  unrelated dispatch-38 UI work. Rather than merge PR #465 as-is or wait on that session (idle/
  disconnected at the time), the genuine dispatch-38 diff was extracted and independently
  re-applied on top of the current, already-fixed `main` — full suite (1639/1639) and build
  reverified clean against that combination, not against PR #465's own claim. **PR #465 is left
  open as a stale draft — do not merge it**, its schema/memory-file changes are a regression.
  9 new tests (7 component-level + 2 integration, the integration test mounting the actual
  `RegisterAuditTab` consumer per CLAUDE.md's "would this verification still pass if reverted"
  rule — proving the prop-threading landed at all 9 call sites, not just that the component works
  standalone). Full writeup: [dispatch38-reveal-ui.md](dispatch38-reveal-ui.md); original brief
  [dispatch-38.md](dispatch-38.md).
- **✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅ [Backfill script logged "0 rows updated" for all 449 employees — CLOSED, live data confirmed clean, 2026-08-20](incident-backfill-count-undercount-2026-08-20.md)** —
  First live run of `scripts/backfill-identity-vault.mjs` printed `449 distinct
  untokenized employee name(s) found` / `449 token(s) resolved` / **`0 row(s) updated`** — an
  internally inconsistent result (zero successes, zero failures, 449 attempts) that was treated as
  a signal to verify, not a clean exit code to trust. Root cause confirmed by reading the actual
  installed `@supabase/postgrest-js@2.108.2` source, not assumed from memory of the API: `count`
  belongs in `update(values, {count})`'s own second argument; the script instead tried
  `.select('*', {count:'exact', head:true})` chained *after* `.eq()/.is()`, which resolves to
  `PostgrestTransformBuilder.select(columns?)` — a different method whose real signature only
  takes `columns`. The `{count,head}` object was silently dropped (plain `.mjs`, no TS
  enforcement), so no count header was ever requested and `updated += count||0` added 0 every
  time — while the underlying `PATCH` requests (zero reported errors) most likely still succeeded.
  **Most likely real outcome: the 449 writes actually happened and only the log was wrong** — but
  this is inferred from library source, not yet confirmed against live data. Fixed in the repo
  (`count:'exact'` moved to `update()`'s own options, the broken trailing `.select()` removed).
  **Confirmed live the same day**: owner ran the read-only SQL check —
  `tokenized: 21929, still_untokenized: 0`. All 449 employees' rows were actually updated on the
  first run; the "0 rows updated" line was purely the broken log, never a failed write. Closed.
- **🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨 [SECURITY INCIDENT — reveal RPC anonymous role-gate bypass, found + fixed same day, 2026-08-20](incident-reveal-rpc-null-role-bypass-2026-08-20.md)** —
  `reveal_employee_identity()` (dispatch #37's vault, PR #459) shipped with a
  PL/pgSQL `NULL`-role trap: an anonymous caller's `get_my_role()` is `NULL`, and
  `NULL not in ('admin','supervisor')` evaluates to `NULL` — which an `ELSIF` with no trailing
  `ELSE` treats as "skip," not "reject." Result: a fully anonymous caller (public anon key, no
  login) fell through the entire role gate and reached the token→name lookup. **Found live** by
  probing production directly with the anon key (per CLAUDE.md's "measure it, don't reason about
  it" — the PR's own verification had read the function's logic and judged it correct, but never
  adversarially probed it), **not by re-reading the code**. This was caught the same session the
  owner ran `scripts/backfill-identity-vault.mjs` for the first time (so real names were freshly
  in the vault) but **before** dispatch #38's reveal UI exists for any user to have discovered a
  real token through — no confirmed real-name disclosure, full reasoning in the incident file's
  "Actual exposure" section. **Fixed same day**: role gate restructured so the reject path is an
  unconditional trailing `ELSE` (a `NULL` condition can never skip an `ELSE`), plus an explicit
  `revoke execute ... from anon` (a second, distinct finding — `revoke ... from public` alone did
  not stop the anon key from invoking the function at all). Owner ran the hotfix live; **re-
  verified live with the same anon-key probe, confirmed closed** — the exact same call now
  correctly returns `"role none is not permitted to reveal identities"` instead of reaching the
  lookup. `supabase/schema-identity-vault.sql` updated to match. **Standing lesson: a security-
  sensitive `SECURITY DEFINER` function needs a live adversarial probe as part of its own
  verification — a correct-looking code read is not enough.** Full incident writeup, including an
  open/unconfirmed hypothesis about a possible project-wide default-privileges gap worth auditing
  later, in the incident file itself.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #38 — reveal-UI for the Register Audit panel, dispatched](dispatch-38.md)** —
  2026-08-20. **NEWEST.** Follow-up to dispatch #37: the vault retrofit deliberately stripped
  plaintext names from `analyzeRegisterAudit`'s output ("blind mode," working as designed), which
  left `store-analytics.js`'s Register Audit panel showing `'Unknown'`/`'?'` at every one of its
  10 display sites with no way for an authorized viewer to see who's being flagged. This dispatch
  closes that the way Direction B intends: a shared `RevealName` component (click → reason prompt
  → `reveal_employee_identity()` RPC → cached, shared-state reveal), wired into 4 easy table-cell
  sites and 5 harder narrative-paragraph sites (string → mixed string/element array restructuring)
  in `RegisterAuditTab`/`RegisterAuditNarrative`. The 10th site (`AITabInsight`'s AI-prompt
  builder) is explicitly excluded — no click target, out of scope. Not yet implemented by an
  engineer — this is the dispatch brief, scoped directly against the real code (not from memory).
  **Prerequisite, owner-side, not blocking this dispatch's code:** run
  `supabase/schema-identity-vault.sql` (sent via SendUserFile) and then
  `node scripts/backfill-identity-vault.mjs` against live Supabase — until then the vault has no
  real token↔name data for the reveal RPC to return.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [RLS anonymous-access question fully CLOSED — three live measurements, 2026-08-20](project-rls-hardening-plan.md)** —
  **NEWEST.** The "92-107 tables wide open to anonymous access" figure repeated across this
  backlog and `plan-security-pii-architecture-2026-08-19.md` was real (a correct grep of
  committed SQL text) but measured the wrong thing — source text across superseded schema files,
  not live database state. Three live, read-only diagnostics against production (all owner-run
  same day) settle it completely: (1) the anonymous-access gap is already closed at the policy
  level via a separate, already-applied multitenant migration (`tenant_id = current_tenant_id()`,
  which correctly rejects anonymous callers — a first pass misread this diagnostic's own headline
  number as "70 open policies" before actually inspecting the `WITH CHECK` clauses, corrected
  same session, before it went further than a chat message); (2) the one real, literal
  `using(true)` found (`qsrsoft_kb`) is already known/intentional; (3) **all 87 tables in
  `public` have RLS enabled — zero exceptions, confirmed against the full table list, not a
  sample.** `project-rls-hardening-plan.md`'s own Phase 1 (closing the anonymous hole) is
  **DONE**, shipped via the multitenant migration rather than that plan's own design. **Phase 2
  (`can_see_loc()`, per-loc isolation) genuinely has not shipped** — the one real piece of that
  plan's original scope still open, separate from the anonymous-access question. Full correction
  chain: `project-rls-hardening-plan.md`'s own correction note at the top of that file.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #37 — identity-vault architecture (Direction B), merged](dispatch37-identity-vault.md)** —
  2026-08-20. **NEWEST, merged (PR #459), independently PM-verified before merge** — the schema/
  RPCs, the shared JS helper, both write-path wirings, the `analyzeRegisterAudit` retrofit, and
  the backfill script were all read directly and diffed against the claims, not taken from the
  summary. One correction from the relayed summary: `store-analytics.js`'s affected panel only
  ever reads `.emp`, never `.id`, so the real behavior is uniformly `'Unknown'`/`'?'` — never a
  raw token surfacing in the UI (the PR's own memory doc already had this right; only the chat
  summary was imprecise). **Recommended next dispatch: a reveal-UI wiring a button into those 9
  sites**, calling `reveal_employee_identity()` per-click with a required reason — not yet
  dispatched. Owner chose to build this before Phase 1, per the plan's own sequencing note.
  `supabase/schema-identity-vault.sql`: `employee_identity_vault`
  (token↔name, zero RLS policies for any role) + `identity_reveal_log` (append-only, admin-read-
  only, indefinite retention, no update/delete policy at all) + `audit_rows.emp_token` (additive,
  PK/`emp` untouched) + two `SECURITY DEFINER` RPCs — `get_or_create_employee_token()` (the shared
  write path, safe to expose broadly, never returns a name) and `reveal_employee_identity()` (the
  ONE path to a real name: admin/supervisor always, manager gated on an explicitly-flagged
  org-wide placeholder toggle, reason required, logged before returning). All role checks use the
  real `admin`/`supervisor`/`manager` values only, per the dispatch's own RBAC finding.
  `src/engine/identity-vault.js` (`getOrCreateToken`/`tokenizeRows`, one RPC call per distinct
  name) wired into both `saveAuditRows()` twins + `loadAuditRows()`; `scripts/backfill-identity-
  vault.mjs` for existing rows (owner-run, not run from this session). `analyzeRegisterAudit`
  retrofit: `e.id` is now the token, no plaintext name survives in the return value anywhere.
  **A real conflict found and flagged, not silently resolved**: `store-analytics.js`'s
  RegisterAuditNarrative panel reads `.emp` directly at 9 sites to display names — this dispatch's
  own "no UI" scope leaves those showing `'Unknown'`/tokens until a follow-up reveal-button
  dispatch, an anticipated cost of Direction B's "blind mode" property, not accidental breakage.
  28 new fixture tests. Original brief: [dispatch-37.md](dispatch-37.md), superseded by the
  implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Security build — six owner decisions in one morning, 2026-08-20](plan-security-loss-prevention.md)** —
  2026-08-20. Every open owner-gated question on this build got answered in one sitting —
  read `plan-security-loss-prevention.md` §4/§5 and `plan-security-pii-architecture-2026-08-19.md`
  §4 for full reasoning, not just the list below:
  1. **Identity architecture: Direction B** (token/identity-vault) — owner delegated on
     "compliant, ethical, most functional," B wins all three. Should land before/alongside
     Phase 1. Not yet scoped into a dispatch.
  2. **Phase 4 retention: indefinite, not auto-expiring** — explicitly for cross-case recurrence
     value ("one that keeps reappearing becomes more focused"); exonerated findings stay as
     "flagged, then cleared," never deleted.
  3. **Phase 4 access: Supervisor tier + optional GM** — a real, intentional divergence from the
     general DO-and-above disclosure-gating policy, scoped to this mechanism only. "Optional" for
     GM still needs a concrete design (per-case toggle? store setting?) before dispatch-ready.
  4. **Phase 4 evidence standard: evidence-grade from day one.** Phase 4 is now fully design-
     decided but still blocked on RLS hardening landing + Direction B landing first.
  5. **`refundCnt`: keep cash+cashless** (the richer auto-pull definition) — owner wants all
     refunds counted, cash flagged as the likely higher-priority signal for Phase 1 rule design.
  6. **Phase 1 rule-compute: scheduled batch job**, not an on-demand Edge Function — a new
     compute pattern for this repo (every existing scheduled workflow only pulls data, none
     evaluate rules).

  **Also: both live-run attempts of the Register Audit pull failed, 2026-08-20** — direct-token
  auth got a 403 (permissions, not expiry — likely the service account's QSRSoft role lacks
  `registerAudit`, cross-referenced against dispatch #34's SSO capture), and the Playwright
  fallback logged in but never captured a token (report page likely needs a UI interaction, not
  just navigation). Owner needs to confirm the service account's role; full logs in
  `dispatch35-register-audit-implementation.md`.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Phase 0b's SQL run, confirmed — Phase 1 unblocked for real, 2026-08-20](plan-security-loss-prevention.md)** —
  **NEWEST.** `supabase/schema-security-rules.sql` run against live Supabase — verified
  independently, not taken on the owner's word: `security_rules` returns `200 []` from the anon
  key (RLS correctly filtering an unauthenticated request), contrasted against a genuinely
  nonexistent table returning `404 PGRST205`. **Phase 0b is fully done. Phase 1 is unblocked, not
  yet dispatched** — next up is either Phase 1 itself or the Direction B identity-vault
  architecture (§4, `plan-security-pii-architecture-2026-08-19.md`), which the plan's own
  sequencing note says should land first since Phase 1 is the first thing that will write new
  employee-attributed data.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #36 — Security build Phase 0b: the substrate, implemented](dispatch36-security-phase0b-substrate.md)** —
  2026-08-19. **Merged (PR #451), independently PM-verified before merge** — interpreter
  logic, baseline math, and the `org_config` RLS pattern-match were all checked line-by-line
  against real code, not taken from the summary; the "no existing normalization helper" claim was
  independently re-grepped and confirmed. Phase 1's actual fraud-detection rules
  are gated on this landing first (`plan-security-loss-prevention.md` §1: "do not start by coding
  individual fraud rules... a rule written before this substrate exists will need to be rewritten
  once it does"). Part 1: `supabase/schema-security-rules.sql` (`security_rules` table, §6's
  schema field-for-field, `org_config`'s RLS shape + `tenant_id`) + `src/engine/security-rules.js`
  (interpreter — `threshold`/`ratio` implemented, `z-score`/`sequence`/`window-function` stubbed
  not thrown) + 2 `ACTIVE=false` seed rules from §2.1 as test fixtures. Part 2:
  `src/engine/security-baselines.js` — `exposureRate()` (the per-$1,000/per-1,000 normalization
  primitive) + `personalBaseline`/`peerBaseline`/`storeBaseline`/`networkBaseline`, each a
  distribution not a blended number, built fresh (confirmed `metric-source.js`/`vs-ly.js` have no
  existing rate-normalization primitive to extend) but following their dollar-weighted/honest-null
  conventions. `peerBaseline`'s same-store cohort is a documented data-limitation proxy for the
  plan's ideal role/daypart/tenure/volume-band grouping — `audit_rows` doesn't carry those columns
  yet. 22 new fixture tests, 2 of which round-trip the seed SQL's exact `logic_expression` JSON.
  No UI — data-layer + interpreter only, per the dispatch's own scope. Original brief:
  [dispatch-36.md](dispatch-36.md), superseded by the implementation writeup above.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #35 — Register Audit implemented, PM-verified](dispatch35-register-audit-implementation.md)** —
  2026-08-19. **NEWEST, merged (PR #448).** Phase 0a is now code-complete — `mapRow()` implemented
  against dispatch #34's confirmed endpoint, resolved field-by-field against the actual consumer
  (`analyzeRegisterAudit`) rather than guessed. **Independently re-verified during PM review, not
  rubber-stamped**: every load-bearing mapping claim (`drawerGC`=`transactions`, five unconsumed
  pct/avg fields, `manualRefAmt` vs `posOverAmt` staying distinct) checked out against `main`'s
  real code. **One real, non-blocking finding from that review: `refundCnt` semantics diverge**
  between manually-uploaded rows (cash-only, by construction) and auto-pulled rows
  (cash+cashless) — not risk-scored today, flagged for resolution during the still-needed
  live-verification pass (no session in this build's history has had real QSRSoft credentials).
  **Two things remain before this data is trusted**: live-verify against a real API response, and
  resolve the `refundCnt` drift. Neither blocks starting Phase 1 (cash-drawer variance + peer
  ranking), but both should close before Phase 1's output is treated as reliable. The original
  dispatch instructions are [dispatch-35.md](dispatch-35.md) — superseded by the implementation
  writeup above, kept for the record of what was asked.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Security PII/identity architecture — logged, not decided](plan-security-pii-architecture-2026-08-19.md)** —
  2026-08-19. Owner follow-up research (Grok/Gemini/ChatGPT) on how security apps
  handle employee PII, checked against a **verified** current-code finding: `audit_rows`/
  `analyzeRegisterAudit` store and key on the employee's **plaintext name today, with zero
  pseudonymization or logged identity-reveal step anywhere** (`src/parsers/index.js:974`,
  `src/utils/register-audit.js:7-8,56`). Two directions laid out (extend the existing role+subject
  disclosure gate with a logged reveal, vs. a real token/identity-vault architecture) — **not
  decided**, added as a fourth axis to `plan-security-loss-prevention.md` §5's existing owner-gated
  decision. Reviewers named: Fletcher Reaves (owner). Also flags GDPR/CCPA likely don't apply to
  this FL/OK-only operation — needs real HR/counsel verification, not more AI reasoning.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #34 — Phase 0a live-capture findings](dispatch-34-phase0a-findings.md)** —
  2026-08-19. **NEWEST.** Follow-up to dispatch #33 (below): the owner captured real DevTools
  sessions settling both of #33's open pieces. (1) Register Audit's real endpoint + field names are
  now confirmed — the shipped scaffold's endpoint guess was wrong; `mapRow()` implementation is the
  remaining work, with a translation table of confirmed vs. still-uncertain field mappings. (2) Any
  Transaction Tier A is **settled dead** (two corroborating captures: no exception-type filter
  exists anywhere in the API or its own filter-menu endpoint) — Register Audit carries all standing
  attribution; Tier B is confirmed buildable via a newly-found `transaction_detail` endpoint.
  Bonus: QSRSoft's own SSO role model was captured, informing a pending Meridian settings request
  (Operations Manager/DO/AS tiers, see Backlog Master §14). Full context:
  [plan-security-loss-prevention.md](plan-security-loss-prevention.md).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #33 — Security build Phase 0a](dispatch-33.md)** —
  2026-08-19. Two ungated, already-scoped tasks: (1) Register Audit auto-pull —
  parser/table/scoring-engine all already exist, only the QSRSoft pull itself is missing (today
  manual-Excel-only) — **scaffold shipped (PR #444), implementation pending real-endpoint data now
  in dispatch #34 above**; (2) one Any Transaction capture filtered to an exception type, to settle
  the owner-approved Tier A/B/C design's one open question — **settled in dispatch #34 above, do
  not re-run.** The engineer's own writeup of what shipped and what blocked them (no QSRSoft
  credentials/egress in that sandbox) is [dispatch33-register-audit-pull.md](dispatch33-register-audit-pull.md)
  — superseded by dispatch #34's real capture for the endpoint questions, still useful for the
  scaffold/save-path implementation notes.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Backlog Master — 2026-08-19](backlog-master-2026-08-19.md)** —
  One consolidated, de-duplicated backlog assembled from a sweep of 20 memory files
  (`project-backlog.md`, `plan-backlog-and-redesign-2026-08-15.md`, `notes-24` through `notes-66`)
  plus the normalization plan and `vision-and-roadmap.md`. **Status update:** two full PM review
  passes have since run **sequentially** over the whole file (not concurrently/disjoint-sectioned,
  despite an earlier draft of this note saying so), plus a targeted coverage sweep and two
  follow-on correction rounds (PRs #433–#440) — see the file's own "How to use this file" section
  for the real history. §15 (Security & Loss Prevention Build) and notes-67's IA-reorg items were
  added 2026-08-19, same round as dispatch #33.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #32 — Workstream C: pipeline contract, wired](dispatch32-pipeline-contract.md)** —
  2026-08-19. **DELIVERED same day** (v5.072, squashed into PR #431) — the last of the 7
  normalization workstreams to ship real code. **Corrects both this dispatch's and #25's own
  "2/19 scripts guarded" measurement**: that grep missed `scripts/lib/pull-outcome.mjs` (PR #269,
  pre-existing) — a separate shared module already imported by **8** scripts, already
  implementing assert-on-zero-rows. Real prior adoption was ~40% (8/20), not ~10%. New
  `scripts/_pipeline-contract.mjs` correctly does NOT duplicate that piece — it only adds the two
  genuinely-missing pieces (unconditional per-partition coverage logging, a freshness SLA
  checker), shipped as pure functions matching `_retry.mjs`'s convention. Two hand-conversions on
  the highest-stakes daily pulls (`lifelenz-pull.mjs`, `qsrsoft-dar-pull.mjs`) — the freshness
  threshold on `lifelenz-pull.mjs` directly targets the CLAUDE.md-cited 6-day silent outage class,
  at the source this time. New ratchet **R8** tracks the remaining 18 scripts, seeded fresh.
  C2 (idempotent partition replace) explicitly deferred, tracked under #336, not dropped.
  **`memory/dispatch-32.md` (the PM re-verification that preceded this) is now superseded — kept
  for the record with a correction notice at its top, not as current guidance.** Independently
  verified: 1584/1584 tests pass, build clean, all claims (the 8/20 count, CEILING=18, the
  pre-existing `pull-outcome.mjs`) reproduced directly against the code by a separate PM pass.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #31 — real click trace corrects dispatch #27, finds a bigger
  problem](dispatch-31.md)** — 2026-08-19. **Instrumentation shipped same day**
  (PR #431, v5.070) — queried `forecast_week_cache` live and found **100% coverage, all 27
  stores, for the entire current business week**, ruling out incomplete cache coverage as the
  cause of the unexplained 66%. New `count()` export in `click-trace.js` (an untimed tally —
  `mark()`'s 1ms floor would silently drop a cache-hit count) reports
  `weekProjections:storeCacheHit`/`storeCacheMiss` per render; new `_mark()` spans wrap the
  three previously-uninstrumented setup blocks (`eventFactors`/`cacheIndex`/`cloudActualsIndex`)
  and both per-day branches (`cacheReadDay`/`liveForecastDay`) so the next real click-trace
  session sees exactly which bucket the remaining cost sits in. Purely additive, no computed
  value changed. Full trace: [dispatch31-weekprojections-instrumentation.md](dispatch31-weekprojections-instrumentation.md).
  Still needs a real-browser `?clicktrace=1` run to actually populate these marks — the sandbox's
  in-browser `fetch` to Supabase fails even though server-side reads work (same limitation
  dispatch #27/#29 already hit). Real Mac Mini click trace on v5.069 —
  the exact real-data verification both dispatch #27 and #29 flagged as unmeasurable from the
  sandbox. **Correction**: dispatch #27's "the 4.3s modal-close figure almost certainly dropped"
  is refuted — modal-close (`✕`) is **32 clicks, avg ~1453ms, total 46,497ms, 52% of all
  long-task time** in the session. The Workstream E route-panel back button (`←`) costs the
  **same** per click as a modal close (~1435ms avg) — routing gave 4 panels URLs, it did not
  reduce the remount cost for them. **Bigger, unanticipated finding**: `compute:weekProjections`
  (Workstream A's target) is only **34%** of `AtAGlance`'s own render cost (22,499 of 65,715ms
  self-time) — the other **66% (43,216ms) has no named span**, meaning either cache coverage is
  incomplete across the district's 27 stores right now, or the cost has moved to uninstrumented
  work (event factors, cloud-actuals indexing, React reconciliation/DOM commit) that caching
  never touched. Recommends instrumenting the cache-hit rate directly (`at-a-glance.js:1575`)
  before assuming either cause. `AtAGlance` render+commit is 92% of all React work measured in
  the session (65.7 of 71.7s).
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #30 — Workstream D follow-up](dispatch-30.md)** — 2026-08-19.
  **DELIVERED same session** (v5.071) — both hand conversions done: `labor-allocation.js`
  (the "awkward" one — its dead `!embedded` standalone-modal branch, hand-rolled backdrop and
  all, converted to `ModalShell`) and `report-subscriptions.js` (the "simple" one — converted to
  `ModalShell` **and** `LocationSelector`, with a small `scope`↔`{level,id}` adapter so the
  persisted string shape never changes). New ratchet **R7**
  (`ratchet-modal-backdrop-bypass.test.js`) seeded at a freshly-measured **78** (independently
  reproduced, not copied from any prior estimate) — bidirectional, catches both a new hand-rolled
  backdrop and a stale-high ceiling after a future conversion. The panel contract deliverable is
  written: [panel-contract.md](panel-contract.md) — shell (`ModalShell` for modals,
  `RoutePanelShell` for `route:true` panels, nothing else rolls its own), grounded in the two real
  conversions rather than speculated. Full trace: [dispatch30-workstream-d-followup.md](dispatch30-workstream-d-followup.md).
  D was dispatched (#26) but never started — checked, no PR touches
  `PanelControls.js` adoption and no bypass-volume ratchet exists. The one thing that changed:
  D's blocker (Workstream E's routing decision) **cleared** — E shipped in PR #426, but not into
  one unified shell as D expected; `ModalShell.js` now also exports `RoutePanelShell` as a
  deliberate **second** shape (route panels replace the view, no backdrop/centering; modals
  overlay it) — D's "one layout contract" now has to name both, not unify them. Re-measured
  adoption fresh (56 panels now, `labor-allocation.js` added): `DateRangeControl` 0/56,
  `LocationSelector`/`ActionMenus` 1/56, `ModalShell` 9/56, `dateRange` prop 8/56 — zero movement
  across two more merged workstreams. **Freshest proof**: `labor-allocation.js`, merged this same
  session, uses **none** of the shared components — rolls its own modal shell and tab styling from
  scratch, live evidence the compliant path still isn't the cheapest one. Recommends it as one of
  the two hand-conversions (multi-tab + custom shell = the "awkward" one), alongside D's original
  five-step sequence, unchanged otherwise.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #29 — Workstream G: join the third dimension (who was on the
  shift)](dispatch-29.md)** — 2026-08-19, the last of the 7 workstreams.
  **DELIVERED same day** (PR #428, v5.069) — `labor-standard.js` wired into a new "Labor
  Allocation" tab (Scheduling hub): District/By Store/Overnight views, TPPH extended to hour_slot
  grain (`dt_trans_cnt`-denominated, kept separate from `METRIC_SOURCES`' daily `tpph` chain
  rather than force-fit into it), Overnight tab classifies open-vs-closed first and shows both the
  schedule-config and data-driven signals per store rather than picking one. Also found & fixed a
  real bug while wiring: `loadDailyActivityRange()` was missing `total_scheduled_hours` from its
  `select()` entirely — every future caller would have gotten `null` for `scheduledVsGuide`/
  `punchedVsScheduled` forever. Full trace: [dispatch29-labor-allocation-panel.md](dispatch29-labor-allocation-panel.md).
  Open items, stated plainly in the PR: real-data verification against live Supabase needs a
  session with real browser+auth access; the 1,716-hr pre-open-hours Breakfast correction isn't
  yet folded into this panel's own gap figure. Unlike A–F, G's finding is already **proven** by
  five owner-run probes
  (`plan-normalization-2026-08-17.md` G-1→G-5) — this dispatch grounds what's built vs. what's
  wired up, not what's proposed. `src/engine/labor-standard.js` (the engine behind the proven
  allocation finding — deficit −20,485/−14,207 corrected, surplus +32,701, 1.6× coverage — in
  `analysis-labor-allocation-2026-08-18.md`) **exists, is tested, and has zero callers outside its
  own test** — the #366 failure mode, a *third* time this session. TPPH auto-sourcing from the DAR
  is **partially done**: daily-grain via `qsrActSummaryRows` is already live in
  `metric-source.js:133`, but the hour_slot-grain TPPH the daypart analysis (G-3/G-4/G-5) actually
  needs is still probe-SQL-only, not an app metric. `rollupShiftsByEmployee()` remains unwired,
  unchanged since 2026-08-17 — and per the workstream's own constraints, should **stay** unwired
  for this first slice (attribute to shift, not person). Gives the engineer a concrete 3-step task:
  wire `labor-standard.js` into a panel (gated by `overnightOpenness()` — never rank TPPH/speed
  across open and closed stores on one axis, the G-5 "killer pair" mistake), extend TPPH to
  hour_slot grain, leave person-level for later. Also flags an unresolved open/closed classifier
  disagreement (Ardmore-Cooper/12th vs. Freeport) a real panel should show both sides of, not pick.
- **⭐⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #28 — Workstream F: role-based voice](dispatch-28.md)** — 2026-08-19.
  **DELIVERED, first slice** (PR #426, v5.068) — Visit Readiness's `topDrivers` extended with a
  `buildVerdict()` one-line decision (food-safety risk prioritized over readiness band), wired into
  the panel's default collapsed row, both printable reports, and `attention-feed.js`'s `visitRisk()`
  (now reads the same verdict instead of re-deriving its own generic text, so the two surfaces can't
  disagree). Count Cycle and DI Compare — the dispatch's own two evidence strings — explicitly
  deferred as next slice, not forgotten. Full trace: [dispatch28-voice-by-role.md](dispatch28-voice-by-role.md).
  Grounds the plan's "role should determine voice, not just visibility"
  premise: both cited evidence strings (`count-cycle.js:235` "No complete weekly count on record",
  `analytics.js:6895` "Not Dialed-In is better — recalibrate") still reproduce unchanged.
  `src/engine/permissions.js` confirmed access-only (boolean toggles, zero presentation fields) —
  the plan's "gates access not presentation" claim holds exactly. The one working precedent is
  SAGE's role framing (`sage-chat/index.ts:690-698`), but it's a binary supervisor/not-supervisor
  branch that only steers LLM prose, not a finished pattern to copy onto a deterministic panel.
  **New scoping fact:** the DB only enforces **3** roles (`schema.sql:13` — `admin`/`supervisor`/
  `manager`), not the 8-tier ladder CLAUDE.md's RBAC table conceptually lists — no tracked migration
  adds `developer` or the other five values, so voice tiers should target the 3 real roles, not the
  aspirational 8. Flags Morning Brief (the plan's own "best next home") as still metric-only
  (zero decision-shaped language, grepped), and `visit-readiness.js:419`'s existing "Top risk
  drivers" ranking as the cheapest near-miss to extend into a decision line — it already computed
  *which* gap matters, the hard half of the problem. Reiterates CLAUDE.md's own "Voice by role"
  standing rule is binding already, not new scope to propose.
- **⭐⭐⭐⭐⭐⭐⭐⭐ [Dispatch #27 — Workstream E: routing vs modals](dispatch-27.md)** — 2026-08-19.
  **DELIVERED** (PR #426, v5.067) — the four flagged panels (DI Compare, Forecast Accuracy,
  Projections, Date-Range Report) are now URL-synced routes (`?panel=`) via new dependency-free
  `src/app/routing.js`, replacing their `showX` modal state; `panel-registry.js` gets a `route:true`
  field on exactly those four, ratcheted by `panel-registry.test.js` so a fifth requires deliberate
  choice. Verified in a real browser via Playwright (deep links, back/forward, in-panel back).
  Full trace: [dispatch27-routing-vs-modals.md](dispatch27-routing-vs-modals.md). Open item: the
  4.3s remount re-measurement still needs a session with real auth (the dev sandbox's bypass can't
  populate real `ds`). Confirms the plan's hybrid routing architecture is unchanged in current
  `App.js`: a `view` state var plus `anyModalOpen` (`App.js:2486-2489`) that unmounts the
  background view behind any open modal. DI Compare, Forecast Accuracy, and Projections are still
  modals; "Date-Range Report" is registered `kind:'nav'` but still opens as a modal. **Correction**:
  the unmount-on-modal-open behavior is not an accident — `App.js:2470-2485`'s own comment records
  it as a deliberate v4.212 perf fix (AtAGlance kept recomputing while hidden), so the plan's cited
  "4.3s modal-close" figure is a side effect of that fix, not a bug, and should be re-measured
  post-Workstream-A (cache hits likely already cut it) rather than cited as-is. **New scoping
  fact**: zero URL-routing infrastructure exists anywhere in `App.js` (no `pushState`, no router) —
  shareable URLs are new plumbing, not a relabel. Points at `src/app/panel-registry.js` +
  `panel-registry.test.js` as the existing enforcement infra to extend with a route-vs-modal
  distinction, rather than building parallel bookkeeping. Carries the owner-endorsed rule (route =
  destination you'd link to, modal = interruption) and flags DI Compare/Forecast
  Accuracy/Projections/Date-Range Report as the four still-misclassified panels to start with.
  Notes Workstream D's broad panel-shell sweep waits on this workstream's routing decision; the
  ratchet/hand-conversion mechanics do not.
- **⭐⭐⭐⭐⭐⭐⭐ [Dispatch #26 — Workstream D: adopt the design system](dispatch-26.md)** — 2026-08-19.
  Re-measured `PanelControls.js` adoption fresh against `main`: unchanged
  since the 2026-08-17 plan despite three workstreams' worth of merged PRs —
  `DateRangeControl` 0/55, `LocationSelector`/`ActionMenus` 1/55 (`eom-dashboard.js`), `ModalShell`
  9/55, `dateRange`-prop panels 8/55. Flags that the plan's bypass-volume counts (inline styles,
  hardcoded px, etc.) do **not** re-measure to the exact same digits under any pattern tried —
  instructs the engineer to re-measure fresh with the ratchet's own exact pattern before seeding
  any `CEILING`, per the precedent already written into this repo's own
  `ratchet-raw-metric-rows.test.js` header. Carries the plan's landing sequence (compliant path
  cheapest first, two hand conversions before any sweep, ratchet the bypass not the adoption,
  convert opportunistically) and a reminder that the broad panel-shell conversion specifically
  waits on Workstream E's routing-vs-modals decision — the ratchet/contract-doc mechanics don't.
- **⭐⭐⭐⭐⭐⭐ [Dispatch #25 — Workstream C: pipeline contract](dispatch-25.md)** — 2026-08-19.
  Corrects the plan's own motivation before scoping the work: of the three
  cited "silent success" incidents, #263 (pmix zero-rows) is already fixed (v5.047,
  `qsrsoft-pmix-pull.mjs`) and #360 (`sales_ledger_daily`) was a self-corrected misdiagnosis, not
  a real gap — only the *generalization* is open. Measured directly: **2 of ~19** pull/write
  scripts have the zero-rows-exits-nonzero + per-partition-count discipline; the other 17 are
  named explicitly. Points at `scripts/_retry.mjs` (6 adopters) as the existing shared-module
  convention to follow, and confirms C2 (idempotent partition replace) is genuinely greenfield —
  522 is already a defensive **read**-side failure mode in 5 scripts but no script has
  delete-then-insert-per-partition on the **write** side. Carries explicit scope guidance: build
  the module + convert a bounded slice + ratchet-track the rest, not a 19-script sweep.
- **⭐⭐⭐⭐⭐ [Dispatch #24 — Workstream B: event scope + recurrence](dispatch-24.md)** — 2026-08-19,
  **DELIVERED** (PR #420, v5.066, migration run and RLS-verified). Standalone Workstream B brief, superseding dispatch-23's §2 now that §1
  is delivered and both of B's prerequisites (Workstream A's render-path fix, §1's precompute
  event-factor fix) are on `main`. `org_events`' `unique(loc, date_start, label)` PK has no scope
  concept, so `applyEventToStores` (`calendar.js:213`) writes N duplicate rows for an N-store
  event ("27 copies of Thanksgiving"); `RETAIL_EVENT_RULES`/`expandRetailEvents`
  (`retail-events.js`) already prove the recurrence half works but freeze their output the same
  way via `saveOrgEvents`. Fix is upstream of `orgEventsToDayMap` (`events-import.js:146`) —
  `forecastDay`/`computeEventFactors` need zero changes. Carries a re-measure reminder:
  Workstream A only removed the `forecastDay` inner-loop cost for cache-hit stores, not
  `computeEventFactors`'s own O(events) indexing pass, which still runs every render regardless
  of cache status. **DELIVERED** (PR #420, v5.066) — full design writeup, including the mid-flight
  RLS finding (a new permissive scope-aware policy would have OR'd past tenant isolation; fixed by
  replacing `org_events`' one existing RESTRICTIVE per-loc policy instead) and both open design
  questions' answers (`org_event_exceptions` table for per-store overrides;
  `collapseScopedEvents()` for one schema holding both rule-based and manual events), in
  [dispatch24-event-scope-design.md](dispatch24-event-scope-design.md). **Migration run and
  verified** (2026-08-19) — `supabase/schema-org-events-scope.sql` applied against production;
  `select policyname, permissive from pg_policies` confirmed `org_events_loc_scope` and
  `org_event_exceptions_loc_scope` both came back `RESTRICTIVE` (not a new permissive policy),
  the exact thing the RLS finding above was protecting against.
- **⭐⭐⭐⭐ [Dispatch #23 — precompute event-factor gap](dispatch-23.md)** — 2026-08-19,
  **§1 DELIVERED** (PR #417, v5.065; full trace, verified real-data delta, and an honest scope
  correction — most real stores' assigned models early-return before the event-adjustment tail,
  so today's district-wide impact was smaller than this dispatch implied — in
  [dispatch23-precompute-event-factors.md](dispatch23-precompute-event-factors.md)). §2
  (Workstream B) is **superseded by dispatch #24 above** — read that one, not this section.
- **⭐⭐⭐ [Dispatch #22 — Workstream A: forecast off the render path](dispatch-22.md)** —
  2026-08-18, **DELIVERED** (PR #415, v5.064). First workstream dispatch since [plan-normalization-2026-08-17.md](plan-normalization-2026-08-17.md)'s
  sequencing gate cleared (Phase 0 ratchets + the open PR queue all confirmed merged on `main`).
  Scopes the `weekProjections` render-path migration (`src/views/at-a-glance.js:1519-1560`, 93% of
  render time, 189 `forecastDay` calls/run) against the repo's real prior art
  (`qsrsoft-dar-pull.mjs`'s `refreshRollup`) and flags that `forecast_snapshots`' existing shape
  (backtest/MAPE record, no LY column) doesn't cleanly fit the weekly-rollup need — an open design
  call for the engineer, not dictated. Carries the Workstream B interaction warning (733 vs ~11,000
  event entries) as a hard sequencing constraint. **Full implementation trace:**
  [dispatch22-workstream-a-forecast-precompute.md](dispatch22-workstream-a-forecast-precompute.md) —
  the `forecast_snapshots` rejection reasoning, the model-assignment localStorage shim, what was
  verified against live Supabase data, and what could NOT be verified (no live click-trace) — the
  same gap dispatch #23 above found reading this code the next day.
- [Dispatch #20](dispatch-20.md) — price-event detection engine, vs-LY young-store trap, and the
  Condiment count-cycle bug. **Delivered**, shipped in PR #411 (v5.062).
- [Dispatch #21](dispatch-21.md) — handoff notice (PM session switch), not a task list; the one
  optional ask (price-wave regression test) shipped in PR #414 (v5.063), reviewed 2026-08-18.
- **⭐⭐ [McValue price-wave analysis 2026-08-18](analysis-mcvalue-price-waves-2026-08-18.md)** —
  **NEWEST work, and the McValue 2.0 FBP document's current source of truth for anything price or
  traffic.** Located three district-wide price rounds by measuring persistent step changes in
  `qsr_product_mix` base price (2026-02-25 all 27 restaurants, 06-13 wave of 14, 06-26 wave of 13)
  after a naive tier-set comparison failed (preserved marked FAILED in the same file so it isn't
  retried). The two-wave stagger became a natural experiment isolating the price effect from
  McValue itself (four gated checks: D, D-ROBUST, D-PLACEBO, D-PLACEBO-TRIMMED — final band −1.17
  to −1.46 pp of the full-window Oklahoma traffic decline). Query E then found the **six clean
  weeks after launch (B1–B3) are clean of price too**, giving a −3.14 pp headline that needs no
  correction — and forced **retiring a load-bearing framing** ("traffic got worse as national
  marketing support increased") that the price data contradicts. Query F closed the document's
  second publish gate (March free-item promo) without needing the 2025 calendar. Runnable SQL with
  every result recorded inline: [mcvalue-verification.sql](mcvalue-verification.sql). Current
  draft: [mcvalue-fbp-draft3.html](mcvalue-fbp-draft3.html). **`project-mcvalue-2-fbp-document.md`
  has a 2026-08-18 top section pointing back here — read that file's top section before its body,
  same as this one.**
- **[HS Football 2026 org_events verification](org-events-hsfb-verify.sql)** — 2026-08-18. The
  10-school PARTIALS-completion swap (43→100 games) cross-checked three ways: workbook internal
  consistency against its own README (100 rows, 49/51 home/away, all 6 judgment calls, all 10
  Thursday games — all reproduced exactly), the one contested removal (Tishomingo vs. Oklahoma
  School for the Deaf) owner-confirmed correct, and the live Supabase table confirmed to carry zero
  stale rows post-swap. Note the first version of the stale-rows check was unscoped and answered
  nothing (caught after running it, fixed in the same file) — a reminder that a query returning
  rows is not the same as a query answering the question it was written for.
- **⭐ [Normalization plan 2026-08-17](plan-normalization-2026-08-17.md)** — **NEWEST plan.** Where the
  app gets normalized against industry norms and against itself: forecast off the render path
  (`weekProjections` = 93% of render time), event scope+recurrence instead of 27 copies of one event,
  pipeline freshness/assertion contract, **design-system adoption** (`PanelControls.js` measured at
  **0/55** panels for `DateRangeControl` and **1/55** for `LocationSelector`/`ActionMenus` — the
  standard exists and is unused), routing-vs-modals, and **role-based voice** (say the number AND the
  decision; preserve analytical depth). Carries the sequencing gate, an explicit what-NOT-to-do list,
  and 8 advisory notes on running this solo.
- **⭐ [PM handoff 2026-08-15](pm-handoff-2026-08-15.md)** — **NEWEST handoff. Start here if you are taking the
  PM seat.** The PM/engineer arrangement and its disciplines, the live PR board (#298/#301/#297 awaiting
  review; #292/#286/#269 held and why), the engineer dispatch order, the owner's action list, the three
  Product Mix / `user/settings` captures and what they settled, PM debts not yet filed, the McValue FBP
  deadline (25 Aug), the corrections register, and the security constraints.
- **[Session handoff 2026-07-28](session-handoff-2026-07-28.md)** — MASTER handoff: everything
  shipped this session (v4.535–544), locked decisions, the next task (build QSRSoft pull scripts),
  access/settings, and pending items. **Start here after a session switch.**
- [Vision & roadmap](vision-and-roadmap.md) — ⭐ north-star, Smart Targets Model v2, accuracy-integrity
  system, deployment paths, prioritized roadmap.
- [North-star discovery lens](north-star-discovery-lens.md) — bridge QSRSoft's gaps, don't clone it;
  correlations, real-world decision trees, "learn and burn."

- [Docs + changelog refresh TODO](docs-refresh-todo.md) — owed after the v4.856–v4.875 sprint;
  lists exactly what is stale in the in-app changelog, CLAUDE.md and the panel catalog

## 🗂 Owner "Notes" working queues (most recent = most relevant)
- [Notes 67 queue](notes-67-queue.md) — IA/navigation reorganization (URL-view conversion, section
  regrouping into Reports/Inventory & Food Cost/Forecasting & Labor Projections/Analysis/HR),
  right-side-modal exception list, two concrete bugs (Food Cost date-selector defaults to May
  2026, DT History 15+ sec load), and the security-build directive that spawned
  [plan-security-loss-prevention.md](plan-security-loss-prevention.md).
- **⭐ [Panel decisions 2026-08-10](decisions-panel-inventory-2026-08-10.md)** — owner's keep/merge/retire
  call on all 97 panels; **the input the UI/UX redesign scopes from.** Carries the standing rule that
  RETIRE means harvest-then-remove, never delete-on-sight.
- [Notes 63 queue](notes-63-queue.md) — multi-user startup-load architecture answer, Needs Attention
  structural gap (no sales-decline detector — Atoka), Food Cost Panel RLS root cause, EOM Change
  Monitor qty-variance + case-conversion, scoring-system revisit (Ops/Controls/District/Model Health),
  Swing Watch "acknowledged" home, Events & Tags duplicates
- [Notes 62 queue](notes-62-queue.md) — SAGE capability audit, Event Tags panel, 1382ms click bug, 1.2M% chart bug
- [Notes 61 queue](notes-61-queue.md) — mobile perf, District View pass, the Resolver engine concept, SMG definitions
- [Notes 60 queue](notes-60-queue.md) — large triage: shared panel design system + cycle-agnostic engine spines,
  concrete bugs, new capabilities, naming
- [Notes 59](notes-59-online-reputation.md) — online reputation/social analytics: Google/FB/Yelp/Reddit/3PO
  ratings + reviews per location, local news, community-sentiment source tracing. Key constraint:
  **prominence beats recency** (what is displayed as current matters, even if old)
- [Notes 58](notes-58-queue.md) — Inventory Control weekly-count rules (Food+Condiment every week,
  floating mid-month Paper count); per-item variance charts; Items Recounted tile blank;
  ⚠️ **absolute must** — one-directional swing alarm w/ click-ack + auto-compiled cause report (store 10422)
- [Notes 32](notes-32-queue.md) — Perf-Review target auto-fill + per-metric sourcing; 1:1 Checkpoint;
  One-Pager round-2 (weekly Opportunity blow-up fix, cascade focus, R2P/TPPH).
- [Notes 31](notes-31-queue.md) — One-Pager v2 (metricSeries range bug, FOB anomaly, range compare,
  L/F/G, cascade dropdown).
- [Notes 30](notes-30-queue.md) — target write-back to QSRSoft; EOM qty-variance; Perf-Review KPI
  directory + threshold authoring; One-Pager scope + generic printable.
- [Notes 29](notes-29-queue.md) · [Notes 28](notes-28-queue.md) · [Notes 27 + feedback](notes-27-and-feedback.md)
  · [Notes 26](notes-26-queue.md) · [Notes 25](notes-25-queue.md) · [Notes 24 UX architecture](notes-24-ux-architecture.md)

## 👥 Performance Reviews
- [Perf-Review data sourcing](perf-review-data-sourcing.md) — QSRSoft People/Digital/Delivery report
  specs + the built+validated parsers (`src/engine/people-reports.js`); job-code taxonomy; cross-check
  finding; owner-confirmed decisions (shift-cert scope, 0-90 turnover).
- [Perf-Review Excel audit](perf-review-excel-audit.md) — threshold decisions vs the authoritative
  workbook; ROUND 2 banked corrections (OEPE %-of-target, Shift-Certified step, Bonus-Eligibility, etc.).
- [Performance Review System](project-perf-reviews.md) — engine, data model, scoring, roadmap.

## 📋 Leadership One-Pager + Opportunity $
- [Opportunity-$ design](design-opportunity-dollars.md) — Labor/Food/GC gaps → recoverable dollars;
  benchmark modes; the engine (`opportunity.js`) + adapter (`one-pager-data.js`) + view.

## 🖨 Forms
- [Forms library index](project-forms-library-index.md) — Pre-Shift Checklists + Travel Paths printable
  blanks; QSRSoft forms auth (Cognito ID token in localStorage).
- [Unified form engine design](design-unified-form-engine.md) — normalize→render, the pull method.

## 🔗 QSRSoft data & intelligence
- [QSRSoft report catalog](qsrsoft-report-catalog.md) — full system map from the owner walkthrough (what
  QSRSoft does, per-menu, to inform Meridian's roadmap).
- [QSRSoft RBAC & permissions](qsrsoft-rbac-and-permissions.md) — SSO getOrgInfo taxonomy.
- [QSRSoft email pipeline](project-qsrsoft-pipeline.md) · [Daily Activity + Shift Dashboard](project-qsrsoft-daily-activity.md)
  · [DAR columns](project-qsrsoft-dar-columns.md) · [CoachQ](project-qsrsoft-coachq.md) +
  [query patterns](coachq-query-patterns.md) · [Controls endpoint](project-qsrsoft-controls-endpoint.md)

## 🎯 Scoring
- [Ops Score attribution: #183/#181/#164](labor-park-oepe-score-attribution.md) — worked
  four-stage before/after (baseline → OEPE fix → park removal → labor basis fix) showing which
  fix moves a store's Ops Score by how much and why. Synthetic performance numbers, real targets.

## 📈 Signals / Smart Targets / Accuracy
- [Signals scanner](project-signals-scanner.md) — auto-correlation across metric pairs, guardrails.
- [Simple-models propagation](simple-models-propagation.md) — T3M/T6W/T3W family engine-wide.
- [Smart Targets / graded / accuracy handoff](handoff-smarttargets-graded-accuracy.md) ·
  [Accuracy layer](project-accuracy-layer.md) · [Graded Visits PACE](project-graded-visits-pace.md)

## 🧮 EOM / Inventory / FOB
- [EOM diagnosis flow](project-eom-diagnosis-flow.md) · [Item Journey](project-eom-item-journey.md) ·
  [FOB context](project-fob-context.md)

## 🧠 SAGE
- [SAGE AI](project-sage.md) — edge fn, live tools, RBAC, auto-scheduling, self-instrumenting.

## 🖱 UI / UX defects
- [Modal/scroll sizing defect (#192 P1)](project-modal-scroll-defect-192.md) — the "one shared
  ModalShell bug" framing was wrong (none of the 5 reports actually use ModalShell); records the
  4 real, separate mechanisms and the guard test that found the anti-pattern was 4x more
  widespread than reported.

## 📦 Inventory
- [Inventory auto-wiring (#214)](project-inventory-auto-wiring-214.md) — wired the Inventory
  Intelligence panel (Service/Production/Overstock/Transfers) to qsr_inventory_summary,
  auto-first with manual gap-fill. Key finding the issue's own body missed: the table has
  NO producer script yet (confirmed via grep) — the wiring is correct and load-bearing the
  moment a pull ships, but shows honest "no cloud data yet" today. Folded in #207 batch-2's
  first item (inventory.js → lazyPanel, ~10.4KB gzip reclaimed) since it required splitting
  parseInventoryData out to parsers/inventory-parse.js anyway.

## 🎯 Coaching spine (Push 3: #209 → #210 → #208)
- [Waste-entry data-discipline (#209)](project-waste-discipline-209.md) — the trust leg.
  Derives each store's OWN expected waste-submission days-of-week from 8 weeks of observed
  qsr_waste history (reuses count-cycle.js's measured COVER_FRAC=0.75, not a new guess),
  flags recent gaps, estimates $ impact landing in Unexplained. "Missing != zero" throughout —
  qsr_waste has no null-vs-zero column. New engine/waste-discipline.js, new
  metric-source.js isLazyFillError() export, surfaced in FOBAnalysisPanel.
- **⭐ [Coaching feedback loop v1 (#208)](project-coaching-loop-208.md)** — the verify leg,
  the only genuine differentiator on the table per the owner. New coaching_cycles table
  (owner needs to run the migration), engine/coaching-loop.js (5 rules enforced
  structurally: auto-captured baseline, follow-up lands in Needs Attention as a new
  coaching-review item type, starts from an existing finding, verdict measured via a
  NOISE_THRESHOLDS map that ships EMPTY per the issue's own v1 fallback — every verdict is
  null until a future session runs measure-coaching-noise-threshold.mjs). Real correctness
  fix found while building: that noise-threshold script's FOB math was a mean of daily
  ratios, not dollar-weighted — fixed to match computeFOBMetrics' own convention. New
  src/views/coaching-modal.js (start/review), Patch Heatmap FOB/Labor "🎯 Coach" buttons,
  Needs Attention "🎯 Log Verdict →" action.
- [Labor gap split (#210)](project-labor-gap-split-210.md) — the diagnose leg. Splits the
  combined actual-vs-needed labor gap into planning accuracy (scheduled-needed, coach the
  scheduler) and execution (actual-scheduled, coach the shift manager). Found and fixed a real
  gap: loadQsrActSummary never carried total_scheduled_hours through on either read path, so
  the split was impossible from data Meridian actually read even though qsr_daily_activity
  always had it. New rollup-table migration (owner needs to run it) + engine/labor-gap-split.js
  (Wed-Tue pay week, signature #4 in-progress-day exclusion, null-vs-fabricated-zero when the
  migration hasn't landed yet). New Labor Tools tab: 🎯 Planning/Execution.
- **⭐ [Over-scheduling is a chaos problem, not a labor-cost problem](finding-overscheduling-is-chaos-not-cost.md)**
  — first finding Push 3 produced, measured within minutes of #210 going live: 21/27 stores
  grossly over-schedule (Ada 66% above need), but the district nets to only +9 hrs vs need
  (matches the Overview tile independently) because over-scheduling and mid-week cutting
  cancel — invisible on the P&L, real operational chaos the owner had suspected for years.
  Validates ranking by combined-magnitude (already shipped) and is the first case where
  "dollarize and sort by $" would be the WRONG instinct — it costs ~nothing but damages the
  operation. Coach column gate confirmed correct as-is. Open: why schedules run so high is
  still unknown; turnover_monthly correlation is the next measurable test.
- **✅ [Patch Heatmap bands + rollup tiles (#219/#220)](project-patch-heatmap-calibration-219.md)**
  — DONE. #219: owner ran the measurement script against production, found a structural bug
  (badAt is not the flag line — watch fires at 0.2*badAt, critical at 0.5*badAt), shipped
  Sales 27 / FOB 1.9 / Labor 8.8 / Speed 73 (was 15/3/3/20). #220: new patch-level rollup row,
  patchDimensions() aggregates raw dollars/sales FIRST then derives dimensions — never colours
  by worst store. Grouping via the LIVE supervisorGroups() (constants.js), not the frozen
  INV_ORG_COORDS.sup snapshot. Controls excluded from both (composite score, correctly out of
  scope). 18 new tests across both issues.

## ⚡ Performance
- [Instrument fix (#189)](project-instrument-fix-189.md) — click-trace's App-tree/AppSidebar
  spans were nested (same-commit layout effects end at one flush), not additive — a misreading
  already caught once by hand. Extended the same pattern to the 4 active-panel views and added
  automatic same-commit subtraction to the report. Not measured live; owner needs to re-capture.
- [Lazy fill + qsr_fob parallel pagination (#191)](project-lazy-fill-191.md) — auditRows now
  loads on demand instead of eagerly at startup (scoped to auditRows only, not gap-scoped —
  records why); qsr_fob switched from serial to parallel pagination. Records the 3 non-resolver
  consumer decisions and what's deliberately NOT verified live (no Supabase session here).
- [Startup render storm (#184 item 0)](project-startup-render-storm.md) — batched the 22
  ds-touching tiered-startup-loader stages behind 3 per-tier flushes (22 commits → 3); the
  ~19-commit remainder (IDB restore, org_config syncs, email/PDF auto-ingest) is enumerated but
  not yet fixed.

## 🏗 Data-refresh sprint & standards (standing rules)
- [Data-refresh sprint handoff](handoff-data-refresh-sprint.md) — the At-A-Glance freshest-wins rework.
- [⭐ Measure it, don't reason about it](feedback-measure-dont-reason.md) — **standing rule.** Diagnose by
  reproducing, not by plausibility; verify a command's output before reporting it. Real costs from 2026-08-07.
- [⭐ PM / worker split](feedback-pm-worker-split.md) — **standing rule.** Two-session arrangement: who owns
  which files (worker owns MERIDIAN_CHANGELOG, always), one task in flight, worker opens draft PRs / PM
  reviews+merges, and the PM review checklist. Written after two same-day cross-session collisions.
- [Data-sourcing standard](data-sourcing-standard.md) — metric-source.js / vs-ly.js; never filter raw
  rows for a metric. **Standing rule.**
- [Data source redundancy](project-data-redundancy.md) — auto/emailed-first, manual = last-resort fill.
- [Panel catalog](panel-catalog.md) — every panel + status.

## 🔒 Infra / security / deploy
- [Security & Loss Prevention build](plan-security-loss-prevention.md) — **not RLS/infra security,
  fraud/theft detection.** Design spec synthesized from three AI-engine research passes
  (Gemini/Grok/ChatGPT), architecture-first (baselines, exposure normalization, opportunity-
  adjusted risk, exoneration analytics, Rules Registry), connected to existing prior art
  ([data-acquisition-shopping-list.md](data-acquisition-shopping-list.md)'s attribution ladder,
  [attribution-validity-register-login.md](attribution-validity-register-login.md)'s
  contested-attribution design, SAGE's disclosure-gating policy). Not yet scoped into dispatches.
- [RLS hardening plan](project-rls-hardening-plan.md) — require-auth policies (Phase 1 done).
- [Project audit 2026-07-27](project-audit-2026-07-27.md) · [Supabase priority](project-supabase-priority.md)
  · [Data model](project-data-model.md) · [Sync rework](project-sync-rework.md) · [Hosting](project-hosting.md)
- [Deploy rule](feedback-deploy.md) — push to branch; Vercel auto-deploys. [Selector UI standard](feedback-selector-ui-standard.md).
- [LifeLenz session](lifelenz-session.md) — token lifecycle, dead ends. [VLH config](project-vlh-config.md).
- [Labor Analysis FLH](project-labor-analysis-flh.md) · [LifeLenz schedule/jobs](project-lifelenz-schedule-jobs.md)
  · [Crew skills matrix](project-crew-skills-matrix.md) · [Feature Requests](feature-requests.md)
- [Performance budget + manual-sourcing audit](feedback-performance-budget.md) — speed is a feature; MANUAL_ONLY stays 0
- [Data-integrity sweep plan](plan-data-integrity-sweep.md) — greppable defect signatures + measured site counts
- `src/components/ModalShell.js` — shared modal shell (Workstream D, ✅ done v4.938–v4.939): standardizes
  the close-button/header pattern app-wide. See [[vision-and-roadmap]] Workstream D and [[notes-63-queue]].
- [PWA Share bug](project-pwa-share-bug.md) · [Backlog](project-backlog.md) · [Meridian status](project-meridian.md)

## 📇 Previously unindexed (added 2026-08-16)

**43 of 124 files were on disk but absent from this index** — measured, not estimated
(`comm -23` of the directory against every `.md` referenced here). Descriptions below are each
file's own front-matter, not a summary written after the fact. Several are cross-referenced above
in the "before you theorize" table because their absence has already cost real work.

### Data reconciliation & measurement
- [dar-vs-ops-reconciliation.md](dar-vs-ops-reconciliation.md) — why DAR-derived totals differ from the manual Ops Report, what was ruled out (**the 4am boundary WAS**), and why auto-first is still correct
- [project-labor-pct-punched-vs-crew.md](project-labor-pct-punched-vs-crew.md) — Notes 35: Labor % standardized on Punched; Crew silently includes salaried-manager $ (FL yes, OK no)
- [project-hourly-projection-accuracy.md](project-hourly-projection-accuracy.md) — tracks whether QSRSoft/LifeLenz hourly projections are systematically biased
- [weighted-rollup-audit.md](weighted-rollup-audit.md) — average-of-averages sweep, incl. what was deliberately left alone for want of a weighting basis
- [metric-inventory-2026-08-07.md](metric-inventory-2026-08-07.md) · [reference-r2p-formula.md](reference-r2p-formula.md) — R2P reconciled to the penny · [notes-57-metric-registry-plan.md](notes-57-metric-registry-plan.md)
- [project-noise-measurement-237.md](project-noise-measurement-237.md) · [project-labor-pct-tail-236.md](project-labor-pct-tail-236.md) — the 994 nulled rows (#243)
- [store-events-material-changes.md](store-events-material-changes.md) — the legitimate-gap ground truth #269's tolerance list is built on
- [count-cycle-condiment-bug-2026-08-18.md](count-cycle-condiment-bug-2026-08-18.md) — chased #410's
  "all 27 stores crit" flag to a real cause: 98.9% of Condiment items reading `active=false`
  district-wide. Fixed in dispatch20/PR #411
- [374-recipe-item-verification-2026-08-18.md](374-recipe-item-verification-2026-08-18.md) — #374's
  acceptance-criteria check for the `recipeItem` Topic 6 rescue in `count-cycle.js`'s `isActive()`
- [project-pull-completeness-263-265.md](project-pull-completeness-263-265.md) — #263 makes a pull say so when it KNOWS it failed; #265 catches the gaps a pull never saw at all (QSRSoft had no row, nothing threw, success was reported truthfully). Neither substitutes for the other — **neither the Sulphur nor the Marietta outage would have been caught by #263 alone**

### QSRSoft / pulls / auth
- [project-qsrsoft-cognito-auth-312.md](project-qsrsoft-cognito-auth-312.md) — the #312/#323 token conversion + backfill record
- [project-product-mix-291.md](project-product-mix-291.md) — #292's design notes and next-session ordering
- [data-acquisition-shopping-list.md](data-acquisition-shopping-list.md) — every candidate endpoint, incl. addenda K (Product Outage) and L (Menu Price Comparison)
- [reference-shift-manager-summary.md](reference-shift-manager-summary.md) — per-daypart manager-on-duty attribution · [qsrsoft-kb-digest.md](qsrsoft-kb-digest.md)

### Security / RLS / infra
- [rls-table-audit-119.md](rls-table-audit-119.md) — full 82-table RLS audit; one real gap, one non-reproduction
- [session-2026-08-07-perf-and-rls.md](session-2026-08-07-perf-and-rls.md) — cold start 183s→59s, per-loc RLS after a rollback, **seven wrong assumptions caught by live queries**
- [project-security-notes.md](project-security-notes.md) — accepted-risk vs needs-fix tracker
- [attribution-validity-register-login.md](attribution-validity-register-login.md) · [project-salaried-coverage-guard-242.md](project-salaried-coverage-guard-242.md)

### Design & product threads
- [project-coaching-feedback-loop.md](project-coaching-feedback-loop.md) — the loop that turns Meridian from reporting into management
- [project-events-redesign.md](project-events-redesign.md) · [project-inventory-control-redesign.md](project-inventory-control-redesign.md) — both owner-signed-off designs
- [project-insight-ledger.md](project-insight-ledger.md) · [project-food-cost-labor-enhancements.md](project-food-cost-labor-enhancements.md) — the two P&L lines that are ~50% of sales
- [project-org-structure.md](project-org-structure.md) — supervisor→store, data-driven since v4.570, incl. the retroactive-attribution caveat
- [project-eom-scoreboard-notify.md](project-eom-scoreboard-notify.md) · [project-scoring-revisit.md](project-scoring-revisit.md) — a MEASURED divergence between two Model Health scorers
- [spine1-panel-controls-126.md](spine1-panel-controls-126.md) · [project-mcvalue-2-fbp-document.md](project-mcvalue-2-fbp-document.md)
- [project-sage-knowledge-grounding.md](project-sage-knowledge-grounding.md) — the handling-notice gate #269 deliberately did not bypass · [project-sage-manual-sourcing-270.md](project-sage-manual-sourcing-270.md)

### Process, capacity & planning
- [systemic-issues-and-next-phase.md](systemic-issues-and-next-phase.md) — **four recurring bug classes measured from 977 commits**, and the structural fix for each
- [plan-backlog-and-redesign-2026-08-15.md](plan-backlog-and-redesign-2026-08-15.md) — how the open issues collapse into a working order
- **⭐ [analysis-labor-allocation-queries.sql](analysis-labor-allocation-queries.sql)** — the four runnable queries behind the allocation analysis, on the VLH guide's own daypart boundaries. Query 2 (concentration) is the one to run BEFORE acting; Query 4 is a re-run owed before any speed number reaches a GM
- **⭐ [analysis-labor-allocation-2026-08-18.md](analysis-labor-allocation-2026-08-18.md)** — hours are in the WRONG DAYPARTS. 58% of drive-thru volume is served under the VLH guide (Breakfast 0.928, Lunch 0.922) while 42% is served over it (Afternoon 1.171, Dinner 1.085, Late 1.207). 826 busy breakfasts under guide vs 2,569 soft afternoons/dinners over. Cost-neutral if the hours net out — a reallocation, not a labour increase
- [gate-pmix-backfill.sql](gate-pmix-backfill.sql) — run BEFORE anything reads `qsr_product_mix`. The pmix pull's fail-fast guard (#393) is unmerged, so a green Action does not mean rows landed — the first attempt wrote 0 rows and exited 0. Gates on distinct loc/date, **never `count(*)`** (price is in the conflict key, so a price change adds a row)
- [probe-g1-shift-dimension.sql](probe-g1-shift-dimension.sql) — the Workstream G screen: does DT speed vary as much *within* a store's own week as *between* stores? Carries the verified DAR facts (business-day-aligned `dt`, 24-slot completeness guard, `dt_untilserve` is **milliseconds**) — read it before writing any new hourly-DAR query
- [plan-normalization-2026-08-17.md](plan-normalization-2026-08-17.md) — ⭐ the successor to the above: seven workstreams (forecast off render path · event scope+recurrence · pipeline contract · design-system adoption · routing vs modals · role-based voice), the sequencing gate, and what not to do
- [feedback-verification-in-sandbox.md](feedback-verification-in-sandbox.md) — what a sandbox session can and cannot prove
- [benchmark-daily-readiness.md](benchmark-daily-readiness.md) — read before quoting any readiness number
- [capacity-and-onboarding-review.md](capacity-and-onboarding-review.md) — how many users can onboard today, and what must land first
- [mac-session-todo-2026-08-06.md](mac-session-todo-2026-08-06.md) — items that require the owner at a Mac
- [finding-padding-and-cash-hunt-2026-08-13.md](finding-padding-and-cash-hunt-2026-08-13.md)

### Owner notes queues
- [notes-33-queue.md](notes-33-queue.md) · [notes-54-56-triage.md](notes-54-56-triage.md) · [notes-66-bullseye-and-state-of-business.md](notes-66-bullseye-and-state-of-business.md) · [notes-66-staged-experiments-and-risk.md](notes-66-staged-experiments-and-risk.md)

---
*Index maintenance: when adding a memory file, add it here. Newest handoff always pinned at top.*
*Drift check — run it, don't trust the habit:*
```
comm -23 <(ls memory/*.md | xargs -n1 basename | grep -v '^MEMORY.md$' | sort) \
         <(grep -o '[a-z0-9-]*\.md' memory/MEMORY.md | sort -u)
```
*Empty output = index complete. It printed **43 filenames** on 2026-08-16 and is empty as of that
fix (125 files, 125 referenced). An index nobody can verify drifts back — run this, don't trust
the habit of "I added it."*
