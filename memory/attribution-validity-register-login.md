# Attribution validity — when a manager's name is on a metric they did not cause

Owner, 2026-08-14, raised while settling #272's gate question. He flagged this **in advance of
any build**, explicitly wanting to work it through together: *"you and I will probably need to
work through some details as it pertains to flagging managers as they are often tied to a lot of
events that they're not necessarily responsible for."*

This is the single largest correctness risk in per-employee exception reporting, and it is an
operational problem before it is a data problem.

---

## Owner decision on the gate (#272)

**Derived judgments — risk scores, anomaly flags, peer-relative outlier rankings — are visible to
supervisor and above**, not DO and above as originally proposed. Raw facts continue to follow the
parity rule (visible to whoever can see them in QSRSoft).

Supervisors are the level that actually acts on a store-floor finding, so excluding them would
have made the flags useless in practice.

## The problem

An exception is attributed to whoever is logged into the register. That is frequently not who was
operating it. A manager's ID left signed in collects every refund, over-ring, T-Red and discount
taken by whoever actually stood there.

So the name on the metric is the name on the *login*, not necessarily the name of the actor. Any
system that ranks people by exception rate without accounting for this will confidently accuse
the wrong person — and the people most exposed are managers, because their IDs have the broadest
POS permissions and get left signed in the most.

## Path 1 — operational, and it is the real fix

Owner: *"managers have to make sure the proper people are logged into the registers that are
actually using them. That will solve 99% of all of these problems. I'm even discussing right
now."*

He has been driving this since he arrived. It is the correct primary control: no amount of
analysis repairs attribution as well as correct attribution at the source.

Meridian's job is to **support and measure** that control, not to substitute for it.

## Path 2 — can we detect a bad attribution from the data?

Owner's own read: *"I don't even know if it's possible yet… Reality is that's probably not gonna
be the case."*

**Partly too pessimistic — for one specific case.** There is a test that is a contradiction rather
than an inference:

> **Transactions recorded under an employee's ID during a period when that employee was not
> punched in.**

That is not a judgement call about who was standing there. It is two records disagreeing. If the
register says X transacted at 14:32 and the time system says X was not on the clock, the login
was wrong.

### What that test needs, and what we actually have — verified 2026-08-14, UPDATED 2026-09-08

| input | status |
|---|---|
| Per-employee **punch timestamps** | ✅ **NOW AVAILABLE (dispatch #124, `scripts/qsrsoft-punch-times-pull.mjs` → `qsr_punch_times`).** This is exactly "Path 2 §3 — the cheapest unlock" this file called for, and it landed via QSRSoft — the source this file's own §"Source decision" reasoned toward, before either of us knew a script for it already existed. Real geid, real shift start/end timestamps, live-measured 2026-09-08: 151,512 rows, back to 2026-05-27, today's shifts already present. Identity resolution (`geid` ↔ `audit_rows.emp_id`) already cross-checked by that dispatch against live data across all 4 digit-length bands — the "decisive reason" concern about a silent cross-system mismatch does not apply, since this pulls from the SAME QSRSoft identifier space Register Audit already uses. (The original `lifelenz-pull.mjs` line below is now stale as the reason this input is missing — it's still true of LifeLenz specifically, just no longer the blocker, since QSRSoft won the source decision anyway.) ~~`scripts/lifelenz-pull.mjs` fetches `ShiftsForSchedulePeriod`... raw shifts are never stored, and those are scheduled shifts, not actual punches.~~ |
| Transaction **timestamp + register/terminal id** | ❌ Still not available — this is exactly what #275's probe asks the "Any Transaction" report for. Needed for the FINER within-shift-window test (a transaction outside the punched window, or two terminals in overlapping minutes); not needed for the daily presence test below. |
| Per-employee **daily** exception aggregates | ✅ Available via Register Audit (`audit_rows`, PK `loc,date,emp`) — daily grain, no times, but does carry a real `emp_id` (numeric, same space as `geid`) alongside the display name. |

**So the DAILY-grain version of the test is runnable today** — "did this employee have any punch at all at this store on this date" — even though the finer intra-shift-window version still needs #275.

### First real sample, run 2026-09-08 — read before building anything on this

Per this file's own step 4 ("pull a sample and look at it together... don't finalise thresholds
from first principles"), this is that sample — a measurement, not a scored feature, not shipped
anywhere in the app. Joined `audit_rows` (rows with a real, non-placeholder `emp_id`) against
`qsr_punch_times` (`punch_type='shift'`) by `(loc, emp_id≡geid, date)`, 30-day window
(2026-08-09 → 2026-09-07, today excluded since both sides are necessarily incomplete for an
in-progress day):

```
audit_rows with a real emp_id:  7,722
  matched (>=1 punch that store/day):  5,835  (75.6%)
  UNMATCHED (audit activity, zero punches found):  1,887  (24.4%)
```

**24.4% is higher than "occasional register-discipline miss" would suggest, and some employee/
store pairs recur across consecutive days** (e.g. one employee at one store unmatched on three
straight sampled days) — worth a closer look at whether that's a real recurring pattern or a
mapping gap for that specific person (salaried/exempt staff who don't punch the same way,
a geid that changed, a store using a different punch system). **Not diagnosed here — this is
the raw sample, not a conclusion**, exactly the caution this file's own standing constraint
requires (no exception metric reaches a name without the handling notice and without this being
treated as a pattern in data, not a finding about a person). Business-day boundary bucketing
uses plain calendar-date-of-`start_date_time` (UTC), not `businessDate()`'s 4am cutover — the
pull script's own header flags this as unconfirmed, so a punch just after midnight could bucket
to the wrong day in edge cases; this is a first-look sample, not a precision measurement.

**Next step is the owner's, per this file's own sequencing** — look at this sample together
before deciding whether/how to build the `contested`/`unknown` state design below.

### Follow-up, same day (2026-09-08) — the owner and I looked at it together, per the above

**The 24.4% headline was substantially inflated by a real data bug, not a real signal.**
`audit_rows.emp_id` is not one consistent identifier scheme — most rows carry a QSRSoft `geid`
(numeric), but a real subset carry an eBOS-style `eID` (`eo384553`, `ea647119`, …), a different
system's identifier `memory/finding-padding-and-cash-hunt-2026-08-13.md` had already flagged
elsewhere as not the same space as `geid`. `qsr_punch_times.geid` is numeric-only, so any
eID-tagged `audit_rows` row was *always* going to read as "unmatched" regardless of real
attendance. **1,329 of the 1,887 "unmatched" rows (70%) are this shape.** Restricting to the
genuinely comparable numeric-`emp_id` subset (both legs of the join, denominator included):

```
numeric-emp_id audit_rows:  ~5,929 (7,722 total minus the eID-tagged rows)
  UNMATCHED, numeric subset:  558  (~7.2%, not 24.4%)
```

Per-store rate on that corrected subset ranges **1% to 30%**, not uniform. Two stores stand out
even after the correction: **loc 43701 (30%)** and **loc 10034 (23%)** are the two highest both
before and after removing the ID-format noise.

**Cross-checked against real job titles (`qsr_employee_tenure`) for the two flagged stores —
the owner's own hypothesis, confirmed for 10034:**

- **Store 10034**, unmatched days by person: Harlee Yates (**GENERAL MANAGER**, 17/17 — every
  audit day she appears), Kimberly Rustin (Cert. Swing Mgr., 4), Melissa Hagerman (Dept Mgr III
  w/ Crew Punches, 3), John Ratliff (Cert. Swing Mgr., 1), Veston Hicks (Cert. Swing Mgr., 1);
  three crew-level people (Jessica Davidson, Quincy Paul, Jonathan Whiddon) each show only 1-3
  days. **Read: these are two different categories, not one.** Harlee's 100%-every-day pattern
  is a role/data-model mismatch, not a security signal — a salaried GM structurally doesn't
  punch the hourly clock system the way crew and swing managers do, so she reads as "unmatched"
  on principle, not on evidence of anything. The other managers (Kimberly/John/Veston/Melissa),
  by contrast, are hourly-tier roles that *should* punch normally and only show up occasionally
  (1-4 days each, not constant) — that shape fits the owner's three hypotheses (below) well, and
  is the kind of thing the coaching-tally design (§ below) is actually for.
- **Store 43701** (Shannon H 29/29, Nia B 26/26 — the two heaviest cases in the whole 30-day
  sample) — **could not be role-checked.** `qsr_employee_tenure` has **zero rows for this store
  at all**. Root cause found: the daily `QSRSoft Employee Roster Pull` was failing its
  `qsr_employee_tenure` write for the *entire 27-store batch* whenever any one employee held two
  job codes (Primary + Secondary come back as two API rows sharing the same `(loc, geid)`, and
  Postgres's `ON CONFLICT DO UPDATE` refuses a batch containing two rows with an identical
  conflict key) — confirmed live via the failed 2026-09-08 15:05 UTC run's own error
  (`ON CONFLICT DO UPDATE command cannot affect row a second time`). **Fixed the same day**
  (`scripts/qsrsoft-employee-roster-pull.mjs`'s `toTenureRows()` now dedupes by `(loc, geid)`,
  preferring the row marked `jobCodeType:'Primary'`) — once the next scheduled run lands, 43701
  should get real tenure rows and this can be re-checked the same way as 10034. **Until then,
  whether Shannon H / Nia B are the same GM-shaped explanation as Harlee, or a genuinely
  sustained signal at a non-management role, is unknown — do not assume either way.**

**Owner's read, verbatim (2026-09-08), on what a sustained (non-GM-explained) pattern would
mean:** *"It would imply that all of the individuals... were logged in to registers by someone
other than themselves (most likely) or they were working off the clock (least likely) or where
[sic] working that day and never logged out of the register prior to leaving their shift (can be
verified)."* Noted for the record; **the "can be verified" leg needs register session
login/logout data this repo does not have yet** (`qsr_punch_times` is clock punches, not POS
session state) — that's the same still-open transaction-detail/terminal-id gap (#275) the table
above already names for the finer test, not a new gap.

### Source decision — QSRSoft preferred (owner, 2026-08-14)

Owner: *"we can either do that or maybe we can pull it from QSRSoft. It's available both
places."* That settles it toward QSRSoft, for three reasons:

1. **History depth.** LifeLenz for Oklahoma starts **October 2025** — a hard floor sitting
   directly on top of the periods we most want to test (the Sept–Oct 2025 Holdenville padding
   window, the 2025 cash pairs). QSRSoft has already been backfilled 27 months by API. If punch
   detail reaches back comparably, attribution-confidence applies **retrospectively to findings
   already on the table**, not only forward.
2. **Same identifier space as the registers — the decisive reason.** The test joins punch records
   to register records *by employee*. Register Audit keys on employee **name**
   (`parsers/index.js:977`). QSRSoft's roster pull already returns
   `{storeNum, geid, fullEmployeeName, …}` — the name → ID bridge exists and is already pulled.
   Sourcing punches from QSRSoft keeps the whole chain in one identifier system. Sourcing from
   LifeLenz introduces a cross-system identity match, and if the IDs do not line up it degrades
   to fuzzy name-matching across hundreds of employees at 27 stores. **A wrong match does not
   error — it silently attributes one person's punches to another.** In a test whose entire
   purpose is establishing who was present, that failure mode is disqualifying.
3. **Mature pull infrastructure** — the `qsrsoft-ops-pull.mjs` pattern is proven at 27 months.

**The argument for LifeLenz that survives:** it is the system of record for time. Punches
originate there; QSRSoft's copy may lag, round, or drop corrections.

**So the probe settles it empirically rather than by assumption:** pull both for one overlapping
store-week and compare punch-for-punch. Agreement → QSRSoft, for the history and the native
join. A lossy QSRSoft copy → LifeLenz, accepting the identity-matching cost deliberately with a
**measured** name→`geid` match rate rather than a hopeful one. Also worth establishing whether
LifeLenz and QSRSoft share the same `geid`: if they do, reason 2 weakens and the decision rests
on history depth alone, which still favours QSRSoft.

A third route exists independently: **transaction timestamps + terminal id** from #275, which
gives the same contradiction test at finer grain plus a second signal — one ID transacting on
two terminals in overlapping minutes, which needs no punch data at all.

### Weaker signals, listed so they are not mistaken for the strong one

- **Implausible session duration** — one ID continuously active 14+ hours, or spanning a shift
  boundary. Suggestive of "nobody logged out," not conclusive.
- **Concurrent terminals** — same ID transacting on two registers in overlapping minutes. Strong
  if timestamps exist, and it needs no punch data at all.

### The honest limit

This detects **that** an attribution is wrong. It does not establish who it should have been.
It can exonerate; it cannot reattribute.

That limit is not a defect — it is the correct design constraint, and it points at the answer.

## The design that follows: mark attribution, don't try to fix it

Rather than repairing attribution, carry an **attribution-confidence** state on every
employee-attributed metric:

| state | meaning | treatment |
|---|---|---|
| clean | no contradicting evidence | normal |
| **contested** | transactions outside punched hours, concurrent terminals, or an implausible session | **excluded from rankings**; shown with the reason, never as a bare number |
| unknown | inputs unavailable for that store/date | shown, but never ranked or flagged |

Defaulting to `unknown` when inputs are missing is the fail-closed behaviour, and it matters: a
store where we cannot test attribution must not silently look clean.

## The two paths converge — and this is the useful part

Owner's fallback, if inference fails:

> *"we make a TAG event or a sidenote, somehow specifying the proper procedure for register
> control in the signing users and making sure they're logged into the POS, and a tally account
> somehow of the frequency of the miss on that so that it can come back and be used in reviews
> and so forth down the line to help reinforce the procedure and standard — else potentially they
> be held accountable for all the metrics that fall under those lines with their names attached."*

**The tally he wants is produced by the detection he doubts is possible.** Every `contested`
attribution is one instance of the register-control standard being missed. Count them per store
per manager per period and that count *is* the frequency-of-miss metric — measured, not
self-reported, and per-thousand-normalised like everything else.

That turns an unfixable data-quality problem into a managed operational metric, and it gives the
accountability rule its teeth: *your exception metrics stand as attributed, and separately, here
is how often your registers were signed in incorrectly.* Both numbers are real, and the second
one is the one the manager actually controls.

It also creates the right incentive. A manager who tightens login discipline improves their
miss-rate immediately and their attribution quality permanently.

## Sequencing

1. **Path 1 is already running** and is the primary control — nothing in Meridian should be
   presented as a substitute for it.
2. **Register Audit auto-pull** (`memory/data-acquisition-shopping-list.md` §A) can ship without
   any of this, because at daily grain it reports facts. The rankings and risk flags are what
   need attribution-confidence, so those gate on this work rather than the pull doing so.
3. ✅ **DONE 2026-09-08 — not via LifeLenz, via QSRSoft (dispatch #124), which the source
   decision above already favored.** `qsr_punch_times` is live with real per-employee shift
   punches; see the updated table and first sample above.
4. The owner explicitly wants to review this **against real data** before it is built:
   *"It'll probably make more sense when we're actually looking at the data."* Do not finalise
   thresholds or the contested-state rules from first principles — pull a sample and look at it
   together.

## Standing constraint

No exception metric reaches a person's name without the handling notice
(`memory/project-sage-knowledge-grounding.md`) and without an attribution state attached. A
pattern in data is not a finding about a person — and here, more literally than usual, the
name on the row may not be the person at all.
