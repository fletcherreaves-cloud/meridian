---
name: project-fob-context
description: "FOB/Food Cost domain context, EOM Troubleshooter tool, QSRSoft report types and analysis logic"
metadata: 
  node_type: memory
  type: project
  originSessionId: 38351d52-5c92-43ba-9c16-74aa91f2fd44
---

## Domain Context

- Food Cost + Labor = ~50% of all QSR costs ($0.50 of every dollar)
- FOB = Food Over Base — measures food cost variance vs a baseline
- 6 controllable components: Completed Waste, Raw Waste, Condiments, Emp/Mgr Meals, Variance Stat, Unexplained
- QSRSoft can only report food cost / variance one location at a time for the most impactful reports (multi-loc aggregation is the long-term goal)

## FOB EOM Troubleshooter — built June 30, 2026

New Meridian view: `src/views/fob-eom.js` — "FOB End-of-Month Troubleshooter"
Nav: sidebar → **FOB EOM Check** (below FOB Analysis)

### Purpose
At EOM (last day of month), the ONLY remaining lever to improve FOB is correcting on-hand inventory counts before period close. Accepts upload of 6 QSRSoft inventory reports and produces a prioritized action plan for GM/Supervisor.

### 6 QSRSoft Report Types
| File type | Auto-detected by |
|-----------|-----------------|
| Contributors (FOB breakdown) | `_Contributors_` in filename |
| On Hand Inventory | `_On Hand_` or `_On_Hand_` |
| Inventory Summary & Usage | `_Inventory Summary_` or `inventory...summary` |
| Inventory History | `_Inventory History_` (optional, reserved) |
| Variance Stat | `_Variance Stat_` or `_Variance_Stat_` |
| Total P&L Cost | `_Total PL_` or `_Total P&L_` |

### Key Business Logic
- **Undercount ending inventory** → calculated usage goes UP → variance gets WORSE (negative)
- **Overcount ending inventory** → calculated usage goes DOWN → variance looks BETTER
- For EOM: find items with large negative variance where ending count might be too low → correct up → improves variance
- Count compliance rule: ALL Food, Condiment, Paper items must be counted on one of last 3 days of every month. NOT on last day (today) if possible, so corrections can be made.
- Condiments: appear on Variance Stat but show NO dollar variance (McDonald's usage calculation method). Check On-Hand count for unusually high amounts only.
- On-Hand report typically shows FOOD class only (not Condiments/Paper).
- **High case count = possible overcount** — compare to days of supply; items with >7-10 days on hand at EOM are suspicious.
- **Large negative variance + low on-hand count** = look for uncounted stock.

### Analysis Tabs
1. **Priority Recount** — variance items ≥$50 negative, sorted by dollar impact
2. **Case Count Review** — on-hand items with ≥4 cases and >9 days supply
3. **Count Compliance** — items not counted within last 3 days
4. **Operational Issues** — high-variance items NOT on On-Hand report (can't fix with counts)
5. **Files** — upload zone

### Test Data Findings (Store 3708, June 2026)
- FOB: 4.73% vs 4.15% target → OVER by $1,875.76
- Biggest driver: Variance Stat -$2,073.61 (1.89% vs 1.25% target)
- Largest variances: McNuggets (-$1,067), Beef (-$504), OJ (-$289), Frappe Caramel (-$285), Cold Foam (-$272)
- Count compliance: 106/107 items counted 6/29, 1 counted 6/30 ✓
- High days of supply flags: Frappe Mocha (5 cases/15.2d), Cookies (4 cases/14.9d), Ice Cream Mix (6 cases/11.4d)
- Cold Foam, Ramyeon Shaker Seasoning, Low-Fat Choc Milk UP G = operational issues (not on OH report)

### Files Modified
- `src/views/fob-eom.js` — new view (created)
- `src/app/App.js` — import, useState showFOBEOM, modal handler, render
- `src/app/shell.js` — nav item "FOB EOM Check"

### Still To Build (Future)
- Inventory History file parsing (reserved slot exists)
- Range column (Red/Yellow/Green) tolerance percentages — user to provide
- Multi-location support (currently single-store per upload session)
- Integration with existing fobRows for trend context across months
- Condiment On-Hand: needs separate parser or expanded filter on On-Hand report
