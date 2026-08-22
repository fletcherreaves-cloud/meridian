---
name: dispatch-60-ci-node-parity
description: Dispatch #60 - close the live trap that let the Forms merge break main for seven commits. The hourCycle fix is UNGUARDED - a faithful revert passes all 1952 tests on the sandbox's Node and only fails on CI's, so any agent can re-break main on a green local run. Measured: no behavioural test can catch this from one Node version. Needs a source-level guard plus a CI matrix.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #60 — the `hourCycle` fix is unguarded, and the trap is still live

**Small (~30 min), and I'd do it before #58.** The failure it prevents just cost `main` seven
consecutive red commits, two of them from an unrelated session.

## What happened

`1ca02ee` (Forms Slices 1-3) was merged on a **clean local 1952/1952** and broke CI on every
commit until hotfix #540 (`b72d377`). Root cause: `apiWindowForDays()`'s `chicagoMidnightUTC()`
string-matches an `Intl`-formatted time against `'00:00'` to locate local midnight.
`hour12: false` **does not pin which hourCycle a runtime resolves** — it renders `"00:00"` on the
sandbox's Node and `"24:00"` on CI's, so neither DST candidate ever matched and every call threw.

The hotfix — forcing `hourCycle: 'h23'` — is correct. **It is also completely unguarded.**

## 🔴 Measured: no behavioural test can catch a revert from one Node version

Restoring the exact pre-hotfix line (`hour12: false`) on the sandbox's Node 22:

```
  full suite            1952/1952 PASS        <- a revert looks completely clean
  hour12:false  format()  -> "00:00"
  hourCycle:h23 format()  -> "00:00"          <- identical, so asserting format() proves nothing
  hour12:false  resolvedOptions().hourCycle -> "h23"
  hourCycle:h23 resolvedOptions().hourCycle -> "h23"   <- ALSO identical; resolvedOptions is
                                                          itself runtime-resolved
```

**So an agent can delete `hourCycle:'h23'`, run the full suite, see green, and re-break `main`
exactly as happened the first time.** Neither `format()` nor `resolvedOptions()` discriminates on
this runtime — the difference only exists on the other one. That rules out the obvious guards.

## What to build

**1. A source-level guard test.** Runtime-independent because it inspects source, not behaviour —
the same shape as this repo's existing ratcheting tests (`light-mode-white-alpha.test.js`,
`metric-chains.test.js`).

Assert that **no `Intl.DateTimeFormat` constructor in `src/` requests `hour` without an explicit
`hourCycle`**, and that bare `hour12:` never appears in one. Fail with a message naming this
incident so the next person understands why. Keep it narrow — it should catch the footgun, not
police every `Intl` call.

**2. A CI Node matrix.** `ci.yml:42` pins `node-version: 20`; the sandbox runs 22. Run `verify` on
**both**, so the whole class of ICU/locale divergence is caught rather than just this instance.
Roughly doubles that job's time — acceptable for the only gate on `main`, but check the deploy-cap
notes in `CLAUDE.md` before adding anything heavier.

⚠️ **Confirm the real CI version first.** `ci.yml` says **20**; hotfix `b72d377`'s message says
**24**. One of them is wrong and it has not been checked. Read an actual CI job log rather than
trusting either — and if the matrix makes the question moot, say so in the PR so the discrepancy
does not get re-litigated later.

**3. Sweep for the same pattern elsewhere.** `chicagoMidnightUTC` locates a moment by
**string-matching formatted output** — inherently brittle. `grep` for other `Intl`/`toLocaleString`
comparisons against literals. If `forms-completion.js` is the only one, say so in the PR; a
confirmed "only instance" is worth as much as a fix.

## Not in scope

Rewriting `chicagoMidnightUTC` to avoid string-matching altogether (offset arithmetic via
`Intl.DateTimeFormat().formatToParts()` would be sturdier). **Tempting, but it is a behaviour change
to freshly-shipped date logic that CI cannot fully verify** — and the whole point of this dispatch
is that CI could not verify the last one either. Guard first, refactor separately if ever.

## Verification bar

- The source-level test must **fail** when `hourCycle:'h23'` is removed and **pass** with it —
  demonstrate both in the PR, since that is the entire point.
- Full suite green on both matrix entries.
- No behaviour change to `forms-completion.js` itself.

## ✅ Resolved (2026-08-22, v5.100)

**1. Source-level guard shipped:** `src/__tests__/ratchet-intl-hourcycle.test.js`. Scans a
`new Intl.DateTimeFormat(...)` constructor call's own options object for `hour:` without
`hourCycle:`, or bare `hour12:`, anywhere under `src/` or `scripts/` (not just `src/` — the sweep
found the second instance lives under `scripts/`). Zero-tolerance (`toEqual([])`), not a ratcheting
CEILING — unlike R4's color-concat check, there is no call shape in this codebase where the trapped
pattern is legitimate. **Bar demonstrated**: reverted both `forms-completion.js`'s `TIME_FMT` and
`qsrsoft-onhand-pull.mjs`'s `centralHour()` to their pre-fix `hour12: false` shape — the guard
failed, naming both `file:line`s exactly. Restored the fix — guard passed. Full suite (1952 → 1954
with the guard's own 2 tests) green on both states as expected.

**2. CI Node matrix shipped:** `ci.yml`'s `verify` job now runs `strategy.matrix.node-version:
[20, 22]` instead of a single pin — 20 for historical/production parity, 22 to match the sandbox
that keeps producing "clean local" runs. Confirmed this doesn't touch the Vercel deploy-count cap
(`CLAUDE.md`'s "merge without asking" section) — that's a separate quota (deployments/day on
Vercel), not GitHub Actions minutes.

**3. Sweep result — NOT an "only instance."** `scripts/qsrsoft-onhand-pull.mjs`'s `centralHour()`
had the identical `hour12:false`-without-`hourCycle` shape, feeding the formatted hour into
`Number()` for a `CT_START`/`CT_END` business-hours range check. **Currently latent** — the
8am–6pm CT window never spans midnight, so "00" vs "24" both fail the range check identically —
but fixed to `hourCycle:'h23'` anyway, before either env-var bound ever changes to include
midnight. Every other `Intl.DateTimeFormat` call site in the codebase (`compute-hourly-projection-
accuracy.mjs`, `eom-snapshot-pull.mjs`) requests no `hour` at all and is unaffected — confirmed by
the guard test itself passing at zero hits post-fix, not by a one-time grep that could go stale.
The various `toLocaleTimeString`/`toLocaleDateString` display-only calls elsewhere (`projections.js`,
`at-a-glance.js`, `eom-dashboard.js`, `eom-share-view.js`, `session.js`, `fob-eom.js`) are a
**different, unaffected case**: none forces a 24-hour cycle (no `hour12:false`/`hourCycle:` at
all) and none compares formatted output against a literal — they just render a label, so `en-US`'s
locale-stable 12-hour default applies the same on every Node/ICU version. Deliberately not folded
into the guard (which is scoped to `Intl.DateTimeFormat` per the dispatch's own "keep it narrow").

**⚠️ Node-version discrepancy resolved.** Read the actual CI job log for the originally-failing
run (`get_job_logs`, job that ran PR #539's `verify` before the hotfix merged into it). The
`actions/setup-node@v4` step's own "Environment details" block shows `node: v20.20.2` — CI's real
test-running Node, exactly matching `ci.yml:42`'s `node-version: 20` pin. `CLAUDE.md`'s existing
"20" claim needed **no correction**. The hotfix's own comment/commit message (`b72d377`, "breaking
on Node 24 in CI") was the wrong one — it had conflated the Actions runner's own "Node 20 is being
deprecated, this workflow runs with Node 24 by default" banner (which is about the runner's
internal JS-action execution layer — checkout, setup-node itself — a separate layer from the
pinned Node the `setup-node` step actually installs and runs `npm test`/`npm run build` with) with
the project's own pinned test Node. Corrected in `forms-completion.js`'s `TIME_FMT` comment; the
already-merged `main` commit message itself cannot be rewritten, hence this note.

**Confirmed out of scope, as specified:** `chicagoMidnightUTC` itself is unchanged — still
string-matches formatted output, still not refactored to `formatToParts()`. That stays a separate,
deliberate future call if ever made.
