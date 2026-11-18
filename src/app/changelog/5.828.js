// @ts-nocheck
export default {version:'5.828', date:'2026-11-18', changes:[
  '**"DT OEPE w/o Parked" nights report widened to any daypart, plus a custom time-of-day ' +
  'range.** Owner follow-up, same day as the nights-only ask: "as prescribed is good, but ' +
  'adding multiple dayparts would be helpful. Even a start time and end time selector would be ' +
  'useful." Renamed from "Night OEPE w/o Parked" to **"OEPE w/o Parked by Daypart"** — the ' +
  'original 3 night segments (4pm-Close / 5pm-7pm / 7pm-Close) are unchanged, joined by ' +
  'Breakfast (7-9am) and Lunch (11am-2pm), reusing the exact slot sets `daypart-peaks.js`\'s "3 ' +
  'Peaks" panel already defines — plus a **Custom range** picker (any start/end hour, inclusive). ' +
  'One fetch per Run Report (now the full day\'s hourly rows, not just the night slots); ' +
  'switching daypart or custom range recomputes instantly client-side with no re-query.',
]};
