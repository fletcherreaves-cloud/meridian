// @ts-nocheck
export default {version:'5.578', date:'2026-10-17', changes:[
  '**Access Log extended to 3 more restricted-tier panels** (owner: "other panels sound like a ' +
  'good plan", same day as v5.577\'s first cut). Grepped panel-registry.js/permissions.js for ' +
  'every panel gated behind a permission narrower than the broadly-granted analytics.* tier -- ' +
  'the same test Pay Rate History/Security were picked by -- and found three real matches: ' +
  'User Management (AdminPanel, gated users.manage.all -- admin/owner only, the single tightest ' +
  'permission in the system), Settings, and Panel Manager (both gated settings.view -- VP/DO/ ' +
  'Admin/Owner). Deliberately skipped Performance Reviews and Data Manager -- both broadly ' +
  'granted to most roles, so neither fits the "restricted tier" test.',
  'No schema change -- app_access_log.panel_id is free text with no check constraint, so this is ' +
  'an app-only change (three new logAppAccess(\'panel_view\', ...) mount-effects + the Access ' +
  'Log viewer\'s PANEL_LABELS map). 3 new tests, each mounting the real panel component and ' +
  'asserting the exact log call on mount.',
]};
