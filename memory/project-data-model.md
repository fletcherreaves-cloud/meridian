---
name: project-data-model
description: "How Meridian data persistence works — IndexedDB/OPFS, Supabase, localStorage, and what survives vs what's lost"
metadata: 
  node_type: memory
  type: project
  originSessionId: cc259420-bc20-4259-b5f9-800bf256cd33
---

# Meridian Data Persistence

**Storage engine:** Dexie.js (IndexedDB), database named `MeridianDB` at schema v5.

**Upload model:** ADDITIVE / UPSERT — not session-based.
- User uploads Excel/CSV files via the app's file upload UI
- Each row is keyed by `loc:YYYY-MM-DD` (the `_rk` field)
- `bulkPut` upserts — re-uploading the same file is safe (idempotent)
- Uploading a newer week's data alongside old data is the normal workflow
- Data accumulates over time; the forecast engine uses as much history as it can find

**What survives a page reload:** Everything — all uploaded rows, metadata, model calibrations, user settings.

**What does NOT survive:**
- Clearing browser site data
- Switching to a different browser or device
- Private/incognito windows

## Persistence Layer Summary (as of v4.260)

| What | Storage | Cross-device? | Key |
|------|---------|--------------|-----|
| Row data (ops, labor, FOB, etc.) | OPFS + IDB | No (re-upload) | — |
| `mf_settings` | localStorage + Supabase | Yes | `org_config` key `app_settings` |
| `mf_targets` | localStorage + Supabase | Yes | `org_config` key `app_user_targets` |
| `mf_anthropic_key` | localStorage only | No | — |
| EOM override notes | localStorage + Supabase | Yes | `org_config` key `eom_manual_{y}_{m}` |
| Performance reviews | Supabase | Yes | `review_sessions` table |
| Monthly targets | Supabase | Yes | `monthly_targets` table |
| SMG FullScale | Supabase | Yes | `smg_fullscale` table |

## Supabase `org_config` Pattern

Key-value store (`key TEXT, data JSONB`). Uses `pushConfigToSupabase(sb, obj, key)` from `review-engine.js` for push, and `supabase.from('org_config').select('data').eq('key',key).maybeSingle()` for fetch. Remote wins over localStorage on merge (Supabase = source of truth).

New keys added over time:
- `app_settings` — app-wide settings (operators, supervisors, theme, etc.)
- `app_user_targets` — per-store user target overrides (`mf_targets`)
- `eom_manual_{y}_{m}` — EOM Supervisor manual overrides for a given month

## Dexie/IDB Tables
`laborRows`, `opsRows`, `ctrlRows`, `fobRows`, `auditRows`, `peaksRows`, `darRows`, `pmixRows`, `weatherRows`, `metadata`
