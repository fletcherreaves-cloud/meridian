// @ts-nocheck
export default {version:'5.550', date:'2026-10-13', changes:[
  'Above-Store One-Pager -- fixed the Sales/GC section (header vs-LY figures and every per-store ' +
  'drilldown row) reading "—" for a Custom date range far enough in the past (owner-reported ' +
  'live, with a screenshot). Root cause, live-measured: App.js bootstraps the laborRows stream ' +
  '(400 days) and qsrActSummaryRows (60 days) ONCE at app startup, trailing from "today" -- the ' +
  'same bug class already fixed twice this session (Performance Reviews Auto-Fill, ' +
  'CurrentMonthPaceSection). matchedVsLY needs the picked range\'s own dates PLUS the dates 364 ' +
  'days further back (the LY leg); for an ~11-month-old Custom range, the LY leg lands ~23 ' +
  'months back, past even the wider window. labor_rows genuinely has both legs (confirmed via ' +
  'Supabase service-role read) -- the table was never the limiter. Added an on-demand widened ' +
  'fetch, mirroring Performance Reviews\' own precedent exactly: widen only the sources that ' +
  'don\'t already reach back far enough, merge into a local ds copy, never touch the app\'s own ' +
  '`ds`, and a failed/empty fetch never overrides existing non-empty rows.',
  'Above-Store One-Pager -- "Upcoming Impacts" is now its own panel toggle, like every other ' +
  'section (owner-requested) -- it used to always render with no way to hide it. A multi-day ' +
  'tagged event (a school closure, a multi-day festival, etc.) now shows as ONE line spanning ' +
  'its full period with a day-count badge ("11/24 – 11/27 · 4d") instead of one identical- ' +
  'looking line per day. New shared helper groupEventRanges() (engine/events-import.js) does the ' +
  'collapsing, reusing the rangeId/rangeDayNum/rangeTotalDays convention orgEventsToDayMap and ' +
  'EventCalendar.save() already write -- built as a reusable export since multi-day events are ' +
  'surfacing in more places across the app, not a one-off fix local to this panel.',
]};
