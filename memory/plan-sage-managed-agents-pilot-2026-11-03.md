# SAGE Managed Agents pilot — side-by-side, effort, cost, and a recommendation

**Task #60.** Owner asked to go past scoping into "a real side-by-side with effort/cost
estimates." Scope stays exactly what was agreed earlier in this session: the scheduled-prompts
automation only (`scripts/sage-run.mjs` + `.github/workflows/sage-run.yml`), never the live SAGE
chat panel — a hosted-container agent platform is the wrong shape for a sub-second streaming chat
UI, and there's no reason to move it.

## 0. The measurement that changes the decision

Before costing anything out, I checked what's actually running today (service-role read,
2026-11-03):

| Table | Measured |
|---|---|
| `sage_prompts` | **1 row total.** "Current SAGE CApabilities" (sic), created 2026-07-24, `schedule_enabled: false`. |
| `sage_prompt_runs` | **0 rows.** |

**Nothing is actually scheduled to run right now.** CLAUDE.md's SAGE section says the "SAGE
Scheduled Prompts" Action "has been running successfully every ~2 hours continuously" since
07-23 — that claim does not match what's in the tables today, whatever was true in the past. The
hourly GitHub Action is presumably still firing and finding zero due prompts each time (a cheap
no-op), not actually exercising the automation it was built to run. **This paragraph in CLAUDE.md
needs its own correction pass** — flagging it here rather than fixing it inline, since that's a
separate, smaller cleanup from this plan.

This matters directly for the pricing decision below: there is currently no real recurring
workload to migrate. Everything past this point assumes a FUTURE state where the owner turns a
real scheduled prompt on and uses it regularly — not today's actual usage.

## 1. What Managed Agents would change

| | Today (hand-rolled) | Managed Agents |
|---|---|---|
| **Scheduler** | GitHub Action, hourly cron (`.github/workflows/sage-run.yml`, 43 lines) | Anthropic-hosted scheduled deployment — native POSIX cron + IANA timezone, small random jitter (5s–9min), up to 1,000 scheduled deployments/org |
| **Runner** | `scripts/sage-run.mjs` (120 lines): signs in `SAGE_RUNNER` service account, mints a user JWT, calls `sage-chat` per due prompt, writes `sage_prompt_runs` | Anthropic-hosted per-session container (bash/file/code-exec), SSE event stream, no script of our own to run |
| **Credentials** | `SAGE_RUNNER_EMAIL`/`SAGE_RUNNER_PASSWORD`/`VITE_SUPABASE_ANON_KEY` as GitHub Secrets, read by the Action | Vault `environment_variable` credentials — stored by Anthropic, substituted at egress, never visible to the session. Tighter than the current GitHub-Secrets-in-a-runner model. |
| **Tool access** | SAGE's 13 live tools (`supabase/functions/sage-chat/index.ts`, 1,335 lines) run IN-PROCESS inside the Edge Function, with direct access to its own service-role Supabase client | A Managed Agent session has no direct access to that Edge Function's internals — it would need the same 13 tools re-exposed as something the session can call out to (custom tools over HTTP, or MCP). **This is the real integration cost, not a detail** — see §3. |
| **Run history / lifecycle** | `sage_prompt_runs` (hand-written), no pause/resume, no archive | Native run records per firing, pause/unpause/archive built into the platform |
| **Outcome grading** | None — a scheduled prompt just runs once and logs its output | `user.define_outcome` available for a single-deliverable task graded until it meets a rubric (not relevant to a Q&A-shaped scheduled prompt; would matter for a future "clean up the backlog until it's actually clean" kind of job) |

## 2. Cost — real numbers, with sourcing caveats

Searched live (2026-11-03); Anthropic's own pricing page is the authority, these are third-party
sources corroborating each other, not a substitute for checking it directly before committing
real spend:

- **Runtime fee: $0.08 per active session-hour**, in ADDITION to normal Messages-API token rates
  — not a replacement for token cost. Container/code-exec time is folded into this fee (no
  separate container-hour billing on top).
- **Idle, rescheduling, and terminated session time is not billed** — only active running time.
- **No batch discount** (the 50% Batch API discount has no Managed Agents equivalent — sessions
  are stateful/interactive, not queued).
- One reseller's real-world estimate: **~$20–50/month for ~10 short Sonnet sessions/day.** Another
  put an always-on agent's idle-adjacent runtime cost around $58/month before tokens — directionally
  consistent with "billed in hourly-ish increments, so a handful of short daily runs isn't free."
- **Not eligible for Zero Data Retention or HIPAA as of October 2026** (per one source) — worth
  logging given this repo's own PII/credential standing rules, even though a scheduled SAGE
  Q&A prompt is unlikely to touch SSN/DOB-grade PII the way a roster pull would.

**Token cost is a wash either way** — the exact same `claude-opus-5-5` call happens whether the
Edge Function or a Managed Agent session makes it. The $0.08/hr runtime fee is pure NEW spend,
not a trade against an existing Anthropic cost. The CURRENT GitHub Actions hourly cron costs
effectively nothing (shared with the project's existing CI minutes budget).

**Rough monthly estimate for realistic future usage** (a handful of scheduled prompts firing a
few times a day, each run short — a few minutes): **$15–40/month in new runtime fees**, on top of
unchanged token costs. Verify against Anthropic's actual pricing page before treating this as
final — it's built from third-party corroboration, not the primary source.

## 3. Effort — the honest estimate

The scheduler/credential swap (§1's first three rows) is genuinely close to "flip a switch" —
maybe half a day: define an Agent config, a scheduled deployment, move the Supabase
anon/service credentials into a vault credential, delete the GitHub Action + `sage-run.mjs`.

**The tool-access row is the real cost.** SAGE's 13 tools today are plain async functions living
inside `sage-chat/index.ts`, called directly with that function's own Supabase client already in
scope. A Managed Agent session can't reach into that Edge Function's process — it needs those 13
tools re-exposed as something it can call remotely (an authenticated HTTP endpoint per tool, or
an MCP server wrapping the same logic). That's not a rewrite of the tool LOGIC (the existing
`query_daily_activity`/`query_lifelenz_labor`/etc. functions are reusable as-is), but it IS a real
transport/auth re-wiring pass across all 13 — closer to **2–4 focused engineering days**, not
an afternoon, plus the result-write-back piece (something needs to read the finished session's
output and persist it to `sage_prompt_runs` or an equivalent table for the At-A-Glance tile that
already reads it).

## 4. Recommendation

**Don't build this yet.** Two independent reasons, either one sufficient on its own:

1. **There's nothing to migrate.** Zero scheduled prompts are actually running (§0). Building a
   2–4 day integration plus a new $15–40/month recurring cost to better-host a feature that
   currently has zero real usage is solving a problem that doesn't exist yet.
2. **The free version already works and is unused, not broken.** The existing hand-rolled
   scheduler/runner is live, tested infrastructure (CLAUDE.md's SAGE section documents it
   shipping in Phase 2, v4.488) — the gap is that nobody has turned a real recurring prompt on,
   not that the plumbing is bad.

**What to actually do next, in order:**
1. **Turn on a real scheduled prompt** on the system that already exists — pick something SAGE
   can usefully check daily/weekly (e.g., "any stream gone stale," "any store trending off pace")
   and set `schedule_enabled: true` on it. This costs nothing beyond tokens and takes minutes.
2. **Watch it for a few weeks.** If it's valuable and the owner wants MORE of it — more prompts,
   tighter schedules, genuinely complex multi-step jobs — THAT'S the point where the $15–40/month
   and 2–4 day integration cost becomes worth paying, for the vault-credential security win and
   not hand-maintaining a 120-line runner script.
3. **Revisit this plan then**, re-pricing against Anthropic's actual current pricing page (not
   third-party corroboration) and re-measuring real `sage_prompt_runs` volume to size the runtime
   fee accurately instead of estimating it.

Not a "no" — a "not yet, and here's the cheap thing to do first that tells you whether it's worth
it at all."
