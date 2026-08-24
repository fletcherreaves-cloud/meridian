---
name: dispatch-89
description: The agent environment cannot read ANY tenant data -- 10 of 10 operational tables return zero rows to the anon key, calibrated against a public-read table that works. A merged PR (#633) already contains a live-measurement claim that this makes impossible, and the claim is load-bearing for whether that fix resolves the owner's symptom. Re-verify it, correct CLAUDE.md's misleading line, and put the durable fix to the owner.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #89 — the agent environment cannot measure live data

**Reads first:** CLAUDE.md's *"Supabase egress is now allowlisted"* paragraph, and
`memory/dispatch-88.md`'s Resolution, item 1.

**Status:** items 1–3 ready, no owner decision. Item 4 is the owner's call, framed.

⚠️ This dispatch is about a claim in **already-merged** code. Nothing needs reverting. What needs
doing is re-establishing whether one measurement behind it was real.

---

## The measurement

Every operational table returns **zero rows** to the anon key this environment has. Measured
2026-08-24 with `Prefer: count=exact` + `Range: 0-0`, reading the `content-range` header:

| table | content-range |
|---|---|
| `qsr_fob` | `*/0` |
| `lifelenz_schedule` | `*/0` |
| `qsr_daily_activity_rollup` | `*/0` |
| `labor_rows` | `*/0` |
| `ops_rows` | `*/0` |
| `qsr_ebos_daily` | `*/0` |
| `cash_sheet_daily` | `*/0` |
| `daily_glimpse_daily` | `*/0` |
| `monthly_targets` | `*/0` |
| `store_vlh_config` | `*/0` |

**Calibrated, so this is not a broken probe:** `qsrsoft_kb` (public-read) returns real row content
through the identical call. `qsr_daily_activity` returns a `57014` statement timeout rather than
`*/0` — a scan that finds nothing, not access. And a deliberately fake column returns `42703`,
so the probe distinguishes "no such column" from "no visible rows." Egress works; the key is
valid; **RLS is what returns nothing.**

## 🔴 Item 1 — re-verify #633's `qsr_fob` claim

`memory/dispatch-88.md`'s Resolution states:

> *"`qsr_fob` was queried live against Supabase (`curl` + the anon key, egress already allowlisted
> per CLAUDE.md) and has real, non-zero `prod_sales_amt` rows through 2026-08-24 … The stream does
> not stop in May."*

`qsr_fob` reports `*/0` to the anon key. **State plainly which credential produced that result.**
Three possibilities, and they are not equally likely — establish which, don't reason about it:

1. A different credential was used (a service-role key present in that session's env and not this
   one). If so, **say so in the correction and name the credential type, not its value** — the
   distinction matters for every future dispatch.
2. An empty response was read as confirmation. `[]` is what RLS returns, and it is easy to
   misread as "query worked" when it means "you saw nothing."
3. Something else was queried.

⚠️ **This is not bookkeeping — the claim is load-bearing.** It is the sole evidence that ruled out
the *"stream genuinely stops in May"* branch, and that branch is the one where the real fix is a
**backfill**, not a UI guard. The race #633 fixed is real and its test proves it. But if the cloud
stream has no data past May, the panel still shows May after the fix, for a different reason, and
the owner's original report is still open.

**How to settle it without live access:** the owner can answer it in ten seconds by opening the
Food Cost panel and reading the month selector. Ask. Do not re-assert it from the same
unverifiable place.

## Item 2 — correct CLAUDE.md's line

The paragraph says the agent *"can now read live tables directly from this env using the anon
key."* It does hedge — *"RLS-restricted tables need the appropriate policy/role"* — but the
headline plus **"do not re-raise"** is what a reader acts on, and the true state is the inverse of
the impression: **every table an analysis would want is RLS-restricted; the readable set is
effectively `qsrsoft_kb`.**

Rewrite it to lead with what is true: egress works, the anon key is valid, and it can read
essentially nothing operational. Keep the `curl` recipe — it is correct and useful the moment a
credential exists. Record the 10-table measurement above so the next session doesn't re-derive it.

⚠️ Keep the **"do not re-raise"** on the *egress* question specifically — that genuinely is
settled, and re-litigating it wastes a session. What must stop being implied is *data access*.

## Item 3 — make an unverifiable claim harder to write

Six stale-or-unsupported claims in three days, and this one is the worst of the family: a wrong
line number misleads a reader, but *"I measured it live"* stops anyone from checking at all.

Add to CLAUDE.md's `Measure it, don't reason about it` rule: **a live-data claim must name the
credential and the observation.** `content-range: */0` is an observation. "Queried live and it has
rows" is not — it is indistinguishable from having read `[]` as success. An empty result is the
default outcome in this environment and must be reported as "no rows visible," never as evidence
about what the table contains.

Keep it to a few lines inside the existing rule. **Do not** write a new standing rule section —
this repo's failure mode is rules nobody reads, not rules that don't exist.

## Item 4 — the durable fix (owner decision, do not implement)

Every dispatch requiring a live measurement is blocked until this changes. Present the options and
stop; do not pick one:

- **A read-only service-role key** in the agent environment. Most capable, and the largest blast
  radius — a service-role key bypasses RLS entirely, so it is a real secret with real consequences
  if it leaks into a log, a fixture, or a memory file. Note that the owner already has an
  **unrotated** service-role key pending from an earlier session; that decision and this one are
  related and should be made together, not separately.
- **A scoped read-only policy** for an agent role over the operational tables. Narrower, safer,
  more setup, and needs a decision about which tables.
- **Neither — the owner measures.** Costs a round-trip per question, and given how many questions
  are one query, that may genuinely be right. It is not a non-answer.

**Recommendation: put it to the owner with the trade-offs, and note that today's de-facto answer
is already the third option** — every measurement in the last three days that mattered came from
him. Making that explicit is worth more than pretending the agent has access it does not.

## Verification bar

- Item 1: the correction names a credential type and an observation, or says the claim could not
  be reproduced. "Re-confirmed" without either is not acceptable.
- Item 2: the `*/0` table list is in CLAUDE.md, so the next session inherits the measurement
  instead of repeating it.
- Item 3: diff is a few lines inside the existing rule, not a new section.

## Do NOT

- Do **not** revert #633. The race is real, the test reproduces it, the fix is correct.
- Do **not** re-run the `qsr_fob` check with the anon key and report `[]` as either confirmation
  or refutation. It is neither.
- Do **not** implement item 4, or add any service-role key to this environment.
- Do **not** put a credential value in a log, fixture, commit, or memory file — credential
  **type** only, per this repo's standing security posture.
