// @ts-nocheck
export default {version:'4.942', date:'2026-08-10', changes:[
  'HOTFIX — the sales-decline check added yesterday (Needs Attention + Attention Now) compared a still-in-progress today against a full day from last year, which could make an ordinary day look like a decline and a real decline look worse than it was, depending purely on what time of day someone happened to look. Both now stop counting today until it’s actually closed out, the same way the rest of the app already handles trailing-week comparisons. Re-checked the real store numbers with the fix in place — same store still stands out as the one with a real problem, nothing else changes.',
]};
