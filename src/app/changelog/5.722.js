// @ts-nocheck
export default {version:'5.722', date:'2026-11-10', changes:[
  '**🐛 Fix: couldn\'t reach the top bar\'s rightmost icon in portrait mode.** The top bar\'s '+
  'right-actions group (Search/SAGE/Log something/scope pills/Date/Notifications/Settings/'+
  'Profile) had `flexShrink:0` and no `overflowX`, and the bar itself has none either — on a '+
  'narrow portrait viewport the combined width simply ran past the right edge with nothing to '+
  'scroll it into view, stranding the Profile icon off-screen. Same root cause and the same '+
  'established fix as tonight\'s hub-tab-bar fix and the Inventory Control pilot '+
  '(`PanelChrome.js`): `minWidth:0` so the group can shrink below its content width, '+
  '`overflowX:\'auto\'` so the excess scrolls instead of overflowing, `overflowY:\'visible\'` '+
  'pinned explicitly so NotificationBell\'s and ProfileMenu\'s own dropdowns (descendants of '+
  'this div, positioned absolutely) don\'t get clipped into a tiny box — the exact regression '+
  '#1596 fixed for PanelChrome\'s band 3, now guarded against here too.',
]};
