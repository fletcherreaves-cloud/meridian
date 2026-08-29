# Dispatch #209 — EOM count-completion notifications (in-app, first real notification system)

## Context — owner-requested, live during an active 3-day EOM count cycle

Owner, 2026-08-29 (day 1 of this month's 3-day EOM count window): *"can we setup a smart
notification for when a store is perceived to complete with any class of count?"* Full spec below
is transcribed directly from the owner's own rules — do not simplify or reinterpret them.

**The hard part is already built and running.** `scripts/qsrsoft-onhand-pull.mjs` already computes,
every hourly run, exactly the per-class completion signal this dispatch needs
(`src/engine/eom-inventory.js`'s `computeCountProgress()` — `byClass.food/condiment/paper/nonproduct
.done`, each `done` at `pct >= CLASS_DONE_PCT` = 98%) and upserts it to `eom_count_status`
(`food_done, condiment_done, paper_done, nonproduct_done` columns). A companion function,
`diagnoseIncompleteCount()`, already returns the exact uncounted-items list the owner wants —
ranked by dollar value at risk, each with `wrin, descr, cls, valueAtRisk, lastCounted, state
(never|early|stale)`. **Read both functions in full (`src/engine/eom-inventory.js`) before writing
any new logic — this dispatch is almost entirely: (1) a transition-detection layer on top of data
that already exists, and (2) the first real notification-delivery mechanism in this app (none
exists today, anywhere).**

A prior session already scoped and deliberately deferred real notifications
(`memory/project-eom-scoreboard-notify.md`, 2026-07-29) — the owner asked to log the idea and chose
in-app-only at the time. That file already identifies the existing fire-once trigger pattern
(`eom_count_status.notified_90`, fired server-side in the pull script) as the template to extend.
**This dispatch is that follow-through**, generalized from "overall 90%" to "per-class complete,"
plus the owner's specific wait/stale/not-started rules below.

## The exact rules (owner's own words, transcribed)

1. **Food + Condiment are usually counted together.** If BOTH are detected as complete (or in
   progress together), **wait until both are complete** before notifying — OR, if a long period is
   detected since the last submission (one class done, the other stalled), notify anyway with
   whatever is known, showing the stalled class's real status.
2. **Paper is usually counted on a separate day.** Same treatment: when Paper completes, notify —
   but ALSO include the current completion status of Food/Condiment (and Non-Product) in that same
   notification, not just Paper alone, so the notification is always a full-cycle snapshot.
3. **If only ONE class is detected** (e.g., a store only touches Food today, not Condiment), report
   on it the same way, but show the other, untouched class as **"not started"** — never as
   "missing" or blank. Every notification always names the status of every relevant class.
4. **Every notification includes**: store info, which class(es) triggered it, a completion percent
   per category, and a list of uncounted items.
5. **Delivery**: in-app now (nothing exists today — this dispatch builds the first one). Email/SMS
   are explicitly OUT OF SCOPE for this dispatch — the owner will provide a provider + recipient
   in a follow-up once this ships; design the notification-creation step so a future send-channel
   can subscribe to it without touching the detection logic (see Task 4).

## Task 1 — Transition-detection engine (new, pure function, unit-testable in isolation)

Add a new function, e.g. `detectCountNotifications(prevStatus, newProgress, { staleHours = 3 } = {})`
in `src/engine/eom-inventory.js` (same file as `computeCountProgress`/`diagnoseIncompleteCount` —
keep the whole EOM-count domain in one place, per this repo's "check whether a helper exists"
rule). Inputs:
- `prevStatus` — the store's PRIOR `eom_count_status` row (the one about to be overwritten this
  run) — needs `food_done, condiment_done, paper_done, nonproduct_done`, plus THREE NEW timestamp
  columns this dispatch adds (see Task 2): `food_done_at, condiment_done_at, paper_done_at`.
- `newProgress` — this run's fresh `computeCountProgress()` output for the store.

Logic (implements the numbered rules above exactly):
- Food+Condiment pairing: if `newProgress.byClass.food.done` and NOT `condiment.done` (or vice
  versa) newly flips true this run, do NOT fire yet — just record the timestamp (Task 2). On a
  LATER run, if the other class still isn't done AND `now - thatClass'sDoneAt > staleHours`, fire
  a notification covering both: the done one as complete-with-%, the stalled one with its real
  current % (not "not started" — it has been touched, just isn't finished; reserve "not started"
  for a class with ZERO counted items, per rule 3).
  If BOTH flip true in the same run (or already were true and this run is the first time both are
  true), fire immediately — no need to wait for the stale timer.
- Paper: independent trigger. The moment `paper.done` newly flips true, fire — and the payload
  always includes Food/Condiment/Non-Product's CURRENT status alongside Paper's, per rule 2 (query
  `newProgress.byClass` for all four, not just paper).
- Rule 3's "not started" vs "in progress" vs "complete" per class, for EVERY notification's payload
  (not just the triggering class): a class with `byClass[k].total > 0 && byClass[k].counted === 0`
  is **not started**; `counted > 0 && !done` is **in progress** (include its real `pct`); `done` is
  **complete**. A class with `byClass[k]` entirely absent (zero items of that class exist for this
  store's catalog) is a real edge case — treat as "not applicable," don't invent a fake 0%.
- Return `{ shouldNotify: bool, triggerClasses: [...], classStatuses: {food:{status,pct}, ...} }` or
  `null` if nothing to do this run (nothing newly complete, and no stale-pairing timeout hit).
- **Never re-fire for the same transition** — once a notification has fired for a given
  store+period+trigger (e.g., "food+condiment complete" or "paper complete"), a later run must not
  re-notify for the same event even though the done-flags stay true for the rest of the month. Use
  a fire-once marker per trigger-kind per store per period (extend the existing `notified_90`
  fire-once pattern — same idea, one column/marker per trigger kind rather than one shared flag).

Write real unit tests for this function directly (no live data needed) — feed it synthetic
`prevStatus`/`newProgress` fixtures covering: both-together, one-then-stale, one-then-other-arrives-
before-stale, paper-alone, not-started-vs-missing, and the no-refire case.

## Task 2 — Schema changes

1. **New columns on `eom_count_status`**: `food_done_at timestamptz`, `condiment_done_at
   timestamptz`, `paper_done_at timestamptz`, `nonproduct_done_at timestamptz` — stamped the first
   time each class's `done` flips true (never overwritten once set, matching `notified_90`'s
   fire-once spirit). Also add whatever fire-once marker Task 1 needs (e.g. a `notified_classes`
   jsonb array or a few boolean columns — your call, but keep it queryable for the in-app read
   side, not just a write-only marker).
2. **New table `eom_count_notifications`** — one row per fired notification event: `id uuid default
   gen_random_uuid() primary key, loc text, period text, trigger_kind text` (e.g.
   `'food_condiment'`/`'paper'`), `class_statuses jsonb` (the full per-class status/pct payload,
   rule 2/3's "always show every class"), `uncounted_items jsonb` (the `diagnoseIncompleteCount()`
   output for the triggering class(es), capped to a reasonable count — e.g. top 25 by
   `valueAtRisk`, with a total count + total $ so nothing is silently truncated without saying so),
   `kb_links jsonb` (Task 3), `created_at timestamptz default now()`, `read_at timestamptz` (null =
   unread), `tenant_id uuid` + full RLS matching every other table in this repo (CLAUDE.md standing
   rule — this is a new persistent data type, it goes in Supabase from day one).
3. Both changes are additive (`alter table ... add column if not exists`, `create table if not
   exists`) — idempotent, safe to run anytime, matching this repo's schema-file convention. Name
   the file `supabase/schema-eom-count-notifications.sql` and tell the owner to run it (standard
   handoff — the same "owner runs this in the SQL editor" pattern every other new table in this
   repo uses).

## Task 3 — Wire it into the pull script + QSRSoft KB grounding

1. In `scripts/qsrsoft-onhand-pull.mjs`, after computing `computeCountProgress()` for a store and
   BEFORE upserting the new `eom_count_status` row, call `detectCountNotifications()` with the
   store's previous row (fetch it first) and the fresh progress. If it returns a notification, also
   call `diagnoseIncompleteCount()` for the uncounted-items payload, and insert a row into
   `eom_count_notifications`.
2. **QSRSoft KB grounding** — a small static per-class mapping (Food/Condiment → "What are the Best
   Counting Practices Using the Mobile Inventory App," Paper → the same or "Physical Inventory,"
   whichever `qsrsoft_kb` row title/`html_url` is the best match — query `qsrsoft_kb` live to
   confirm exact titles/URLs before hardcoding, don't guess the exact string). Attach as
   `kb_links: [{title, url}]` on the notification row. This does NOT need the SAGE search
   machinery — a fixed small lookup table is the right scope here, not a new KB search integration.
3. Add your own feedback/observations as a plain-text field or two if genuinely useful while
   you're in this code (the owner explicitly invited this) — e.g. if `diagnoseIncompleteCount`'s
   `lateBulk` flag (bulk count landed on the wrong day) is easy to surface in the same payload, do
   it and say why in the PR body; don't invent new engine logic beyond what's asked, but DO surface
   already-computed signals that make the notification more useful.

## Task 4 — In-app notification UI (genuinely new — nothing like this exists in the app today)

Confirmed: **zero existing toast/badge/notification-center anywhere in this app.** This is a new,
small, global UI surface, not a modal:
1. A bell icon with an unread-count badge in the app shell's top bar (`src/app/shell.js`,
   alongside the existing top-bar controls — check `SchedulingHubPanel`/nav badge patterns already
   in `shell.js` for the visual idiom, e.g. `NAV_EXTRAS` badges already used for other nav items).
2. Clicking it opens a lightweight panel/dropdown (not a full `RoutePanelShell` page — this is
   meant to be glanceable from anywhere) listing `eom_count_notifications` rows, newest first,
   unread visually distinct, each row showing: store name, trigger classes, per-class status/pct
   (rule 3's not-started/in-progress/complete for ALL relevant classes, not just the trigger),
   uncounted-item count + $ at risk (not the full list inline — collapse/expand, or link into the
   EOM Dashboard's existing per-store drill-down for full detail), and the KB link(s).
3. Clicking a notification marks it read (`read_at`) and can deep-link into the EOM Dashboard
   scoreboard for that store (`src/views/eom-dashboard.js`'s existing Scoreboard tab, per
   `memory/project-eom-scoreboard-notify.md` — reuse that existing view, don't build a second one).
4. **Design the read/poll path so a future email/SMS channel is a pure addition, not a rewrite**:
   the notification-CREATION step (Task 3, inside the pull script) is the single place a future
   `send_email(row)`/`send_sms(row)` call would hook in — leave an explicit, named comment marking
   that hook point, but do NOT stub out fake email code or a fake provider integration. Out of
   scope for this dispatch, full stop.
5. Global polling/refresh: a simple periodic fetch (e.g. every 60s while the app is open) of unread
   count is enough — this is not a real-time push system, just needs to feel current within a
   minute during an active count day.

## Verification

- Unit tests for `detectCountNotifications()` covering every rule combination named in Task 1 —
  this is the core logic, test it thoroughly and directly (no live data needed).
- A real end-to-end check: run the modified `qsrsoft-onhand-pull.mjs` logic (or a scoped
  integration test) against a real or realistic fixture proving a notification row actually lands
  in `eom_count_notifications` with the right shape when a class transitions to done.
- Render-level test for the new bell/badge + panel UI (mount the real component, not just the
  data function) — matching this session's "would this still pass if reverted" standing rule.
- Confirm the fire-once behavior: running the detection twice against the same transition does NOT
  produce a second notification row.
- Confirm rule 3's "not started" vs "in progress" distinction renders correctly for a fixture where
  one class has zero counted items and another has partial progress.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope (explicitly, per the owner's own message)

- Email/SMS delivery — follow-up dispatch once the owner provides a provider + recipient. Leave
  the single named hook point (Task 4.4) and nothing else.
- The Count Completion Report (reusable EOM/daily/weekly report) — separate dispatch (#211),
  shares `eom_count_status_history`/`inv_count_sessions` but is a different deliverable (a report,
  not a notification).
- Pull-frequency changes and the cron-reliability watchdog — separate dispatch (#210), unrelated
  files (workflow YAML, not this script's detection logic), can land in parallel.
- Any change to `computeCountProgress()`/`diagnoseIncompleteCount()`'s existing math — reuse as-is.
