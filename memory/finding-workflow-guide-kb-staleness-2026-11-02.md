---
name: finding-workflow-guide-kb-staleness-2026-11-02
description: "Audit + fixes for the owner's 2026-11-02 'refresh knowledge base/help' ask — which in-app Workflow Guide / KB content was stale against the real current app structure."
metadata:
  type: finding
---

# Workflow Guide / KB staleness audit (2026-11-02)

Part of the owner's "refresh knowledge base/help + build role-based interactive Getting Started
tool" backlog item. Investigated with a dedicated read-only audit (16 numbered claims + the
Troubleshooting panel + the `panel_index` KB article) before rewriting anything, per the
"measure, don't reason" standing rule — every fix below is backed by a real panel-registry.js
entry, changelog entry, or App.js call site, not a guess.

## What was actually stale (fixed)

- **`App.js`'s `showWorkflow` "📖 Workflow Guide"** (the daily/weekly/monthly cadence modal):
  - "district grid" → **District View** (the component is literally `DistrictGrid`, but the
    KB's own `panel_index` article already calls it "District View" — guide now matches).
  - WEEKLY/MONTHLY "Lock the ... projection" steps referenced the `proj`/`pvsa`/`dialedin`
    panels as plain sidebar buttons. All three are now `kind:'test-kitchen'` (dev-gated,
    hidden in the ⚗ Test Kitchen drawer unless betaMode is off) — the real promoted home for
    the day-to-day workflow is the **Planning** hub (`id:'planning'`, tabs: Targets/Monthly/
    Pace/Yearly/Smart Targets). Rewrote both steps to point to Planning first, with the Test
    Kitchen panels named as the full-grid alternative.
  - "FOB Analysis" (toolbar button) → **Food Cost** (`id:'fob-analysis'`, renamed per changelog
    4.259, and it's a sidebar nav item, not a toolbar button).
  - "Channel Intelligence" / "Channel Intel toolbar button" → **folded into 3PO Delivery's
    Overview tab** (dispatch #201, 2026-08-28 — `channel-intel` is now `kind:'internal'`,
    redirect-only).
  - "Revenue Intel toolbar" → **Revenue** (current registry label), and it's a Panel-Manager-
    toggled optional panel, not a toolbar button.
  - **Hardcoded operator names** ("Ryan, Gary, Rick/Kathy, Jacob") — still factually correct
    today (`constants.js` `DEF_SETTINGS.operators`) but violates the standing "don't hardcode
    org/people names in app content" rule and is brittle (these names already changed once).
    Genericized to "each operator group."
  - "Store KB (📍)" — icon claim was wrong (registry had an empty icon; 📍 is actually used
    elsewhere for the Location grouping mode). Fixed the registry entry itself (see below)
    instead of just removing the claim, since nothing else used that icon slot.
  - "Why Engine"/"3PO Delivery" quick-reference items reworded to note they're optional panels
    (Panel Manager toggle), not toolbar buttons.

- **`forecast.js`'s `KB_ARTICLES`**:
  - `locked_projections`: "Open Projections from the sidebar (Forecasting > Projections)" and
    "Go to Proj vs Actuals (Forecasting > Proj vs Actuals)" — same Test-Kitchen-demotion issue
    as above, rewritten to point to Planning + name the Test Kitchen panels explicitly. Also
    corrected "saved to localStorage" → **"saved to Supabase, cloud-synced across devices"**
    (verified: `App.js`'s `saveLockedProjections` calls `saveUserSetting('locked_projections',
    next)`, and `_stLockedProjections` loads it back via `loadUserSettings(...)`, logging "✓
    Loaded locked projections from Supabase" — localStorage is just the instant-read mirror).
  - `smart_targets`: "Access: Sidebar → 🎯 Smart Targets" — `smart-targets` is now
    `kind:'internal'` (redirect-only); real access is **Planning → Smart Targets tab**
    (confirmed: `modal==='smart-targets-v2'` sets `setPlanningTab('smart')` + `goRoute('planning')`).
  - `panel_index`'s own TEST KITCHEN bullet listed "AI tools (Anomaly Scan, Why Engine)" as
    Test Kitchen items — both are actually `kind:'optional'` (Panel Manager toggle), never
    Test Kitchen. Corrected.
  - `panel_index`'s "Feature Requests / Task Queue" bullet undersold a real merge (dispatch
    #194 absorbed Feature Requests into Task Queue as one list with a `type` field;
    `feature-requests` is now `kind:'internal'`, redirect-only). Reworded to say so.

- **`panel-registry.js`**: `store-kb`'s label fixed `'Store Kb'` → `'Store KB'`, icon `''` →
  `'📍'` (verified no other code reads `PANEL_BY_ID['store-kb']`'s icon, so this is a pure
  correctness fix with zero rendering risk — the entry is `kind:'internal'`, never shown in nav).

## What was checked and is NOT stale (left alone)

Shift Analysis tab, Intelligence Brief tab, GM Coaching Letters (modal title still verbatim
matches even though the sidebar label shortened to "GM Letters"), Competitive Impact, the
10-days-before-week-start / 15th-of-prior-month deadline language (at-a-glance.js computes the
identical deadlines live today), and the Troubleshooting panel (`src/views/troubleshooting.js`,
already self-aware about the Food Cost rename and the Calendar→Events & Tags move, no hardcoded
names).

## Deliberately not done in this pass

- A full promotion/demotion audit of every Test-Kitchen panel this guide now points to (whether
  `proj`/`pvsa`/`dialedin` SHOULD be promoted back to `kind:'nav'`, given the guide treats them
  as the normal weekly workflow) — that's a product decision, not a doc-accuracy fix, and is
  explicitly out of scope here. Flagging it: the guide now describes BOTH the promoted Planning
  path and the Test Kitchen fallback, which is accurate either way regardless of that decision.
- The "build a role-based interactive Getting Started tool" half of the backlog item — a new UI
  build with its own design questions (what varies by role, how "interactive" vs. the existing
  static Workflow Guide modal), tracked separately from this content-accuracy pass.
