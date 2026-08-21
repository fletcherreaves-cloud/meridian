---
name: dispatch-56
description: Five owner asks on the Security panel, scoped against code. A rule directory in the legend (cheap - the text is already in security_rules). Employee start date (NOT a UI change - no hire date exists anywhere; investigation-first). Inventory findings showing a bare WRIN instead of the product name (a real defect, and descr is already loaded). Instance-vs-pattern-vs-trend plus links to prior findings (buildable from security_findings alone). Register and time of event (needs the transaction_detail pull, already captured and documented in dispatch-34, explicitly parked until an investigation needed it - this is that moment).
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #56 — Security panel: five owner asks, scoped against the code

**Five parts. A and C are cheap and independent — ship them first, separately, and do not let them
wait on the rest.** B and E are investigations before they are features. D is a real build.

| part | ask | verdict after scoping |
|---|---|---|
| **A** | rule directory in the legend | small; text already exists in `security_rules` |
| **B** | employee start date | **no such data exists anywhere** — investigate first |
| **C** | product name on inventory findings | **a real defect**, and `descr` is already loaded |
| **D** | instance / pattern / trend + links to prior findings | buildable from `security_findings` alone |
| **E** | register worked, time of event | needs the `transaction_detail` pull — already captured |

**Owner request (2026-08-21, side note):** *"On the security tab in legend > Let's add directory of
what each policy covers."*

Small job. Scoped against the code first, so most of the apparent work turns out to be already done.

## What exists today (measured, don't re-derive)

- **`Legend`** (`src/views/security-panel.js:429`) is a **vocabulary glossary** — 8 rows defining
  verdicts (Flagged / Clear / Undetermined / Hygiene), the signal-count badge, baseline types,
  threshold-vs-σ, and the ⏸ inactive marker. **It does not list the rules.** So this request is
  additive, not a duplicate of something already there.
- **The per-rule plain-language text already exists** as `security_rules.description`, rewritten
  under dispatch #46 by `schema-security-rules-plain-language.sql`, and is already rendered under
  each rule name on a finding (`security-panel.js:354`). **Reuse it. Do not write new copy.**
- **`loadSecurityRules()`** (`src/lib/supabase.js:3989`) already does `select('*')` with **no active
  filter**, and already maps `method`, `description`, `domain`, `subdomain`, `logicType`,
  `baselineType`, `severity`, `windowDays`, `active`, `investigationAction`.
- The panel already holds all of it in its `rules` state.
- **Nine rules today:** CASH-001…004, INV-001…005.

**So the only data work is one line:** `loadSecurityRules` does not currently map
`false_positives`. Add it.

## ⚠️ The one way this goes wrong

**Render the directory from the live `rules` array. Never hand-write a rule list in the component.**

A hardcoded directory is a second copy of text that lives in a database table an owner can edit, and
it starts drifting the moment a rule is retuned, renamed, or deactivated — with nothing to catch it.
This repo has paid for that exact class three times in the last week: Job A's stale `'Proj Workflow'`
label, dispatch #52's 15 schema-drift columns, and `proj`'s false `section:'planning'`. A directory
whose whole job is to tell the truth about the rules is the worst possible place to introduce a
fourth.

If a rule is added to `security_rules` tomorrow, it must appear in this directory with no code change.

## What each row shows, and why it earns its place

Per rule, grouped by domain (Cash / Inventory):

| field | why |
|---|---|
| `method` (fall back to `ruleId`) + `ruleId` | the name on findings, so the directory and a finding are obviously the same thing |
| `description` | the plain-language "what it covers" — the actual ask |
| `baselineType` | *what it compares against.* The legend already defines peer/personal/store/network; this says which one each rule uses |
| `logicType` + `windowDays` | threshold vs z-score vs ratio, and over how long. The legend already explains why those are different kinds of number |
| `investigationAction` | **what to do when it fires.** This is the standing voice rule — a directory that names a rule but not the decision it drives is a number nobody acts on |
| `false_positives` | the known legitimate explanations. The 0013113 investigation burned two dead hypotheses; publishing them saves the next person that hour |
| `severity` | 1–5, so a reader can tell an informational rule from a critical one |
| `active` | **inactive rules MUST be listed, marked ⏸** — see below |

**Inactive rules are listed, not hidden.** CASH-003 is deactivated right now. Omitting it makes a
reader wonder whether a rule they remember was removed, renamed, or is silently not running — and
the legend already defines the ⏸ marker for exactly this. Reuse that marker and its existing
wording: an inactive rule's findings are historical output, not current truth.

## Placement

Inside the existing legend, **below the vocabulary rows, as its own collapsed-by-default
subsection** (e.g. "Rule directory — what each policy covers"). The legend is a quick "what am I
looking at?"; 9 rules × 8 fields would bury the 8 vocabulary rows that answer that question. Reuse
the legend's existing dismiss/remember behaviour — do **not** add a second `localStorage` key for
the subsection's open state unless it proves annoying in use.

Show **both domains**, grouped and labelled, regardless of the panel's current cash/inventory
toggle. This is reference material, and someone reading it is often asking "is there a rule that
covers X?" — a directory filtered to the tab you happen to be on cannot answer that.

## Verification

- **Render-based, and it must count.** Render the legend with the directory open against a fixture
  of all nine rules including an inactive one, and assert **every rule appears** — count them, don't
  spot-check. The failure this catches is a filter that silently drops inactive rules.
- **The anti-hardcode check is the important one.** Add a rule to the fixture that exists in no
  source file, and assert it renders. A directory built from a literal passes every other test in
  this file and fails this one — which is exactly the point.
- Assert `investigationAction` and `false_positives` actually render, not just the description. They
  are the half that makes this a directory rather than a list.
- No new eager imports; the panel is already lazy. Entry chunk before/after in the commit body
  (1680 KB / 493.6 KB gz at v5.092).

---

# Part B — employee start date on a security subject

**Owner request, same message:** *"It would also be nice to have the following in Security as well
if possible — Employee start date."*

The intent is obvious and good: a cash finding against someone in their third week is a different
story from the same finding against a ten-year veteran. Tenure is context a reviewer needs before
acting.

## ⚠️ This is NOT a UI change. Meridian does not have this data.

Measured before scoping: **no hire date, start date, or tenure field exists anywhere** in
`src/`, `scripts/`, or `supabase/`. Nothing to render. Do not go looking for a field to surface —
there isn't one, and the first task is to establish where it can come from.

**Candidate sources, in order:**

1. **LifeLenz** — the workforce system, so the only place a *real* hire date plausibly lives. But
   `memory/lifelenz-session.md` documents **no employee-master endpoint**, and that runbook exists
   precisely to record what has and hasn't been found. Check whether one exists before assuming it
   does — and if you go looking, **write what you find into that runbook, including the dead ends.**
   That file's whole value is that it stops the next session re-walking the same paths.
2. **QSRSoft Register Audit** — already gives `empName`/`empID` (`emp_id` landed under dispatch #51).
   Transactional, so a hire date is unlikely, but the response envelope is already being parsed and
   worth one look at the field list.
3. **Derive a tenure proxy from atoms already pulled** — first appearance of an `emp_token` in
   `audit_rows`. Standing rule prefers deriving from pulled atoms over adding a source, and the
   backfill rule means "first seen" can be pushed back as far as the pull reaches rather than being
   capped at when we started looking.

## The line that must not be crossed

**A derived proxy is labelled as a proxy. It is never shown as "Start date."**

"First seen in our data" is not a hire date, and rendering it under that label invents an HR fact
about a real person and attaches it to a security finding — where someone may act on it. If Part B
ships the proxy, it ships as **"First activity in our data — not an HR hire date"** or similar, with
the distinction visible on the surface, not buried in a tooltip. If a real hire date is found later,
it replaces the proxy and the label changes with it.

This is the same discipline as the rest of the build: `min_denominator` yields an honest null rather
than a confident-sounding number, and cash gets no z-test on 1–4 rules. A mislabelled tenure figure
is that error with a person's name attached.

## Order of work

**Report before building.** Do task 1 and 2 as investigation and come back with what exists —
including "LifeLenz has no such endpoint," which is a real and useful finding worth committing to
the runbook. Do not build the proxy until the owner has seen whether a real hire date is reachable,
because a labelled proxy and a real date are different features and only one of them is worth the
UI space.

Part A does not depend on this and should not wait for it.

---

# Part C — inventory findings show a bare code, not a product

**Owner:** *"For the Inventory policies, list the name of the product as well as any other pertinent
information the discovery."*

**This is a real defect, and it is nearly free to fix.** `security-panel.js:400` renders an
inventory subject as:

```js
`Item ${group.wrin} (store ${group.loc})`
```

A bare WRIN. Every inventory finding currently makes the reader go look up what the item *is* before
they can think about it — which is the difference between a panel you act on and a panel you close.

**The name is already in the data.** `qsr_variance_stat.descr` is the item description, and it is
already mapped by the loaders at `src/lib/supabase.js:3048/3090/3107` and already read for
`lifecycle_category`. Surface it: **`descr` as the heading, WRIN as the secondary identifier** —
the code still matters for lookups, it just stops being the only thing shown.

⚠️ **Join on `(loc, wrin, period)`, never `(loc, wrin)`.** The period-fan-out bug is documented and
was reproduced during the 0013113 investigation: dropping `period` inflated counts ~3.5× (658 vs
188). It looks like it works.

Also surface, where present: `cls` (item class — the 82.1%-vs-47.0% packaging split turned on it)
and `lifecycle_category`, which the panel already knows and which tells a reader "this is a setup
issue, not a security question" before they spend an hour on it.

# Part D — is this an instance, a pattern, or a trend?

**Owner:** *"Trend, pattern, instance, etc."* and *"Links to previous findings or a roll up
somehow."*

Two halves, both buildable from `security_findings` alone — **no new data source.**

**1. Subject history.** `security_findings` carries `emp_token`/`wrin`, `rule_id`, `loc`,
`window_start`/`window_end`, `value`, `pass`. So "has this subject been flagged before, on which
rules, in which windows" is a query against a table already loaded. Show it on the subject: the
prior windows, which rules fired in each, and whether the value is rising or falling.

**A first-time flag and a fifth consecutive flag are completely different situations and the panel
currently presents them identically.** That is the substance of this request.

**2. Name the shape, but only where the data supports it.** Instance = flagged in one window.
Pattern = flagged in multiple non-consecutive windows. Trend = consecutive windows with the value
moving in one direction.

⚠️ **Do not label a shape from two windows.** Dispatch #52 deliberately declined a z-test on 1–4
flagged cash rules for exactly this reason, and its `periodTrend` deliberately returns medians with
**no flat/step/improving label asserted by the code**. Keep that discipline: below a stated minimum
number of windows, show the history and let the reader read it. State the minimum in the UI, don't
hide it.

**Link, don't re-render.** Where dispatch #52's drill-down already computes something (period trend,
cross-store prevalence), this reuses it. `src/engine/security-drilldown.js` is pure and unit-tested —
extend it rather than writing a parallel history calculation next to it.

**Free win while you are here:** `security_rules.corroboration_rules` and `exoneration_rules` exist
in the table, are populated, and are **dropped by `loadSecurityRules()`** — it maps neither. Those
are literally "which other rules strengthen or weaken this one," which is the roll-up the owner is
asking for, already authored and currently invisible. Map them and surface them (in Part A's
directory, and on a finding where a corroborating rule actually fired on the same subject).

# Part E — register and time of event: the `transaction_detail` pull

**Owner:** *"Any other key info such as drawer (register) worked and time of event."*

**Not renderable today, and not because of a UI gap.** `audit_rows` is a **daily per-employee
aggregate** — PK `(loc, date, emp)`, no register number, no timestamp. Nothing to surface.

**But the source is already found, captured, and documented.**
`memory/dispatch-34-phase0a-findings.md:145-180` records the `transaction_detail` endpoint
(`api.security.myqsrsoft.com/security/transaction_detail`), reached from the `any_transaction` list,
returning:

- **register #** (`node_id` / `final_register`, e.g. `POS0013`) — the owner's "drawer worked"
- **session start/end times** and `pos_session_start_time` — the owner's "time of event"
- point-of-delivery (`pod`: Drive Thru / front counter) — behavioural context the daily aggregate erases
- itemized lines with per-line `qty_voided` / `qty_promo` / `orig_amt` vs `amt` vs `red_amt` — the
  T-Red concept at line-item grain
- before-total vs after-total reduction split, tender breakdown
- **operator and manager, with badge numbers** — the manager on duty, which is "any name attached to
  the event" for cash

That file closes with: *"worth a follow-up dispatch when an actual investigation needs it, not
before."* **This is that moment — the owner is asking for exactly its contents.**

**Scope it as Tier B, on demand.** One transaction / store / date-range at a time, fetched when an
investigator drills in — never an eager pull. The Security panel is already built this way (dispatch
#43's on-demand requirement, and #191 pulled `auditRows` out of the eager startup batch — do not
reintroduce that cost).

**Two things to settle in the same pass:**
- **Auth.** Assume the QSRSoft DAR pattern applies: `api.reports.myqsrsoft.com` requires browser
  session cookies and returns 401 to a server-side fetch with a token alone. Verify against
  `api.security.myqsrsoft.com` before designing around either answer.
- **Camera/video linkage — still genuinely open.** The captured call was a normal `TRX_Sale` and had
  no camera field. That does not answer it; a link plausibly only appears on a flagged row. Pull an
  actual refund/void/over-ring and settle it. Either answer is a finding worth committing.

⚠️ **PII.** This endpoint returns real names and badge numbers. Everything the vault rules say still
applies: `security_findings` subjects stay `emp_token`/`wrin`, never plaintext; a name reaches the
UI only through the logged reveal path; **never log a name, badge, or token value** — key names and
shapes only.

# What else would enhance this — proposals, not requests

Offered because the owner asked *"anything else to enhance this data"*; none are approved:

1. **Daypart and point-of-delivery** on cash findings, once Part E lands. Overnight drive-thru is a
   different risk profile from lunch front-counter, and the daily aggregate erases the distinction.
2. **Manager on duty.** `transaction_detail` returns it. A supervision gap that recurs across
   several employees is a different finding from one employee's behaviour — and it is the kind of
   pattern no per-employee rule can see.
3. **Peer context inline.** The drill-down computes flag rate vs other stores; the same comparison
   against peers at the *same* store, same daypart, is the question a GM asks first.
4. **What changed since last window** on a repeat subject — value delta, not just both values. The
   direction is the decision-relevant part.
5. **A "no findings" statement.** A subject with zero findings this period currently shows nothing,
   which is indistinguishable from not having been evaluated. That is the Clear-vs-Undetermined
   distinction the legend already works hard to draw, applied at subject level.

---

## Not in scope

- Editing rules from the panel. This is read-only reference.
- Any change to rule logic, thresholds, or `security_rules` rows themselves.
- The drill-down (dispatch #52) — already shipped. Part D **extends** it; it does not replace it.
- Camera/video *integration*. Part E settles only whether a link EXISTS in the payload.
