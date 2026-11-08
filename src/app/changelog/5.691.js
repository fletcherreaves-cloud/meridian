// @ts-nocheck
export default {version:'5.691', date:'2026-11-08', changes:[
  '**Fixed: Inventory Control\'s Reports/Scans/Monitor/Pulls menus wouldn\'t open on Mac or '+
  'iPhone (task #119, owner screenshot).** Worked fine on Chrome/Windows — the menu\'s dropdown '+
  'was a descendant of the action row\'s horizontal-scroll container, and Safari (the shared '+
  'engine on both Mac and iPhone) clips a dropdown there more strictly than Chrome/Firefox do, so '+
  'the menu silently rendered with zero visible height instead of opening. The dropdown now opens '+
  'in its own floating layer positioned off the real button, so no scroll container on any browser '+
  'can clip it. Every other panel\'s action menus (Export ▾ on the new reports, etc.) share this '+
  'same component and get the same fix for free.',
]};
