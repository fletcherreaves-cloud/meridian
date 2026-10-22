// @ts-nocheck
export default {version:'5.583', date:'2026-10-22', changes:[
  '**Swing alarm: the 4th and last Notes 58 requirement shipped -- AI scour for what the ' +
  'mechanical checks miss.** Owner\'s original ask (Notes 58, 2026-08-19) had four parts: (1) ' +
  'detect a large one-directional sales/guest swing, (2) make it impossible to miss, with a ' +
  'click acknowledgement, (3) preemptively compile a report pulling other metrics/trends to ' +
  'establish operational-vs-external cause, (4) use AI to scour for anything missed. Re-measured ' +
  'this session against the real code (not assumed from memory docs): parts 1-3 were already ' +
  'fully shipped across several earlier dispatches -- swing-feed.js/SwingAlarm.js (detect + ' +
  'blocking click-ack modal, persisted to Supabase with a who/when audit trail) and ' +
  'swing-context.js\'s newsContextFor/metricContextFor (local-news ranking + this store\'s own ' +
  'labor%/OEPE before-vs-during comparison). Part 4 was the one piece swing-context.js\'s own ' +
  '2026-09-22 comment explicitly flagged as deferred: "Wiring an AI-driven cause search... is a ' +
  'separate, more judgment-laden piece, not done here."',
  'New `aiScourForSwing` (engine/swing-context.js) routes through the same sage-chat web-search ' +
  'pattern engine/why.js\'s lookupMissEvent already proved out for forecast-miss lookups: on a ' +
  'user click (not auto-fired -- a real API call per use), it hands Claude what the news/metric ' +
  'scans already found and asks it to use web search for whatever those two mechanical checks ' +
  'could not catch -- a closed road with no news coverage, a competitor promo, a local event -- ' +
  'and report 2-4 ranked candidates. Same standing framing as the rest of this file: candidates ' +
  'only, never a claimed cause.',
  'Wired into the real CriticalSwing modal (components/SwingAlarm.js), not just the engine: a ' +
  '"AI Scour" button below the existing news/metric-context sections, with loading/result/error ' +
  'states and a clear control, state reset per swing item (no stale result carried from one ' +
  'store\'s modal into the next). 6 new tests mount the actual component and drive the full ' +
  'button-click -> loading -> result/clear/error cycle, per this repo\'s "would this ' +
  'verification still pass if reverted" standing rule.',
  'Corrected memory/notes-58-queue.md and memory/MEMORY.md, which had never been updated to ' +
  'reflect that parts 1-3 shipped (same stale-doc pattern found and fixed for Notes 67 earlier ' +
  'this session) -- both now mark all four Notes 58 swing-alarm requirements resolved.',
  'Full suite 660/660 files, 6133/6133 tests green. Build clean, within budget (576.90 KB ' +
  'eager / 850 KB).',
]};
