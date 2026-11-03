// @ts-nocheck
export default {version:'5.612', date:'2026-11-03', changes:[
  '**GM role: trimmed nav to match the real GM routine (owner-approved, task #77).** Applied the ' +
  'first slice of `memory/plan-role-based-panel-gating-2026-11-03.md` — 18 multi-store/strategic ' +
  'analytical panels (Pricing Engine, Promo/Discount ROI modeling, Market Intelligence, Trend ' +
  'Explorer, Signals, Leaderboards, Conversion/Oil Efficiency, and the 9 Reports Hub deep-dive ' +
  'reports) are no longer in a GM\'s nav — none of them are named in the real GM Routines ' +
  'reference the plan was built from. Uses the existing `disabledPanels` role mechanism (task ' +
  '#64) — a pure trim, not a new restriction: a GM with no entry here behaves exactly as before. ' +
  'Supervisor and OM are unchanged (their own routines show the broader analytical surface is ' +
  'correct for those tiers). `src/engine/permissions.js`\'s `DEFAULT_ROLES` carries this as the ' +
  'shipped default now; the live org\'s already-persisted role list was updated to match via the ' +
  'same `org_config.org_roles` row the Settings → Roles UI writes to.',
]};
