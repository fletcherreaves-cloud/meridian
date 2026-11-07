# Game Plan — the new front-facing GM/SM/AM/DM home screen (2026-11-07)

## Where this came from

Owner asked for a freelance, no-limits exploration of what role-based home screens could look
like ("Four Decks" — published as a private Artifact, four mockups: The Bridge/Owner-VP-Admin,
The Patch/DO-OM, Today's Game Plan/GM, Shift Scoreboard/SM-AM-DM). Owner's verdict: *"I like the
GM deck best — build that one for real... create a new set of main overlay. Keep the other
intact and make it optional for users, but make this the front facing version."*

So: Game Plan ships as a NEW default for store-altitude roles, the existing Checklist/Bullets/
Narrative experience stays fully intact and one click away, never removed or demoted.

## What it's built on

NOT a new data engine. `CuratedHomePanel` (task #92/#106) already computes `items`/`summary` via
`buildCuratedHomeItems()` (`src/engine/curated-home.js`, itself layered on
`computeMorningBrief()`) — Game Plan is a 4th presentation of those exact same facts, plus one
real addition: a trailing-week sales trend + a matched-day vs-LY "win" read
(`src/engine/game-plan.js`'s `computeGamePlanWeek()`), sourced through the SAME shared auto-first
resolvers (`metricSeries`, `autoFirstDaily`) every other panel in this app uses — never a second,
independently-derived read of raw rows.

**Every number on screen is real or it doesn't render:**
- Zero flagged items → an honest "nothing flagged today" card (never an invented problem).
- A win card only shows when trailing-week vs-LY is a REAL, clearly-positive comparison
  (`WIN_VS_LY_FLOOR_PCT = 3`) — a flat or negative week gets no celebration, by design.
- The week-so-far trend covers the trailing 7 **closed business days** ending at
  `lastClosedBusinessDay()`, not a calendar week ending at "now" — CLAUDE.md's own 4am-ABC
  business-day rule flags an in-progress day as structurally incomplete
  (`qsr_daily_activity_rollup` zero-fills hours that haven't happened yet), so it's excluded from
  the trend entirely rather than plotted half-filled next to closed days.
- A day with no plan data gets a null pct, never a fabricated percentage.
- "Three actions" (`gamePlanActions()`) caps at the top 3 real flagged items and never pads with
  invented advice when fewer exist.

## Default + opt-out mechanics

- `FORMATS` gained `'gameplan'` (first in the list); `STORE_ONLY_FORMATS` hides it from the
  format picker entirely at patch/district altitude — it's a one-store-one-day framing, it has no
  meaning for a multi-store pattern item.
- Default format is `'gameplan'` at store altitude, `'checklist'` otherwise — but ONLY for a
  caller with no saved preference at all. An existing saved `curated_home_format` (local or
  cloud) is NEVER overridden, same "don't retroactively change existing users' settings"
  convention this app already used for the notification-consent screen and the onboarding tour.
- The format picker is ALWAYS visible (small, top-right) even on the Game Plan screen itself, so
  switching back to Checklist/Bullets/Narrative is always one click — "keep the other intact and
  make it optional for users." Game Plan also carries its own "See everything flagged →" link
  that does the same thing, for anyone who doesn't notice the picker.

## Files

- `src/engine/game-plan.js` (new) — `computeGamePlanWeek()`, `gamePlanActions()`,
  `WIN_VS_LY_FLOOR_PCT`. Pure, Supabase-free, unit-tested (`src/__tests__/game-plan.test.js`).
- `src/views/game-plan-view.js` (new) — `GamePlanFormat` component (priority card, week bars,
  actions, win card).
- `src/views/curated-home.js` — `CuratedHomePanel` gained the default-selection logic, the
  `gameplan` branch (full-screen render, bypassing the stat-tiles/severity-bar shell the other
  three formats share), and a `userName` prop (threaded from `App.js`'s existing `userName` state,
  for the greeting).
- Tests: `src/__tests__/game-plan.test.js` (engine), `src/__tests__/curated-home-game-plan.test.js`
  (panel-level: default selection, saved-pref respect, the two hide/switch affordances, the
  all-clear fallback, the win-floor gate). Two pre-existing test files
  (`curated-home-panel.test.js`, `curated-home-phase2-2026-11-07.test.js`) updated to explicitly
  select Checklist before asserting Checklist-specific content, since it's no longer the default
  — what they verify (real content, format switching, drill-through links) is unchanged.

## Deliberately out of scope for this pass

- The Bridge/The Patch/Shift Scoreboard mockups — not built for real yet. Owner reviewing the
  Four Decks gallery; this dispatch only acted on the one verdict already given (GM).
- A real DB-backed per-store "win" history or a broader achievement system — the win card is a
  single live computed read each time, not a tracked streak.
- Mobile-specific layout tuning beyond the existing responsive styles already in this codebase's
  component patterns.
