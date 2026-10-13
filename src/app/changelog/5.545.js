// @ts-nocheck
export default {version:'5.545', date:'2026-10-13', changes:[
  'Events > Full Ledger -- added the ability to tag a new event across a date range, not just a ' +
  'single day (owner-requested, mass-review notes 70). The "+Add Event" form now has an ' +
  'optional end-date field; saving a range writes one entry per day, sharing a rangeId with ' +
  '"(Day N of M)" labels -- the SAME convention events-import.js\'s orgEventsToDayMap() already ' +
  'established for multi-day org-sourced spans (school closures, etc.), so a manually-created ' +
  'range is structurally identical to an imported one to every existing consumer (dupe ' +
  'detection, the grouped multi-store display). Editing an existing single day still edits just ' +
  'that one day, even if it\'s part of a range -- the end-date field only appears for a brand-' +
  'new event. Saving over a range that collides with existing tagged days warns once, naming ' +
  'every day that would be replaced, rather than silently overwriting or warning per-day.',
]};
