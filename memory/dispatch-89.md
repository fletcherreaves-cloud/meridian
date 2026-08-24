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

**Status:** items 1–3 ready, no owner decision. **Item 4 is DECIDED by the owner (option A) — read it, implement nothing; he installs the key.**

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

## Item 4 — ✅ DECIDED 2026-08-24 by the owner: **option A, a `service_role` key in the agent environment.** Do not implement; the owner installs it.

**The owner chose A over this dispatch's recommendation of C, after the trade-offs were put to him
and the framing error below was corrected.** That is his call and it is settled — do not re-argue
it, and do not treat the recommendation history as an open question.

⚠️ **A framing error in the original of this section, corrected — it made the riskiest option look
like the mildest.** It offered *"a **read-only** service-role key"* as the first option. **There is
no such thing.** Supabase's `service_role` key bypasses RLS entirely, for **writes as well as
reads**. Genuinely read-only access is not a weaker service-role key; it is a separate Postgres
role with SELECT-only grants and a JWT carrying it — which was the *second* option, not a lighter
version of the first. **A was chosen knowing it is full read/write with RLS bypassed.**

| | what it is | outcome |
|---|---|---|
| **A** | `service_role` key in the agent env — full read **and write**, RLS bypassed | ✅ **CHOSEN by the owner** |
| **B** | dedicated Postgres role, SELECT-only grants, JWT | not pursued |
| **C** | the owner runs the query | was this dispatch's recommendation; **overruled** |

### 🔴 The one detail that is dangerous to get wrong

The variable **must** be named `SUPABASE_SERVICE_ROLE_KEY` — **never** with a `VITE_` prefix.
Vite bundles every `VITE_`-prefixed variable into the **public client JS**, and `vite.config.ts`
does not override `envPrefix`, so `VITE_SUPABASE_SERVICE_ROLE_KEY` would ship the key to every
browser that loads the app. The unprefixed name is already the repo's convention
(`scripts/lifelenz-pull.mjs`, `scripts/qsrsoft-roster-stats-pull.mjs`), so consistency and safety
point the same way here. `.gitignore` already covers `.env*`.

### Operating rules for the key, binding on every session

1. **Reads only.** No write, update, upsert, or delete with this credential without the owner's
   explicit approval **for that specific operation**. It bypasses RLS, so a careless write is
   unbounded — there is no policy underneath to catch it.
2. **Never echo the value.** Not into a commit, memory file, fixture, log, PR body, test snapshot,
   or a message to the owner. Report **observations** (`content-range: */27`), never the secret.
3. **Claims still name credential and observation** — item 3's rule does not relax because access
   now exists. It gets *more* important: a session with a working key can produce a wrong number
   as easily as a session without one produced an invented claim.
4. **RLS is bypassed, so reads are unfiltered by tenant** — including personnel data in the roster
   and schedule tables. The standing posture holds unchanged: crew and manager names are personnel
   data, **field names only**, never values into memory files or fixtures.

### Rotation now touches TWO places

`SUPABASE_SERVICE_ROLE_KEY` exists as a **GitHub Secret** (the pull workflows) and now in the
**agent environment**. A rotation that updates only one breaks the other — scheduled workflows
start failing, or the agent env goes dark. Update both in the same sitting.

**Still open, and NOT closed by this decision:** the unrotated service-role key pending from an
earlier session. The owner has deliberately deferred it (*"not worried about rotating key just
yet… we can work through that and rotate later"*) — that is a conscious deferral, not an oversight,
and it should not be re-raised as urgent. It is recorded here only so the two-places fact above is
attached to it when the rotation does happen.

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
