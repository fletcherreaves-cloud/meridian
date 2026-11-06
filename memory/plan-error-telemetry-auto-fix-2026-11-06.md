---
name: plan-error-telemetry-auto-fix-2026-11-06
description: "Design for closing the loop on real browser crashes: capture every ErrorBoundary catch into a new deduplicated Supabase table, feed it into the existing weekly self-maintenance sweep as an 8th rotation dimension, and let that sweep's existing Tier A/B/C autonomy framework (memory/sweep-dimensions.md) decide what ships unattended vs. what stops for the owner. Not yet built — written up per the owner's own request, 2026-11-06, right after a live District View crash (fixed same session, PR #1682) prompted the idea."
metadata:
  node_type: memory
  type: plan
scope: tenant
sensitivity: open
---

# Error telemetry → auto-fix pipeline — design (2026-11-06)

## What prompted this

Same session, same night: a real crash reached production (District View's "RECENT EVENTS"
widget threw `undefined is not an object (evaluating 't.dkEnd.localeCompare')` minutes after an
unrelated PR merged — root cause and fix in PR #1682's own body). The owner caught it by
screenshot, described live, and asked me to fix it. While that was in flight, the owner raised
two follow-on asks in his own words:

1. *"we probably need to create a loop somehow that will at minimum give a warning or an oops
   type page and allow the user to still use the app without having to fully reload it... loop
   back into using other portions of the app that aren't affected"* — addressed same session,
   PR #1682's second commit: `lazyPanel()`'s compact `ErrorBoundary` now always shows a "Back to
   Home" action (`mf:error-go-home` window event), not just when a call site happens to pass
   `onClose`. **That part is done, not this doc's subject.**
2. *"this may actually be a good candidate for an automation... if an error occurs, you could
   loop in a routine that auto logs it to the task request and fix list so that it gets the
   attention it needs and then... you can determine a fix without my interaction."* Rephrased
   more plainly a message later: *"incorporate event handling in error handling protocols when
   errors arise and crashes occur."* **This doc is that second ask.**

The core gap: a real crash today reaches `componentDidCatch`'s `console.error` and nothing else.
It never becomes a ticket. The owner only finds out if he happens to be looking at the screen
when it happens (as he was tonight) — there is no mechanism to catch what he doesn't see.

## What already exists (measured, not assumed) — this is NOT a from-scratch build

Three real, already-shipped mechanisms this design plugs into rather than duplicates:

1. **`ErrorBoundary`** (`src/features/session.js`) — every `lazyPanel()`-wrapped panel already
   catches its own render crash via `componentDidCatch(e, i)`, which today only does
   `console.error('Meridian error:', e, e?.cause||'', i)`. This is the exact, single interception
   point a capture call needs — one function, already firing on every real crash, app-wide.
2. **SAGE's "🐞 Log" flow** (`src/views/sage.js`'s `LogIssueModal`, ~line 900-956) — already
   proves the destination shape works: `saveTask({title, description, notes, tier, priority,
   status:'backlog', source})` → `supabase.from('tasks').insert(...)` (confirmed directly,
   `src/lib/supabase.js:3774`), or `saveFeatureRequest(...)` → the real `public.feature_requests`
   table (`supabase/schema.sql:1338`, columns: `title/description/category/status/priority/
   submitted_by/dev_notes/completed_version/votes/is_seed`). SAGE already sets `source:'sage'`
   on its own task rows — a crash-report capture would set `source:'error-boundary'` the same way,
   not invent a new destination table.
3. **The weekly self-maintenance sweep + its Tier A/B/C autonomy framework**
   (`memory/sweep-dimensions.md`, `memory/release-bar.md`) — already does EXACTLY the "check
   requests, determine a fix without my interaction" loop the owner is describing, for seven
   other dimensions (panel contract, data-sourcing, dead code, duplication, doc drift, settings
   hygiene, KB accuracy). It already has the three-tier split this idea needs on day one: Tier A
   ships silently batched, Tier B ships flagged as its own PR, Tier C never acts alone. **The
   right move is an 8th rotation dimension, not a new autonomous-fix mechanism living outside
   that framework.**

## Proposed architecture

### 1. Capture (client-side, small)

`ErrorBoundary.componentDidCatch` gains one best-effort write alongside its existing
`console.error`:

```js
componentDidCatch(e, i) {
  console.error('Meridian error:', e, e?.cause||'', i);
  reportRuntimeError(e, { panel: this.props.panelName, compact: !!this.props.compact })
    .catch(()=>{}); // never let telemetry itself crash the crash handler
}
```

`reportRuntimeError()` is a new, tiny function (`src/lib/supabase.js`, same file every other
`saveX`/`loadX` helper already lives in) that writes to a **new table**, not `tasks` directly —
see Dedup below for why.

**`panelName` is new plumbing `lazyPanel()` doesn't currently pass.** Every `lazyPanel(importFn)`
call site already names its own panel inline (e.g. `lazyPanel(() => _storeDash().then(m =>
({default: m.DistrictGrid})))`) — threading that string through as a second arg
(`lazyPanel(importFn, 'DistrictGrid')`) is a small, mechanical, Tier-A-shaped change across the
~80 call sites in `App.js`, not a design risk. Worth doing regardless of this feature — "which
panel crashed" is useful in the console log today too.

### 2. New table + dedup (the part that matters most)

**Never insert one row per occurrence.** The same bug hits every user who opens that panel —
without dedup, one bad deploy generates hundreds of near-identical rows in an hour, which is
noise, not signal, and exactly the kind of flood a sweep-based (not instant-trigger) design is
built to avoid.

```sql
create table if not exists public.runtime_error_reports (
  id            uuid primary key default gen_random_uuid(),
  fingerprint   text not null,          -- hash of (message, top stack frame, panel) -- the dedup key
  message       text not null,
  stack         text,
  panel         text,                   -- lazyPanel's new panelName, null for the top-level boundary
  first_seen_at timestamptz default now(),
  last_seen_at  timestamptz default now(),
  occurrence_count int default 1,
  status        text default 'new',     -- new | triaged | fixed | wontfix | flaky
  task_id       uuid references public.tasks(id),   -- set once the sweep files a ticket
  created_at    timestamptz default now()
);
alter table public.runtime_error_reports enable row level security;
create policy "runtime_error_reports: public read"  on public.runtime_error_reports for select using (true);
create policy "runtime_error_reports: public write" on public.runtime_error_reports for all    using (true);
create unique index if not exists runtime_error_reports_fingerprint_idx on public.runtime_error_reports (fingerprint);
```

(Gated on the owner, same as every schema file in this repo — never run by an agent.)

`reportRuntimeError()` computes the fingerprint client-side (message + first real stack frame +
panel, not the full stack — line numbers shift across deploys and would fragment the same bug
into new fingerprints every release) and does an upsert: `on conflict (fingerprint) do update set
last_seen_at=now(), occurrence_count=occurrence_count+1`. One real bug stays one row, however many
times it fires, across however many users and however many days — until it's fixed, at which
point a NEW crash (if one happens) will have a different fingerprint and start a fresh row,
honestly rather than silently resetting a count that would otherwise misrepresent an old,
unrelated failure as newly recurring.

### 3. Sweep integration (the "determine a fix without my interaction" part)

New rotation entry in `memory/sweep-dimensions.md`:

> 8. **`[sweep:runtime-errors]`** — query `runtime_error_reports` where `status='new'`, ordered by
>    `occurrence_count` descending. For each: reproduce the exact failure (never trust the stack
>    trace as the root cause without confirming it — same "measure it" standing rule every other
>    sweep dimension already follows), then classify under the SAME Tier A/B/C rules every other
>    dimension uses — a null-guard / fallback-value bug reproduced and fixed with a regression
>    test is Tier A; anything that changes visible behavior or a data contract is Tier B; anything
>    that can't be reproduced after a real attempt, or that points at a genuine design question
>    rather than a bug, is Tier C — filed as a `tasks` row (`source:'sweep-runtime-errors'`,
>    linking back via `runtime_error_reports.task_id`) or a direct note, never silently applied.
>    Mark the row `status='fixed'`/`'wontfix'`/`'flaky'` once resolved so the next sweep pass
>    doesn't re-surface it.

This is the whole "auto-fix" loop the owner described, and it inherits every guardrail the sweep
framework already has instead of needing new ones invented for it:

- **Never unattended for Tier C** — a crash whose real cause turns out to be a genuine product
  decision (not a bug) gets a note to the owner, not a silent patch.
- **Full release-bar checklist** (`memory/release-bar.md`) on anything that ships — build clean,
  full suite green, payload budget held, changelog entry, no DDL.
- **Reproduce before fixing** — this repo's own "a reviewer's root cause is a hypothesis" rule
  applies doubly hard to a client-captured stack trace, which can be stale, minified, or
  misleading in ways a reviewer's own read of the code isn't.
- **Batched PRs for Tier A**, so this doesn't spend extra deploy budget per crash report the way
  tonight's two separate hotfix pushes did (justified tonight because they were live and urgent;
  routine via the sweep, batching is the right default).

### 4. What this explicitly does NOT do (by design, not by oversight)

- **No instant trigger-on-crash agent run.** Firing a Claude session the moment any user hits any
  error would be expensive, noisy (one bad deploy = dozens of simultaneous sessions on the same
  bug), and risky (an agent session fixing its own fix mid-incident, racing itself). The weekly
  cadence is deliberate — same reasoning the existing sweep framework already settled on.
- **No auto-deploy without the release bar.** "Without my interaction" in the owner's ask means
  without having to be the one who NOTICES and FILES it — not without the existing build/test/
  review gates every other change goes through. Those stay, full stop.
- **No PII in the report.** `message`/`stack`/`panel` only — no user id, no `accessible_locs`, no
  request payload. A crash message occasionally embedding a data value (e.g. a bad date string)
  is an accepted, reviewed risk already inherent in any stack-trace logging; worth a second look
  during build, not a blocker to writing this doc.

## Open questions for the owner (before Phase 1 starts)

1. **Does `runtime_error_reports` get its own small in-app viewer**, or is querying it only
   something a sweep/session does? (Lean: no viewer needed for v1 — the sweep's own filed `tasks`
   rows are already visible in the existing Task Queue panel; a raw-reports viewer is a nice-to-
   have, not load-bearing.)
2. **Should a crash ever notify the owner directly** (push/email) outside the weekly cadence, or
   is "it'll be in next week's sweep" acceptable for everything that isn't already caught live
   the way tonight's was? (Lean: no — a high-`occurrence_count` row by Monday is itself the
   signal; a live crash the owner is looking at, like tonight's, will keep being reported the way
   it was tonight regardless of this pipeline.)
3. **Threading `panelName` through all ~80 `lazyPanel()` call sites** is mechanical but touches a
   lot of lines for a feature that's otherwise small — worth doing as its own prep PR before the
   rest of this, or folded into the same PR as the capture function?

## Phasing

- **Phase 1** — schema (owner runs it), `reportRuntimeError()` + the `componentDidCatch` wiring +
  `panelName` threading, dedup upsert. No sweep integration yet; rows just accumulate.
- **Phase 2** — `[sweep:runtime-errors]` rotation entry + first real run against whatever Phase 1
  has collected by then.
- **Phase 3** (optional, only if Q2 above comes back "yes") — a notification path for a
  high-occurrence row outside the weekly cadence.

Nothing in this doc is built yet. This is the proposal to react to, not a change already made.
