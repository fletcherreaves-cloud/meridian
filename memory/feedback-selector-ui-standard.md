---
name: feedback-selector-ui-standard
description: "UI standard for location/org selectors throughout Meridian — hierarchy, pill style, scope options"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 38351d52-5c92-43ba-9c16-74aa91f2fd44
---

All selectors that filter data by location or organizational grouping should follow a consistent hierarchy and include the full scope chain. The user confirmed this standard after seeing the store-selector pill bar in the FOB EOM Troubleshooter (June 30, 2026).

**Standard scope options (always include all that apply to the context):**

| Level | Examples |
|-------|---------|
| All | "All Locations" |
| State | OK (Oklahoma) |
| Org/Patch/Operator | Operator group, patch (e.g., McReaves) |
| Individual store | 3708, 3709, … |

The pill/chip button style (small rounded pills, selected = accent border + tinted background) is approved and preferred for these selectors.

**Why:** As more multi-location panels are built (FOB, Labor, Food Cost, etc.), consistent selector behavior lets operators quickly filter to their scope without relearning the UI each time. Including All → State → Org/Patch → Location from the start avoids retrofitting later.

**How to apply:**
- Any panel that shows store-level data should have this selector (not just a store number dropdown)
- Order: All first, then group levels, then individual stores — sorted numerically
- When a store is selected, show its name alongside the number if available from the org data (`stores` prop)
- The selector bar should appear immediately below the panel header, above any KPI status rows
- Use `var(--accent)` tint for selected state; neutral `var(--bdr)` border for unselected

**See also:** [[project-meridian]] for org data structure, `stores` prop pattern in App.js
