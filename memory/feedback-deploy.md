---
name: feedback-deploy
description: Always push commits to both git remote and Vercel after every session
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

After every commit (or series of commits), always run `git push origin main`.

**Why:** Vercel auto-deploys on push to main, so pushing is the deploy step. The user said "always remember to push it to Vercel" — meaning every session should end with a push, not just when explicitly asked.

**How to apply:** At the end of any coding session where commits were made, push without waiting for the user to ask. If the user says "commit it," follow up with a push immediately after.
