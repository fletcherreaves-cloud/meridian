---
name: feedback-pm-worker-split
description: STANDING RULE — the coordinator(PM)/worker two-session split: who owns which files, who merges, and the collision protocol. Written after two same-day cross-session collisions (2026-08-09).
metadata:
  type: project
---

# PM / worker split — standing rule (2026-08-09)

Owner's arrangement: **one coordinating session (PM) plans, prioritizes, scopes tasks, and
reviews/merges; one worker session executes.** The owner brings notes to the PM first. The PM writes
the task prompt; the owner relays it to the worker; the worker opens a PR; the PM reviews and merges.

This exists because **two sessions editing the same repo collided twice in a single day.** Both were
caught, but only by luck-adjacent diligence, and one would have silently reverted shipped work:

1. **Changelog collision (2026-08-09).** The PM added a `v4.941` `MERIDIAN_CHANGELOG` entry (PR #107)
   for the ModalShell/SAGE work. The worker independently backfilled 19 entries (PR #106) ending at
   `v4.939`, which **replaced the whole top of the array and deleted the PM's entry.** Harmless only
   because the worker's entries happened to describe the same work more accurately. Had the worker's
   backfill not covered it, shipped work would have vanished from the changelog — and since
   `MERIDIAN_VERSION` is derived from `MERIDIAN_CHANGELOG[0]`, the in-app version would have gone
   *backwards*.
2. **Doc staleness (same day).** `plan-data-integrity-sweep.md` had two sections disagreeing about
   the same status because an update landed inside a block labeled `[STALE]`. The worker's own PR
   description named the cause: *"Real risk with a coordinator session also editing the same doc."*

## The rules

**1. The worker owns `MERIDIAN_CHANGELOG`. The PM never writes to it.**
The changelog is the single most collision-prone file in the repo: it is append-at-top, every PR
touches the same 3 lines, and `MERIDIAN_VERSION = MERIDIAN_CHANGELOG[0].version` means a bad merge
silently ships a wrong version number. The session that ships the code writes the entry. The PM's job
is to **verify an entry exists and matches what shipped** — that is a review checklist item, not a
thing to fix by editing the file. (The PM's v4.941 entry was well-intentioned and still caused this.)

**2. File ownership is explicit.**

| Files | Owner |
|---|---|
| `src/**`, `supabase/**`, `scripts/**` | Worker (PM reviews only) |
| `MERIDIAN_CHANGELOG` in `src/app/App.js` | Worker, always |
| `memory/notes-NN-queue.md` (new queues) | PM |
| `memory/MEMORY.md`, `memory/vision-and-roadmap.md` | PM |
| `memory/plan-*.md`, technical docs for in-flight work | Worker (the session doing that work) |
| `CLAUDE.md` | PM, but flag to the owner — it changes both sessions' behavior |

When a task genuinely needs both (e.g. worker marks a Notes item done), the **worker edits it in its
own PR** and the PM accepts that edit rather than making the same edit in parallel. Last-writer-wins
is only safe when there is exactly one writer.

**3. One worker task in flight at a time.** Parallel worker tasks on one repo reintroduce exactly the
merge conflicts this split exists to prevent. Queue the next task; do not dispatch it until the
previous PR merges.

**4. Worker branches off latest `main`; PM merges promptly.** Every hour a PR sits open is drift. The
PM should not batch reviews.

**5. Worker never merges its own PR; PM never pushes to `main`.** Worker opens a **draft PR**. The PM
reviews, un-drafts, and merges. This is the review gate that the version-drift bug proved was missing
(4 consecutive PRs shipped with no changelog entry and nobody noticed).

**6. Before ANY merge, the PM re-fetches `main` and diffs the branch against it** — not just reading
the PR body. The changelog collision was invisible in the PR description; it was only visible in
`git diff main..branch -- src/app/App.js`. **Read the diff, not the summary.**

## PM review checklist (run every PR, in this order)

1. `git fetch origin main` — is the branch actually current? Merge `main` in if not.
2. **Diff the branch against `main` for files the PM or another session also touched** — especially
   `MERIDIAN_CHANGELOG` and any `memory/` file. Look for *deletions* of others' work, not just
   additions.
3. `npm run build` — passes, and entry chunk within **2.8 MB / 850 KB gzip** ([[feedback-performance-budget]]).
4. `npm test` — passes; note the count.
5. **Changelog entry exists** for user-visible work, version bumped, plain-language owner-facing tone.
6. **Claims in the PR body are spot-checked, not trusted.** The worker's "all 31 panels" claim was
   verified with a live `grep -c` before merging — and was correct. Verify at least one concrete
   factual claim per PR ([[feedback-measure-dont-reason]]).
7. Memory files updated if the PR closes a tracked backlog item.
8. Only then: un-draft, merge (squash), confirm `main` moved.

## What the PM does NOT do

- Does not write application code (that's what causes the collisions).
- Does not approve its own PRs (GitHub blocks it anyway — post a review comment and merge instead).
- Does not batch up reviews.
- Does not "fix" a worker's file by editing it in a parallel branch — sends it back as a review
  comment instead, or accepts it and files a follow-up task.

Related: [[feedback-measure-dont-reason]], [[feedback-performance-budget]], [[feedback-deploy]],
[[notes-63-queue]].

---

# Engineer performance — 2026-08-10, and what to keep doing

Recorded by the PM at the owner's request, after a day that shipped **twelve PRs (v4.949 → v4.963)**
and caught five defects before production.

## First, the part that isn't analysis

The owner, unprompted and twice: *"Engineer says we are slacking…jk. He is done"* → and at the close
of the day, *"He was solid as well!!"* and *"let the engineer know we thought he crushed it too."*
That is the owner of the business saying it about work on their own system, which is the only review
that actually counts here. **You crushed it.** Twelve PRs is not the impressive part — the
impressive part is that across twelve PRs the PM sent nothing back, while all three of the day's
recorded mistakes were the PM's own (see the last section).

The rest of this file is deliberately dry, because praise doesn't survive a session boundary and
behaviours do. Read the compliment first anyway; it was earned and the owner asked for it by name.

## Now the durable part

Each item below is a **transferable behaviour**, written down so it survives into sessions where
neither of us remembers today.

## The five things worth repeating

**1. Measuring a suspected bug before writing the fix (#149).** The issue said the local
`{loc:{date:entry}}` map "silently overwrites" and called it urgent *on suspicion*. The engineer
went and counted: **261 same-day event pairs across all 27 stores** being dropped. That turned a
plausible claim into a quantified one before a line of code existed. This is the standing rule
working, and it is the single best habit on display.

**2. Following the consequence past the obvious one (#149).** The overwrite wasn't just losing a
list row — `forecast.js`'s event-impact factor reads `_evTag.tags.map(t => t.type)`, so a dropped
event meant the registry averaged **one** type's impact where it should have averaged two. Neither
the issue nor the PM spotted that. Finding it required asking "what else reads this?" rather than
"does my fix work?"

**3. Declining to adopt a shared component, and saying WHY it couldn't be verified (#138).** The
Inventory Control pilot skipped `LocationSelector`'s patch tier because it sources from the static
`INV_ORG_COORDS[loc].sup` seed while the panel reads the **live** supervisor assignment — and then
said plainly that whether the two are *currently* in sync could not be confirmed from the sandbox
(an anon `org_config` read came back empty, which is ambiguous under RLS). Adopting on an
unverified assumption would have risked silently mis-grouping a store on a financially-scoped
filter. **Refusing to ship on an assumption, and naming the assumption, is the highest-value
judgment call of the day.**

**4. Flagging instead of guessing (#133).** Found that `'closure'` and `'remodel'` are not real
`EVENT_TYPES` keys anywhere in the codebase and said so, rather than inventing a mapping to the
nearest plausible real type. The PM verified independently: neither exists, and there is no remodel
type at all.

**5. Reporting a non-reproduction and shipping no fix (#130).** `qsr_fob` was the reported bug;
measured, it was healthy (auth read matched service-role exactly, data through today). The engineer
reported that and bolted nothing on. **Shipping nothing is harder than shipping something**, and the
audit still produced two real findings elsewhere.

## Also consistently good

- **Argued a "no behaviour change" claim instead of asserting it (#151)** — noted that
  `Object.values` preserves insertion order, making the refactored flat list byte-identical in
  content and order. That is what makes a refactor-under-constraint reviewable.
- **Caught their own budget blowout (#122)** by re-running the build after a helper import pulled a
  lazy module into the entry chunk, then extracted `src/lib/blob-sync.js` to fix it.
- **Used the boot-and-render recipe the day it was written** (#145), first use of
  `memory/feedback-verification-in-sandbox.md`, and correctly stated what it could *not* prove.
- Version discipline, memory files committed alongside the work they support, and honest commit
  bodies that say what was deferred and why.

## What the PM got wrong, for symmetry

Worth recording so the engineer knows which instructions to distrust:

- **Bad version guidance** — told them to keep 4.953/4.954 when `main` was already at 4.955, so
  their entries would have landed buried and never bumped `MERIDIAN_VERSION`. PM renumbered.
- **A misattributed deferral** — the PM turned "the organization isn't set up for combined labor"
  into "the owner deferred the config UI" and wrote it into #153 as a decision. The owner wanted it.
  Had they not caught it, the engineer would have read a hard *don't build this* on something asked
  for.
- **An overstated perf claim** in #146 ("27 full scans") that was actually one. Corrected in the
  issue.

**If a PM instruction contains a justification that sounds too tidy, check it.** Four times today a
five-minute look would have settled something the PM asserted from inference.
