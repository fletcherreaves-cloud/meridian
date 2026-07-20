---
name: feature-requests
description: "Feature Requests module — current state, how Claude reads/writes, Supabase table, CLI access"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

> **Refresh from live DB:** `node scripts/features.mjs sync-memory` (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`)
> **Add:** `node scripts/features.mjs add --title="..." --status=idea --priority=medium --category=Analytics`
> **Update:** `node scripts/features.mjs update <id> --status=in-progress --dev_notes="..." --completed_version=v4.x`
> **List:** `node scripts/features.mjs list [--status=planned] [--category=AI]`
>
> Service role key: Supabase Dashboard → Settings → API → `service_role`. Add to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY=...`

## Module (as of v4.370)

- **Panel:** `src/views/feature-requests.js` — list/kanban toggle, status/priority/category/age/submitter/text filters, voting, submit form, dev status+notes controls
- **Nav:** `src/app/shell.js` → `💡 Feature Requests` (opens modal via `modal==='feature-requests'`)
- **CRUD:** `src/lib/supabase.js` — `loadFeatureRequests`, `saveFeatureRequest`, `updateFeatureRequest`, `voteFeatureRequest`
- **CLI:** `scripts/features.mjs` — `list / add / update / sync-memory`

## Data model (Supabase `feature_requests` table)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK, auto |
| title | text | required |
| description | text | optional |
| category | text | AI / Analytics / Data / Finance / Guest Voice / Labor / UI / General |
| priority | text | high / medium / low |
| status | text | idea / planned / in-progress / completed / declined |
| submitted_by | text | name, "Anonymous", or "Claude Code" |
| votes | int | upvote counter |
| dev_notes | text | shown to all users after save |
| completed_version | text | e.g. "v4.370" |
| is_seed | bool | false for real DB records |
| created_at / updated_at | timestamptz | auto |

## Seed items in `feature-requests.js` (show if not in DB by title)

**Completed:** SAGE (v4.281), Supabase persistence (v4.301), SMG auto-calibrate (v4.310), District grid (v4.311), Org Summary groups (v4.314), Data Manager (v4.315), Feature Requests module (v4.316), eBOS automation (v4.340), DAR automation (v4.356), Store daypart card (v4.357), Morning Brief pace (v4.358), Signals LiveOps (v4.360), Projections QSRSoft column (v4.369).

**Planned (high):** SAGE tool use, MAPE daily 3-way, DT Speed-of-Service panel, Beta operator onboarding.

**Planned (medium):** SAGE session memory, Perf Review OSAT polish, FOB multi-location variance.
