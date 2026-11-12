// @ts-nocheck
export default {version:'5.743', date:'2026-11-12', changes:[
  '**🔒 Panel Manager: a true systemwide kill switch, admin/owner only.** Owner request: '+
  '"leave it the same for the panel manager, but for developer/admin role add a secondary '+
  'toggle to disable systemwide." Each optional panel row now shows a second, admin/owner-only '+
  '"🔒 Everyone" switch alongside the existing per-device show/hide switch. The existing switch '+
  'only ever controlled your own device; the new one is a real global override, persisted to '+
  'Supabase (`org_config`, no new schema) and checked with NO role bypass at all — unlike the '+
  'existing per-role `disabledPanels` gate, which always lets admin/owner through. A panel '+
  'flagged this way is off for every user, every device, every role, including the admin who '+
  'flagged it. New engine primitive `isPanelGloballyEnabled` (permissions.js), wired into the '+
  'same `panelEnabled` choke point that already feeds the sidebar nav and search index, so the '+
  'kill switch applies everywhere a panel can be reached.',
]};
