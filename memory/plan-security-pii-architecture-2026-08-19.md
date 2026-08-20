---
name: plan-security-pii-architecture-2026-08-19
description: Owner-commissioned follow-up research (Grok, Gemini, ChatGPT) on how security/loss-prevention apps handle employee PII and naming — pseudonymization, identity-vault separation, masking/reveal UI, audit logging. Compared against this org's existing access-control design and this codebase's actual current state. LOGGED FOR A FUTURE DIRECTION DECISION — not built, not decided.
metadata:
  type: project
---

# Security build — PII/identity architecture research (2026-08-19)

**Status: logged for a decision, not scoped, not built.** Owner ran a follow-up question — "how do
most security-leaning apps handle use of sensitive data and naming employees?" — through the same
three AI engines used for `plan-security-loss-prevention.md`, wanting to check this org's existing
design is compliant before more of the security build ships. This file synthesizes their answers,
checks them against what's *actually already decided* in this repo (not re-derived), and — this is
the part worth reading closely — checks them against what the *code actually does today*, which
turns out to matter more than either research pass anticipated.

**Do not scope this into a dispatch.** This is exactly the kind of owner-gated question §5 of the
main plan file already identifies (data retention, access control, evidence-grade standard) —
this file adds one more axis (identity architecture) to that same gate, it doesn't open a new one.

---

## 1. What the three engines converged on

All three (independently, in different framings) recommend the same core pattern, which is a
real, well-established industry practice (the ICO's pseudonymization guidance and NIST's privacy
framework are both cited, correctly, across the three transcripts):

1. **Separate identity from analytics.** Risk scores, exception counts, and behavioral baselines
   live keyed to a stable pseudonymous token (e.g. a hashed/opaque `Person_7F92A1`), not a name.
   A separate, more tightly access-controlled "identity vault" holds the token → real-name mapping.
2. **Resolve identity only through a logged, justified action** — not simply "does this role see
   names." ChatGPT's framing (reason code + case number + `IDENTITY_REVEAL` audit event) is the
   most concrete of the three.
3. **Mask by default in the UI**, reveal on demand (Gemini's blur/reveal toggle, initials-only
   default rendering).
4. **"Blind mode" as a bias-reduction feature**, not just a privacy one — an investigator sees
   `Person_7F92A1`'s behavior pattern before knowing who it is, reducing halo/horns effect from
   prior opinion of that person. This is a genuinely good idea independent of the privacy angle.
5. **Neutral, non-accusatory field/label naming** (Gemini: avoid `Fraudster_Score`, use
   `Exception_Variance_Index` or similar) — this one is **already a settled decision** in this
   repo, not new: `project-sage-knowledge-grounding.md`'s handling notice already bans "suspected
   wrongdoing" framing outright (§0 of the main plan file, point 3).
6. **Retention discipline + logging of every view/export/reveal action.**
7. **Legal grounding cited: GDPR (EU), CCPA/CPRA (California), PCI DSS (cardholder data), state
   electronic-monitoring notice laws.** ChatGPT correctly notes pseudonymized data is still
   "personal data" under GDPR as long as re-identification is possible — pseudonymization reduces
   risk, it does not exit the regulatory scope entirely.

**One thing to flag plainly, since none of the three localized it:** this org operates only in
Florida and Oklahoma. GDPR almost certainly does not apply directly (no EU operations or EU-
resident staff data in evidence). CCPA/CPRA almost certainly does not apply either (no California
nexus in evidence). PCI DSS governs *cardholder data* specifically (card numbers, not employee
names) — relevant to any payment-tender fields this build touches, not to employee PII itself.
**The actually-relevant legal anchor for employee monitoring/PII in this org is Florida and
Oklahoma state law plus ordinary US employment-law/HR practice, not the frameworks the research
leaned on.** This isn't a reason to ignore the research's *architecture* recommendations, which
are sound regardless of jurisdiction — it's a flag that "GDPR/CCPA-compliant" is the wrong compliance
target to chase, and this needs real verification (HR/counsel), not an AI-engine's generic legal
survey and not further reasoning from this session. **Do not treat this file's legal framing as
authoritative — flag the question, don't answer it from here.**

---

## 2. Checked against what's already decided in this repo — most of it is, some of it isn't

`plan-security-loss-prevention.md` §0 already has an owner-approved disclosure-gating policy
(`project-sage-knowledge-grounding.md`, 2026-08-13) that covers real ground here:

| research idea | already covered? | where |
|---|---|---|
| Role-gated visibility of sensitive findings | ✅ yes | Above-supervisor only (DO/VP/Owner/Admin/Developer); Supervisor/GM/Office Staff excluded |
| Gate on subject, not just role | ✅ yes | A finding about the requester (or an implicated DO) doesn't return to them even if role clears the bar |
| Mandatory handling notice, non-accusatory language | ✅ yes, verbatim text already exists | Long/short form notice, "not a determination of wrongdoing," bans "suspected wrongdoing" framing |
| Attribution/false-positive rigor before scoring a person | ✅ yes, more specific than the research | `attribution-validity-register-login.md`'s clean/contested/unknown state — a *data-quality* gate, different mechanism than "blind mode" but serves an adjacent purpose (reduces false accusation risk) |
| Data retention for an accusation trail | ⚠️ already flagged as open, owner-gated | §5 point 1 — not decided, correctly deferred |
| Sequencing behind RLS hardening | ✅ already decided | §5 point 3 — accusation-grade data must not land before RLS hardening |
| **Pseudonymization / identity-vault separation at the data-model level** | ❌ **not decided, not built** | New ground — see §3 below |
| **Logged, justified "identity reveal" as a distinct action from role-permitted viewing** | ❌ **not decided, not built** | New ground |
| **"Blind mode" UI (investigate behavior before identity)** | ❌ **not decided, not built** | New ground |

So: **the access-control question (who is allowed to see a finding) is well-covered. The data-
architecture question (how identity is stored and whether "seeing" and "resolving identity" are
even different actions) is not covered at all** — the existing policy assumes the underlying data
already carries the real name, and controls access to the *view*, not the *storage*.

---

## 3. What the code actually does today — verified, not assumed

This is the part worth the owner's attention most, because it's a measured fact, not a design
gap on paper. Checked directly against `src/parsers/index.js` and `src/utils/register-audit.js`:

- **`audit_rows`' primary key literally includes the employee's plaintext name.** `parseRegisterAudit`
  (`src/parsers/index.js:974`) reads the `Emp Name`/`Employee`/`Cashier` column straight off the
  Register Audit export (e.g. `"Aaden W"`) into the `emp` field, which becomes `audit_rows`' PK
  component `(loc, date, emp)` — no ID, no token, no hash, anywhere in the path.
- **The risk-scoring engine uses that same plaintext name as its record identifier.**
  `analyzeRegisterAudit` (`src/utils/register-audit.js:8,56`): the per-employee aggregation key is
  `loc+'::'+r.emp`, and the exposed record's `id` field is set directly to `e.emp` — the name
  itself, unmasked, at every layer between the database and whatever UI eventually renders it.
- **There is no masking, no reveal action, no separate identity-resolution step anywhere in this
  pipeline.** Grepped for `mask`/`redact`/`pseudo` in `register-audit.js` — nothing. Today, "can
  see the finding" (role+subject gate, already built) and "can see the name" are the exact same
  event — there is no second gate between them, and dispatch #33/#34/#35's forthcoming auto-pull
  will write MORE rows into this same plaintext-keyed shape, at higher volume and higher frequency
  than the manual upload ever did, unless this gets decided first.

**This matters more than an abstract "should we pseudonymize" question, because of the RLS
sequencing already agreed in §5 point 3.** That point already says accusation-grade data shouldn't
land before RLS hardening closes the ~92-107 wide-open `using(true)` tables. **Pseudonymization
would meaningfully shrink that exposure window even before RLS hardening finishes** — a leaked or
over-broad query against a token-keyed table exposes behavior patterns tied to an opaque ID, not a
name; the same leak against today's actual schema exposes a real person's name directly next to
their cash-shortage and refund history. That's a genuine reason to consider sequencing
pseudonymization *ahead of or alongside* RLS hardening rather than only after the full accusation-
trail mechanism (§5) is ready — worth the owner's explicit call, not assumed here.

---

## 4. DECIDED 2026-08-20 — Direction B (pseudonymization/identity-vault architecture)

**Owner delegated the call, 2026-08-20**: *"I am good with whatever would be considered compliant
and ethical and be the most functional."* Deciding on that basis:

**Direction B wins on all three of the owner's stated criteria.** Compliant: pseudonymization is
the industry-standard pattern for exactly this situation (ICO/NIST guidance, §1 above) and
meaningfully shrinks what a leaked or over-broad query exposes — a real consideration given §3's
RLS-hardening gap is still open. Ethical: it gets the "blind mode" bias-reduction property as a
structural side effect — an investigator sees a behavior pattern before knowing whose it is,
which directly serves §1's exoneration-analytics goal of not treating a finding as an accusation.
Functional: it doesn't cost Phase 1 anything (baselines/rules operate on a token exactly as well
as a name) and it's actually the *cheaper* time to build it — Phase 1 hasn't shipped yet, so no
risk-score data exists under the old plaintext scheme that would need migrating later. Waiting
until after Phase 1 ships would mean redoing this against live data instead of doing it once.

**Sequencing implication, not previously flagged:** the identity-vault build should land
**before or alongside Phase 1**, not after — Phase 1 is the first thing that will write new
employee-attributed data (risk scores, rule evaluations), and it should write tokens from day
one rather than plaintext names that get migrated later. This is a real scoping input for
whichever dispatch defines Phase 1's actual schema, not a separate, deferred project.

**DISPATCHED 2026-08-20 — `memory/dispatch-37.md`.** Owner chose to build this before Phase 1.
The dispatch also surfaces a real, load-bearing finding: CLAUDE.md's documented 8-tier RBAC isn't
actually implemented (`profiles.role` only has 3 real values), which changes how the reveal
mechanism's access control has to be grounded — see the dispatch itself, not repeated here.

### The two directions that were compared (kept for the record)

**Direction A — extend the existing role+subject gate with a logged reveal, keep plaintext storage.**
Smaller lift: add an audit-log table (`identity_view_log` or similar) that records every time a
disclosure-gated finding naming a real employee is rendered/exported, who viewed it, and why (reuse
the existing handling-notice infrastructure to prompt for a reason). Does not touch `audit_rows`'
schema or any ingestion path. Gets most of the "who looked up this employee, when, why" audit trail
the research wanted, without a data-model migration. Leaves the underlying tables holding plaintext
names regardless of RLS state — the exposure-window argument in §3 above doesn't improve.

**Direction B — adopt the pseudonymization/identity-vault architecture.** Real lift: a new mapping
table (token ↔ employee identity, tightly RLS'd, separately from every analytics table), every
current and future ingestion path (Register Audit today; Any Transaction Tier B, labor-punch
exceptions, or anything else this build eventually touches) writes tokens instead of names,
`analyzeRegisterAudit` and any panel/export that currently reads `.emp`/`.id` as a name needs
reworking to resolve through a logged reveal step instead. Meaningfully reduces blast radius during
the RLS-hardening gap (§3 above), and gets the "blind mode" bias-reduction benefit as a side effect
of the same architecture. Touches every table this build produces or will produce — not a small
addition, and not something to start speculatively before the owner decides it's worth the lift.

**Reviewers on this decision:** **Fletcher Reaves** (owner/developer) — decided 2026-08-20.
HR/counsel still need to weigh in on §1's separate jurisdiction question (GDPR/CCPA likely don't
apply; state law/HR practice does) — that's not resolved by this architecture decision.

## References

- Full three-engine transcripts: relayed by the owner in-session, 2026-08-19 (not separately filed
  as uploaded documents this time, unlike the original three security-research files referenced in
  `plan-security-loss-prevention.md`'s own References section).
- `plan-security-loss-prevention.md` §0 (disclosure-gating policy), §5 (employee rule-out
  mechanism, the existing owner-gated decision this file adds an axis to).
- `attribution-validity-register-login.md` (clean/contested/unknown attribution-confidence design
  — the existing, different-mechanism answer to a related false-positive concern).
- Code verified directly, 2026-08-19: `src/parsers/index.js:974` (`parseRegisterAudit`),
  `src/utils/register-audit.js:7-8,56` (`analyzeRegisterAudit`).
