---
name: plan-performance-review-continuity-2026-08-26
description: Full design synthesis for the Performance Review "yearly continuity" rebuild — per-person yearly records replacing the current H1/H2-only data model, effective-dated role/store assignments driving auto-populate, promotion/transfer scoring, relative-hierarchy override authority for locked actuals, and a real job-title-code-to-review-role map grounded in measured live data. Captures every owner decision from the 2026-08-26 conversation plus what's still genuinely open.
sensitivity: open
metadata:
  node_type: memory
  type: plan
---

# Performance Review continuity — full design synthesis (2026-08-26)

Owner-originated. Started from a real usability problem (Nick Rice set up for H1, it's August,
no way to see his review "in entirety" including H2) and grew into a full redesign conversation
across several exchanges (some lost to two container restarts — this doc is the durable record
so that never costs real answers again).

## Decisions confirmed by the owner — build to these, not to my defaults

### 1. Data model: reviews become per-person, per-YEAR records (not per-half)
Direct quote: *"the reviews should be per person per year... I'm not saying we need to lose the H1
and H2 more so that they should be rolled up into the entire year review... quarterly roll ups to
include the mid year and end of year so I'd still wanna see all 4/4 individually plus a six month
half first half year review and a second six month second half year review."*

This is **the real restructure**, not my originally-recommended "additive rollup view" — that
recommendation is superseded. One review record per (person, year), containing:
- Q1/Q2/Q3/Q4 scored individually (as today, just no longer split across two top-level records)
- H1 (mid-year) roll-up = Q1+Q2
- H2 (end-of-year) roll-up = Q3+Q4
- A full-year overall

**No migration burden — confirmed:** *"There are currently no reviews in the system that have to
be saved as they've all been for testing so I'm not worried about losing that data if we need to
go a different route."* Every review record that exists today is test data. Safe to redesign the
schema clean rather than write migration logic, per the owner's own explicit permission — this is
worth re-confirming immediately before deleting anything, but do not build migration machinery
that adds real scope for zero real records.

### 2. The review follows the PERSON, not the store
Direct quote: *"the review should follow the person which will cover any event in which someone
is promoted to a new role and or transferred to a different location."*

- **GM and below:** always exactly one location at a time. *"There are could be a scenario or GM
  was overseeing two stores at one time... unusual"* — a real edge case, acknowledged but not the
  primary design driver.
- **Supervisor and above:** *"they will always have multiple locations assigned to them"* — this
  is the NORMAL case at that level, not an edge case.
- **Effective-dated assignments drive auto-populate:** *"we should also count for in both of these
  scenarios the effective date of store assignments for all roles. Those dates should play into
  what matrix auto populate and what results and targets auto populate."*

**This exact shape already exists in the codebase and should be extended, not reinvented** —
`src/constants.js`'s supervisor-org system (`orgAssignments()`/`whoRan(loc,date)`/`groupsAt(date)`,
"Supervisor org: effective-dated assignments" section): `{loc, supervisor, start}` rows, "latest
start ≤ date wins." The person-level assignment model this feature needs is the same shape with
one more axis — `{person, role, loc, start}` — and should reuse the identical "latest start ≤
date wins" resolution logic, not a new algorithm. `whoRan()`'s own header comment is explicit that
this pattern exists specifically so historical rollups stay honest across a mid-history change —
that is precisely this feature's requirement.

**✅ ADDED 2026-08-26 — the above-store levels form a real nested hierarchy, not a flat list of
"multiple locations," and there's an imminent live test case.** Owner: *"Area supervisors will be
assigned to multiple locations. The rolled up data will be used to determine a supervisor's actual
results based off all the locations."* Then, naming the org's actual near-term plan: **"Ashley
Podraza, who is currently a supervisor, will be an ops manager for what is currently her patch and
Robert's patch in Oklahoma beginning within a month or so — that job title will be over more than
one supervisor, ideally 2 to 4 supervisors, and would be responsible for the metrics in all of
those stores contained within, same principal rolled up, averages for targets and the stores
actual results."* And: **"A director of operations would encompass all the locations they are
assigned to, which would include operations managers, supervisors, and stores."**

So the real shape is **AS (patch of stores) → OM (2–4 AS's patches combined) → DO (whatever mix
of OMs/AS's/stores is assigned to them)** — and that DO description matters: a DO's direct
assignments can be a **mix of levels** (some OMs, maybe a standalone AS not yet folded under an
OM, possibly even a store directly), not a clean uniform 4-tier tree. **The assignment model
should be a general reports-to graph, not a fixed-depth hierarchy**: a person's effective store
scope = their own directly-assigned stores UNION the (recursively resolved) scope of every person
assigned to report to them, all resolved as-of the same date via the identical "latest start ≤
date wins" rule already established above — so `{person, role, loc-or-person, start}` rows, where
the "loc-or-person" side can point at either a store OR another person, and scope resolution
recurses. This generalizes AS/OM/DO with one mechanism instead of three special cases, and the
Ashley Podraza promotion (real, ~1 month out) becomes the first live test of both the promotion-
segment machinery (decision #3B) and this recursive scope resolution at ship time or shortly after.

**Rollup math must follow the existing standing rule, not a plain average — "averages" in the
owner's own phrasing means the right kind, not a naive one.** CLAUDE.md: *"Standing rules: correct
math, never average averages, dollar-weight aggregates."* An AS/OM/DO's ACTUAL and TARGET for any
dollar-denominated metric (sales, labor $, FOB $) must be a dollar-weighted rollup across every
store in their resolved scope (Σ$/Σbasis, matching the FOB tile's own `Σ$/ΣprodSales` pattern
already in the app — CLAUDE.md's At-A-Glance entry), never an average of each store's own
percentage. Non-dollar metrics (e.g. a count like Shift-Certified Managers) sum or roll up by
whatever basis that specific metric already uses elsewhere in the app (`metric-source.js`) — reuse
the existing metric's own aggregation rule per store, don't invent a second one for the
above-store rollup.

### 3. Promotion / transfer scoring — segment by period, don't force one blended number
Two related but distinct scenarios, both owner-confirmed as real and both currently unhandled:

**A) Store transfer, same role.** Historical practice, owner's own words: *"it was always awarded
based on the store data in which the manager worked the majority of the month."* So the existing,
proven baseline is **majority-of-month wins that month's store attribution** — simplest, matches
what this owner has actually done by hand for years. Owner is explicitly open to a richer
day-weighted version (*"account for actual days of month at each location... or have an additional
scoring block for the period weighted to the number of days — I am open to suggestion here"*).
**Recommendation: build majority-of-month first** (it's the proven baseline, and it's a simple,
well-defined resolver — reuse the same "as-of a date" shape as #2 above, just resolved per month
instead of per point-in-time). Add day-weighted as a v2 "additional scoring block," not a
blocking requirement for v1 — it adds real complexity (partial-month FOB/labor/OEPE pulls don't
cleanly apportion by calendar day the way sales dollars do) for a case that, per the owner's own
description, is not how it's been done historically anyway.

**B) Role promotion (mid-cycle).** This is the harder case — a promotion changes which KPI
category applies (review-engine.js's `DEFAULT_REVIEW_CONFIG.metrics` differs by role: an AM/DM/SM
review and a GM review score entirely different metric sets and weights). Owner: *"we also have to
resolve for when a manager... receives a promotion up or down that would change the metrics of
their review category and how we merge the two over a review... My recommendation would be to
research how this is handled as an industry norm."*

**Research done (2026-08-26, web search — see Sources below).** No single formal "blended rating
formula" exists as an industry standard; the two consistent patterns across HR sources:
1. **Evaluate against each role's OWN framework for the months actually held in that role** — "the
   entire performance management cycle can restart if a worker transfers to a new position," i.e.
   score against the new role's metrics/targets from the promotion date forward, not a hybrid.
2. **The overall/period rating is a synthesized judgment, not a mechanical average** — explicitly
   stated in more than one source: *"The overall rating should reflect a holistic view... and does
   not need to be an average."*

**Recommendation, unifying A and B into one mechanism:** a promotion and a store transfer are the
same underlying event from the data model's point of view — an assignment-timeline change
(`{person, role, loc-or-person, start}`, generalized per the AS/OM/DO nested-scope addition below
decision #2). Handle both the same way:
- Split the affected period into segments at each assignment change.
- Score each segment against **its own role's KPI framework and its own store's targets** (not a
  blend) — majority-of-month for a mid-month change, per (A).
- Surface all segments together on the review (e.g. "Jan–Mar: AM @ Store 3708" / "Apr–Jun: GM @
  Store 5183"), each with its own category scores.
- The period/overall rollup (H1, H2, full-year) is **not a rigid formula** — compute a
  provisional weighted number (segment length × segment score) as a starting point, but this is
  explicitly a "does not need to be an average" judgment call the reviewer can adjust with
  commentary, matching the HR-source consensus above. Don't over-engineer a formula the sources
  themselves say shouldn't be mechanical.

### 4. Override authority for locked auto-populated actuals: RELATIVE hierarchy, not a fixed role list
Supersedes my earlier "Admin + Developer + DO" recommendation. Owner: *"anyone 2 levels above the
reviewed person. So if a GM is being reviewed then the Supervisor does the review, The OM or DO or
higher would be the only ones to override a result."*

This requires a **reviewer-chain ladder**, computed generically, not hardcoded per role. From the
owner's own example the chain reads: `SM/AM/DM → GM → AS/Supervisor → OM → DO → VP → Owner/OO`.
Override authority for a person at level N = whoever sits at level N+2 or higher in that same
chain. **This ladder does not exist anywhere in the codebase today** — `ROLE_KEYS` (review roles:
GM/AM/DM/SM/AS/OM) and the RBAC role list (CLAUDE.md: Developer/Admin/Owner/VP/DO/Supervisor/
GM/Office Staff) are two separate, only-partially-aligned taxonomies (e.g. "Supervisor" in RBAC ≈
"AS" in ROLE_KEYS; "OM" only exists in ROLE_KEYS). **Building one unified ladder both taxonomies
map onto is required new infrastructure**, not a config tweak — flagging this now so it's not
discovered mid-dispatch.

### 5. Job-title-code → review-role mapping: MEASURED, not designed from guesses
Owner: *"The job title code can be deciphered to know exactly what level role they are within some
of those categories, we may need to wire that in along with the table matching up the job title
code to the job title that goes with it... I believe you already have access to all that data and
it would just be a matter of an additional SQL table."*

**Confirmed exactly right — I do have that access this session (SUPABASE_SERVICE_ROLE_KEY) and
pulled the real, live distinct job-title codes from `qsr_employee_tenure` rather than guessing.**
Measured 2026-08-26, all employment statuses, excluding crew/maintenance/admin codes:

| code | description | n (all-time rows) |
|---|---|---|
| 45 | GENERAL MANAGER W/ MGR PUNCHES | 2 |
| 641 | GENERAL MANAGER | 24 |
| 643 | **"2000-11-02"** ⚠️ | 1 |
| 647 | CERT. SWING MGR. | 180 |
| 845 | DEPARTMENT MANAGER I | 1 |
| 846 | DEPARTMENT MANAGER II | 3 |
| 10001 | DEPT MGR I W/ CREW PUNCHES | 3 |
| 20107 | DEPT MGR III W/ CREW PUNCHES | 1 |

Clean mapping for 3 of 6 review roles: **GM** = {45, 641}. **DM** = {845, 846, 10001, 20107}.
**SM** = {647} ("Cert. Swing Mgr." = this org's term for shift manager). This is a much finer
breakdown than `DEFAULT_JOB_BUCKETS`' existing single lumped `shiftMgr` bucket
(`people-reports.js`) — that bucketer conflates codes 647/845/846/10001/20107 into one "shift
certified" count for a *different* purpose (headcount composition) and was never meant to
distinguish DM from SM for review routing. **A new, review-specific code map is needed — do not
repurpose `DEFAULT_JOB_BUCKETS` for this,** its existing consumers (`shiftCertifiedByLoc`,
headcount composition) need the coarser grouping and shouldn't be disturbed.

**✅ RESOLVED 2026-08-26 — AM vs DM (owner clarification + a second live measurement).** Owner:
*"Assistant managers are typically salary positions in our industry whereas department managers
are typically hourly positions in our industry — functionality wise I would view them similar, if
not the same."* So AM and DM are the same functional job in this org's KPI framework, split by pay
classification, not by a distinct job-title code — which is exactly why no separate "AM" code
exists. **Measured the DM-coded population's `hourly_pay_rate` to check this is a usable signal,
and it is:**

| code | description | hourly_pay_rate seen |
|---|---|---|
| 845 | DEPARTMENT MANAGER I | 0 (1 of 1) |
| 846 | DEPARTMENT MANAGER II | 0 (3 of 3) |
| 10001 | DEPT MGR I W/ CREW PUNCHES | 0, 0, 15.25 (mixed) |
| 20107 | DEPT MGR III W/ CREW PUNCHES | 18.50 |

For comparison, code 641 (GENERAL MANAGER) is 0/null on all 24 active rows (cleanly salaried, as
expected), and 647 (Cert. Swing Mgr.) is nonzero on all 180 (cleanly hourly) — so `hourly_pay_rate`
is a real, working salaried/hourly signal in this data, not noise. **Rule for the code→role
mapping: a DM-coded employee (845/846/10001/20107) with `hourly_pay_rate` 0/null suggests
review-role `AM`; nonzero suggests `DM`.** Code 45 ("GENERAL MANAGER W/ MGR PUNCHES," 2 people,
both nonzero-rate) is the one wrinkle — GM-bucketed but hourly-tracked, presumably a punch-based
pay arrangement layered on a still-functionally-GM role; leave it bucketed as GM, don't let it leak
into the AM/DM split.

**✅ REFINED 2026-08-26 — owner confirmed the code-45 handling, then added a real scenario that
needed a design answer.** *"Regardless if a GM has an hourly rate or not, if they're labeled to
GM, they should be reviewed as a GM"* — confirms code 45 stays GM, as above, full stop, on the
code alone. But: *"perhaps a GM in training might be assigned that way, and wouldn't necessarily
be fully responsible for their own store — in that circumstance it should be optional as to if
they're reviewed as more of an assistant manager or department manager versus a general manager...
make that an optional selection on the review itself... This would cover doing what's right for
the individual at the time."*

**This doesn't change the architecture — it's the clearest possible confirmation of it, and it
generalizes the point beyond just AM/DM.** The suggested role (from the job-title code, whatever
it says — GM included) pre-fills the review's role field; **the person setting up the review can
always override it manually for that one review**, exactly matching the "spot decision, not a
rigid formula" shape from the promotion/transfer research above (decision #3B) — a GM-in-training
reviewed under the AM/DM framework for now is the same kind of judgment call as a promoted
manager's segment scoring, just without an actual store/role change having happened yet. **No new
mechanism needed for this specific case: `NewReviewForm`'s existing Role dropdown
(`performance-reviews.js`) already lets a reviewer pick any of the 6 `ROLE_KEYS` freely when
creating a review** — the only new work is pre-filling that dropdown's default from the roster
suggestion (per decision #5's design) rather than leaving it hardcoded to `'GM'`
(`const [role, setRole] = useState('GM')` today), while leaving the dropdown itself exactly as
freely editable as it already is.

**✅ RESOLVED 2026-08-26 — the bigger point, and it changes the design: the roster pull is a
SUGGESTION source, never the authority, especially above GM.** Owner: *"all of the names for the
people in supervisory or above roles, you will also find their names in one of the stores['] data.
I'm just not sure what they'll be labeled as — they could be labeled as GM's or even something
different. So in this case, we will have to override or use our app environment to dictate what
their position titles actually are."* Confirms: an AS/OM/DO person still has a home-store roster
row (matching this table's "one row per person per home location" shape), but that row's
`job_title_code` can be stale/wrong for them specifically — e.g. still reading GM months after a
promotion, because nothing require QSRSoft's own code to be updated on an above-store promotion.

**This settles the architecture, not just the AM/DM split: `qsr_employee_tenure`'s job-title code
pre-fills a suggested role (feeding the "select from a dropdown or prepopulate" UI from the
original ask); the app's own effective-dated person-assignment record — the same extension of
`orgAssignments()` already planned in decision #2 above — is the single authoritative source once
set, editable by an admin at any time.** No blocking gap remains: GM/DM/AM/SM all get a real,
measured suggestion rule; AS/OM/DO get no roster suggestion at all (expected — above-store roles
were never going to have one) and go straight to manual assignment, which the design already
required for their multi-location assignments regardless.

**Also worth checking `643`'s garbage description ("2000-11-02" where a job title description
should be)** — a real, small data-quality bug in either the source system or the pull/parse path,
one row, not urgent but worth a `grep` when someone's in that code next.

**One clean small addition, not yet built: a Supabase-backed code→role config table** (owner's own
suggestion — "an additional SQL table"), matching the existing `org_config` pattern
(CLAUDE.md: "Org config... is configurable in Supabase `org_config` table — not hard-coded — to
support future multi-org deployments"). Store the GM/DM(hourly)/AM(salaried)/SM mapping there, not
hardcoded in JS, so a future job-code change or a second tenant's different codes don't need a
redeploy. This table only ever feeds the suggestion/pre-fill step — the app's own assignment
record stays authoritative regardless of what this table says.

### 6. Cross-login persistence & hierarchy-based visibility — MEASURED, real infrastructure
already exists, with real gaps in it

Owner: *"comments... need to make sure #DATA is stored safely and can be carried through to
different logins... I should be able to pull up a review for anyone that I'm responsible for...
if I'm a DO I should be able to see that."* Checked the actual code rather than assuming either
"it's fine" or "it's missing" — both are half true.

**✅ Good news: cross-login persistence is ALREADY REAL, not new work.** `review-engine.js` has a
working `reviews` Supabase table round-trip: `upsertReview()`/`deleteReview()` push the FULL review
object (including every `comments.*` field — the behavioral-section text the owner is specifically
asking about) to Supabase on every save (`_pushReview`), and `syncReviewsFromSupabase()` pulls
every review the current user's RLS grants them into `localStorage` on login. **The full review,
comments included, already leaves the device it was typed on and follows the user to a different
login** — this part of the ask is done today, not something this redesign needs to build.

**⚠️ Real gap #1 — write access has NO restriction at the database level, at all, today.**
`supabase/schema.sql`'s `reviews` RLS: `"reviews: authenticated write"` (INSERT) and `"reviews:
authenticated update"` (UPDATE) both check only `auth.uid() is not null` — any authenticated user,
any role, can insert or overwrite ANY review row in the table, including someone else's. This is
independent of the rest of this plan: it means the "lock imported actuals, gate override by
hierarchy" design (decision #4) currently has **zero enforcement below the client UI layer** — a
person who bypassed the app's own screen (or just used the Supabase REST API directly with their
own logged-in session token) could edit anyone's review today. Worth fixing as its own real
finding, not bundled silently into a bigger feature.

**⚠️ Real gap #2 — RLS only recognizes 3 roles, and doesn't cover the hierarchy the owner is
describing.** The `reviews: supervisor read` and `reviews: manager read own locs` policies key off
`get_my_role()` returning `'admin'`, `'supervisor'`, or `'manager'` — but `src/engine/
permissions.js`'s actual `DEFAULT_ROLES` are `admin` (level 1), **`area_supervisor`** (level 2,
not `'supervisor'` — a literal string mismatch against the RLS policy's check), and `manager`
(level 3). **No DO, OM, VP, or Owner role exists anywhere in the RLS policy or in
`DEFAULT_ROLES` at all** — a DO-tier login gets zero read access under the current policies unless
separately flagged `admin`. (Could not find anywhere in `src/` that actually writes
`profiles.role` — it appears to be set by hand today, e.g. directly in Supabase, not through app
UI; noting this as measured, not assumed.) **The 8-tier RBAC list CLAUDE.md documents
(Developer/Admin/Owner/VP/DO/Supervisor/GM/Office Staff) does not match what's actually
implemented** — `permissions.js`'s own comment says roles are meant to be "org-configurable (not
hardcoded)," but only 3 are defined, and the review-role ladder (GM/AM/DM/SM/AS/OM, decision #4)
is a third, still-different taxonomy layered on top of both. **This needs to become one real,
built role/level system — not a reconciliation of two things that already agree.**

**⚠️ Real gap #3 (smaller) — existing visibility is location-scoped, not hierarchy-scoped.** The
`supervisor`/`manager` read policies check `reviewee_loc = any(accessible_locs)` — "which stores
can this login see," not "who reports to this person." That's a reasonable proxy for a flat AS
patch, but doesn't express "a DO sees everything under their OMs" without also keeping
`accessible_locs` in sync as a derived superset for every DO/OM login — brittle compared to
resolving visibility straight from the assignment graph (decision #2's addition) the way access
should actually be computed.

**✅ Reuse, don't rebuild: `staff_assignments` already exists and is exactly the effective-dated
assignment concept this whole plan has been designing — currently unused (zero code references
anywhere in `src/`).** `supabase/schema.sql`: `staff_assignments {id, profile_id, store_loc,
start_date, end_date, notes}`, with its own comment reading *"Track which manager/supervisor was
responsible for which store during each period. Enables accurate review attribution when someone
transfers between locations"* — a stub someone already provisioned for precisely this feature and
never wired up. **Extend this table (add a `role` column; generalize `store_loc` to support the
person-or-loc recursive model from decision #2) rather than creating a competing new one.**

**Net effect on scope:** the persistence half of the owner's ask is already solved; the
visibility/access-control half is real, necessary build work — and it turns out to be the SAME
work as the hierarchy ladder already planned for override authority (decision #4), just extended
down to READ access on reviews (and enforced in RLS, not only in the client) rather than a
separate concern. One role/hierarchy system serves: override authority, review visibility, and
(per decision #3B/#5's spot-decision mechanism) who's allowed to approve a departure auto-finalize.

## What this unlocks once built
- Full-year review view (the original ask — "how do I see Nick Rice's review in entirety").
- The "new manager needs a review" notification panel (previously-agreed design: active + zero
  reviews this year + review-eligible job bucket) — buildable for ALL SIX roles now: GM/AM/DM/SM
  get a real roster-code suggestion (AM vs DM split by `hourly_pay_rate`), AS/OM surface through
  the app's own assignment record instead of a roster suggestion (expected for above-store roles,
  not a blocker).
- Locked/auto-populated actuals with a required-reason override, gated by the relative-hierarchy
  rule — a real, currently-live bug fix on its own: `autoPopulateKPIs` (review-engine.js) today
  unconditionally overwrites `mo[key]` for every `src:'auto'` metric on every run (confirmed by
  reading the code — target fields check `if (mo[slot]==null)` before filling; actual fields do
  not), so a manual correction someone makes today is silently clobbered the next time the review
  is opened. This needs fixing regardless of how the rest of this plan lands.

## Open items — need an owner decision before dispatching build work

*(The AM/AS/OM job-code gap that previously sat here as item 1 is resolved — see decision #5
above. Nothing below blocks starting the build sequence; these are confirmations to get right
along the way, not gates.)*

1. **Confirm "no real review data to lose" still holds** before any schema change ships — a quick
   re-check immediately before the restructure lands, since time has passed since the quote above.
2. **The day-weighted transfer-scoring "v2" block** (section 3A) — proposed as non-blocking future
   work, confirm that's an acceptable sequencing.
3. **The unified reviewer-hierarchy ladder** (section 4) is new infrastructure nobody has asked
   for elsewhere in the app yet — confirm the GM→AS/Supervisor→OM→DO→VP→Owner/OO chain above
   reads correctly against how this org actually works day to day (e.g., does every GM report to
   exactly one Supervisor, or can that vary by store the way the store-supervisor assignment
   already does?). **Sharpened by decision #6 below: this is more real than "new" — it needs to
   replace/extend `permissions.js`'s existing 3-tier `DEFAULT_ROLES` (admin/area_supervisor/
   manager) and fix a live RLS role-string mismatch, not invent a ladder from nothing.**

## Second-pass gap review (2026-08-26) — owner asked "what else are we missing"

Stress-tested the design above rather than re-summarizing it. Four real gaps need an owner
decision (asked directly, answers to be recorded here); the rest are minor enough to record a
default recommendation now and revisit only if wrong in practice.

### Resolved 2026-08-26 (owner decisions on all 4)

**A) Backfill — ✅ RESOLVED: backfill 2026 from real history.** Reconstruct actual store/role
segments for the whole current year from `qsr_employee_tenure`'s own `store_start_date`/
`job_title_code_start_date` history, not a clean-slate start at ship time. This year's first real
reviews need to be correctly segmented from day one, not just going forward — real build scope,
not a nice-to-have.

**B) Termination / departure — ✅ RESOLVED, with a specific mechanism, not the plain auto-clear I
proposed.** Owner: *"Do the auto finalize but require approval in the ability to override it. The
approval and potential override should come from a job title code qualified to perform the review
or above."* So: a departure (`termination_entry_date` set, or a detected role change out of
GM/AM/DM/SM/AS/OM) **auto-finalizes the review provisionally and auto-clears the person from the
new-manager panel immediately** — no manual step needed to get the routine case out of the way.
But that auto-finalize is **not a silent, unreviewable lock**: whoever is qualified to review that
role (the person's normal reviewer per the relative-hierarchy ladder — decision #4 — or anyone
above them) can approve it as final or reopen/override it, e.g. if the departure record was wrong,
or they want to add closing commentary first. **This reuses the exact same reviewer-hierarchy
mechanism already designed for locked actuals — not a second authorization system.**

**C) Root override escape hatch — ✅ RESOLVED: yes, explicit unconditional rule.** Admin/Developer
can always override a locked actual, full stop, independent of whatever the computed hierarchy
ladder says — a safety valve so a ladder bug or a vacant reviewer slot can never lock out the
people actually responsible for data integrity. Build this as a hard-coded OR alongside the
relative-hierarchy check, not something that has to fall out of the ladder being correct.

**D) Auto-detected role/store changes from noisy roster data — ✅ RESOLVED: propose, require
confirmation.** A detected code/store change from the roster pull surfaces as a pending suggestion;
a person confirms it (or it's dismissed, e.g. if it self-corrects within a few days) before the
review actually splits into a new segment. Protects against payroll corrections or job-code
data-entry noise silently fragmenting someone's real review.

### Recorded as a default — minor enough not to block on, revisit if wrong in practice

- **Exact-tie transfer month** (a transfer on day 15/16 of a 30/31-day month): later assignment
  wins on an exact tie. Simple, deterministic, matches "the most recent thing that happened" intuition.
- **Vacant reviewer slot** (a GM's Supervisor position is empty when an override is needed): walk
  up the ladder to the next filled level above, rather than blocking the override entirely.
- **Concurrent multi-store GM** (the acknowledged rare case from decision #2): score as one
  dollar-weighted composite across both stores for any month held concurrently, not as two
  sequential segments — matches the standing "never average averages, dollar-weight aggregates"
  rule (CLAUDE.md, Roadmap) rather than inventing a different aggregation just for this case.
- **New-manager panel: first-ever review vs. simply not-yet-reviewed-this-year** — both trigger on
  "zero reviews this year," but the panel should visually distinguish them (e.g. "🆕 New to role"
  vs. "⏰ Due this year") using `job_code_start_date` recency, since they're different urgency
  levels even though the underlying query condition is the same.
- **Assignment-record audit trail**: every `{person, role, loc, start}` row also carries who set it
  and whether it came from the roster suggestion as-is or was manually corrected — same discipline
  as the actuals override log (decision #4's mechanism), since a wrong assignment silently
  misattributes an entire segment's scoring, and it needs to be traceable to fix.
- **Overlapping same-store assignments during a handoff** (outgoing GM training incoming GM for a
  week, both technically "at" the store): the assignment model still resolves to exactly one
  active assignment per store per date (latest start wins, same as `orgAssignments()` today) — the
  cutover is whatever date someone enters as the new assignment's `start`, not a blended overlap
  period. Simplest option; a real fuzzier handoff week just picks a single effective date.

## Suggested build sequencing (not yet dispatched — for discussion)

Roughly independent pieces, ordered by dependency, sized to fit the project's one-engineer-at-a-
time dispatch practice:

0. **🔴 Live security gap, deliberately held for the full redesign — owner decision, 2026-08-26,
   not an oversight.** `reviews` RLS write policies (decision #6, gap #1) currently let any
   authenticated account insert/overwrite any review row. Offered an immediate small interim fix
   (restrict to the 3 known roles + fix the `'supervisor'`/`'area_supervisor'` string bug) vs.
   holding for the real hierarchy system. **Owner chose to hold** — fix it once, correctly, as
   part of item #1 below, rather than twice. Means this gap stays live until that phase ships;
   that's accepted, not unnoticed. **Owner's stated reasoning: "No one else is using the platform
   right now, so this is safe"** — true today (single-user), but that's a condition, not a
   permanent fact: **CLAUDE.md's own roadmap already names "multi-user then multi-tenant
   deployment" and "future plan is to deploy to a second trusted operator in beta"** as a real
   next step. This deferred fix must land BEFORE that second operator's account exists, not just
   "eventually" — re-check this item specifically at that point if the full redesign hasn't
   shipped by then.
1. **Role/level system — build the real thing, not a reconciliation.** Decision #6 found that
   `permissions.js`'s `DEFAULT_ROLES` (admin/area_supervisor/manager, 3 tiers), the `reviews` RLS
   policies (which don't even match those 3 role ids correctly), and the review-role ladder
   (GM/AM/DM/SM/AS/OM, decision #4) are three different, non-aligned systems today — none of them
   is the finished GM→AS→OM→DO→VP→Owner ladder this plan needs. This is real new-role
   infrastructure, not a small unification step — build it first since everything else (override
   authority, review visibility, departure approval) depends on one real ladder existing.
2. **Lock auto-populated actuals + reason-required override**, enforced in RLS (not just the
   client), gated by the relative-hierarchy rule from #1 PLUS the unconditional Admin/Developer
   override (resolved item C).
3. **Person/role/store effective-dated assignment model** — extend the existing, currently-unused
   `staff_assignments` table (decision #6: already shaped for exactly this, add a `role` column
   and the person-or-loc recursive scope from decision #2) rather than building a new one; also
   extend `reviews` RLS to grant read access by resolved hierarchy scope, not just `accessible_locs`.
   Foundational — #4, #6, #7 (new-manager panel), and the promotion/transfer scoring all depend on
   it. **Includes the 2026 backfill (resolved item A).**
4. **Data model restructure**: per-person yearly review records replacing per-half records, with
   the Q1-Q4 + H1/H2 + full-year rollup view.
5. **Promotion/transfer segmented scoring**, built on #3 and #4, including the propose-then-
   confirm flow for roster-detected changes (resolved item D) — never a silent auto-split.
6. **Departure handling**: auto-finalize + auto-clear from the new-manager panel on
   `termination_entry_date`/a detected role exit, reviewable/reopenable by the person's normal
   reviewer or above (resolved item B) — reuses #1/#2's hierarchy mechanism, built after it.
7. **New-manager notification panel**, built on #3 — covers all six roles from the start (GM/AM/
   DM/SM via roster-code suggestion, AS/OM via the assignment record directly).
8. **Job-code→role Supabase config table**, feeding #7 and #3's role detection.

## Sources (web research, section 3B)
- [HR's guide to mid-year performance reviews | QuickBooks Blog](https://quickbooks.intuit.com/r/manage-employees/mid-year-performance-reviews-guide/)
- [University of Wisconsin–Madison — performance management](https://hr.wisc.edu/?p=18312)
- [Georgetown University — Annual Performance Management Evaluations](https://hr.georgetown.edu/performancemanagement/annual-performance-review/)
