---
name: project-hosting
description: Meridian hosting — migrated from Netlify to Vercel on 2026-07-02
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

# Meridian Hosting

**Current state (2026-07-02):** Live on **Vercel**, auto-deploys on every `git push` to `main`.

**Why:** Netlify free tier hit build-credit limits after many same-day deploys (300 min/month). Vercel gives 6,000 build minutes/month free.

> ⚠️ **That "6,000 build minutes" framing is the wrong axis, and it cost us (measured 2026-08-21).**
> Vercel's free tier also caps **deployments per day at 100** (`api-deployments-free-per-day`), and
> **that** is the limit this project actually hits — twice in one day on 2026-08-21. Meanwhile the
> build-side quota sat at **5 h of 100 h used, 0 s billable build minutes**. So the resource the
> platform was chosen for has never been close to binding, and the one that bites was never counted.
> A `vercel.json` `ignoreCommand` skips the *build* but still creates a *deployment* ("Ignored",
> with its own deployment id), so it does not relieve the cap. **Preview deployments for
> `claude/**` branches are the real volume** and are off by owner decision — see the two Vercel
> rules in `CLAUDE.md` (Dev Rules). When a deploy limit fires, read the error's resource name
> before reaching for the build charts.

## Active setup
- **Platform:** Vercel (free tier)
- **Production URL:** `https://meridianbi.vercel.app`
- **GitHub repo:** `fletcherreaves-cloud/meridian` (private)
- **Trigger:** every push to `main` auto-deploys — no manual action needed
- **Config:** `vercel.json` already in repo — SPA rewrite (`/* → /index.html`) + no-cache for `sw.js`
- **Build:** Vercel auto-detects Vite → `npm run build` → output `dist/`
- **Netlify:** GitHub integration unlinked (site still exists but never auto-updates — can delete later)

## How to apply
- After every `git push`, Vercel deploys automatically. No drag-and-drop or CLI step needed.
- If Vercel ever fails: fall back to `npx netlify-cli deploy --dir=dist --prod` (user has Netlify CLI auth saved from 2026-07-02 session).
- Do NOT use `netlify login` or re-link GitHub to Netlify — it's intentionally disconnected.
