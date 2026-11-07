# Projection/Targets Ownership + Cross-User Awareness (2026-11-07)

## Owner's ask (verbatim intent)

> "we need to figure out a way in settings to designate someone while allowing other people to be
> added as well to be in charge of projections for an organization as that should not be spread
> across all roles... let's come up with a way to have an event log so that if one user logged in
> and makes changes to projections and another user follows up and logged in, they're notified
> that the first user has already done certain things so that they don't double up on them...
> There may be other panels that we need to treat the same way."

Clarified in follow-up turns:
- Initial owner list: just the owner (Fletcher) for now, with room to add others later.
- Default baseline: **DO/VP and above** — "safe to assign to DO/VP and above... with option to
  grant access from those role levels to another user if the need arose based on a different
  organization."
- Scope: **Smart Targets' "Apply as Official" and the Monthly/Yearly Targets editors are "the
  same zone"** as Projections lock/edit — one capability gates all four write actions.

## The real bug this surfaced

`locked_projections` was stored via `saveUserSetting`/`loadUserSetting` against the
`user_settings` table, whose primary key is `(user_id, key)` — **per login, not per org**. Two
different real user accounts would silently fork into two disconnected copies of "the truth"
instead of sharing one. This was a correctness bug independent of the ownership/notification ask,
not just a double-work risk.

**Fix:** moved `locked_projections` to `org_config` (`src/lib/supabase.js`'s new
`saveOrgConfig`/`loadOrgConfig`), the SAME shared, tenant-wide blob table `org_roles`/
`app_settings`/`store_registry`/`contact_registry`/`app_user_targets` already use. Zero new
schema for this half — just a storage-location fix, reusing an existing mechanism per CLAUDE.md's
"check whether a helper exists before writing one" rule. Also fixed lock-entry attribution: `by`
used to read `settings.dmName` (free-text settings value); it now reads the real authenticated
user's name.

## Design

1. **`projections.own` permission key** (`src/engine/permissions.js`) — `true` for
   admin/owner/vp/do, `false` for every other role. Governs: Projections lock (week + month +
   approve), Smart Targets "Apply as Official", Monthly Targets saves, Yearly Targets saves.
2. **`panel_owner_grants` table** (`supabase/schema-panel-ownership-2026-11-07.sql`, owner must
   run) — named delegation on top of the role baseline. `panel_id` is a zone string (`'projections'`
   covers all four write surfaces above, matching the owner's "same zone" framing), not a literal
   panel-registry id — a future zone that should be treated the same way gets its own `panel_id`
   value, not a schema change. RLS lets any signed-in user read the active grant list (it gates UI
   client-side) but only an existing owner (role baseline or an active grant) may insert/update one,
   so a non-owner can never self-grant.
3. **`canOwnPanel()` / `ownerNotificationTargets()`** (`src/engine/panel-ownership.js`) — pure,
   Supabase-free, unit-tested (`src/__tests__/panel-ownership.test.js`). `canOwnPanel` is the gate
   (role baseline OR an active, non-revoked grant for that user+panel_id). `ownerNotificationTargets`
   answers "who gets told" — always the 4 baseline roles, plus any active grantee's user id (minus
   the actor), de-duplicated.
4. **Cross-user notice** (`notifyPanelOwners()` in `src/lib/supabase.js`) — reuses the EXISTING
   `app_notifications` general framework (built for Movers Alerts), not a parallel mechanism. Fires
   one row on every gated write (Projections lock/approve/month-lock, Smart Targets apply, Monthly/
   Yearly Targets saves), targeted via `target_roles` (existing column) + the new
   `target_user_ids uuid[]` column (same additive pattern `target_roles` itself used — NULL preserves
   every existing producer's behavior unchanged). In-app only by default (`notify_push`/
   `notify_email` both false) — the ask was "notice," not a phone alert for every target edit.
5. **Owners grant-management UI** — a new "Projections & Targets Owners" tab in the existing
   `AdminPanel` (`src/views/admin.js`'s `OwnersTab`), visible only to someone who already holds the
   role baseline. Add/revoke a named grantee against `panel_owner_grants`.

## What's gated, and how

| Write surface | File | Gate point |
|---|---|---|
| Projections week-lock (`lockRow`, `showLockFor`, `lockAllStores`, `lockByPatch`) | `src/features/projections.js` | Early-return in each function + disabled Lock/Lock-All/Lock-by-Patch buttons |
| Projections approve (`approveRow`) | `src/features/projections.js` | Early-return + disabled button |
| Projections month-lock/refresh (`showMonthLockFor`) | `src/features/projections.js` | Early-return + disabled Lock/Refresh Month buttons |
| Smart Targets "Apply as Official" (`applyOfficial`) | `src/views/smart-targets.js` | Early-return + disabled per-store and bulk Apply buttons |
| Monthly Targets inline edit (`handleSaveProjField` / `EditableProjCell`) | `src/views/analytics.js` | Cell click-to-edit disabled + defensive early-return |
| Yearly Targets inline edit (`handleSaveField` / `EditableTargetCell`) | `src/views/yearly-projections.js` | Cell click-to-edit disabled + defensive early-return |

All four live under the **Planning hub** (`PlanningHubPanel` in `src/app/App.js`), which is the
ONLY real render path for `SmartTargetsPanel`/`MonthlyProjectionsPanel`/`YearlyProjectionsPanel` —
confirmed via grep before relying on `common` to carry the new props through. `canOwnProjections`/
`userId`/`userName`/`projOwnerGrants`/`onNotifyOwners` are computed once in `App.js` (role from
`effectiveRole`, so the existing view-as-role sandbox correctly previews a lower role's own
restricted access) and threaded down.

## Owner action required

Run `supabase/schema-panel-ownership-2026-11-07.sql` in the Supabase SQL editor (DDL — never an
agent's own action). Until then, `loadPanelOwnerGrants`/`grantPanelOwnership`/
`revokePanelOwnership` fail soft (console warning, empty grant list) — the role baseline
(admin/owner/vp/do) still works with zero dependency on this migration; only the NAMED-grant
delegation path needs it.

## Deliberately out of scope for this pass

- Per-zone granularity (separate `panel_id`s for Projections vs. Smart Targets vs. Monthly vs.
  Yearly) — the owner explicitly said "same zone," so one capability gates all four.
- Migrating the existing `LockHistoryPanel`'s event log off `localStorage`/`mf_projection_log`
  onto a real per-row-attributed table. The owner's "event log" ask is served by the new
  cross-user `app_notifications` row (the actual gap: a SECOND user didn't know what a FIRST user
  already did), not by rebuilding the whole history log's storage. `LockHistoryPanel` remains
  localStorage-backed and device-local, same limitation as before this dispatch — a real
  follow-on if it's worth doing, not bundled in here.
- Push/email delivery for these notices (in-app bell only, by design — see point 4 above).
