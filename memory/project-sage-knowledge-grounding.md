# SAGE knowledge grounding — give SAGE the project's accumulated reasoning

Owner idea, 2026-08-13: *"is it possible for SAGE ... to link all of our knowledge that we've
accrued in this project — memory files, MD files — and give it the power of knowing all of the
things that we've discovered through trial and error, and forward-applying it to its reasoning."*

Tracked as an issue; this file is the design record.

---

## Why it is worth doing — the corrections, not the facts

SAGE can already query data. What it cannot reach is **what we tried and disproved**. The
memory corpus records measured refutations that SAGE would otherwise confidently re-derive:

- district-relative differencing does **not** reduce noise (~1.0x on all five components)
- longer measurement windows do not either (flat or worse)
- `qsr_fob` rows are **month-constant** — averaging daily rows is wrong
- near-identical-consecutive-months alone fires on 9 of 27 stores; insufficient as a detector
- the Simple trailing family (T3M/T6W/T3W) beats every engineered model for monthly store sales
- never average averages; dollar-weight aggregates
- manual streams are last-resort fill, never a tile's primary source

Grounded, SAGE inherits a year of hard-won corrections. Ungrounded, it repeats dead ends with
full confidence.

## Current SAGE state (verified 2026-08-13)

`supabase/functions/sage-chat/index.ts:534` — `model: 'claude-opus-4-8'`, `max_tokens: 8000`,
`thinking: { type: 'adaptive' }`.

**A generation behind.** `claude-opus-5` is current. One-line change plus
`supabase functions deploy sage-chat --no-verify-jwt`. Worth doing independently of this project.

## Measured constraint

`memory/` is **112 files, 1.3 MB**; with CLAUDE.md that is ~1.13M characters, roughly **280k
tokens**. Too large to paste into the system prompt, and most of it is narrative or superseded.

## Architecture

**The pattern already exists.** SAGE has `qsrsoft_kb` + a KB tool for vendor documentation, so it
can ground answers on how QSRSoft defines a metric. This is that same pattern pointed at our own
knowledge — an extension, not new architecture.

- **Git stays the source of truth.** History, diffs, review, and the standing commit-your-memory-
  files rule already forces it. A table alone has none of that: silent overwrites, no diff.
- **Supabase is the serving layer**, because nothing in the app and nothing in SAGE can read git.
  A table is *required* for SAGE to reach any of this.
- One-way sync on push to `memory/`, via GitHub Action.
- In the prompt: a **curated digest of standing conclusions** (dated, ~5–10k tokens — the rules
  and the refuted list). For depth: a `search_project_knowledge` tool.
- Start with ~10–15 files, not all 112, and measure whether answers actually improve. More
  context is not automatically better; a digest of decisions beats a dump of prose.

### The write path (owner's contribution, 2026-08-13)

A table is not only readable — it is writable, so the corpus can grow from usage rather than only
from someone remembering to write a memory file. A session appends a finding; SAGE appends a
pattern it noticed in its own answers.

Hazard: unreviewed content reaching SAGE — the refuted-claims problem, but worse, because nobody
read it. Resolution:

```
status = 'proposed'   stored, NOT served
status = 'approved'   served to SAGE
```

Promotion happens by committing the matching memory file, or by owner approval in-app. Automatic
write path, nothing unvetted ever quoted.

---

## Sensitivity gating — OWNER DECISION, 2026-08-13

This is a policy decision, not an implementation detail, and it gates the whole project.

**The failure mode the owner named:** a GM researches their own restaurant, and SAGE returns a
finding *about them*. They get called out by a machine and become defensive. That outcome is
unacceptable and must be impossible by construction, not by convention.

**The policy:**

1. Investigative and personnel-sensitive findings are **restricted to above-store personnel**.
2. Specifically **above supervisor** — so **DO and above** (DO, VP, Owner/OO, Admin, Developer).
   Supervisor, GM and Office Staff do not receive them.
3. **Above-store personnel decide what filters down.** The system never disseminates a finding
   downward on its own; a human chooses what a store hears and how.

**One extension worth building in beyond what was stated:** gate on *subject*, not only role. A
finding whose subject is the requester should not be returned to that requester even when their
role would otherwise clear the bar. Role alone does not cover the case of an implicated DO.

**Mechanism:** per-file frontmatter (`sensitivity`, `min_role`, `subject_locs`,
`subject_people`), enforced at query time in the tool, defaulting to restricted when unset —
fail closed. Note that SAGE's data tools are already RBAC-scoped by `accessible_locs` (v4.494),
but a knowledge base is prose, not rows, so `accessible_locs` filtering does not apply. This
needs its own gate.

**Why this is urgent rather than theoretical:** `memory/finding-padding-and-cash-hunt-2026-08-13.md`
names a former GM in a padding investigation and discusses a current GM's difficulties by name.
That file exists in the corpus today. It must never be ingestible at anything below the bar above.

An access audit trail on restricted entries is worth having for the same reason.

### Mandatory handling notice (owner request, 2026-08-13)

Every restricted disclosure carries an automatic notice. Its job is not politeness — it is to
state, in the artifact itself, that **a pattern in data is not a finding about a person**, so
that distinction is not left to whoever happens to read it.

**Short form — attached to every restricted disclosure:**

> **Restricted · statistical signal, not a finding of fact.** This identifies a pattern in data.
> It does not establish cause, intent, or wrongdoing by any individual. Handle per the
> organization's confidentiality and human-resources procedures, and involve HR before any
> action concerning an employee.

**Long form — on full reports and exports:**

> **Handling notice — restricted**
>
> This material identifies a statistical pattern. It is **not** a determination that any person
> acted improperly. Patterns like this arise from inexperience, process gaps, system and data
> errors, and legitimate operational change at least as often as from misconduct, and this
> analysis cannot distinguish between those causes.
>
> Treat it as a reason to look further. Never as a conclusion.
>
> - Do not share it with, or discuss it in front of, anyone it names or implicates.
> - Do not pass it below the level at which you received it without approval.
> - Involve Human Resources before any conversation, investigation, or action concerning an
>   employee, and follow the organization's established procedures.
> - Keep a record of who you disclose it to.

**Three implementation constraints:**

1. **Generated with the finding, not bolted on at render.** If it is a separate UI element, a
   paraphrase, a copy-paste or an export drops it. Prepend at the tool-output layer so it is
   part of the text SAGE receives — then it travels with the content wherever the content goes.
2. **Not SAGE-only.** Any restricted finding surfaced anywhere in Meridian — panel, printed
   report, PDF export — carries the same notice.
3. **No "suspected wrongdoing" language anywhere.** That framing is itself prejudicial; it
   plants the conclusion the notice exists to prevent. "Statistical signal" and "reason to look
   further" do the work without loading the reader.

**Open for owner:** the draft says "involve Human Resources." If the real escalation path is the
DO or Director of Operations rather than an HR function, it must name the real role. A notice
pointing at a process that does not exist gets ignored, and then the whole thing is decoration.

---

## Standing permission

Owner, 2026-08-13: memory files may be created and committed **without asking** — *"we need to
retain anything that is [of] relevance and importance and could be a future help to us."*

## Open

- Owner call on whether `claude-opus-5` upgrade ships now or with this project.
- Which ~10–15 files seed the first digest.
- Whether refuted claims are labelled at ingest or need an explicit `refuted: true` field.
- Table name, schema, and whether it reuses the `qsrsoft_kb` shape verbatim.
