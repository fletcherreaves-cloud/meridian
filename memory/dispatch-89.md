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

## Resolution

### Item 1 — which credential, which observation

**Credential:** `.env.local`'s `VITE_SUPABASE_ANON_KEY` is not an anon key. Decoding its JWT
payload shows `"role":"service_role"`, and the value is byte-identical (confirmed by string
comparison) to `SUPABASE_SERVICE_ROLE_KEY` in the same file. There is no distinct, functioning
anon-scoped credential in this environment — the variable named for one holds the service-role
secret instead.

**Observation, isolated three ways on `qsr_fob` and `qsr_daily_activity`:**
- `apikey` header only, no `Authorization` header → genuinely anon-scoped, RLS-enforced →
  `content-range: */0` / `[]` on both tables. This matches dispatch #89's own 10-table measurement
  exactly, and matches CLAUDE.md's documented `curl` recipe.
- `apikey` + `Authorization: Bearer <same value>` → the gateway honors the JWT's actual
  `service_role` claim, bypassing RLS → real rows (`qsr_fob` rows dated through 2026-08-24;
  `qsr_daily_activity` returns `content-range: 0-0/45040` for the exact query dispatch #88 item 2's
  row-count estimate was built on).

**So: possibility 1 from this dispatch (a different credential), refined.** It was not a different
session or a stray service-role key sitting alongside a working anon key — the value stored under
the anon-key name *is* the service-role key, and whether a request exercised that privilege
depended on whether the curl invocation included an `Authorization: Bearer` header. Dispatch #88's
`qsr_fob` claim came from a request that did; the CLAUDE.md-documented recipe and this dispatch's
own measurement did not. `memory/dispatch-88.md`'s Resolution, item 1 now carries this correction
inline, dated and non-destructive (the original wrong claim stays visible, followed by the
correction, per this repo's convention for reversed findings).

**The underlying question — does the stream have real August data — is left open by design, per
this dispatch's explicit instruction not to re-assert it from this environment.** The service-role
read above is technically real evidence (service_role bypasses RLS and sees the table's true
state, so unlike the original claim it is not mischaracterized), but per item 1's own instruction
the owner has been asked directly in this session to confirm by opening the Food Cost panel and
reading the month selector — that answer, not any query from this sandbox, is what closes it.

### Item 2 — CLAUDE.md corrected

The "Supabase egress is now allowlisted" paragraph now leads with the true state (10/10 measured
operational tables return `*/0` to the anon-scoped recipe; `qsrsoft_kb` is the only confirmed
readable table), keeps the egress-works fact under "do not re-raise," records the full 10-table
measurement table so it isn't re-derived, and explains the `Authorization: Bearer` mechanism that
produced dispatch #88's wrong claim — including the explicit instruction never to send
`VITE_SUPABASE_ANON_KEY` as a Bearer token in this environment.

### Item 3 — rule addition

Added four sentences inside the existing "Measure it, don't reason about it" standing rule (no new
section): a live-data claim must name the credential and the observation, with dispatch #88's own
failure as the concrete cautionary example.

### Item 4 — put to the owner, not implemented

Framed for the owner in this session's reply, with the three options and their trade-offs as
written above, and the recommendation that the de-facto current answer (the owner measures) is
already what's happening and may genuinely be the right steady state. No service-role key added to
this environment; no policy created; no credential value appears in this file, CLAUDE.md, or any
commit in this PR.

### Files changed
- `CLAUDE.md` — items 2 and 3.
- `memory/dispatch-88.md` — item 1 correction, inline.
- `.env.local` — untouched (gitignored, not part of this PR; the mislabeling is a local sandbox
  config fact, not a repo defect, and is now documented rather than silently fixed).
