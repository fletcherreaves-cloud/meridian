---
name: dispatch-43
description: Build the Security panel — a dedicated modal that houses security/loss-prevention findings as an investigation workspace. Owner-requested 2026-08-20. security_findings currently has ZERO references anywhere in src/; the only way to see a finding today is a SQL query. Phase 1 is a read-only investigation surface grouped by SUBJECT (not by rule); Phase 2 adds triage state.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #43 — The Security panel

**Owner-stated, 2026-08-20:** *"We should build out the security panel UI. I am good with its data
coexisting where appropriate, but think we need an entire modal to house security events. It will
be logical and make research and findings easier."*

**The gap this closes.** The security build has a working backend and **no UI whatsoever**.
`security_findings` has **zero references anywhere in `src/`** (grepped, excluding tests and
changelog). The batch job writes findings; nothing reads them. The only way to see one today is a
SQL query pasted into the Supabase console — which is why every evaluation in the 2026-08-20
session came back to the owner as a fenced block to run by hand.

**Read before starting:**
1. `memory/plan-security-loss-prevention.md` — the original plan; §1's five principles are the
   design brief for this panel, especially principle 4 (exoneration).
2. `memory/plan-security-pii-architecture-2026-08-19.md` §4 — Direction B, the identity vault.
   The panel is the main consumer of it.
3. `memory/analysis-inventory-variance-baseline-2026-08-20.md` — why the inventory numbers on
   screen are not yet trustworthy, and what the panel must therefore NOT imply.
4. `memory/dispatch-42.md` — the calibration work running in parallel. **Coordinate: #42 changes
   what `value`/`pass`/`baseline_context` contain, not their shape.** Build against the shape.

---

## 1. What actually exists to build on (measured 2026-08-20, do not re-derive)

**Live data.** Both domains have real findings in `security_findings` right now:

| rule | subjects | flagged | rate | note |
|---|---:|---:|---:|---|
| CASH-001 cash over/short | 670 | 37 | 5.5% | healthy |
| CASH-002 POS over-ring | 670 | 72 | 10.7% | healthy |
| CASH-003 manual refund | 670 | **0** | 0% | **cannot fire — INV-002's signature** |
| CASH-004 promo/discount | 670 | 15 | 2.2% | healthy |
| INV-001 TvA variance | 5165 | 2603 | 50.4% | `active=false`, predominantly measurement error |
| INV-002 TvA $ exposure | 5165 | 0 | 0% | `active=false`, threshold ~77× its own max |

The cash rules ran for the first time on 2026-08-20 (`workflow_dispatch`, run 32403363787) once
#487 unblocked `audit_rows`: **2,680 findings across 4 rules, 0 errors.** Three of four land in a
believable 2–11% band. **CASH-003's zero is a real finding for #42** — same shape as INV-002.

**Schema** (`supabase/schema-security-findings.sql`): `id, tenant_id, emp_token, wrin, loc,
rule_id, window_start, window_end, value, threshold_used, pass, baseline_context jsonb,
explanation jsonb, computed_at`, plus a generated `subject_key`. A CHECK constraint enforces
**exactly one subject** per row — `emp_token` XOR `wrin`.

**Three schema facts that drive the whole design:**

1. **`pass` is nullable, and null is not false.** It means the engine honestly declined a verdict
   (no exposure in window, no threshold configured, and after #42: below the exposure floor,
   zero stdev, insufficient n). 670 subjects per cash rule but only 37 flagged — the vast
   majority are `pass=false` (clear) or `pass=null` (no verdict). **Rendering null as "clear" is
   a correctness bug, not a display nicety.** Three states, three treatments.
2. **`baseline_context` already carries `{mean, stdev, n, values}`** at evaluation time, and
   `explanation` carries plan §4's additive breakdown. The evidence the panel needs to justify a
   finding is already persisted — **you do not need to recompute anything to explain a finding.**
3. **The subject is a token, never a name.** `emp_token` → `employee_identity_vault`.

**RLS is already gated** and is *stricter* than most tables here: `admin`/`supervisor` always,
`manager` only when `org_config.gm_identity_reveal_enabled`. Nobody else gets rows.

**Reuse, do not rebuild** (standing rule — check whether a helper exists first):
- **`RevealName`** — `src/views/store-analytics.js:1167`, already exported at :2391. Handles the
  RPC, the reason prompt, the cache, the failure states. Dispatch #38 built it; use it as-is.
- **`reveal_employee_identity(p_token, p_reason)`** does all role-gating and logging server-side.
  The component does none of it and neither should the panel.
- **`ModalShell`** — the app's modal wrapper. `App.js:2845` (Signals) is the closest model.
- **`lazyPanel()`** — `App.js:70`.
- **`panel-registry.js`** — ONE source of truth. Registering there is what wires nav +
  `onOpenModal` + render + `anyModalOpen`. **Do not hand-edit those four lists**; that drift is
  the exact thing the registry was built to end.

---

## 2. The organizing decision: group by SUBJECT, not by rule

**This is the most important call in the dispatch and the thing that makes the panel a research
tool rather than a report.**

The batch job's natural output is rule-major: four rules × 670 subjects = 2,680 rows. Rendered
that way, one employee flagged on three different rules appears as three unrelated rows in three
different lists, and the single most informative fact about them — *that they are flagged on three
of four independent cash signals* — is the one thing the UI destroys.

**Group by subject.** One row per employee-token (or per WRIN), carrying that subject's verdicts
across every rule. Sort by how many independent signals agree, then by severity. A person flagged
on one rule at 1.2× threshold is noise; a person flagged on three is a lead. Convergence across
independent signals is precisely what a loss-prevention system exists to surface, and it is free
here — the data already supports it, only the grouping is missing.

This also implements plan §1 principle 4 (**exoneration**) for nothing extra: showing all four
verdicts per subject means the three they passed are visible next to the one they failed. A panel
that shows only failures cannot exonerate anyone.

**Corollary:** the cash domain and the inventory domain are the same panel but not the same list.
An employee-subject and a WRIN-subject share a schema and share nothing else operationally. Two
tabs, one shell.

---

## 3. Phase 1 — the read-only investigation surface (ship this alone)

**Scope Phase 1 so it is independently shippable and useful with no new tables.**

### Shell
Modal via `ModalShell`, `maxWidth:1400`, registered in `panel-registry.js`. Title `🔒 Security`.

**Permission must match the RLS tier, not be looser.** This is a correctness requirement, not a
polish item: RLS returns `[]` to an unauthorized role, which is **indistinguishable from "no
findings"** on the wire. A nav entry visible to a role whose reads are silently filtered produces
a confident, affirmative "No findings" — the same false-negative shape as the #192 / v4.870
"affirmative no-data on an unresolved load" bug this repo has already been bitten by twice. Gate
the nav entry to the same admin/supervisor(+conditional manager) tier the policy enforces, and
have the panel distinguish *empty result* from *not permitted* from *still loading*.

### Controls
- **Scope pills**, All → State → Org/Patch → Store, per `memory/feedback-selector-ui-standard.md`.
- **Window** — findings carry `window_start`/`window_end`; default to the most recent
  `computed_at` batch, with the window stated on screen. Never show a number without its window.
- **Domain tabs** — Cash (employee subjects) / Inventory (WRIN subjects).
- **Filters** — rule, verdict (flagged / clear / no verdict), minimum agreeing-signal count.

### The list (subject-major)
One row per subject: signal-count badge, per-rule verdict chips, worst-severity value, store,
window. Employee names render through `RevealName` — tokens by default, revealed on demand.

**Every row states the decision in one line, in restaurant words, with the number next to it**
(standing rule, owner-stated 2026-08-17 — say the number AND the decision). Not
`CASH-001 z=2.8`, but something a supervisor acts on — *"Cash drawer runs short more often than
peers — $4.10 short per $1,000 in sales vs. $0.90 for the store"* — with the metric, its window,
and its comparison basis visible, never replaced by the plain-language line and never hidden
behind a click.

### The drill-down (why the finding exists)
Per subject: each rule's `value`, `threshold_used`, and the `baseline_context` it was judged
against (`mean`/`stdev`/`n` — say which baseline: personal, peer, store, network), the
`explanation` additive breakdown, and the underlying `audit_rows` / `qsr_variance_stat` rows for
the window. **Depth stays exact and reachable** — this is the analyst end of the standing
both-ends rule; do not simplify it away.

Show honest nulls **with their reason**, not as blanks: "no verdict — no exposure in window" is
information, and it is the mechanism that stops the panel from implying a clean bill of health it
never computed.

### Data loading
`loadSecurityFindings()` in `src/lib/supabase.js`, following the existing loader conventions
(pagination past the 1000-row cap — that bug has bitten `loadQsrActSummary` already). **On-demand,
not eager at startup.** `auditRows` was deliberately moved *out* of the eager startup batch under
#191; do not undo that by loading findings on login. Load on panel open, with a real pending state.

### Calibration honesty
`INV-001`/`INV-002` are `active=false` pending #42, and `CASH-003` cannot currently fire. **The
panel must not present stale or uncalibrated output as current truth.** Show each rule's
`active` state and the `computed_at` of the batch that produced the rows. An inactive rule's old
findings are history, not findings.

---

## 4. Phase 2 — triage state (only after Phase 1 ships)

What turns a report into a workspace: marking a subject **reviewed / dismissed / escalated**, with
a note and who set it. Without it, the same 37 flagged names are re-read from scratch every day.

This is a **new persistent data type**, so per the standing rule it goes in Supabase — a
`security_finding_status` table keyed by `(tenant_id, subject_key, rule_id, window_start)`, with
`tenant_id` + RLS matching the findings policy, and writes attributed to the acting user. Status
is *investigation* state, deliberately separate from the findings the batch job overwrites on
every run — never let a re-run erase a human judgement.

**Do not fold Phase 2 into Phase 1's PR.** Phase 1 is valuable alone and much easier to review.

---

## 5. Coexistence — where security data shows up outside the modal

The owner explicitly allowed this ("data coexisting where appropriate"). Keep it to **deep links
into the modal**, not reimplementations of it:

- **Register Audit tab** (`store-analytics.js`, tab `register`) — the natural cash home; it
  already renders these employees and already uses `RevealName`. A flag marker on a flagged
  employee that opens the modal focused on that subject.
- **Inventory / FOB** — same idea for WRIN subjects.
- **`attention-now.js`** — a candidate surface for "N subjects flagged on 2+ signals this week."
  Evaluate it; don't force it.

**One rule for all of these:** a count on another panel must come from the same loader and the
same verdict logic as the modal. Two computations of "how many flagged" will drift, and the repo
already has a standing rule about exactly this (dispatch16, #348: diff the two computations before
debugging either).

---

## 6. Verification

- **Test at the call site, not just the engine** (#366): a test that renders the panel with
  fixture findings and asserts the subject-grouping and the three-state verdict rendering. A test
  that only exercises a grouping helper cannot tell "built" from "built but never wired in."
- **All three verdict states**, explicitly: `pass=true`, `pass=false`, `pass=null` must render
  differently, and the null case must show its reason. Assert that null never renders as clear.
- **Permission states**: not-permitted, permitted-but-empty, and loading must be visually and
  behaviourally distinct. Assert the panel does not claim "no findings" on a blocked read.
- **Perf**: `lazyPanel` by default; entry chunk budget ≤ 2.8 MB / ≤ 850 KB gzipped. Put the
  before/after numbers in the commit body. A static import in `App.js` costs every user on
  every load.
- **Never hardcode `rgba(255,255,255,X)`** — use the theme tokens. Guarded by
  `light-mode-white-alpha.test.js`'s ratcheting ceiling.
- **Live check**: with real findings in the table, open the panel and confirm the flagged counts
  match the SQL (`37 / 72 / 0 / 15` for CASH-001..004 as of run 32403363787). If the panel and a
  direct query disagree, that is a Phase-1 blocker.

---

## 7. Explicitly not in this dispatch

- **Rule authoring/editing UI.** Rules are seeded by SQL today; leave that alone.
- **Calibration.** That is #42. Do not adjust thresholds from inside this work.
- **Notifications/alerting.** Ask first — pushing security alerts is a different risk class.
- **SAGE integration.** Disclosure-gating for employee risk data is a live policy question in
  `project-sage-knowledge-grounding.md`; do not wire findings into SAGE without an explicit
  owner decision.
