# Plan: Movers Alerts (task #91) — threshold measurement + scoping pass

> Owner request 2026-11-04 (see `TaskGet` task #91 for the full origin/framing — not urgent,
> "at some point", but "could see this becoming a major part of our app"). This doc is the
> "real design/scoping pass before building" that task explicitly called for: the trigger
> threshold measured against real data (never guessed), plus the open product-judgment
> questions laid out for the owner to decide before any code gets written.

## What already exists (confirmed, not re-built here)

- **Push send mechanism**: `scripts/lib/webpush-notify.mjs` + `scripts/lib/app-notification-
  delivery.mjs`, already in production for pull-failure alerts (`qsrsoft-onhand-pull.mjs`).
  Device opt-in via `src/app/shell.js`'s `DeviceAlertsToggle` (VAPID, service worker,
  `push_subscriptions` table). Nothing new needed here.
- **"Supporting information"**: `src/engine/why.js`'s `diagnoseMiss()` already returns ranked,
  tagged root causes for a sales/metric miss (PRIMARY/CONTRIBUTING/NOTE/etc.) — the natural
  source for "why did this store move," not a new diagnostic engine.
- **"Suggested remedies"**: the Recommendation Ledger (task #84, `src/engine/recommendation-
  ledger.js`) already has the accept/track/outcome shape for "here's a suggestion, did it work."
- **Scheduling precedent**: `scripts/sage-run.mjs`'s hourly Action already proves "scheduled
  job reads live data → writes a result → triggers downstream action" at this project's scale.
- **The signal itself**: `src/views/at-a-glance.js`'s `moversStrip` (~line 1430) already
  computes single-day `salesVsLYPct` per store from `qsrActSummaryRows` (fed by
  `qsr_daily_activity_rollup`), already guards against bogus comps (`lySales>=$1k`,
  `|pct|<=200%`, both carried into the measurement below), and already ranks top-3 up / bottom-3
  down / slowest-2 DT. It is purely pull-based today — a user has to open the app to see it.

So the actual open work is: decide the trigger threshold (measured), then wire these four
existing pieces together. This doc covers the first half.

## Measurement — same methodology as the swing alarm's -10%/-8% (`swing-detect.js`)

The swing alarm's own header is explicit that its threshold came from measuring 676 real
store-weeks, not a guess, and that recalibration should happen "if the business changes shape."
Movers is a **different grain** (single calendar day, not a rolling week), so the swing alarm's
numbers do not transfer directly — they had to be re-measured at this grain.

**Method**: pulled every row of `qsr_daily_activity_rollup` live via the service-role key
(66,526 raw rows), computed `salesVsLYPct` with the exact same guard logic the app already uses
(`_yoyPct` sanity band −75%/+300% in `lib/supabase.js`, plus `moversStrip`'s own `lySales>=$1,000`
and `|pct|<=200%` filters) — **53,196 qualifying store-days across 26 stores** (the 27th,
Tishomingo #43380, has only 322 days of data post-relocation and a -10% mean, consistent with
the Launch Planner work's own finding that it's still mid-ramp against a pre-relocation LY
baseline — excluded from the pooled stats below as a known special case, not folded in to avoid
skewing the "normal" distribution).

### Pooled single-day distribution (all 53,196 qualifying store-days)

```
mean    +6.9%      p1   -26.4%
median  +5.0%      p5   -14.1%
stdev   17.0pp      p10   -9.5%
                    p90  +24.1%   p95 +32.6%   p99 +66.5%
```

Per-store stdev ranges 13.3pp–18.9pp (25 of 26 stores) — close enough together that a single
pooled threshold is reasonable for a first version; no store is a wild outlier the way #43380 is.

**Compare to the swing alarm's weekly numbers** (median +0.8%, stdev 10.7pp): daily swings are
**~60% noisier** than weekly ones, as expected — a day is a smaller sample than a week. Any
daily-grain threshold has to be correspondingly more extreme than the weekly −8%/−10% to avoid
firing on routine noise.

### ⚠️ The real finding: "up" movers are not an anomaly signal at this grain

Ran the swing alarm's own sustained-run test (how many stores ever hit N consecutive days at/
over a threshold) at several candidate thresholds:

```
>=10% for 7+ consecutive days:  25 of 26 stores
>=20% for 7+ consecutive days:  25 of 26 stores
>=30% for 7+ consecutive days:  24 of 26 stores
```

**Virtually every store, at some point, sustains +10% to +30% vs LY for a full week or more.**
This isn't noise in the usual sense — it reflects real, sustained, store-level growth (pricing,
volume, LY being a weak comp), but it means an "up swing" trigger, at ANY threshold tested up to
+30% sustained for a week, would eventually fire for nearly every store in the district. That is
not a usable alert signal — it is closer to "this store had a good month," which is already
visible everywhere else in the app (Analytics, Store Dashboard, the existing `moversStrip` "up"
display itself). **Recommendation: do not build a push-alert trigger on upward movement at this
grain.** The passive "▲ Up vs LY" display in `moversStrip` stays exactly as it is (it's already
working as a non-alerting, glance-only display) — this finding is specifically about what should
or shouldn't escalate to a push notification.

### Down swings: a usable signal exists, at two different grains

```
Single-day, no sustained requirement:
  <= -20%: 1,105 / 53,196 store-days (2.08%)
  <= -25%:   606 / 53,196 store-days (1.14%)   ← roughly this grain's "p1" event
  <= -30%:   385 / 53,196 store-days (0.72%)

Sustained-run store counts (how many of 26 stores ever hit this):
  <=-20% for 5+ consecutive days:   9 of 26
  <=-20% for 7+ consecutive days:   5 of 26
  <=-25% for 3+ consecutive days:  14 of 26
  <=-25% for 5+ consecutive days:   6 of 26
  <=-30% for 3+ consecutive days:   9 of 26
  <=-30% for 7+ consecutive days:   1 of 26
```

Two usable rules fall out of this, mirroring the swing alarm's own SPIKE vs SUSTAINED split:

- **Single-day SPIKE**: `<= -25%` in one day is this grain's ~p1 event (1.14% of all store-days)
  — rare enough to be genuinely noteworthy on its own, without waiting for a second bad day.
  This is the daily-grain equivalent of the swing alarm's `spikePct: -13` (its own p1 at weekly
  grain).
- **Sustained decline**: `<= -20%` for 3+ consecutive days is a reasonable WARN-level trigger
  (narrows to a meaningfully smaller set of stores than any single day would, without being as
  rare as the 5-7+ day cuts). `<= -25%` for 3+ days is a tighter CRIT-level cut (14/26 stores
  ever hit it — still fires more than the weekly swing alarm's -10%/2-week rule, which is
  calibrated to isolate 1-2 stores specifically, because this is a faster-twitch, earlier-
  warning signal by design, not a replacement for the weekly alarm).

**Recommended starting thresholds** (ship as the v1 trigger, explicitly NOT final — same
"recalibrate if the business changes shape" caveat the swing alarm's own header carries):

| Severity | Rule |
|---|---|
| CRIT (single occurrence) | 1 day at or below **−25%** vs LY |
| WARN (sustained) | 3+ consecutive days at or below **−20%** vs LY |
| — (up swings) | **No push trigger.** Passive display only, unchanged. |

### Known gap this measurement does NOT cover

This is single-store, single-day **sales** only — matches `moversStrip`'s current scope exactly
(it doesn't trigger on DT, GC, or anything else; those stay informational-only in the strip for
now). If Movers alerts later expand to guest-count or DT (the strip already shows "Slowest DT"
passively), that needs its own separate measurement — DT's noise characteristics are not sales'.

## DECIDED (2026-11-07, owner, live Q&A) — all four open questions answered

1. **Audience/role targeting** → **GM + AS + DO only** (the roles who can actually act on a
   single-store decline), not every role with `accessible_locs` access to that store.
2. **Occurrence vs schedule** → **On occurrence.** Fires the moment that day's DAR pull confirms
   a CRIT/WARN swing — not bundled into a daily digest.
3. **Push content** → **Store + severity + top cause.** The notification body itself carries the
   single highest-ranked `diagnoseMiss()` cause, not just the swing number — more self-contained
   than a bare "CRIT decline" ping, at the cost of a longer body.
4. **Scope of the mechanism** → **Build a general alerting system now**, not a Movers-only
   notification type. Movers is the first alert TYPE registered against it, but the
   trigger-evaluation/dedup/push-delivery plumbing is built generic from the start so a second
   alert type (e.g. a future Labor or FOB alert) doesn't need a rewrite.

This changes the shape of "next step" below — it's no longer just a Movers trigger script, it's
a small generic alerting framework with Movers as its first registered type.

## Recommended next step when this is picked up for real

**Generic alerting framework, Movers as the first type:**

1. **`alert_types` concept (code-registry, not a DB table)** — each type registers an `id`
   (`movers_down`), a trigger-evaluation function (reads live data, returns 0+ candidate events),
   a severity, a push-content formatter (title/body, given the event + its top
   `diagnoseMiss()`-style cause), and a target-role list (`['gm','area_supervisor','do']` for
   Movers). This keeps Movers' actual logic in its own module (e.g.
   `src/engine/alerts/movers-alert.js`) rather than hand-coding movers-specific branches into a
   shared runner.
2. **One generic table, not one per type**: `alert_events` — `(id, alert_type, loc, severity,
   event_date, payload jsonb, created_at)` — and `alert_deliveries` — `(id, alert_event_id,
   user_id, channel, sent_at)` to dedupe (never re-push the same event to the same user) and to
   give a per-user delivery log for free, reusable by any future alert type.
3. **One generic runner** (new GitHub Action, same `sage-run.mjs`-style cron pattern but
   triggered on occurrence — i.e. right after the DAR pull workflow completes, not on its own
   independent schedule): loop every registered alert type's evaluator → write new `alert_events`
   rows (skip if an identical one already exists for that loc/date/type) → resolve each event's
   target users via its type's role list + `accessible_locs` → push via the existing
   `webpush-notify.mjs`/`app-notification-delivery.mjs` (unchanged) → log each send to
   `alert_deliveries`.
4. **Movers' own evaluator** applies this doc's measured thresholds (CRIT: 1 day ≤ -25%; WARN:
   3+ consecutive days ≤ -20%/-25%) against `qsr_daily_activity_rollup`'s freshest day per store,
   and formats its push body as `"{store}: {severity} sales decline — {topCause}"` using
   `why.js`'s `diagnoseMiss()` for the cause.
5. Tap-through from the notification opens the store's Why Engine / Recommendation Ledger view
   for full detail — not duplicated into the push body itself.
6. Ship Movers CRIT/WARN-down only for v1 (per this doc's up-swing finding) — the framework's
   generality is in the plumbing, not in shipping multiple alert types at once.

## SHIPPED (2026-11-07, v5.681) — exactly per the decisions above, two real adjustments

Built the same session the decisions were made. Reused `app_notifications` (shipped 2026-10-12)
as the generic alerting substrate rather than building a second one — it was already designed
for exactly this ("the NEXT notification-producing feature... plugs into" per its own header),
Movers is simply its first real producer. No new generic tables were needed.

- **`src/engine/movers-alert.js`** (new, pure) — `evaluateMoversAlert(series)` implements the
  measured table exactly (CRIT single-day ≤-25%; WARN 3+ consecutive days ≤-20%; CRIT wins if
  both would fire the same day). `buildMoversAlertContent()` builds the push title/body.
- **`scripts/movers-alert-run.mjs`** (new) — reads `qsr_daily_activity_rollup` directly
  (service-role), computes salesVsLYPct per store/day with the same guard `moversStrip`/
  `lib/supabase.js`'s `_yoyPct` use, dedupes against existing `app_notifications` rows via
  `(type, resolve_key)` before ever inserting (never re-fires the same store/day twice), and
  calls `deliverAppNotification()` for each new alert.
- **`.github/workflows/movers-alert-run.yml`** (new) — `workflow_run` trigger on "QSRSoft Daily
  Activity Pull" completing, matching the owner's on-occurrence decision. Deliberately NOT added
  to `sync-failure-watch.yml`'s watched list — that watcher's own test
  (`sync-failure-watch.test.js`) scopes its "is this a real workflow" check to cron-triggered
  workflows specifically, and this one has no cron (reactive-only). Noted in the workflow's own
  header so this isn't mistaken for an oversight later.
- **Real adjustment #1 — "general alerting system" meant extending `app_notifications`, not
  building a parallel generic framework.** The owner's decision was to build the general
  mechanism now rather than Movers-only plumbing; `app_notifications` already *was* that general
  mechanism (demonstrated with a synthetic type in its own test suite, never given a second real
  producer before this). Building a second parallel system alongside it would have been the
  wrong kind of "general."
- **Real adjustment #2 — push content uses `swing-detect.js`'s `classify()`, not
  `why.js`'s `diagnoseMiss()`.** The owner asked for "top cause" in the push body; `diagnoseMiss()`
  needs the browser app's full in-memory `ds` dataset object (built from many client-side
  loaders over time) and cannot run from a Node pull script without replicating that whole
  aggregation server-side. `swing-detect.js`'s `classify(pct, guestPct)` is a pure, already-
  existing function doing the same sales-vs-guest-count relationship classification (traffic
  loss / check-mix / check erosion) the swing alarm already uses at weekly grain — reused here at
  daily grain instead of built new, per this repo's own "check whether a helper exists" rule.
  Full Why Engine detail stays reachable by tapping through to the app, as the owner's own
  decision specified.
- **New capability, not previously modeled anywhere in this app**: role/store-targeted push
  delivery. Every push notification shipped before this (dispatch #211/#215/#216's own code
  comments say so explicitly) broadcasts to every subscribed device. Added a `target_roles`
  column to `app_notifications` (nullable — null preserves the exact existing broadcast
  behavior for every other producer) and taught `scripts/lib/app-notification-delivery.mjs`'s
  `deliverAppNotification()` to resolve recipients by `profiles.role` + `profiles.accessible_locs`
  when a row sets it (`profiles.accessible_locs == null` = unrestricted, same convention every
  other RLS/access check in this repo already uses).
- **Owner action required**: run the new `target_roles` column migration in
  `supabase/schema-app-notifications.sql`'s block 3 (idempotent `alter table add column if not
  exists` — safe to run even though the rest of that file was already run before). DDL is never
  an agent's own action.
- Verified: `npm run build` clean, within payload budget; full suite passing (new tests:
  `movers-alert.test.js`, `movers-alert-run.test.js`, plus 3 new cases in
  `app-notification-delivery.test.js` for the role/store-targeting path).
