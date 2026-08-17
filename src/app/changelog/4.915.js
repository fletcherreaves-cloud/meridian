// @ts-nocheck
export default {version:'4.915', date:'2026-08-08', changes:[
  'Clicks no longer wait for the store rebuild. Every time a data loader finished, the app rebuilt all 27 stores immediately and the screen froze until it was done — measured at up to half a second each, and it ran sixteen times in one session. That work now happens at low priority, so a click, a menu or closing a panel goes through first. The numbers are unchanged; they just no longer block what you are doing.',
]};
