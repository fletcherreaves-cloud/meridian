---
name: project-vlh-config
description: "VLH guide configuration system — store_vlh_config table, panel, and data model"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b414dcb-fdd6-4da2-ac88-7ae8b2b824d9
---

## Store VLH Configuration (v4.360–361)

Per-store physical configuration used to select the correct VLH (Variable Labor Hours) guide page for labor-efficiency calculations.

**Supabase table:** `store_vlh_config`
- PK: `loc` (text, NSN-format store number)
- `aot` boolean — Automated Order Taking (kiosks)
- `dt_type` text — Drive Thru layout
- `in_store` text — In-Store service type
- `kitchen` text — Kitchen configuration
- `vlh_guide` text — Standard or HPG
- `coffee` text — BDAP/McCafé coffee station presence
- `updated_at` timestamptz

**UI:** `StoreVlhConfigPanel` in `analytics.js`, opened via Data Manager → ⚙ Store VLH Config button. Stores grouped OK / FL, auto-saves on every dropdown change.

**Constants in `constants.js`:** `VLH_DT_TYPES`, `VLH_IN_STORE`, `VLH_KITCHEN`, `VLH_GUIDE`, `VLH_COFFEE`

**VLH Guide PDFs** (source of truth):
- `/McDonald's/2026/12 - Scheduling/2022 VLH Workbook - High Productivity Guides - Final.pdf`
- `/McDonald's/2026/12 - Scheduling/2022 VLH Workbook - Standard Guides - Final.pdf`
- 49-page each; page 1 = configuration index (AOT × DT × In-Store × Kitchen → page number)
- Each page has per-station labor tables: Drive Thru, In-Store (Order Takers, Assemblers), Delivery/Curbside, Table Service, Kitchen, BDAP, McCafé, Hash Browns & Fries
- BDAP and McCafé tables are present on every page — they are NOT configuration-index dimensions; store presence is separate per-store config

**Coffee options:** `none`, `bdap`, `mccafe`, `both`

**Why:** Once store configs are filled in, next step is VLH guide-based needed hours calculation from DAR guest counts — compare against `actual_punched_hours` for a labor efficiency metric per store per hour. This is a foundation for that future feature.
