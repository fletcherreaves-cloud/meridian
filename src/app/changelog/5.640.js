// @ts-nocheck
export default {version:'5.640', date:'2026-11-05', changes:[
  '**New: Role-view sandbox — preview the app as another role (task #97, owner-approved).** ' +
  'Admin/Owner only. A "👁 View as role" selector in the account menu lets a level-1 user see ' +
  'exactly what the nav, panel visibility, and every permission-gated control looks like for ' +
  'another role — without touching their own account. Single interception point: `App.js`\'s ' +
  '`perm()`/`panelEnabled()` (the two functions every nav item, modal gate, and panel-visibility ' +
  'check already calls — ~100 call sites) now read `effectiveRole` (the simulated role when one ' +
  'is set, else the real role) instead of `userRole` directly, so every one of those call sites ' +
  'picked it up with zero changes of its own. A loud, always-visible "👁 VIEWING AS" banner (same ' +
  'treatment as the existing Data Incomplete banner) sits under the topbar whenever a simulation ' +
  'is active, with an Exit button; the account-menu header also shows the simulated role plus a ' +
  'note naming the real one. Deliberately NOT persisted anywhere (no localStorage/sessionStorage/' +
  'cloud settings) — it always resets to the real role on reload, so nobody can be left "stuck" ' +
  'simulating a lower role after walking away. This is a client-side nav/panel display ' +
  'simulation only, not a real RLS re-scope: the signed-in JWT and `accessibleLocs` never ' +
  'change, so it is strictly restrictive (can only hide things a real admin/owner already sees, ' +
  'never grant anything) — a lower-role simulation can\'t expose data a real holder of that role ' +
  'couldn\'t already see. Location/patch/store SCOPE simulation (as opposed to role) is ' +
  'deliberately out of scope for this pass — a real second step, not forgotten. 5 new tests, ' +
  '735/735 test files, 6680/6680 tests; build clean.',
]};
