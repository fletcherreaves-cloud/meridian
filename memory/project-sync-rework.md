---
name: project-sync-rework
description: Cross-device sync needs rework before multi-org or multi-user scale
metadata: 
  node_type: memory
  type: project
  originSessionId: 38351d52-5c92-43ba-9c16-74aa91f2fd44
---

Current cross-device sync stores raw files as base64 in `pending_reports.file_data`. Works fine for single org, small team.

**Why:** Supabase Storage RLS blocked anon uploads; base64-in-Postgres was the practical workaround.

**How to apply:** Remind Fletcher to rework this when (a) adding a second org, (b) hiring someone who needs their own login, or (c) moving away from "one person uploads for everyone." The right long-term fix is persisting parsed row data to Supabase tables (like SMG FullScale already does) rather than syncing raw files.

Known gaps:
- 30-day window means new users miss old uploads
- No org filtering on `pending_reports` — second org would see first org's files
- `org` column exists in schema but isn't written or filtered yet
