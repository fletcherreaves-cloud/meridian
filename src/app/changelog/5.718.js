// @ts-nocheck
export default {version:'5.718', date:'2026-11-09', changes:[
  '**👥 Admin: proper location/patch picker for accessible_locs** (owner request 2026-11-09 — '+
  '"indulge me in the user settings... give them not just access to other stores but access '+
  'to a whole patch"). User Management\'s per-user store grant was a raw comma-separated text '+
  'box; replaced with `LocationsEditorModal` — a grouped-by-state (OK/FL) checkbox grid of '+
  'every store plus a "quick add a whole patch" dropdown sourced from the live '+
  '`supervisorGroups()` (never hardcoded), which unions a supervisor\'s current stores into '+
  'the selection additively rather than replacing an existing single-store grant. Saves '+
  'straight to `profiles.accessible_locs` (blank selection clears it back to unrestricted), '+
  'the same real RLS-enforced mechanism every panel\'s data already scopes against — no new '+
  'schema, no change to how access is enforced, just a usable way to grant it. Self-service '+
  '"switch between my own granted stores" and a temporary role-perspective toggle are '+
  'explicitly deferred as their own follow-up.',
]};
