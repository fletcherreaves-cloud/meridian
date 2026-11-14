// @ts-nocheck
export default {version:'5.776', date:'2026-11-14', changes:[
  '**New: Tickets/Calendar section on the GM Daily Review panel** (task #155, Notes 75\'s 2nd ' +
  'routine item — "cheap, well-scoped follow-on" deferred when the rest of the panel shipped). ' +
  'Promotions and other calendar events (games/concerts/community) reuse the SAME org_events ' +
  'day-map expansion (`orgEventsToDayMap`) every other calendar consumer already uses — log-only ' +
  'event types (staffing/training/competitor intel) are excluded since this is the customer-' +
  'facing calendar, not the incident log. **Payroll Released** is pure date arithmetic (every ' +
  'other Wednesday starting 2026-11-18, the owner\'s own anchor), not a data pull. **Truck Orders ' +
  '(Martin Brower)** parses `INV_ORG_COORDS[loc].del` — a real field that already existed but was ' +
  'only ever displayed as a raw string, never parsed into a today/tomorrow flag before this. ' +
  '**Maintenance/Technology Tickets deliberately NOT built** — no automated or manual data ' +
  'source exists (QSRSoft\'s Equipment/Tickets sub-app is WAF-blocked to every tested auth path, ' +
  'memory/notes-74-queue.md\'s own finding); surfaced as an honest "not available" line instead ' +
  'of a fabricated one. New engine function `buildTicketsCalendar` (daily-review.js) + new ' +
  '`TicketsCalendarCard` (daily-review.js panel). 10 new tests.',
]};
