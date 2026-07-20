---
name: project-pwa-share-bug
description: iOS Safari Share sheet fails after v4.393 — Add to Home Screen broken on iPhone
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

RESOLVED in v4.394 (commit 7e52573, 2026-07-10). On iPhone the app showed a "⚠ McForecast — Script Error / Line 0, Col 0" screen instead of loading — reproduced even in Safari Private mode.

**Root cause:** the global `window.onerror` handler in `src/features/morning-brief.js` replaced the entire `#root` with an error screen on ANY uncaught error — including the uninformative cross-origin `"Script error."` that iOS Safari reports with line 0, col 0, no source and no Error object. These opaque errors (Safari quirks, extensions, third-party/opaque resources) are benign, but a single one tore down the whole React app, so it looked broken from the home screen / standalone. It reproduced in Private mode precisely because service workers are disabled there — which also *ruled the SW out* as the cause (the earlier PNG-icon / analytics.js `onScroll` theories were wrong).

**Fix:** `window.onerror` now logs and ignores the opaque case (`!err && !src && !line && !col`) instead of destroying the app; real, attributable errors still show the recovery screen. Also fixed a stale Web Share Target redirect in `public/sw.js` (`/meridian/` → `/`, a dead GitHub-Pages-era base path). SW bumped to v4.394.

**Still pending:** on-device confirmation on Fletcher's iPhone after the v4.394 deploy. If it recurs, capture the *real* error via Mac Safari → Develop → [iPhone] → Web Inspector (the opaque handler now logs it to console).
