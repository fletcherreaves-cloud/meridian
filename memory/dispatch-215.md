# Dispatch #215 — EOM roll-up digest (Patch/Org/District) + FOB targets alongside components

## Sequencing — do NOT start until dispatch #213 is merged to `main`

#213 (item name+WRIN, KB links, FOB+components section, freshness gate) is actively touching
`scripts/qsrsoft-onhand-pull.mjs` and `scripts/lib/resend-notify.mjs` as this doc is written. This
dispatch builds directly on #213's FOB-section work (same target-alongside-components idea, one
level up the org chart) and mostly adds NEW files, but reuses those two enough that starting before
#213 lands risks a real merge conflict, not just a stylistic one. **Branch from `main` only after
#213 is confirmed merged.**

## Context — two owner requests, one natural pairing

Live owner feedback right after seeing the EOM notification + FOB work (2026-08-29): *"I think a
great segue with this newly implemented idea would be to roll up the stores by patch and operator
and organization levels to get either timed emails sent out (we can test through my email for now)
and also report ability inside the panel to generate this on demand so it could be sent out so
those leaders see what they need to see and can react quicker."* Plus: *"I also think being able to
put targets alongside the fob and components would make this amazing."*

These pair naturally: a roll-up digest is the SAME per-store completion/FOB data #213 already
computes, aggregated up the org chart, with the same "show the number and the target" upgrade
applied at every level, not just the single-store email.

## Task 1 — FOB targets alongside components (extends #213's just-merged FOB section)

**Don't invent a new target source — reuse the exact resolution `computeFoodCostHeadline()` already
uses** (`src/views/store-cockpit.js`): `target: t.tFOBTarget` (headline FOB% target) and
`compTarget: { statv: t.tStatLoss, comp: t.tCompWaste, raw: t.tRawWaste, cond: t.tCondiment, emp:
t.tEmpFood, unex: t.tUnex }` where `t` is the store's target object. This is the SAME shape
`buildStoreFobReport()` (`src/engine/fob-report.js`) already consumes and already renders
gap/over-target/topDriver from — don't duplicate that math in the notification path, call
`buildStoreFobReport()` (or extract just the `comps`/`overTarget`/`gapPP`/`topDriver` piece it
already computes) instead of a third hand-rolled version.

**The `t` object itself** — in the browser this is `DEFAULT_TARGETS[loc]` merged with any live
override (`settings.targets[loc]`, Supabase `monthly_targets`/`user_settings`). `scripts/qsrsoft-
onhand-pull.mjs` (a Node script) does NOT currently load any of this — you'll need a real source for
it there. `DEFAULT_TARGETS` itself is plain data, exported from `src/constants.js`, and this script
already imports other constants from that same file (`STORE_NAMES`, `unpadLoc`) — importing
`DEFAULT_TARGETS` the same way is the straightforward path unless a store has a live override in
`monthly_targets` that should win; check `monthly_targets`' schema/read pattern (used elsewhere,
e.g. Projections) before deciding whether this dispatch needs to query it too or whether
`DEFAULT_TARGETS[loc]` alone is an acceptable v1 (state your choice and why in the PR body either
way — this is a real judgment call, not a mechanical lookup).

Extend `resend-notify.mjs`'s FOB section (added by #213) to show each component's actual vs.
target, and the headline FOB% vs. target — matching `fob-report.js`'s own `pp()`/`money()`
formatting, not a new format.

## Task 2 — Roll-up digest engine (new, `src/engine/eom-digest.js`, pure + reused by both consumers)

One function, something like `buildEomDigest(storeRows, { level, groupBy })` — takes the same
per-store shape #213's notification already builds (count-class completion, FOB+targets from Task
1, any fired-notification/uncounted-item risk) across the stores in scope, and rolls it up to:
- **Patch** — group by the LIVE supervisor assignment, `supervisorGroups()`/`supervisorOf(loc)`
  from `src/constants.js`. **Do NOT use the static `INV_ORG_COORDS[loc].sup` seed** — that file's
  own comment (near `INV_ORG_COORDS`) explicitly warns it's stale/seed-only and the live timeline
  (`whoRan`/`orgAssignments`/`supervisorGroups`) is the real answer. **This live state is populated
  client-side at app startup (`setLiveSupervisorGroups`/`setLiveAssignments`, called from `App.js`)
  and will NOT be populated in a bare Node script** — `scripts/eom-digest-send.mjs` (Task 3) needs
  to either fetch the same live-assignment source these setters are fed from (find it — likely a
  Supabase table read during `App.js` startup, check there before assuming) and call
  `setLiveAssignments()`/`setLiveSupervisorGroups()` itself before calling `supervisorGroups()`, or
  this whole grouping silently falls back to the stale seed. Verify which one your script actually
  gets — don't assume the import "just works" the same in Node as in the browser.
- **Org** — `getStoreOrg(loc)` from `src/constants.js` (`'emerald'`=FL, `'mcdok'`=OK — already
  canonical per this repo's org-mapping fix, don't re-derive).
- **District / overall** — everything, one row.

Each roll-up row: store count, per-class completion breakdown (how many stores complete/in-
progress/not-started per class), stores with an open uncounted-item risk (dollar total), and — per
Task 1 — a FOB-vs-target read at the aggregate level (e.g. avg gap, count of stores over target,
worst offenders) so a Supervisor or DO sees the same "number + decision" read the single-store email
gives, one level up. Say the decision, not just the numbers (matches this repo's standing "say the
number and the decision" UI-voice rule) — e.g. "Patch P1: 4/6 stores Food+Cond complete, Ardmore and
Sulphur still open — 2 days left."

Unit tests with synthetic multi-store fixtures: patch grouping, org grouping, a store with no
supervisor assignment (shouldn't crash / should land somewhere sane, not silently vanish from every
roll-up), a store over FOB target vs. under.

## Task 3 — Scheduled + on-demand send (new `scripts/eom-digest-send.mjs`, reusing `resend-notify.mjs`)

- New Node script: loads the relevant store data (same tables the onhand-pull script already reads
  — `eom_count_status`, `eom_count_progress_log`, `qsr_fob`), calls `buildEomDigest()` for each
  level the owner wants (at minimum: district-wide + every patch — org-level optional first pass,
  your call), and sends ONE email per level via a new `sendDigestEmail(digest, level)` in
  `resend-notify.mjs` (or a sibling lib file if that keeps things cleaner — your call, matching how
  #211 organized `sendEmailNotification`/`sendSmsViaCarrierGateway`).
- **Recipient, for now: `fletcher.reaves@mcreaves.com` for every level**, regardless of whose patch/
  org it is — matches the owner's own "we can test through my email for now" and Resend's existing
  sandbox-sender restriction (can only deliver to the account's own address until the domain is
  verified — no new blocker here, it already applies to #211's sends). **Structure the send call so
  swapping in a real per-role recipient later is a config change** (e.g. a `recipientFor(level,
  groupKey)` function that currently always returns the owner's email) **not a rewrite** — the
  owner's own phrasing ("so those leaders see what they need to see") makes real per-role delivery
  an explicit future intent, don't paint that into a corner.
- New workflow `.github/workflows/eom-digest-send.yml`: `workflow_dispatch` (for on-demand, Task 4)
  **and** a `schedule:` cron for the timed send. **Cadence — the owner said "timed emails" without
  specifying a schedule; default to once daily at 6pm CT (23:00 UTC) during the active count window
  (reuse `scripts/lib/count-window.mjs`'s `inCountWindow()` the same way `qsrsoft-onhand-pull.mjs`
  already gates its own run), and say clearly in the PR body that this is a starting guess the owner
  can retune** — don't leave the cadence undocumented or buried in a cron string with no
  explanation.
- Add to `sync-failure-watch.yml`'s watched list per this repo's standing new-automated-workflow
  rule — though note this one is a SEND, not a data pull, so "staleness" doesn't quite apply the same
  way; use judgment on whether that rule's spirit (something should notice if this silently stops
  running) still applies here, and say what you did either way.

## Task 4 — On-demand "Generate Report" in the panel

**Reuse the existing on-demand-pull mechanism, don't build a second one.** Data Manager's sync
buttons already call the `trigger-dar-sync` Edge Function (`supabase/functions/trigger-dar-sync/
index.ts`), which holds an allowlist `WORKFLOWS` map of `{file, inputs, label}` and dispatches the
named GitHub Actions workflow via `workflow_dispatch`, authenticated by a Supabase session (not a
client-side GitHub token). Add one entry: `digest: { file: 'eom-digest-send.yml', label: 'EOM
Digest Report', inputs: { level: '', debug: '0' } }` (or whatever inputs Task 3's workflow actually
declares — keep them in sync). This needs `supabase functions deploy trigger-dar-sync` after the
edit — flag that in the PR body as a post-merge step, same as every Edge Function change in this
repo.

In the EOM Dashboard panel (`src/views/eom-dashboard.js`) or wherever fits best per the panel-
contract check: add a "📧 Generate Report" affordance that (a) calls `buildEomDigest()` client-side
and renders the roll-up **inline in the panel immediately** — this doesn't need the Edge Function at
all, it's the same pure function from Task 2 called with data already in `ds` — so a leader sees the
roll-up without waiting on email, and (b) a separate explicit action to actually SEND it (via the
`trigger-dar-sync` call above), so "view it" and "email it" are two clearly different actions, not
one button that silently does both. `LocationSelector`/scope picker per the panel-contract standing
rule, so a Supervisor can view/send just their own patch.

## Verification

- Unit tests per Task 2's engine (patch/org/district grouping, unassigned-store handling, FOB-vs-
  target aggregation) — synthetic fixtures, not just a happy path.
- Unit tests (mocked fetch) for Task 3's send functions, matching #211's own testing pattern for
  `resend-notify.mjs`.
- A real live measurement: confirm `supervisorGroups()`/`getStoreOrg()` actually group a handful of
  real store locs the way you'd expect by hand-checking a few against `CLAUDE.md`'s own store list
  (Organization Context section) — don't trust the grouping logic without checking real output.
- Panel-contract check on whatever panel Task 4 lands in.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Real per-role recipient delivery (routing a Supervisor's digest to that Supervisor's own email) —
  blocked on Resend domain verification (owner's own pending action) AND on real per-user contact
  info existing anywhere in this app (it doesn't yet). Task 3 structures for it, doesn't build it.
- Any change to `buildStoreFobReport()`'s or `computeFoodCostHeadline()`'s math — reuse as-is.
- SMS digest — email only, per the owner's own framing this time ("timed emails", "sent out"); no
  SMS mention for this feature (unlike #211's per-store notification, which explicitly wanted both).
- A UI settings screen for cadence/recipients — hardcode the Task 3 defaults, make them config-
  shaped (constants/env, not deeply buried), not a full admin UI, for this first slice.
