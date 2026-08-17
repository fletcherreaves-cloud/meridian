// @ts-nocheck
export default {version:'4.871', date:'2026-08-07', changes:[
  'Startup: removed ten full-table row-count scans that ran on every single login purely to write numbers to the browser console. Two of them exceeded the database statement timeout and failed outright, and all ten competed with the real data loads during startup. Time to a usable app dropped by about 7 seconds. The diagnostic is still available at ?tablecounts=1.',
]};
