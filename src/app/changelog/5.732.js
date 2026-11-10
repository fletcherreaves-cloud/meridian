// @ts-nocheck
export default {version:'5.732', date:'2026-11-10', changes:[
  '**🔧 Fixed: Security findings view was silently failing to refresh, every single day.** The '+
  'materialized view the Security panel reads from (shipped this morning) was never actually '+
  'updating after its daily batch run — the refresh call hit a hard 8-second timeout on the API '+
  'connection path it used, every time, against the table\'s real size. Caught live while turning '+
  'on the new drawer-open scoring rule for review. Fixed by moving the refresh to a scheduled job '+
  'inside the database itself, outside that timeout entirely — verified working end-to-end before '+
  'shipping. The Security panel now actually reflects each day\'s new findings.',
]};
