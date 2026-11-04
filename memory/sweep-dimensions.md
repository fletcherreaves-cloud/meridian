# Self-maintenance sweeps — scope, rotation, and the autonomy tiers (2026-11-04)

Owner-requested standing framework (2026-11-04 conversation): proactive, scheduled inconsistency
sweeps instead of only opportunistic ones, with explicit parameters for what ships without
asking and what always stops for sign-off. A weekly scheduled task fires into the project's
Claude Code session and runs ONE dimension from the rotation below — never an unscoped "find
bugs in the app" pass, which produces noise and re-discovers what's already a known, accepted
tradeoff.

## The autonomy tiers (what happens to a finding)

**Tier A — fix silently, ship in a batched PR.** Low blast radius, reversible, matches an
existing precedent exactly. Examples: a panel missing one panel-contract convention it should
already have, a demonstrably dead code path (proven dead — tested, not assumed), a stale
greppable reference, applying an already-approved pattern (e.g. a `LocationSelector` conversion)
to a newly-found straggler. Every Tier-A fix still clears `memory/release-bar.md` in full before
merging. Several Tier-A fixes from one sweep batch into ONE PR, not one PR per finding (deploy
budget discipline).

**Tier B — fix, but flag loudly, as its own PR.** Anything that changes visible behavior or
math, a new cross-table data dependency, anything that moves the payload budget. Ships through
the same release-bar checklist, but never silently batched with Tier-A noise — its own
changelog entry, its own clearly-labeled PR body section.

**Tier C — never act alone. Report or suggest, never apply.** Schema/DDL, anything touching PII
or credentials, a genuine product-judgment call (a decision, not a bug), reversing a documented
owner decision, anything architecturally significant. A sweep that finds one of these produces
either a `spawn_task` suggestion card or a direct note to the owner — never a direct edit.

When in doubt about which tier a finding belongs to, it's Tier B at the loosest, never Tier A.

## The rotation

Pick whichever dimension was covered longest ago (or never). Rotation state is tracked by
grepping commit messages for a `[sweep:<dimension>]` tag — every sweep-originated commit carries
one. `git log --grep='\[sweep:' --oneline` shows the real history; no separate state file to go
stale.

1. **`[sweep:panel-contract]`** — `memory/panel-contract.md` conformance across all panels, not
   just ones already being touched for another reason. Current adoption ratio is tracked in that
   file.
2. **`[sweep:data-sourcing]`** — `memory/data-sourcing-standard.md` violations: raw
   `ds.laborRows`/`ctrlRows`/`opsRows` reads bypassing `metric-source.js`, a rate metric using
   mean-of-daily instead of `metricSumRatio`.
3. **`[sweep:dead-code]`** — helpers with zero remaining call sites, settings keys nothing reads
   or writes, feature flags that have been permanently on/off for months. Prove dead via a repo-
   wide grep before removing, never assume.
4. **`[sweep:duplication]`** — the "check whether a helper exists" rule, run as an audit instead
   of only catching it opportunistically (the org-map/week-start/scheduled-hours repeats that
   cost real reconciliation bugs before).
5. **`[sweep:doc-drift]`** — CLAUDE.md and memory/*.md claims re-measured against the real code
   they describe. Narrow and targeted — this is NOT a license to rewrite every stale line-number
   citation (CLAUDE.md's own standing rule against that sweep stands); it's for claims that are
   now factually wrong, not just citations that drifted by a few lines.
6. **`[sweep:settings-hygiene]`** — `MANUAL_ONLY_METRICS` staying empty, orphaned settings keys
   nothing reads, a toggle that's been permanently one value since it shipped.
7. **`[sweep:kb-accuracy]`** — in-app Knowledge Base / Workflow Guide wording checked against
   real on-screen panel titles and real current behavior (same method as the 2026-11-02 KB audit,
   run again rather than assumed still accurate).

## Mechanics

- Fires weekly via a scheduled task into this persistent session (full context already loaded —
  no need to re-explain the project).
- Runs the release-bar checklist on anything it produces before calling it done.
- Reports a one-paragraph summary to the owner only when something shipped (Tier A/B) or needs
  his decision (Tier C) — a clean sweep that found nothing real is a silent no-op, not a status
  update.
- Never touches `CLAUDE.md` directly from an unattended sweep — a CLAUDE.md change (the single
  highest-blast-radius file in the repo, read at every session start) is proposed in the sweep's
  report for the owner/this session's own next interactive pass, not auto-edited.
