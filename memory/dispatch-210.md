# Dispatch #210 — EOM pull cadence + scheduled-run reliability watchdog

## Context — owner-requested frequency bump, plus a live incident from the same morning

Owner, 2026-08-29 (day 1 of the 3-day EOM count window): asked whether there's a reason not to
pull on-hand count + Variance Stat more frequently during the last 3 days of the month, proposing
every 15-30 min between 8am-8pm.

**Corrected framing, confirmed live**: the on-hand pull (`qsrsoft-onhand-pull.mjs`) is **already
hourly** during the count window (`.github/workflows/qsrsoft-onhand-pull.yml`'s cron is `0 * * * *`,
with an in-script `inCountWindow()`/`inCtBusinessHours()` gate doing real work on every landed run
8am-6pm CT during the last 3 days of the month — today, 2026-08-29, is day 1, confirmed via `date
-u`). So "more frequent" means hourly → every 15-30 min, not "not automated → automated." The
**Variance Stat pull (`qsrsoft-variance-pull.mjs`) is genuinely daily-only** — no window gate at
all, `30 10 * * *` year-round.

**The same morning, a real incident surfaced this exact class of risk**: the DAR pull
(`qsrsoft-dar-pull.yml`) silently failed to fire for its two morning scheduled runs (~3am and ~5am
CT) — not a failure, the workflow simply never started (confirmed via the GitHub Actions API: no
run exists between 01:57 UTC and manual intervention at 11:52 UTC, while sibling pull workflows ran
fine in the same window). This matches GitHub's own documented behavior: scheduled cron triggers
are best-effort and can be silently dropped under platform load, and a repo with many workflows
clustered at the same top-of-hour times (this repo has a lot of them) is more exposed to it. A
second, independent measurement confirms this isn't a one-off: the on-hand pull's own daily
"progress snapshot" window (10:00-14:00 UTC) had **zero runs land in it at all** on 2026-08-28.

**This changes the shape of the ask.** A tighter cron on its own doesn't fix anything if crons can
silently no-show — it just means more silent no-shows are possible. This dispatch does three
things: (1) the cadence change the owner asked for, sized sensibly against that real risk, (2) the
mechanical fixes that were already overdue regardless (missing concurrency guards), and (3) a real
watchdog that catches "this should have run by now and didn't" — which would have caught this
morning's DAR gap immediately instead of the owner noticing it in the app.

## Task 1 — Cadence changes

1. **On-hand pull: hourly → every 30 minutes** during the existing count window (last 3 days of
   month, 8am-6pm CT) — NOT 15 minutes. Reasoning to preserve in the PR body: 15-min cadence
   multiplies exposure to the same silent-drop risk documented above for marginal freshness gain
   over 30-min; 30-min is the better balance, especially once Task 3's watchdog exists as a
   backstop. Modify `.github/workflows/qsrsoft-onhand-pull.yml`'s cron (GitHub cron can't express
   "every 30 min only 8am-6pm" directly — either add a second `*/30` style expression restricted by
   the script's own existing hour gate the same way the current hourly one is, or use two explicit
   cron lines at `:00` and `:30` — your call, but keep the existing in-script
   `inCountWindow()`/`inCtBusinessHours()` gate as the source of truth for whether a landed run does
   real work, don't duplicate that logic into the cron expression itself).
2. **Variance Stat pull: add a window-gate mirroring the on-hand pull's own pattern**, accelerating
   during the last-3-days count window specifically (recommend hourly during the window, same as
   on-hand's own base cadence — read `inCountWindow()`/`inCtBusinessHours()` in
   `scripts/qsrsoft-onhand-pull.mjs` and reuse/import that logic rather than reimplementing it in
   `qsrsoft-variance-pull.mjs`, per "check whether a helper exists before writing one"), while
   keeping the existing once-daily cadence for the rest of the month (Variance Stat matters most
   exactly when counts are being submitted and diagnosed).
3. Real timing data already measured this session: on-hand real runs take ~130-142s, variance-pull
   real runs have measured as long as 671s (11 min) — both comfortably inside their workflow
   timeouts even at a tighter cadence. No GitHub Actions runner-minute cost concern — this repo is
   public, public repos get unlimited standard-runner minutes. No documented QSRSoft/eBOS-side rate
   limit exists anywhere in this repo's memory files — do a real, live smoke-test of the tighter
   cadence for at least a few real cycles before calling this done, rather than assuming it's safe
   because no documented limit was found (absence of a documented limit is not proof of no limit).

## Task 2 — Concurrency guards (real gap, independent of the cadence change)

Neither `qsrsoft-onhand-pull.yml` nor `qsrsoft-variance-pull.yml` has a `concurrency:` block today
(unlike `deploy.yml`/`ci.yml`, which both do) — at a tighter cadence, a slow run (variance-pull has
measured 11 minutes) could still be executing when the next scheduled run fires. Every write in
both scripts is an idempotent upsert on a stable PK, so this isn't silently corrupting data, but it
doubles eBOS/Playwright login load for no reason and should be closed regardless of whether the
cadence changes. Add `concurrency: { group: <workflow-name>-${{ github.ref }}, cancel-in-progress:
false }` (queue, don't cancel — a cancelled mid-write run is worse than a queued one) to both.

## Task 3 — Scheduled-run reliability watchdog (the real fix for today's incident class)

Build a lightweight new workflow (e.g. `.github/workflows/scheduled-pull-watchdog.yml`) that:
1. Runs frequently (every 30-60 min) and checks each critical scheduled pull's **actual last-run
   timestamp** against its **expected interval** — reuse `src/engine/stream-freshness.js`'s
   `STREAMS` array as the source of truth for what "critical" means and what freshness each stream
   expects (per CLAUDE.md's own standing rule: "add the new stream's `dsField` to `STREAMS`" for
   every new pull — this watchdog should read that SAME registry rather than hand-listing streams
   a second time, so the two never drift apart).
2. For any stream whose actual last-updated timestamp is older than its expected interval by a real
   margin (not a hair-trigger — allow real slack for the "sparse and delayed" behavior already
   documented, but catch a multi-hour genuine no-show like today's), **automatically re-trigger the
   owning workflow via the GitHub Actions API** (`workflow_dispatch`) rather than just logging —
   self-healing, matching the standing "backfill it, don't file it" philosophy already established
   in this repo for data gaps. Cite this dispatch's own root-cause finding (today's DAR gap) as the
   concrete motivating case in the PR body.
3. This is explicitly a SAFETY NET for scheduling failures, not a replacement for `sync-failure-
   watch.yml` (which watches for a workflow that RAN and FAILED — a different, already-covered
   failure mode). Don't merge or replace that file; this is a new, narrower check for "should have
   run, silently didn't."
4. Keep the retrigger logic conservative: at most one automatic retrigger per stream per detection
   cycle (don't loop-retrigger a workflow that's failing for a real reason — that's
   `sync-failure-watch.yml`'s job once it actually runs and fails). If a retrigger itself doesn't
   clear the staleness within a reasonable follow-up window, that's a real failure worth a louder
   signal — decide and justify what that louder signal is (a GitHub issue comment, a log line
   picked up elsewhere, or folding into dispatch #209's new notification table if that's landed by
   the time you build this — your call, state the reasoning).

## Task 4 — Owner idea already logged, cheap to include if it fits naturally

`memory/project-eom-scoreboard-notify.md` already records an owner idea: **the instant a store's
on-hand count crosses "believes done," dispatch the FOB pull (`qsrsoft-pull.yml`) immediately**
rather than waiting for its own 3x/day schedule — using the GitHub Actions REST API from inside
`qsrsoft-onhand-pull.mjs` on the existing `notified_90` fire event. If dispatch #209 lands first (it
adds new per-class fire-once events in the same script), wire this off the SAME fire points rather
than duplicating the trigger detection — check with the actual state of `main` when you start this
dispatch. If #209 hasn't landed yet, wire it off the existing `notified_90` trigger alone and note
in the PR body that a per-class version can follow once #209's finer-grained triggers exist. This
task is a nice-to-have, cheap addition — if it meaningfully complicates the PR, defer it with a
one-line note rather than let it block Tasks 1-3.

## Verification

- Live-confirm (name credential/method) that the tightened on-hand cadence actually produces
  landed runs at roughly the new interval over a real observation window during today's remaining
  count-window hours — not just that the cron file looks right.
- Confirm the variance-pull window-gate correctly restricts acceleration to the last-3-days window
  and doesn't change its cadence for the rest of the month.
- Concurrency guard: a real test or at minimum a clear explanation of how you verified the
  `concurrency:` block is syntactically correct and scoped per-workflow (not accidentally shared
  across unrelated workflows).
- Watchdog: a real test proving it detects a genuinely stale stream (simulate one) and issues a
  `workflow_dispatch` call — don't just assert the detection logic in isolation.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- The EOM count-completion notification engine itself (dispatch #209) — different files
  (script-internal detection logic + new schema/UI vs. this dispatch's workflow YAML + a new
  watchdog workflow), can land in parallel; only Task 4 above has any real interaction between them.
- The Count Completion Report (dispatch #211).
- Any change to what data the on-hand/variance pulls actually fetch — cadence and reliability only.
