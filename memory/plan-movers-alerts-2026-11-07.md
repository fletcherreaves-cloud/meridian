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

## Open product-judgment questions — NOT decided here, owner's call

Per this project's own standing rule (CLAUDE.md "Dev Rules" — a change whose scope or product
behavior is a judgment call is never applied unattended), these four are specifically called out
by task #91 itself and are not something to resolve by guessing:

1. **Audience/role targeting** — which roles get which store's alerts. The RBAC/`accessible_locs`
   model already scopes data access; does every role with access to a store get its Movers alert,
   or should this default to GM/AS/DO (the roles who can actually act on it) with everyone else
   opt-in?
2. **"On occurrence" vs "on a schedule," or both** — occurrence-based (fire the moment a day's
   DAR pull confirms a CRIT/WARN day) is more timely; schedule-based (e.g. once each morning) is
   calmer and matches the existing `sage-run.mjs` precedent most directly. Could also be CRIT=
   occurrence, WARN=next scheduled digest.
3. **Push content** — title/body length limits mean the notification itself can carry at most a
   one-line summary (store name + the swing + maybe the single top `diagnoseMiss()` cause);
   everything else (full Why Engine causes, suggested remedy, ledger tracking) lives behind a
   tap-through into the app. Exact copy/format is a product call, not a data one.
4. **Scope of the mechanism** — does this stay a Movers-specific notification type, or does it
   become the first instance of a more general alerting system (the owner's own framing — "could
   see this becoming a major part of our app" — suggests the latter is worth considering
   up front, even if only Movers ships first, so the plumbing doesn't need a rewrite later).

## Recommended next step when this is picked up for real

1. Owner answers the four questions above (or defers them with a stated default to start with).
2. Build the trigger as a scheduled check (reusing the `sage-run.mjs` cron pattern) that reads
   `qsr_daily_activity_rollup`'s freshest day per store, applies the thresholds in the table
   above, and writes a result row (new table, e.g. `movers_alerts_sent`, to avoid re-firing the
   same event every run).
3. Wire the three existing pieces (push-send, `diagnoseMiss()`, Recommendation Ledger) rather
   than building new versions of any of them.
4. Ship CRIT/WARN-down only for v1, per the finding above — revisit up-swings only if a genuinely
   different, more targeted signal is found later (e.g. a sudden day-over-day jump rather than a
   sustained level, which this measurement did not test).
