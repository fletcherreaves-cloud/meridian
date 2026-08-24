---
name: handoff-2026-08-24-key-rotation
description: Supabase legacy API keys were disabled 2026-08-24T14:53:50Z and every consumer migrated to the new sb_publishable/sb_secret format. What is verified, what is still outstanding (the sage-chat deploy — and why a working SAGE does NOT prove it shipped), and the doc debt the rotation created.
sensitivity: open
metadata:
  node_type: memory
  type: handoff
---

# Handoff — 2026-08-24, Supabase key rotation complete

Supersedes `memory/handoff-2026-08-24-service-role.md` on anything key-related. That file's two
data questions are **both answered and closed**; read its ANSWERED sections for the results, and
ignore its credential instructions — they describe keys that no longer exist.

---

## What changed

The owner migrated to Supabase's **new API key format** and **disabled the legacy keys at
`2026-08-24T14:53:50Z`**. Confirmed live, not assumed: a request with the old key now returns
`401 "Legacy API keys are disabled"` naming that exact timestamp.

| variable | now holds | note |
|---|---|---|
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_…` | opaque, **not a JWT** |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_…` | opaque, **not a JWT** |

🔴 **The variable NAMES were kept on purpose.** Changing values only meant **36 workflows and 3
edge functions needed no edit**. The consequence is that both names now describe their contents
inaccurately. **Do not rename either without tracing every consumer** — the list is in this file.

⚠️ **Nothing in the codebase decodes these as JWTs** — verified by grep across `src/`, `scripts/`,
and `supabase/functions/` for `split('.')` / `atob` / decode / length assumptions before the
migration. That is *why* an opaque key was a drop-in. If anyone adds such a decode later, it breaks
silently.

## Verified working after the cutover

Each checked by the owner against the live system, post-disable:

1. **The deployed site** — meridianbi.vercel.app loads and renders data (v5.135).
2. **SAGE** — returned a full 27-store pacing-vs-projection answer. This exercises `sage-chat`'s
   `SUPABASE_SERVICE_ROLE_KEY` path, which was the **specific risk flagged before the disable**:
   the three service-role edge functions read the platform-injected legacy-named variable, and it
   was unknown whether it would survive. **It did.** That question is closed.
3. **GitHub Actions** — eBOS and DAR pulls both dispatched and ran.

**Vercel needs care that the others don't.** `VITE_`-prefixed values are **compiled into the
bundle at build time**, and Vercel stores a **separate row per environment**. Updating Preview does
not touch Production. This cost a round trip today: Preview was updated first and Production still
held the legacy key. If a future rotation happens, update **Production** and **redeploy** — a saved
variable alone changes nothing.

## ✅ DONE 2026-08-24 — the sage-chat deploy shipped and was verified against the distinguishing test

**`supabase functions deploy sage-chat --no-verify-jwt` has been run.** #85's 1000-row truncation
fix and #626's query-ordering fix are **live in production.** This section previously read *"has
still never been run"* — true when written, false within the hour. ⚠️ **Do not re-raise it as an
open owner action.**

**How it was verified — the test that actually distinguishes fixed from broken.** A single-day
question proves nothing: 27 stores × 24 `hour_slot`s = **648 rows**, under PostgREST's 1000-row
cap, so a one-day pull was always complete either way. That is precisely why the bug survived so
long. The distinguishing test is a **multi-day** window:

| run | result |
|---|---|
| 30-day question, **pre-deploy** | *"the tool returned only 2 days per store"* — matches `1000 ÷ 648 = 1.54 days` exactly |
| 30-day question, **post-deploy** | no caveat; real 30-day sales per store ($223K–$433K), all 27 stores |

🔴 **The trap that cost two false starts, worth knowing for any future edge-function deploy:**
`supabase functions deploy` ships **whatever is on the deploying machine's disk**, not what is on
GitHub. The owner's Mac was **20 commits behind** at `ecb9000`, so the first two deploys succeeded
— with no error — and shipped the *old* code. The tell was that `paginate.js` and
`promo-roi-note.js` were absent from `ls supabase/functions/sage-chat/`; `paginate.js` is created
by #625 and cannot exist in an older checkout. **`git pull` before any function deploy, and check
the file listing before believing the deploy.**

Note this also means every earlier "sage deployed" in that session shipped from the same stale
checkout — which is why #619's LifeLenz column fix and #611's `gap_vlh` rename *were* live (they
predate `ecb9000`) while #625/#626 were not.

## Doc debt the rotation created — fix opportunistically, do not sweep

- **CLAUDE.md's Supabase-egress block** is superseded and now says so in place. Its `*/0` table was
  measured with a **now-dead** key and is history, not current access. **Re-measure before relying
  on any of it.**
- ⚠️ **A false claim reached three places:** that `VITE_SUPABASE_ANON_KEY` was *"byte-identical to
  `SUPABASE_SERVICE_ROLE_KEY`, both `role:service_role`."* **Measured false 2026-08-24** — it
  decoded to `role: anon`, and sending it as `Authorization: Bearer` still returned
  `content-range: */0` on `qsr_fob`: no elevated privilege by claim *or* behaviour. Corrected in
  CLAUDE.md. **Still uncorrected in `memory/dispatch-88.md` and `src/app/changelog/5.133.js`** —
  moot post-rotation, but both assert it as fact and the changelog is user-facing.
  The lesson worth keeping: **decoding a credential is a measurement like any other — state the
  observation, not the conclusion.**

## Where the secret key lives (for the next rotation)

| place | count | note |
|---|---|---|
| GitHub Secrets | **36 workflows**, one secret | all read `secrets.SUPABASE_SERVICE_ROLE_KEY` |
| Supabase Edge Function secrets | 3 functions | `sage-chat`, `eom-share`, `ingest-report` — **platform-injected, nothing to set** |
| Claude Code agent environment | 1 | a running session never sees a change; needs a new session |
| Vercel | Production / Preview / Development | **publishable key only**; baked at build time, needs a redeploy |

`trigger-dar-sync` reads `SUPABASE_ANON_KEY` (also platform-injected).

## Open work

**Engineer:**
- The `sage-chat` deploy above is the owner's to run, but the **multi-day verification** after it
  is worth a dispatch — it is the only thing that proves #85 shipped.
- Correct the false service-role claim in `dispatch-88.md` and `changelog/5.133.js`.

**Owner:**
- ✅ Deploy done and verified (see the DONE section above) — **do not re-raise.**
- **Verify the forecast-bias claim before acting on it.** SAGE's post-deploy answer recommends a
  district-wide downward projection correction on the basis of *"-6.0%, 27 of 27 stores under."*
  That is the single largest recommendation outstanding and the least verified — it changes every
  store's schedule. Run **Forecast Accuracy → MAPE by source** over a real 30-day window and
  confirm the error is genuinely one-directional first. The $42K–$85K/mo attached to it is
  explicitly an estimate resting on an assumption.
- **Tolerance bands** — still needs a conversation before it can be a dispatch. Prior art:
  `store-dash.js` declares `tol:` on 24 metrics and **nothing reads any of them.**
- **LifeLenz "need" model calibration** — all 27 stores positive, district +35.8 h/day. Parked as
  analysis; note it is the shape of work (27 stores × a multi-week window) that argues for real
  data access rather than one-off queries.
- **Security-events 403** — token-injection test, then packet capture. See
  `finding-qsrsoft-security-entitlement-request-2026-08-22.md`'s appended final state; run the
  injection test **before** filing a support ticket.
