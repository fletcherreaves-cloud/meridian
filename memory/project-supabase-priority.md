---
name: project-supabase-priority
description: Supabase persistence is top strategic priority — move all data off OPFS/device-local into Supabase so any device/user gets data automatically
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

Moving everything to Supabase is the #1 architectural priority for Meridian. Currently most data lives in OPFS (per-device, per-origin) so switching URLs or adding users requires re-uploading everything. The goal is cloud-first persistence.

**Why:** User keeps losing data when switching URLs (Netlify→Vercel), new users start blank, multi-device use is broken. Every time we add a feature we should ask "does this belong in Supabase?"

**What's already in Supabase:** monthly_targets, labor_rows, smg_voice_performance, lifelenz_schedule, pending_reports, org_config

**What still needs to move to Supabase:**
- laborRows (daily Operations Report data) — partial, labor_rows table exists but full history not auto-loaded on startup
- fobRows (FOB/food cost data) — not in Supabase yet
- opsRows (Operations Report service/OEPE data) — not in Supabase yet
- ctrlRows (Controls sheet data) — not in Supabase yet
- darRows (DAR hourly data) — not in Supabase yet
- smgFullscale (SMG FullScale survey) — not in Supabase yet
- schedRows (LifeLenz Labor Analysis Summary) — partially (lifelenz_schedule has some, but not the Labor Analysis CSV data)

**How to apply:** When adding new data types or fixing persistence bugs, always ask if the data should be saved to AND loaded from Supabase. The pattern: save on upload → load on startup (like we did for monthly_targets and labor_rows).
