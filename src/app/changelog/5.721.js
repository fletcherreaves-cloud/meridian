// @ts-nocheck
export default {version:'5.721', date:'2026-11-10', changes:[
  '**🐛 Fix Labor & Scheduling hub\'s squeezed title + wrapping tab bar** (owner-reported via '+
  'screenshot: "fix the title and give the tabs the scrolling option like we did in Inventory '+
  'Control"). 12 tabs in `SCHED_TABS` wrapped onto a second row, and in `RoutePanelShell`\'s '+
  'header flex row (the title div is `flex:1`/`minWidth:0`, the tab bar sits right next to it) '+
  'that squeezed "Labor & Scheduling" down to a near-unreadable sliver rather than pushing the '+
  'tabs to their own line. Fixed with the same established pattern the Inventory Control pilot '+
  '(`PanelChrome.js`) set for exactly this shape of overflow: `minWidth:0` so the tab bar CAN '+
  'shrink below its content width, plus `overflowX:\'auto\'` so it scrolls instead of forcing '+
  'its sibling to collapse. Applied to both of `App.js`\'s hub tab bars — Scheduling (the one in '+
  'the screenshot) and Planning, which shared the identical pre-fix style literal.',
]};
