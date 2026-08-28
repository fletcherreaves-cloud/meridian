# Dispatch #187 — SAGE conversation cross-device persistence

## Context — a real, long-standing gap, and the infra to close it already exists

`memory/project-sage.md`'s own "Enhancement ideas (deferred)" list has carried "Conversation
memory across sessions" since SAGE shipped. CLAUDE.md's SAGE section still lists "Cross-device
session memory and conversation retention" under Vision/future enhancements. Neither is done.

**What SAGE has today** (`src/views/sage.js`): the active thread (`SAGE_THREAD_KEY`) and up to 25
archived past conversations (`SAGE_SESSIONS_KEY`) are `localStorage`-only — device-local, and
per-origin (a session started on one device/browser is invisible everywhere else). That's the
gap. **What already exists to close it**: `saveUserSetting(key, value)` /
`loadUserSetting(key)` (`src/lib/supabase.js:3073`) — a generic per-user cloud JSON-blob store,
already backed by a live `user_settings` table + RLS (confirmed shipped and working since
2026-08-09, used today for `model_assignments`, `mf_bt_summary`, `mf_period_scoreboard`,
`dialed_in`, per CLAUDE.md's Dev Rules section). **This dispatch needs zero new Supabase schema**
— reuse the existing table, don't reinvent (CLAUDE.md's "check whether a helper exists before
writing one").

Two existing hydration patterns to choose from, both in `App.js`, and they're NOT
interchangeable — pick the right one for the reason each was built that way:
- `_stModelAssignments` (~line 1670): unconditional cloud-wins, no timestamp. Fine for a blob
  that's only ever written by an explicit user action (Apply Winners, manual override).
- `_stDialedIn` (~line 1683): **`{data, savedAt}`-wrapped, cloud wins ONLY if strictly newer**
  than local. Built specifically because a long-running local operation (Calibrate All, writing
  incrementally) must survive a stale cloud hydration landing mid-run, and a fresher local write
  must not be clobbered by older cloud data either.

**A live SAGE conversation is the `_stDialedIn` case, not the `_stModelAssignments` case** — a
user actively chatting on one device must never have their in-progress thread stomped by a stale
cloud read from a different, older session. Use the `{data, savedAt}`-guarded pattern.

## Task

1. Wrap both `SAGE_THREAD_KEY` (active thread) and `SAGE_SESSIONS_KEY` (archived sessions) writes
   in a `{data, savedAt}` envelope, mirroring `mf_dialed_in`'s convention (check whether a shared
   normalize/wrap helper already exists generically before writing a SAGE-specific one — `App.js`'s
   `_normalizeDialedIn` may be local to that one blob; if so a small SAGE-local equivalent is fine,
   don't force a shared abstraction for two call sites).
2. Push to `user_settings` (`saveUserSetting('sage_thread', ...)` / `saveUserSetting('sage_sessions', ...)`)
   at natural settle points — **not on every stream chunk**. Reasonable settle points: when a
   message finishes streaming (`streaming` transitions from true→false), on archive-to-history
   (existing action, ~line 1210), and on session switch/clear. Debounce if needed (check for an
   existing debounce helper in `App.js` — `useDebounce` — before writing a new one) so a fast
   back-and-forth conversation doesn't hammer Supabase with a write per turn.
3. Hydrate on SAGE panel mount (not app-wide startup — SAGE is already lazy-loaded and its data is
   heavier/less universally needed than `dialed_in`/`model_assignments`, so pulling it in on every
   app boot for every user is unjustified weight). Cloud wins only if `savedAt` is strictly newer
   than the local copy's, matching `_stDialedIn`'s guard exactly. `localStorage` stays the instant
   read path (existing behavior, unchanged) — this is additive, not a replacement.
4. **Measure payload size before shipping** — 25 archived sessions of potentially long
   conversations could be a genuinely large JSON blob. Report the real size of a representative
   heavy user's current `SAGE_SESSIONS_KEY` localStorage value (yours, or a synthetic
   equivalent-scale one) in the PR body. If it's large enough to be a real concern (say, multiple
   hundred KB), propose a bound (e.g. cap total content length, not just session count) rather than
   shipping unbounded — but don't add a cap if the measured size doesn't warrant one.
5. Do not change SAGE's actual chat/streaming behavior, system prompt, or tool-use logic — this is
   persistence-layer only.

## Verification

- A real cross-device check: save a thread, confirm it lands in `user_settings` via a live query
  (name credential/method per "measure it, don't reason about it"), simulate a second "device" (a
  fresh localStorage / different browser profile / incognito against the same login) and confirm
  it hydrates.
- Confirm the `savedAt` guard actually protects an in-progress conversation — write a test that
  simulates a stale cloud value arriving after a newer local write and asserts local wins (mirror
  how `_stDialedIn`'s own guard is tested, if it has a test; if not, this is still worth a direct
  unit test given the whole point of this dispatch is not clobbering an active conversation).
- Standard suite + build. Version bump per CLAUDE.md convention (check current version on
  `origin/main` first — several dispatches may have landed today already).

## Out of scope

- Any change to SAGE's model, system prompt, tool-use, or streaming UI.
- A shared/generalized "cloud-synced localStorage" abstraction — two call sites (this + dialed-in
  + model-assignments) don't yet justify one; note it as a future refactor candidate if it becomes
  obviously repetitive, don't build it now.
- Multi-tenant or admin-visible conversation history — this is purely the same user's own
  conversations following them across their own devices.
