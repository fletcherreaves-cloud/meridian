// @ts-nocheck
export default {version:'5.565', date:'2026-10-15', changes:[
  'Needs Attention -- added an "Open Coaching" section (owner, live, 2026-10-14: "why don\'t we ' +
  'include an area in the panel to check on progress of any and all open coaching issues. To ' +
  'see what is happening and be able to append new notes to it with time stamped and date ' +
  'stamped entries and by whom"). Previously a coaching cycle was only visible for ONE single ' +
  'day-window (once its 30-day review came due); there was no way to browse everything still in ' +
  'flight or record progress while a cycle was open.',
  'New engine/coaching-loop.js openCoachingCycles() -- every result==null cycle (not just ones ' +
  'due today), sorted soonest-review-first so the list reads as a queue, each carrying a ' +
  'daysUntilReview for display (negative = overdue).',
  'New append-only coaching_cycle_notes table (schema-coaching-cycle-notes.sql) -- deliberately ' +
  'a SEPARATE table from coaching_cycles.note (the one-time start note), not a read-modify-write ' +
  'array column, so every entry is immutable and individually timestamped/attributed. Same ' +
  'tenant+loc RLS shape as coaching_cycles itself. Author is captured via the same auth.getUser() ' +
  'email convention AttentionPanel\'s existing ackItem()/NeedsYouTodayTile\'s dismiss() already use.',
  'The Needs Attention panel\'s new "🎯 Open Coaching (N)" section (collapsible, same pattern as ' +
  'Acknowledged/Running Well) lists every open cycle -- store, metric, days until review, the ' +
  'original start note, and the full appended-note history with author + timestamp -- plus an ' +
  'inline "+ Add note" field to log progress without waiting for the review date. A cycle whose ' +
  'review has come due also gets a "🎯 Log Verdict →" shortcut straight to the existing review ' +
  'flow, no need to find it in the main findings list first.',
  'ds.coachingCycleNotes now loads eagerly alongside ds.coachingCycles (same small/slow-growing- ' +
  'table treatment), and refreshCoachingCycles() (already threaded everywhere a coaching change ' +
  'needs to show up live) now reloads both in one call, so an appended note, a new cycle, and a ' +
  'recorded verdict all refresh the same way.',
  '7 new tests (3 in coaching-loop.test.js for openCoachingCycles, 4 in new ' +
  'open-coaching-section.test.js rendering the real component: only open cycles show, start ' +
  'note + appended history render with attribution, adding a note calls addCoachingCycleNote ' +
  'and refreshes, empty state). Full suite green (605/605 files, 5658/5658 tests), npm run ' +
  'build clean, within the entry-chunk budget.',
  '⚠️ Needs a one-time manual step: run schema-coaching-cycle-notes.sql in the Supabase SQL ' +
  'editor to create the table. Until then, note history is simply empty (no crash) -- the add-' +
  'note call fails silently via the normal error path, same as any other not-yet-migrated table ' +
  'in this codebase.',
]};
