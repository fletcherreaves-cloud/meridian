// @ts-nocheck
export default {version:'5.501', date:'2026-10-06', changes:[
  'OK Supervisor reassignment (owner-provided org chart, effective 2026-10-05): Zukarr Eaves ' +
  'promoted from GM (Tishomingo) to Supervisor, taking 3708/24471/43380 from Robert Spencer and ' +
  'Ashley Podroza; Robert Spencer also picks up 13113 (from Ashley) and 35064 (from Steven ' +
  'Vaughn). Sabrina Turner replaces Zukarr Eaves as GM of Tishomingo (43380).',
  'New append-only org_assignment_audit table + logOrgAssignmentChange() helper: every add/edit/ ' +
  'remove through Settings -> Supervisor Assignments now logs to a permanent audit trail with no ' +
  'update/delete policy at all, so even a corrective removal of a supervisor assignment stays ' +
  'recoverable -- closing the one real gap in the existing effective-dated timeline (removing a ' +
  'row previously left no trace anywhere). Owner must run supabase/schema-org-assignment-audit.sql ' +
  'once in the Supabase SQL editor to activate it.',
  'The real production org_config.app_settings.orgAssignments was updated directly via the ' +
  'service-role key -- the 5 new rows were appended (never overwriting the prior history), so ' +
  'whoRan()/groupsAt() correctly resolve the OLD supervisor for any date before 2026-10-05 and ' +
  'the new one on/after.',
]};
