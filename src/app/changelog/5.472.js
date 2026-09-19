// @ts-nocheck
export default {version:'5.472', date:'2026-09-19', changes:[
  'Sidebar: "Save Session"/"Restore Session" relocated out of the nav -- both used to be two bare ' +
  'navItem() calls tacked onto the end of AppSidebar\'s render, after the SECTIONS/Admin loop and ' +
  'outside panel-registry.js entirely (no id, no section, no perm gate). "Save Session" duplicated ' +
  'a home it already had (ProfileMenu\'s account-icon dropdown, "Save session to file"); "Restore ' +
  'Session" had no other home at all.',
  'Both actions now live only in ProfileMenu -- "Restore session from file" added right after the ' +
  'existing Save item, wired through AppTopbar\'s existing onRestoreSession prop (App.js already ' +
  'had the handleRestoreSession callback, previously only reachable via the sidebar). Neither is a ' +
  'modal/route panel, so neither belongs in the PANELS registry -- ProfileMenu is the established ' +
  'home for this class of action (theme toggle, Load files, Workflow guide).',
  '2 new tests against the real exported AppTopbar (opening the account menu shows both actions; ' +
  'clicking Restore calls the real onRestoreSession handler) -- would fail on a revert, since ' +
  'ProfileMenu had no Restore item before this change. shell-nav-snapshot.test.js\'s EXPECTED ' +
  'baseline re-captured to drop both labels from the sidebar tail. Full suite 536/536 files, ' +
  '5067/5067 tests. Build clean, eager payload 551.61 KB gzip (budget 850 KB).',
]};
