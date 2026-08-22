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

### macOS specifics — get these right or the runner dies quietly

- **Stop it sleeping.** `sudo pmset -a sleep 0 disablesleep 1`, and in System Settings → Energy,
  enable *"Prevent automatic sleeping when the display is off."* A sleeping Mac is the single most
  likely cause of a missed run.
- **Come back after a power cut.** `sudo pmset -a autorestart 1`.
- **Install the runner as a SERVICE, not a terminal session.** From the runner directory:
  `./svc.sh install && ./svc.sh start`. That registers a `launchd` job so it survives logout and
  reboot. A runner started with `./run.sh` in a Terminal window dies the moment the window closes
  or the user logs out — and it will look fine right up until it doesn't.
- **Label it** (e.g. `self-hosted, macOS, qsr-security`) and target that label in the workflow, so
  a future second runner can't accidentally pick up this job.
- **Verify it survives a reboot** before calling the setup done. Reboot the Mac, then confirm the
  runner shows Idle in the repo's Actions → Runners page without anyone logging in.

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
- A deliberate **runner-offline** test: the workflow must fail loudly and trip
  `sync-failure-watch`, not silently record zero rows. The register-audit pull's
  *"✗ zero rows saved … a quiet no-op, not a success"* is the pattern to copy.
- No plaintext name anywhere in the diff, logs, or test fixtures.
- `npm run build` clean; **check `node -v` against `ci.yml`'s `[20, 22]`** before trusting a local
  green (#60).
