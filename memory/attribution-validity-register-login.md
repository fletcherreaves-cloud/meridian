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

### What that test needs, and what we actually have — verified 2026-08-14

| input | status |
|---|---|
| Per-employee **punch timestamps** | ❌ **Not available today.** `scripts/lifelenz-pull.mjs` fetches `ShiftsForSchedulePeriod` and pre-aggregates it via `rollupShiftsByRole` — *raw shifts are never stored*, and those are **scheduled** shifts, not actual punches. The `punchInLate` figures in `src/views/scheduling.js` are a hardcoded static per-store block, not per-employee data. |
| Transaction **timestamp + register/terminal id** | ❌ Not available today — this is exactly what #275's probe asks the "Any Transaction" report for. |
| Per-employee **daily** exception aggregates | ✅ Available via Register Audit (`audit_rows`, PK `loc,date,emp`) — but daily grain, no times. |

So the test is **not runnable today, and plausibly reachable** by more than one route.

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
3. **LifeLenz punch extension** is the cheapest unlock and is worth scoping before the
   transaction-detail probe, since it does not depend on how that probe lands.
4. The owner explicitly wants to review this **against real data** before it is built:
   *"It'll probably make more sense when we're actually looking at the data."* Do not finalise
   thresholds or the contested-state rules from first principles — pull a sample and look at it
   together.

## Standing constraint

No exception metric reaches a person's name without the handling notice
(`memory/project-sage-knowledge-grounding.md`) and without an attribution state attached. A
pattern in data is not a finding about a person — and here, more literally than usual, the
name on the row may not be the person at all.
