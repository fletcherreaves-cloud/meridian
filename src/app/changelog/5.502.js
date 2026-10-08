// @ts-nocheck
export default {version:'5.502', date:'2026-10-06', changes:[
  'GM assignments get the same effective-dated history + audit log Supervisor just got (v5.501), ' +
  'owner follow-up request: a GM swap (like Tishomingo\'s) now leaves a dated record instead of ' +
  'silently overwriting a name. New Settings tab, "GM Assignments" -- same add/edit-date/remove ' +
  'flow as Supervisor Assignments, one store per row (a GM is 1:1 with a store, unlike a ' +
  'Supervisor\'s multi-store patch).',
  'constants.js\'s whoRan()/groupsAt() tie-break loop generalized into a shared latestEffective() ' +
  'primitive, reused by the new GM timeline instead of a second copy of the same "latest start ' +
  '<= date wins" logic. No schema change needed -- the org_assignment_audit table from v5.501 ' +
  'already allows assignment_type:\'gm\'.',
]};
