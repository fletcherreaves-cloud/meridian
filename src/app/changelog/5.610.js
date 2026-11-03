// @ts-nocheck
export default {version:'5.610', date:'2026-11-03', changes:[
  '**Sidebar: picking a panel inside an expanded section now auto-collapses that section** ' +
  '(owner request) -- the same collapse clicking its header would trigger, so the sidebar ' +
  'settles back down to just section headers after you navigate instead of staying expanded ' +
  'indefinitely. v2 nav style only; classic and the icon-rail-collapsed sidebar have no section ' +
  'header to collapse, so both are unaffected, same scoping the section-accordion behavior ' +
  '(v5.6xx-era "expanding one collapses others") already uses.',
]};
