# Dispatch #217 — EOM digest settings: configurable levels + send time

## Context — the one item #215 explicitly deferred as "not this first slice"

Dispatch #215 shipped the EOM roll-up digest (district/patch/org rollup, scheduled email + on-
demand panel send) with two things hardcoded: which levels get emailed on the daily schedule
(district + patch, org left as an on-demand-only opt-in) and when (once daily, 6pm CT/23:00 UTC,
explicitly flagged in that dispatch's own workflow comment as "a starting guess, not a locked-in
decision"). #215's own Out of Scope section named the natural next step: *"A UI settings screen
for cadence/recipients — hardcode the Task 3 defaults, make them config-shaped... not a full admin
UI, for this first slice."* This dispatch is that next slice — levels + cadence only, NOT
recipients (real per-role recipient delivery stays blocked on Resend domain verification + this
app having no per-user contact model yet, exactly as #215 left it — don't touch that part).

## Design — `org_config`, not `user_settings`

This is an app-wide setting (which levels get emailed, at what hour), not a per-user preference —
matches `org_config`'s existing role in this app (`supervisorGroups`/`orgAssignments` already live
under `org_config.key = 'app_settings'`, read by `eom-digest-send.mjs`'s own `bootstrapLiveOrg()`
from #215). Use a NEW key, `eom_digest_config`, don't overload `app_settings`:
```
org_config.key = 'eom_digest_config'
org_config.data = { levels: ['district','patch'], sendHourUtc: 23 }
```
`org_config` already has RLS for this (`schema.sql`'s "config: authenticated read" / "config:
admin/supervisor write" policies) — no new migration needed, it's a new KEY in an existing table,
not a new column/table.

## Task 1 — read/write helpers (`src/lib/supabase.js`)

`loadEomDigestConfig()` / `saveEomDigestConfig({levels, sendHourUtc})` — same shape as
`loadUserSetting`/`saveUserSetting` just above the Web Push section in that file, but reading/
writing `org_config` (key `'eom_digest_config'`) instead of `user_settings`. Return a sensible
default (`{levels: ['district','patch'], sendHourUtc: 23}` — today's hardcoded behavior) when no
row exists yet, so a fresh install behaves identically to today until someone actually changes it.

## Task 2 — `scripts/eom-digest-send.mjs` reads the config instead of hardcoding it

- New `loadDigestConfig()` in the script (mirrors `bootstrapLiveOrg()`'s own `org_config` read
  pattern — same file, same query shape, just a different `key`), with the same default fallback
  as Task 1's client-side helper (same literal default value in both places — no drift).
- `levelsToRun()` currently defaults to `['district', 'patch']` when `DIGEST_LEVEL` env var is
  unset — change the default source to the loaded config's `levels` (env var still wins when
  explicitly passed, e.g. the on-demand panel send already passes `level` explicitly via
  `trigger-dar-sync`'s `digest` workflow entry — that path is untouched, it already bypasses this
  default).
- **Cadence**: `.github/workflows/eom-digest-send.yml`'s cron changes from `0 23 * * *` (fixed
  6pm CT, once daily) to hourly (`0 * * * *`) — the SCRIPT now self-gates on whether the current
  UTC hour matches the configured `sendHourUtc`, the same way `qsrsoft-onhand-pull.mjs` already
  self-gates on `inCountWindow()`/`inCtBusinessHours()` rather than relying on cron granularity
  alone. `DIGEST_FORCE=1` (already exists, used by the on-demand panel path) bypasses BOTH the
  existing count-window gate AND this new hour gate — an on-demand click must never be blocked by
  "it's not the configured hour yet." Running hourly instead of once daily costs nothing extra in
  practice (the hour check makes 23 of 24 runs immediately no-op) but is what actually makes the
  configured hour meaningful without a second YAML edit every time someone changes it.

## Task 3 — settings UI (in the existing EOM Digest modal, `src/views/eom-dashboard.js`)

Small, inline — not a separate settings screen/panel. In the digest modal #215 already built
(search for `digestOpen`/the `📧 EOM Digest` `ModalShell`), add a compact "⚙️ Scheduled send"
row: checkboxes for District / Patch / Market (which levels the DAILY email includes — independent
of whatever level the user is currently VIEWING in the modal, don't conflate the two), and an hour
picker (label it in CT for readability since that's the owner's own timezone context throughout
this feature, e.g. "6:00 PM CT" — store as UTC via `sendHourUtc`, same CT↔UTC handling this repo's
cron comments already do manually; don't need DST-aware conversion precision beyond what a single
hour dropdown reasonably implies). Save via Task 1's `saveEomDigestConfig()`. Load current config
on modal open so the fields reflect the real stored value, not silently reset to defaults.

## Verification

- Unit tests: `loadEomDigestConfig()`/`saveEomDigestConfig()` (mocked supabase) — default when no
  row, round-trip when one exists.
- Unit tests: `eom-digest-send.mjs`'s `levelsToRun()` now sourcing from the loaded config,
  `DIGEST_LEVEL` env var still overriding it when set (explicit on-demand level pass-through
  unaffected — write a test proving the on-demand path still works exactly as before).
- Unit test: the new hour-gate — matching hour proceeds, non-matching hour no-ops (unless
  `DIGEST_FORCE=1`), mirroring how `inCountWindow()`'s own force-override is already tested.
  Real timestamp fixtures, not just booleans.
- Panel-contract check on the new settings row (it's inline in an existing `ModalShell`-based
  modal, not a new panel — confirm it doesn't need its own close affordance/LocationSelector
  since it's not a standalone panel).
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Real per-role recipient delivery — unchanged from #215's own out-of-scope, still blocked on
  Resend domain verification + no per-user contact model.
- Per-level recipient overrides (e.g. "Market digest goes to a different address than District") —
  not asked for, don't build it speculatively.
- Sub-hour cadence granularity (e.g. "every 4 hours") — a single daily hour is what's being made
  configurable, not a general cron-builder UI.
- Any change to `buildEomDigest()`'s roll-up math or `sendDigestEmail()`'s content — reuse as-is.
