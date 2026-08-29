// @ts-nocheck
export default {version:'5.250', date:'2026-08-29', changes:[
  'Dispatch #210 -- EOM pull cadence tightened + a real scheduled-run reliability watchdog. ' +
  'Owner asked whether the on-hand count + Variance Stat pulls could run more often during the ' +
  '3-day EOM count window; the same morning the QSRSoft Daily Activity Pull silently failed to ' +
  'fire for its ~3am/~5am CT scheduled runs (confirmed live via the GitHub Actions API: no run ' +
  'exists between 01:57-11:52 UTC while sibling pulls ran fine) -- a documented GitHub behavior ' +
  '(scheduled cron triggers are best-effort and can be silently dropped), not a script bug. That ' +
  'reframed a simple cadence bump into cadence + reliability together.' +
  '\n\n' +
  'Cadence: qsrsoft-onhand-pull.yml now fires every 30 min (":00"+":30" cron lines) during the ' +
  'existing 8am-6pm CT / last-3-days-of-month window -- NOT 15 min, deliberately, to avoid ' +
  'doubling exposure to the same silent-drop risk for marginal freshness gain now that the ' +
  'watchdog below is a backstop. The in-script inCountWindow()/inCtBusinessHours() gate (now ' +
  'extracted to scripts/lib/count-window.mjs so qsrsoft-variance-pull.mjs can reuse it verbatim ' +
  'rather than reimplementing it) stays the sole authority on whether a landed run does real work ' +
  '-- the cron change only makes more runs LAND, it carries none of the window logic. ' +
  'qsrsoft-variance-pull.mjs gained a window-gate it never had (was daily-only, 30 10 * * * ' +
  'year-round): a new hourly cron line (offset :15, avoiding the on-hand pull\'s :00/:30 to reduce ' +
  'clustering) now fires year-round, and the script\'s own runMode() decides real work -- ' +
  'accelerate to hourly during the count window (same gate as on-hand), stay once-daily the rest ' +
  'of the month (a [10,12) UTC WINDOW around the original 10:30 slot, not an exact-minute match, ' +
  'per the same "GitHub runs are sparse and delayed" reasoning on-hand\'s own progress-snapshot ' +
  'already uses). Real timing already measured this session and cited rather than re-measured: ' +
  'on-hand ~130-142s, variance-pull up to 671s (11 min) -- both comfortable even at the tighter ' +
  'cadence, and this is a public repo (unlimited standard-runner minutes).' +
  '\n\n' +
  'Concurrency: both workflows gained `concurrency: {group: <name>-${{github.ref}}, ' +
  'cancel-in-progress: false}` (queue, don\'t cancel -- every write in both scripts is an ' +
  'idempotent upsert on a stable PK, so a cancelled mid-write run is strictly worse than a queued ' +
  'one). Neither had a concurrency block before, independent of the cadence change.' +
  '\n\n' +
  'New watchdog: .github/workflows/scheduled-pull-watchdog.yml + scripts/scheduled-pull-' +
  'watchdog.mjs, every 30 min. Explicitly NOT a replacement for sync-failure-watch.yml (which ' +
  'watches a workflow that RAN and FAILED) -- this catches the DIFFERENT failure mode from ' +
  'today\'s incident: a run that never started at all, so there is no workflow_run event for ' +
  'that watcher to see. Reads src/engine/stream-freshness.js\'s STREAMS array as the source of ' +
  'truth for which streams are critical (no second hand-maintained list); a small additive ' +
  'mapping, scripts/lib/scheduled-pull-registry.mjs, carries only what STREAMS\' browser-side ' +
  '`dsField` can\'t -- the Supabase table/date-column to query directly and the owning .yml ' +
  'workflow file to re-dispatch -- keyed by the SAME `key`, with a test asserting the two files\' ' +
  'key sets are identical in both directions so they can\'t drift apart. Staleness = ' +
  '(cadenceDays*24h + 16h grace) -- deliberately generous, not a hair-trigger: these are DATE- ' +
  'grain columns pulled once a morning, so the normal pre-next-pull age is already well into the ' +
  '24-30h range, and 16h grace is a reasoned default (not a live-measured one, flagged as such) ' +
  'pending real detections to calibrate against. A genuinely stale stream gets ONE automatic ' +
  'workflow_dispatch retrigger via the GitHub REST API (actions:write on the default GITHUB_TOKEN ' +
  '-- workflow_dispatch is one of the two events explicitly exempt from the token\'s normal ' +
  '"won\'t trigger further runs" restriction, so no separate PAT), tracked via a GitHub issue ' +
  '(same mechanism sync-failure-watch.yml already uses for its own state); still stale next cycle ' +
  'escalates with a comment instead of retriggering again (a workflow failing for a REAL reason ' +
  'is sync-failure-watch.yml\'s job once it runs and reports failure) -- and the issue auto-closes ' +
  'once the stream recovers. The watchdog itself is now scheduled, so it was added to sync-' +
  'failure-watch.yml\'s own watched-workflows list (its own test requires every cron workflow to ' +
  'be watched).' +
  '\n\n' +
  'Task 4 (cheap nice-to-have) made it in: qsrsoft-onhand-pull.mjs now nudges QSRSoft FOB Pull ' +
  '(qsrsoft-pull.yml) via workflow_dispatch the instant any store crosses "believes done" this ' +
  'run, instead of waiting for FOB\'s own 3x/day schedule -- wired off the existing notified_90 ' +
  'trigger (dispatch #209\'s finer-grained per-class triggers were doc-only on `main` as of this ' +
  'dispatch, checked live, so nothing to wire onto yet; a per-class version can follow once #209 ' +
  'lands). At most one dispatch per script run.' +
  '\n\n' +
  'Verification: real behavioral tests throughout, not source-text regexes, per this repo\'s ' +
  '"would this verification still pass if reverted" rule -- qsrsoft-variance-pull.mjs and ' +
  'qsrsoft-onhand-pull.mjs both gained the same import.meta.url-guarded-main() pattern ' +
  'qsrsoft-punch-times-pull.mjs already used, so their real gate/nudge functions are imported and ' +
  'exercised directly (mocked fetch/Supabase, no live network) rather than only asserted by ' +
  'inspection. New: count-window.test.js (the extracted pure gate), qsrsoft-variance-pull-' +
  'window.test.js (the new window-gate end to end, including "the new hourly cron landing mid-' +
  'month at an off-slot hour stays a no-op"), scheduled-pull-registry.test.js (STREAMS<->registry ' +
  'parity + every workflowFile resolves to a real file), scheduled-pull-watchdog.test.js (a ' +
  'genuinely stale stream really issues a workflow_dispatch POST to the RIGHT workflow AND opens ' +
  'an issue; a fresh stream makes zero API calls; a still-stale stream with an issue already open ' +
  'escalates via comment and does NOT dispatch a second time; recovery closes the issue), ' +
  'qsrsoft-onhand-pull-fob-nudge.test.js (the Task 4 nudge fires with the right URL/body when ' +
  'GITHUB_TOKEN/GITHUB_REPOSITORY are set, no-ops cleanly without them, never throws on a failed ' +
  'call). Live smoke-testing the actual tightened cadence against real GitHub Actions runs is ' +
  'this worktree\'s one open item -- it cannot push or dispatch workflows itself (isolated ' +
  'worktree, PM handles push/PR/merge), so that observation window is the PM\'s to run post-merge.' +
  '\n\n' +
  'Full suite: 308 files / 3177 tests passing (5 new test files). Build clean; eager payload ' +
  '522.25 KB gzip (budget 850 KB, headroom 327.75 KB) -- unchanged, as expected, since this ' +
  'dispatch is workflow YAML + scripts/, no src/ app-bundle changes.',
]};
