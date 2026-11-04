# Dispatch #36 — Security build Phase 0b: the substrate (Rules Registry + baselines)

**Board (2026-08-19), at time of writing:** `main` will be at the commit merging PR #449
(Phase 0a's PM verification pass). Phase 0a (Register Audit auto-pull) is code-complete —
**implemented, not yet live-verified** (no session in this build's history has had real QSRSoft
credentials; that's a separate, owner-side follow-up, not this dispatch's problem to solve).

**This dispatch does not need QSRSoft access at all.** Everything below is schema, utility
functions, and an interpreter — buildable and testable against synthetic/fixture data the same
way dispatch #35's `mapRow()` was unit-tested without a live API. Read
`memory/plan-security-loss-prevention.md` §1 and §6 in full before starting — this dispatch
implements exactly what those sections already specced; it is not a new design.

**Why this dispatch and not Phase 1 (the actual fraud-detection rules):** the plan file is
explicit that Phase 1 is gated on this — *"do not start by coding individual fraud rules... a
rule written before this substrate exists will need to be rewritten once it does."* Skipping
ahead to Phase 1 without this would mean rebuilding it once §6's Rules Registry lands anyway.

---

## Part 1 — Rules Registry: table + interpreter

**Self-contained, no dependency on Part 2 — do this first or in parallel.**

`memory/plan-security-loss-prevention.md` §6 already specs the full schema:

```text
RULE_ID, DOMAIN, SUBDOMAIN, METHOD, DESCRIPTION, DATA_REQUIRED, LOGIC_TYPE, LOGIC_EXPRESSION,
WINDOW, BASELINE_TYPE, THRESHOLD, SEVERITY, WEIGHT, CONFIDENCE, OPPORTUNITY_FACTOR,
CORROBORATION_RULES, EXONERATION_RULES, FALSE_POSITIVES, INVESTIGATION_ACTION, SOURCE,
VERSION, ACTIVE
```

1. **New Supabase table, `security_rules`**, matching this schema. Follow `org_config`'s existing
   pattern for tunable, non-code config (`plan-security-loss-prevention.md` §6 names this
   explicitly as the precedent to match) — `tenant_id` + RLS like every other table, per
   CLAUDE.md's standing rule for new persistent data.
2. **A small interpreter** that takes a `security_rules` row plus a data context (whatever
   `DATA_REQUIRED` names) and evaluates `LOGIC_EXPRESSION` against it, returning a pass/fail +
   the computed value. `LOGIC_TYPE` enumerates four shapes (`threshold | z-score | sequence |
   ratio | window-function`) — the interpreter needs to handle at least `threshold` and `ratio`
   for Phase 1's actual rules to run on top of this later; `sequence` and `window-function` can
   be stubbed/deferred to Phase 2/3 per the plan's own build order, but the schema and table
   should accommodate them from day one (don't redesign the table later for this).
3. **Seed with 2-3 real rules from §2.1** (e.g. cash-drawer variance, POS over-ring rate) as
   fixture/test data proving the interpreter round-trips a real rule correctly — not because
   Phase 1 rules are in scope for this dispatch, but because an untested schema is not verified.
   Delete or mark these `ACTIVE=false` if they'd otherwise look like Phase 1 already shipped.
4. **No UI required.** This is a data-layer + interpreter dispatch. A rules-management panel is
   future scope, not part of Phase 0b.

## Part 2 — Baselines + exposure normalization substrate

1. **Personal / peer / store / network baseline computation** (§1 principle 2). Four distinct
   comparisons, not one — a system that only does peer-comparison misses someone who drifted
   slowly from their own historical norm while staying inside the peer band. Design each as a
   function that takes an employee/store + metric + window and returns that baseline's mean/
   distribution, not a single blended number.
2. **Exposure normalization utilities** (§1 principle 1 — "never count raw events, normalize
   against exposure"). **Check `src/engine/metric-source.js` and `src/engine/vs-ly.js` before
   writing anything new** — CLAUDE.md's standing rule ("source data through the shared helpers")
   and this repo's own repeated-helper-duplication history (four copies of the org map, three of
   scheduled-hours) both apply directly here. These normalization utilities should very likely
   live next to or extend those existing modules, not become a fourth parallel way of computing
   a rate. This matches `data-acquisition-shopping-list.md`'s own standing normalization rule
   (per-$1,000-sales or per-1,000-transactions, never raw counts) — reuse that convention exactly,
   don't invent a new unit.
3. **Event normalization schema** — for rung 2 (Register Audit) specifically, the plan file
   already says this is "close to already shaped by the existing `audit_rows` columns; extend
   rather than redesign." Confirm `audit_rows`' current shape covers a normalized event record
   (who/where/when/what/how-tendered) well enough for the baseline functions above to consume
   directly, and note any gap rather than building a parallel schema speculatively.

**Verification approach, matching dispatch #35's pattern**: build against fixture/synthetic
`audit_rows`-shaped data (multiple employees, multiple stores, multiple weeks) with known,
hand-computed baseline values, and assert the functions reproduce them. This does not require
real QSRSoft data — the whole point of this substrate is that it works on whatever shape of
attributed data lands in `audit_rows`, real or fixture.

---

## Explicitly not in this dispatch

- Any of §2's actual fraud-detection rules (cash-drawer variance, void/refund peer ranking, TvA
  inventory variance) — that's Phase 1, gated on this dispatch landing first. The 2-3 seed rules
  in Part 1, step 3 are test fixtures proving the interpreter works, not a Phase 1 delivery.
- Sequence engine, change-point detection, cross-domain correlation (§3) — Phase 3.
- Opportunity-adjusted risk layering (§1 principle 3) — Phase 2, needs the baselines from this
  dispatch as an input first.
- Exoneration/explanation-library automation (§1 principle 4) beyond what the Rules Registry
  schema's `EXONERATION_RULES` column already accommodates structurally — the actual automated
  counter-evidence search is Phase 3.
- The employee rule-out/evidence-chain mechanism (§5) — gated on owner decisions per §5 and the
  RLS hardening plan landing first. Do not start this.
- Any UI/panel work — this dispatch is data-layer only.
- Resolving the `refundCnt` semantic drift flagged in dispatch #35's own follow-up
  (`dispatch35-register-audit-implementation.md`) — separate, small, unrelated fix; mention it in
  a future dispatch if it hasn't been picked up by then, don't fold it into this one.
