# Dispatch #65 — run the `api.security` pull from a permitted network origin

**Status:** ready to start. Architecture is settled by measurement; no vendor contact involved.
**Reads:** `memory/dispatch-63.md` (the CORRECTION section) and
`memory/finding-qsrsoft-event-details-endpoint-2026-08-21.md`.

---

## What was measured

`api.security` refuses our requests by **network origin**, not by credential, principal, auth
flow, or request shape — all of which were controlled and eliminated in #63.

| origin | credential | result |
|---|---|---|
| owner's home/office network, browser | owner's SPA token | **200** |
| owner's home/office network, **`curl`, no browser** | same token | **200 + real rows** |
| owner's **mobile carrier** (laptop tethered), `curl` | same token | **200 + real rows** |
| **GitHub Actions** (Azure), real Chromium + real SPA login | Playwright SRP token | **403** |
| **GitHub Actions**, `getFreshToken()` | ID token *and* access token | **403** (byte-identical) |

The owner's browser `sub` hash is `9378eb7a6502` — **identical to ours**. One Cognito principal,
allowed from two consumer networks and denied from a cloud network.

**So the rule is not an allowlist of the owner's specific IPs** — a mobile carrier IP the vendor
has never seen also works. It is a **block on datacenter/cloud ranges**. `api.reports` is
unaffected (every existing pull runs on hosted runners daily), so this is specific to the
security module — unsurprising for one whose routes include `video_provider`.

**⚠️ The vendor is not a participant.** Per the owner (2026-08-22), QSRSoft will not assist and
asking would be counterproductive. Do **not** contact them, and do not reopen the superseded
entitlement request (`memory/finding-qsrsoft-security-entitlement-request-2026-08-22.md`). The
data is the owner's own, accessed with the owner's own credentials, from the owner's own network.

## ✅ HOST DECIDED (owner, 2026-08-22): the Mac mini

`Fletchers-Mac-mini`, on the owner's own network. **Already proven as a permitted origin** — both
`event_details` measurements in this dispatch and in #58 were run from it and returned 200 with
real rows. No hardware to buy, no new network path to validate. The owner will confirm/ensure it
stays powered on.

### 🔴 KNOWN FAILURE, not hypothetical (owner, 2026-08-22)

*"When we left for a week back in July, after a day or so the network disconnected from the Mac
mini."* This exact machine has **already dropped off the network unattended**, on roughly a
one-day timer. It is the primary risk to this dispatch. **The owner is away again next month —
treat that as the validation window and watch it deliberately.**

### 🔴 Detection must NOT depend on the runner — `sync-failure-watch` cannot catch this

**A workflow whose self-hosted runner is offline does not FAIL — it QUEUES.** No failed run, no
failure event, nothing for `sync-failure-watch.yml` to see. It sits pending indefinitely, looking
like nothing is wrong. Relying on failure-watch alone reproduces #171 exactly: a check that runs,
passes, and cannot fail in the case it exists for.

**The alarm must come from the DATA.** Wire the stream into `src/engine/stream-freshness.js`'s
`STREAMS` array so *absence of fresh rows* fires:

```js
{ key: 'securityEvents', label: 'Security events (event_details)',
  dsField: '<the ds field the loader populates>', cadenceDays: 1 },
```

`warnAt = cadence+1`, `critAt = cadence+3`, per-stream not pooled. **Do BOTH:**
`sync-failure-watch.yml` catches a run that starts and fails; `STREAMS` catches a run that never
starts. Neither alone is sufficient. Given FileVault (below), `STREAMS` is the only thing that
will tell anyone the runner is down.

### macOS specifics — get these right or the runner dies quietly

- **Stop it sleeping.** `sudo pmset -a sleep 0 disablesleep 1`, and in System Settings → Energy,
  enable *"Prevent automatic sleeping when the display is off."* A sleeping Mac is the single most
  likely cause of a missed run.
- **Come back after a power cut.** `sudo pmset -a autorestart 1`. Confirm with `pmset -g`.
- **✅ APPLIED AND VERIFIED on the host, 2026-08-22** (`pmset -g`): `SleepDisabled 1`, `sleep 0`,
  `disksleep 0`, `displaysleep 10`, `autorestart 1`, `standby 0`. Also already on by default and
  worth knowing: **`tcpkeepalive 1`** — relevant here, since the runner holds an outbound long-poll
  to GitHub and TCP keepalive is what stops an idle connection being dropped by the router or
  carrier NAT. That may bear on the July disconnect. `womp` was already `1`; nothing was added.
  ⚠️ **Run these one at a time.** Pasting them as a block collides with `sudo`'s password prompt —
  the queued lines get swallowed as password input and silently never run. Authenticate with
  `sudo -v` first, then one command per line. And do not append `# comments`: this shell has
  `interactive_comments` off, so `pmset -g # note` fails with "unhandled argument #".
- **❌ `pmset -a womp 1` does NOT help — do not add it.** "Wake for network access" wakes a Mac on
  an **inbound** packet. A self-hosted runner is the opposite shape: it opens an **outbound**
  long-poll to GitHub and waits. Nothing connects in, so nothing will wake it. On Wi-Fi it is
  weaker still, needing a Bonjour Sleep Proxy most networks lack. `disablesleep` above is the
  actual lever.
- **Ethernet is NOT available** (owner: *"wired not practical at this time, maybe in the future"*),
  so the Wi-Fi drop must be survived and detected rather than designed away. Revisit if wired
  becomes practical — it remains the best single fix.
- **✅ Wi-Fi watchdog, since wired is out.** A `launchd` job every few minutes turns "offline until
  someone notices" into "offline for five minutes":
  ```bash
  IF=en1   # ✅ CONFIRMED 2026-08-22 — see below
  ping -c1 -t5 1.1.1.1 >/dev/null 2>&1 || {
    networksetup -setairportpower "$IF" off; sleep 5; networksetup -setairportpower "$IF" on; }
  ```
  🔴 **The interface is `en1`, NOT `en0`, on this host.** `pmset -g assertions` (2026-08-22) shows
  the MAGICWAKE kernel assertion on **`en1`** (`owner=IOSkywalkNetworkBSDClient`) — on a Mac mini
  with an unused Ethernet port, `en0` is the wired interface and `en1` is Wi-Fi. A watchdog
  hardcoded to `en0` would cycle a dead Ethernet port while Wi-Fi stayed broken, and would look
  like it was working. **✅ Confirmed 2026-08-22** by `networksetup -listallhardwareports`:
  `Hardware Port: Wi-Fi → Device: en1`. Use `en1`; the engineer need not re-check.
  Also visible there: `Hardware Port: Ethernet → Device: en0`. The Mac mini **has** a physical
  Ethernet port, it is simply not cabled today. If a cable run ever becomes practical, `en0` is
  ready and wired remains the best fix for the Wi-Fi drop.
  Pair with a **static DHCP reservation** so it reclaims the same address.
- **Install the runner as a SERVICE, not a terminal session.** From the runner directory:
  `./svc.sh install && ./svc.sh start`. That registers a `launchd` job so it survives logout and
  reboot. A runner started with `./run.sh` in a Terminal window dies the moment the window closes
  or the user logs out — and it will look fine right up until it doesn't.
- **Label it** (e.g. `self-hosted, macOS, qsr-security`) and target that label in the workflow, so
  a future second runner can't accidentally pick up this job.
- **🔴 An unattended reboot WILL leave the runner down — measured, not assumed (2026-08-22).**
  ```
  $ fdesetup status                → FileVault is On.
  $ sysadminctl -autologin status  → Automatic login is disabled because FileVault is enabled.
  ```
  `./svc.sh install` writes a **LaunchAgent** (`~/Library/LaunchAgents/actions.runner.*.plist`),
  which runs in a **user session**. FileVault demands the disk password at boot *before* macOS
  starts, and macOS therefore refuses auto-login outright — so after any unattended reboot the
  machine sits at the unlock screen and **nothing runs at all**. A brief power blip becomes a
  silent outage lasting until someone physically unlocks it.
  **Decision: keep FileVault ON.** This machine holds QSRSoft credentials, and the alternative is
  booting straight to an unlocked desktop. Accept that a reboot needs a human — that is tolerable
  *only* because the data-freshness alarm above is mandatory and will surface it. For *planned*
  reboots, `sudo fdesetup authrestart` unlocks once for the next boot.
  **Do not "fix" this by disabling FileVault.**

- **✅ Instead, stop the unattended reboots — that is the real fix.** FileVault only bites when the
  machine reboots with nobody there, so remove the causes rather than the encryption:
  1. **A UPS.** Cheap, and it eliminates the main cause (power blips). With no unexpected reboots
     the FileVault prompt essentially never fires. Best single purchase for this dispatch.
  2. **Disable automatic macOS updates on this machine.** The sneaky one: macOS will install an
     update and reboot itself overnight, and FileVault then parks it at the unlock screen.
     **✅ CONFIGURED 2026-08-22** (System Settings → General → Software Update → Automatically):
     | setting | state | why |
     |---|---|---|
     | Download new updates when available | **ON** | Downloading never reboots; it just pre-stages so a supervised install is quick. |
     | **Install macOS updates** | **OFF** | 🔴 The one that matters — this is the overnight self-reboot. |
     | Install system data files and security updates | **ON** | Mostly XProtect malware definitions, which install with no reboot. Left ON deliberately: this box holds QSRSoft credentials and the Supabase service-role key, so continuous protection beats the rare Rapid Security Response that may want a restart — and the freshness alarm covers that case. |
     Consider flipping the third to OFF *only* for the duration of a long trip, then back on.
  3. **`sudo fdesetup authrestart`** for *planned* reboots — unlocks once for the next boot only.
  Considered and rejected: disabling FileVault to enable auto-login. That removes the only
  protection on a disk holding QSRSoft credentials and the Supabase service-role key, *and* boots
  to an unlocked desktop, to solve a problem that only occurs on reboot. Physical theft of a Mac
  mini in a home or office is the realistic threat here; a reboot needing a human is not.

⚠️ **Private repo only.** A self-hosted runner executes workflow code on the host machine. This
repo is private with a single trusted contributor, which is exactly the case where this is fine —
but never enable self-hosted runners for public-fork PRs.

## The architecture — self-hosted GitHub Actions runner

Install a GitHub self-hosted runner on an always-on machine on a **consumer connection** at the
owner's home or office (a Mac mini, NUC, spare laptop, or a Pi all qualify — the mobile result
means even an LTE-connected device works). Then:

- the `api.security` workflow gets **`runs-on: self-hosted`**
- **every other workflow stays on hosted runners, unchanged.** Do not migrate the other 24
  scheduled pulls; they work today and moving them adds risk for no benefit.

Why this over the alternatives:

- **It changes almost nothing.** Secrets, logging, `sync-failure-watch.yml`, the retry plumbing
  and the token path all carry over. `getFreshToken()` needs **no change** — it was never the
  problem; a token it minted returns 200 from a permitted origin.
- **Tailscale exit node** (hosted runner egressing through a device at the owner's site) is a
  workable fallback if a persistent runner isn't wanted, but it adds a moving part inside the auth
  path and a tailnet-uptime dependency. Second choice, not first.
- **A local `launchd`/cron script** is a stopgap only: it dies when the machine sleeps and is
  invisible to the failure-watch system, which is exactly the #171 failure mode.

### 🔴 Explicitly rejected

- **Third-party residential-proxy services.** The `event_details` response carries **plaintext
  employee names** (`"crew":"Aaden W — 91"`). Routing that, plus a live credential, through a
  commercial proxy hands both to an unaccountable third party. Not worth it at any price. Own
  hardware on an owned connection, or nothing.
- **A cloud VPS with a static IP.** Almost certainly the same datacenter block. Untested, and
  testable for a few dollars if someone wants certainty, but do not build on it.

## ✅ The pull's SHAPE is now settled (2026-08-22) — it's the simple one

`memory/dispatch-58.md`'s empty-`registers`/`cashiers` question is **answered**. Measured by the
owner from a permitted origin: same store/date/token, `registers:[13]/cashiers:[91,0]` → **38
events**, `registers:[]/cashiers:[]` → **170 events**. Empty means **ALL**.

So: **one request per `(store, date, event_token)` — 27 × 8 = 216/day.** No enumeration stage, no
per-register discovery loop. Sizing: ~170 events / ~70 KB per cell for `all_promo`, so low tens of
thousands of rows/day estate-wide — use the existing pulls' chunked-upsert pattern, not one insert.
Confirm against a second store before assuming that ceiling holds.

**A candidate runner already exists:** the owner ran these measurements from a **Mac mini**
(`Fletchers-Mac-mini`) on the permitted network. If it is always-on, it is the obvious host — no
hardware purchase required.

## Build checklist (the standing new-pull rule, all in one PR)

1. **Watch it** — add the workflow's exact `name:` to `sync-failure-watch.yml`;
   `src/__tests__/sync-failure-watch.test.js` enforces this both ways. A self-hosted runner adds a
   failure mode hosted runners don't have (machine asleep, runner offline), so this matters *more*
   here, not less.
2. **Per-stream staleness**, not pooled — `stream-freshness.js`, per #171.
3. **`qsr_security_events` already exists** (created 2026-08-22, role-gated RLS, `tenant_id`).
   Verified live. No migration needed.
4. **Manual fallback** retained per the auto-first rule.
5. **Two-path auth** matching the existing pulls.

## Constraints

- **Tokenize on ingest.** `crew`/`mgr` arrive as plaintext `"Name — badge"`. They go through
  `get_or_create_employee_token()` into `crew_token`/`mgr_token`; the badge is kept as its own
  column. **No plaintext name in the table, a log, a fixture, or a memory file** — the schema's
  own header says so.
- **Sane cadence** — once or twice daily, matching the existing pulls, with the usual backoff.
  Do not hammer the endpoint; that is ordinary good behaviour toward an API and also keeps the
  runner's traffic looking like what it is.
- **Do not migrate other workflows** to the self-hosted runner.

## Verification bar

- The pull returns **200 and real rows from the self-hosted runner** — with the row count and
  store/date window in the PR body. A 403 from there means the origin assumption is wrong and the
  dispatch stops for a re-measure, not a workaround.
- **A deliberate runner-offline test, alarming via the DATA path.** Stop the runner service, let
  a scheduled run come due, and confirm the stream reads stale in the per-stream freshness check.
  Do not accept "sync-failure-watch would catch it" — a pending job raises no failure at all.
- **An unattended-endurance check.** Leave the Mac untouched over a weekend and confirm the day-2
  and day-3 runs land. One successful run proves nothing about a failure mode this machine has
  already shown. The owner is away next month — that is the real test. The register-audit pull's
  *"✗ zero rows saved … a quiet no-op, not a success"* is the pattern to copy.
- No plaintext name anywhere in the diff, logs, or test fixtures.
- `npm run build` clean; **check `node -v` against `ci.yml`'s `[20, 22]`** before trusting a local
  green (#60).

---

## Resolution — PARTIALLY shipped (2026-08-22), from a sandboxed session with NO physical/
## self-hosted-runner access

**Read this before assuming any item below is verified.** This session is the same kind of
sandboxed environment #63's engineer used — no QSRSoft network access, no self-hosted runner, no
terminal on `Fletchers-Mac-mini`. Everything the runner-install checklist above needed hands-on
access for (`pmset`, `networksetup`, `./svc.sh install`, the Wi-Fi watchdog `launchd` job) is
already annotated ✅ in this file by whoever *did* have that access before this session started —
this session did not do any of it and cannot confirm it beyond reading the same annotations.

### Shipped, code-side

- **`scripts/qsrsoft-security-events-pull.mjs`** — the actual daily pull. Two-path auth mirrors
  `qsrsoft-ops-pull.mjs` (direct `getFreshToken()` + plain fetch first, real-SPA-login Playwright
  as fallback), NOT `qsrsoft-register-audit-pull.mjs`'s cookie/`page.request` dance — the finding
  file already established `api.security` is token-only, no session cookie. One POST per
  `(store, date, event_token)` with empty `registers`/`cashiers`/`time_slices` (dispatch #58's own
  "empty means ALL" measurement) — 27 × 8 = 216 requests/day at the default cadence. Reuses
  `src/engine/security-events.js`'s `parseSecurityEventRow`/`EVENT_TOKENS`/`storeRefFromLoc`
  verbatim (already built and unit-tested under dispatch #56 Part E — nothing here re-derives
  them). Tokenizes `crewName`/`mgrName` via `identity-vault.js`'s `tokenizeRows()` — called
  **once per field, over the whole run's accumulated rows**, not per unit, to keep the RPC count
  down at 216+ units/day. No plaintext name is logged anywhere (grepped the diff to confirm).
- **`supabase/schema-qsr-security-events-upsert-fix.sql`** — a real bug caught by reading the
  existing schema before writing the upsert call, not by running it and hitting the error live.
  The original `schema-qsr-security-events.sql`'s unique index targets an EXPRESSION
  (`coalesce(order_key, '')`), which PostgREST's `onConflict` (what `supabase-js`'s `.upsert()`
  compiles to) cannot reference — only a plain column list. The pull's very first write would have
  failed outright with "no unique or exclusion constraint matching the ON CONFLICT specification".
  Fix: drop the expression index, add a real `UNIQUE NULLS NOT DISTINCT` constraint on the same
  plain columns (Postgres 15+, which Supabase runs) — same "a null `order_key` still collides"
  behaviour the original comment described, but a shape PostgREST can actually target.
  **⚠️ This migration has NOT been applied to the live database from this session** — no direct
  Postgres connection is available here (only the REST API via anon/service-role keys), and no
  precedent in this repo for a sandboxed session running DDL exists. It needs the same "owner runs
  it in the Supabase SQL editor" step every other `schema-*.sql` file in this repo has always
  needed. **The pull script's first live run will fail on save until this runs.**
- **`.github/workflows/qsrsoft-security-events-pull.yml`** — `runs-on: [self-hosted, macOS,
  qsr-security]`, matching the label the dispatch itself names. Daily cron (10:00 UTC, alongside
  the DAR/eBOS cadence) + `workflow_dispatch` with the same backfill inputs every other pull
  offers. Playwright install step kept for the fallback path only.
- **`sync-failure-watch.yml`** — `QSRSoft Security Events Pull` added to the watched list (half of
  the brief's "do BOTH" — catches a run that starts and fails, per the standing new-pull rule).
- **`src/__tests__/qsrsoft-security-events-pull.test.js`** — unit tests for the pull script's pure
  helpers (`buildUrl`/`buildBody`/`extractRows`), matching this repo's own convention for these
  scripts (mapping/URL/envelope logic unit-tested, the live network path verified by an actual
  run). 2027/2027 tests total (6 new), build clean, no entry-chunk change (none of this touches
  the client bundle).

### NOT shipped — deliberately deferred, not silently skipped

- **`src/engine/stream-freshness.js`'s `STREAMS` entry — the OTHER half of "do BOTH".** Read
  through App.js's existing eager-load call sites (`loadFobRows`/`loadOpsRows`/`loadCtrlRows`/…)
  before writing this and found **zero precedent for a role-conditional eager load** — every
  existing `STREAMS`-eligible source loads unconditionally for every session, relying on RLS being
  merely tenant-scoped (empty only when genuinely absent). `qsr_security_events`'s RLS is
  **role-gated** (admin/supervisor always, manager only with `org_config.gm_identity_reveal_enabled`
  — `schema-qsr-security-events.sql`'s own explicit, deliberate departure from the tenant-only
  pattern). An unconditional eager load into `ds` would return `[]` for every GM/office-staff/
  DO/VP session — and `streamFreshness()`'s own contract (its header comment, verified by reading
  it) treats a **present-but-empty** array as a real incident (`staleDays: Infinity`, `severity:
  'crit'`), not as "not loaded". That means wiring this the same way every other stream is wired
  would manufacture a **guaranteed false critical alarm on every non-admin/supervisor session**,
  every time — not a corner case, the default case for most of this app's role roster. Shipping
  that blind, from a session with no way to log in as a GM and see the result, is a worse outcome
  than shipping nothing here. **Left for the next session with:** gate the loader
  (`loadQsrSecurityEventsRecent()` — does not exist yet either, would be a small eager wrapper
  around the existing `qsr_security_events` read, windowed to a few days, not the full drill-down
  query `loadQsrSecurityEventsForSubject` already does) behind `userRole==='admin'||userRole===
  'supervisor'` before the `setDs` call — this would be the FIRST role-conditional eager load in
  App.js, so treat that as worth a second look, not a mechanical copy-paste. The `manager`+flag
  tier is not replicable client-side without also fetching `org_config` at startup; treating it as
  "no verdict" (same as an unloaded field) rather than guessing is the safe direction to err.
- **Everything requiring the physical Mac mini or the self-hosted runner itself**, none of which
  is reachable from this sandboxed session:
  - Installing/starting the runner service (`./svc.sh install && ./svc.sh start`) — this session
    has no shell on that machine.
  - **The verification bar's own three items, none attempted**: a real `200` + row count from the
    self-hosted runner; the deliberate runner-offline test (stop the service, confirm the stream
    reads stale — moot anyway until the `STREAMS` wiring above exists); the weekend unattended-
    endurance check. All three need someone with hands-on access to that machine, on its own
    timeline (the endurance check specifically needs days, not a single session).
  - Running the schema migration above against the live database.

**So: this dispatch is code-complete for what a sandboxed session can build and unit-test, and
explicitly NOT verified end-to-end.** Do not read the presence of the pull script, the workflow
file, or a green local test suite as evidence the pull actually works against the real API from
the real runner — none of that has been exercised. The next session with access to
`Fletchers-Mac-mini` (or the owner directly) needs to: run the schema migration, install/start the
runner, `workflow_dispatch` this workflow once and confirm real rows land, then come back and
finish the `stream-freshness.js` wiring with the role-gating question above actually settled.
