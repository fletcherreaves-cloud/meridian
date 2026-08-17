// @ts-nocheck
export default {version:'4.949', date:'2026-08-10', changes:[
  'Small cleanup, no behavior change: 3 more places that hand-built "the last full business day" from scratch now share the one helper that already existed for it — the Above-Store One-Pager\'s month-to-date range and two of Labor Tools\' trailing-window pickers. This is the exact kind of copy-pasted date math that has caused a real bug five separate times when someone accidentally left off the "exclude today" part; fewer places holding a hand-copy means fewer places that can quietly drift.',
]};
