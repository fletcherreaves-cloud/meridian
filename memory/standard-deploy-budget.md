---
name: standard-deploy-budget
description: How to work without exhausting the Vercel 100-deployments/day cap. The limiter counts deployments at CREATION, before ignoreCommand, so build-side tricks cannot help - the only lever is fewer PUSHES. Practical rules for engineers, plus the two things that look like fixes and are not.
metadata:
  node_type: memory
  type: standard
---

# Deploy budget — how to work without burning it

**Audience: anyone pushing to this repo.** Read once; it changes how you push, not what you build.

---

## The one fact that determines everything

Vercel's free tier caps **deployments created per day at 100** (`api-deployments-free-per-day`),
and **the limiter runs when a deployment is CREATED — before the ignore step**. A skipped build
still spends one.

📌 **Every push to any branch creates a deployment.** Branch pushes, merge commits, docs-only
commits, WIP commits. All of them.

**MEASURED 2026-08-23:** 27 commits landed on `main` in 24 hours (12 docs-only, 15 code), against
**102** live `claude/*` branches. Each merged PR costs a *minimum* of two deployments — one for the
branch push, one for the merge commit — before counting any intermediate pushes. 27 merges is
therefore 54+ deployments floor. That is how a 100/day budget disappears.

**This is not theoretical.** On 2026-08-23 a real production fix (v5.115, the day-of-week
correction) was silently refused and did not reach users for ~12 hours. Nothing in GitHub reported
it; the owner found it by reading the version in the app footer on his phone.

---

## The rules

1. **One push per PR.** Commit locally as often as you like — `git commit` is free, `git push` is
   not. Push once, when the branch is ready to open as a PR.
2. **Never push WIP.** Exploratory commits (a temporary debug dump, a widened measurement, the
   real fix) belong in one push at the end. Three WIP pushes = three deployments for one PR.
3. **Amend rather than append** for fixes to your own unmerged branch — a typo in a commit
   message, a changelog reword, a comment correction. `git commit --amend` + one force-push beats
   a second commit and a second push. (Only ever force-push a branch nobody else is on.)
4. **Batch docs.** Several memory files in one work chunk = one commit, one push.
5. **Never push to trigger CI.** No empty commits, no close-and-reopen. If CI didn't run, say so.

## ⚠️ The exception that overrides all of the above

**Never withhold a fix to save budget.** If CI is red or `main` is broken, push the fix
immediately — a broken `main` costs far more than a deployment. The rules above are about
*avoiding needless* pushes, never about rationing necessary ones.

---

## 🔴 Two things that look like fixes and are NOT

Both have already been tried. Do not re-litigate either.

- **Tuning the build / `ignoreCommand`.** `vercel.json`'s `ignoreCommand` optimises BUILD TIME, and
  build time is **not** the constraint: that quota sits at **5% used** (5 h of 100 h, 0 s
  billable). The `ignoreCommand` was added the morning of 2026-08-21 on exactly this assumption
  and **the cap was hit again the same evening.** Observed directly: a deployment goes
  `created → Building → Ignored` under one deployment id — the count is already spent before the
  ignore runs.
- **Deleting stale branches.** Recovers **nothing**. Only *pushes* cost. Deleting the 102 branches
  is hygiene, not budget. (Worth doing; just don't expect a payoff.)

Also settled, so nobody re-checks them: `vercel.json`'s `git.deploymentEnabled` takes only exact
branch names (ours are randomly suffixed, so no glob works), and the dashboard's Ignored Build Step
skips *builds*, which per the above does not skip the count. Left on "Automatic" deliberately.

## What "retry in 24 hours" actually means

Nothing. It is a **rolling window** — capacity frees continuously. A deployment succeeded seven
minutes after a refusal on 2026-08-21, and again on 2026-08-23. You are never locked out for a day.

## When a deploy limit fires

**Read the error's resource name first** (`api-deployments-free-per-day`), not the build charts.
This project has now hit two platform deploy limits and got the mental model wrong both times —
`memory/project-hosting.md` still frames the Netlify→Vercel move as buying "6,000 build
minutes/month", a *build-time* framing for a *deployment-count* problem.

## The one real lever, still unbuilt

Disconnect Vercel's Git integration and deploy from a GitHub Action gated on
`paths-ignore: [memory/**, '**.md']`, so a push creates nothing Vercel-side and only an explicit
`vercel deploy --prod` does. That would make the count "code commits to main" instead of "pushes to
any branch." Repo precedent exists (`.github/workflows/deploy.yml` → GitHub Pages).
⚠️ **A hypothesis, not a finding** — needs three Vercel secrets and removes the automatic safety
net if the Action breaks. Verify before building. See `memory/plan-2026-08-23.md`.
