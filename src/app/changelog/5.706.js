// @ts-nocheck
export default {version:'5.706', date:'2026-11-09', changes:[
  '**Missed on Current Count — "Force count date" now shows a real frozen snapshot for a past '+
  'date, not today\'s live counts re-labeled (owner request 2026-11-09).** `qsr_onhand` is '+
  'rolling-latest — a later recount overwrites it — so picking a past date used to re-anchor '+
  'TODAY\'s on-hand state against that date instead of recovering what was actually missed back '+
  'then. Now reads `inv_count_sessions`\' own frozen `missing_items` for the exact (store, date, '+
  'class) picked — the durable record a later recount can never erase. A class with no session '+
  'on file for that exact date says so plainly instead of guessing or going silent. Blank/today '+
  'is unchanged.',
  '**Added a Class Filter (Food/Condiment/Paper/Non-Product)** to the same report — same shape '+
  'and localStorage persistence as FOBEOMPanel\'s "Class Filter (view & print)" — filtering the '+
  'on-screen view and Print/Copy/CSV together.',
]};
