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
