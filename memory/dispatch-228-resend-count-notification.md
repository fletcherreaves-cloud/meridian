---
name: dispatch-228-resend-count-notification
description: On-demand "regenerate with fresh data and resend" for the per-store EOM count-completion notification email/text
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #228 — Resend the count-completion notification with fresh data

Owner request, verbatim (2026-08-30, with a screenshot of a real "Ardmore-Cooper/12th... Food +
Condiment count complete" email): *"Can we also make it so i can regenerate the email with fresh
data that we are sending per location for the count completion?"*

## What this is, and what it is not

There are TWO different EOM emails in this codebase — don't conflate them:

1. **EOM Digest** (`scripts/eom-digest-send.mjs`) — the daily roll-up report (district/patch/org/
   operator). **Already has an on-demand resend**: `trigger-dar-sync`'s `digest` workflow entry,
   wired to the EOM Dashboard's existing "📧 Generate Report" → Send action
   (`eom-dashboard.js:~2090`, `triggerSync('digest', { level: digestLevel })`). Nothing to build
   here — if the owner meant this one, it already works.
2. **Count-completion notification** (`scripts/qsrsoft-onhand-pull.mjs`'s `notifyRow()` /
   `deliverNotifications()`) — the fire-once "Store X just finished counting Food+Condiment/Paper/
   Non-Product" alert to the owner (email via Resend + SMS via AT&T gateway + web push). **This is
   what the screenshot shows, and it has no on-demand trigger at all.** This dispatch is about #2.

## Why "regenerate with fresh data" matters, not just "resend the same email"

`notifyRow(row)` sends whatever `row` it's handed — it doesn't recompute anything. The automated
path in `qsrsoft-onhand-pull.mjs` builds that `row` fresh every run via `buildNotificationRow()`,
fed by that run's own `computeCountProgress()`/`diagnoseIncompleteCount()`/FOB snapshot. A GM can
correct a count, or the pull can land more data, *after* the original notification fired — the
owner wants a button that re-derives the row from **current** data and sends it again, not a
"forward this old email" action.

## The reusable pieces (all already exist — wire them together, don't reimplement)

- **`buildNotificationRow(loc, period, detection, diag, fobSnapshot, dateStr, fobTargetReport)`**
  (`scripts/qsrsoft-onhand-pull.mjs:213`) — pure, already exported. Builds the exact row shape
  `sendEmailNotification`/`sendSmsViaCarrierGateway` consume. Reuse verbatim.
- **`detectCountNotifications(prevStatus, newProgress, opts)`** (`src/engine/eom-inventory.js:550`,
  exported) — its return value's `.classStatuses` field is built from `newProgress.byClass` via the
  internal (non-exported) `classNotifyStatus()`/`NOTIFY_CLASS_KEYS`. **Don't export those two internals
  and hand-roll a second classStatuses builder** — call `detectCountNotifications({}, currentProgress)`
  (an empty `prevStatus` so nothing reads as "already fired", the fire-once logic is irrelevant for a
  manual trigger anyway) and read `.classStatuses` straight off the result. One call, no new exports.
- **`computeCountProgress(onHandRows, {period, asOf})`** (`src/engine/eom-inventory.js`) — feeds
  `detectCountNotifications`'s `newProgress` argument. Already used everywhere else in this file.
- **`diagnoseIncompleteCount(onHandRows, {period, asOf})`** — the `diag` argument (uncounted items +
  `lateBulk`/`lateBulkDay`). Already carries the 2026-08-31 `active`-flag fix (v5.276) — a resend
  built on this won't resurface the false-urgency bug this session just closed.
- **`fetchFobSnapshotForStore`, `resolveFobTargets`, `buildFobTargetReport`** — all already exported
  from `qsrsoft-onhand-pull.mjs` and already reused by `eom-digest-send.mjs` for the identical
  purpose (FOB section of an email). Same three-call sequence, verbatim.
- **`notifyRow(row)`** (`scripts/qsrsoft-onhand-pull.mjs:182`, exported) — fires all three channels
  (email/SMS/push) from a built row. Reuse verbatim; don't call the three send functions separately.
- **`EMAIL_TO`/`SMS_TO`** (`scripts/lib/resend-notify.mjs:24-25`) — hardcoded to the owner
  (`fletcher.reaves@mcreaves.com` / an AT&T SMS gateway), not per-store recipients. No recipient
  resolution needed — this has only ever been an owner-facing alert, and stays that way.

## What's actually new

### 1. A small script: `scripts/eom-notification-resend.mjs`

CLI/env args: `loc` (required), `period` (default: current month). Loads current on-hand rows for
that store+period the same way `qsrsoft-onhand-pull.mjs` already does (reuse its loader, don't
re-fetch differently), runs the pipeline above, and calls `notifyRow()`. Trigger kind for a manual
resend should read as `'manual_resend'` or similar in `class_statuses`/logging — distinct from the
automated fire kinds (`food_condiment`, `paper`, etc.) so a later reader of `eom_count_notifications`
history can tell a manual resend apart from an automatic fire. Decide the exact trigger-classes
scope (all 4 classes' current status, not just whichever class most recently completed) — the point
of "regenerate" is a full current-state snapshot, not a replay of one specific original trigger.

Log the send the same way the automated path does (`eom_count_notifications` insert, if that table
already records automated fires — check `buildStatusRow`'s neighborhood in `qsrsoft-onhand-pull.mjs`
for the existing persistence call before adding a second one).

### 2. `trigger-dar-sync`'s `WORKFLOWS` allowlist (`supabase/functions/trigger-dar-sync/index.ts`)

Add an entry, e.g.:
```ts
resend_notify: { file: 'eom-notification-resend.yml', label: 'Resend Count Notification', inputs: { loc: '', period: '' } },
```
Follow the `digest` entry's exact comment style (cite this dispatch number, note which UI button
calls it). Requires a matching **new** `.github/workflows/eom-notification-resend.yml` with a
`workflow_dispatch` block declaring `loc`/`period` inputs, modeled on `eom-digest-send.yml`'s own
`workflow_dispatch` block (cited as the pattern to follow by the `digest` entry's own comment).

### 3. A "🔄 Resend" button, per store

Where exactly is a judgment call for whoever implements this — the EOM Dashboard's per-store
"Store message" modal (`eom-dashboard.js`, the same modal that already builds `draft`/shows
`FobStrip`) is the natural fit, since that's where the owner is already looking at one store's
current state. Wire it to `triggerSync('resend_notify', { loc, period })`, matching the `digest`
button's exact call shape. Since `triggerSync` requires an authenticated Supabase session
(`trigger-dar-sync` checks the bearer token), this is already gated to logged-in users — no new
auth work needed.

## Standing conventions to follow (per CLAUDE.md, not new instruction)

- **Adding a new automated-ish pull/send path**: this isn't a new *data* pull, but it does add a
  new GitHub Actions workflow — check whether `sync-failure-watch.yml`'s watch-list applies (this
  one fires only on manual click, never scheduled, so likely doesn't need the same unattended-
  failure watch a cron job needs — judgment call, but note the reasoning in the PR either way).
- **Speed check**: this button lives in an already-loaded modal: no new lazy chunk, no measurable
  eager-payload change expected. Measure and report both numbers anyway per the standing rule.
- **Version bump + changelog entry**, real render test (the button actually calls `triggerSync`
  with the right args — a test that only unit-tests the new script wouldn't catch a button wired to
  the wrong workflow key).

## Verification bar

- Real test of `scripts/eom-notification-resend.mjs`'s row-building logic against a synthetic
  on-hand fixture (mirrors `test-eom-notification-send.mjs`'s existing pattern of exercising the
  real send functions, not a mock of them) — prove the built row has correct `class_statuses`/
  `uncounted_items`/`fob_snapshot` for a known input, not just that `notifyRow` gets called.
  **A live send cannot be verified in this sandbox** (no `RESEND_API_KEY`) — same limitation
  `test-eom-notification-send.mjs`'s own header already documents; note it in the PR rather than
  claiming a live send was confirmed.
- Render test proving the new button calls `triggerSync('resend_notify', {...})` with the correct
  `loc`/`period` for whichever store's modal is open.
- Full suite + build in a fresh worktree, gzip eager-payload before/after.
