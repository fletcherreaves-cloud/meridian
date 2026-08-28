# Dispatch #196 — rename Help to Workflow; build a real two-mode Troubleshooting panel

## Context

From `memory/decisions-panel-inventory-2026-08-10.md`: *"Help → Rename to 'Workflow.' Owner wants
'Help' to mean troubleshooting, and a real two-mode (End User / Developer) Troubleshooting panel
built."* This is TWO actions, not one — a rename of existing content, and a genuinely new build.

**Verified 2026-08-28**: the current `help` registry entry (`showHelp&&h(ModalShell,{title:'📖
Meridian — Workflow Guide',...` in `App.js`) already titles its modal "Workflow Guide" and its
content (checked live) is a daily/weekly onboarding checklist ("DAILY: load fresh data, check
Home Command Center, review Priority Brief...") — i.e., this IS the Workflow content the decision
doc means to rename TO. **The rename target is really just the registry `label`/nav entry** (still
literally "Help" today, `icon:'?'`), not a content rewrite — the content is already
workflow-shaped. **No real "Help" (troubleshooting) surface exists anywhere in the app today** —
this is genuinely new work, not a relabel of something else.

## Task

1. **Rename the registry entry**: `help` panel's `label` → "Workflow" (matching its modal's own
   existing title). Consider whether the `id` itself should change too (`help` → `workflow` or
   similar) — if you rename the id, update every `modal==='help'`/`goRoute`/deep-link call site
   (there are at least two `if(modal==='help') setShowHelp(true)` sites in `App.js` — grep for all
   of them, don't assume there are only two). If you keep `id:'help'` for backward-compat with
   existing deep links while changing only the `label`, that's also a defensible choice — state
   which you picked and why (a stale/misleading `id` vs. a broken deep link are both real costs;
   pick the one that costs less here).
2. **Build the new Troubleshooting panel** as the app's actual "Help" — two modes, End User and
   Developer, per the owner's own explicit ask. Before designing content from scratch, check
   whether troubleshooting-relevant content already exists scattered elsewhere in the app (error
   messages, known-issues lists, the SAGE "🐞 Log" flow's failure-language detection, CLAUDE.md's
   own "Known bugs" sections in various dispatch docs) that could seed either mode rather than
   starting from a blank page. Use your judgment on exact content scope for a first slice — this
   doesn't need to solve every possible support question on day one, but it needs to be a real,
   useful two-mode surface, not a placeholder.
   - **End User mode**: plain-language troubleshooting for the app's actual users (data not
     loading, a panel showing stale numbers, "why does this number look wrong" — things a
     GM/supervisor would hit).
   - **Developer mode**: the CLAUDE.md-adjacent stuff — known data-source quirks, where to find
     pull-script logs, common causes of a stale stream, anything that would help Fletcher (or a
     future second operator's own technical support) debug something faster than starting from
     scratch.
3. **Register `?` as this new panel's icon** (matching what `help` used before the rename) unless
   you have a good reason to pick a different one — state your choice.
4. Opportunistic panel-contract check while you're in both surfaces (close button via ModalShell,
   print/export if it's a natural fit for a reference doc — CLAUDE.md's own "print export options
   anytime we build something unless there's no need" rule may apply here) if it doesn't
   meaningfully widen scope.

## Verification

- Workflow panel renders with its (unchanged) content under its corrected label.
- New Troubleshooting panel renders, both modes genuinely populated with real content (not just a
  toggle over two empty states) — describe what's in each mode in your PR body.
- Every deep-link call site for the old `help` id still resolves correctly, whichever id-stability
  choice you made.
- Standard suite + build. Version bump (check `origin/main` current version first).

## Out of scope

- Any other panel merge from the 2026-08-10 list (Feature Requests/Task Queue, Metric
  Correlations) — separate dispatches.
- A full support-ticket/knowledge-base system — this is a reference panel, not a new data model.
