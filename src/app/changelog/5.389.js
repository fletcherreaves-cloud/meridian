// @ts-nocheck
export default {version:'5.389', date:'2026-09-07', changes:[
  'Data loading: fetchAll() (the one shared Supabase pagination helper ~37 loaders call) now ' +
  'has a per-page timeout (30s). Previously a page fetch that HANGS -- no error, no response, ' +
  'just a stalled connection -- blocked pagination forever with no escape, because every ' +
  'existing safeguard (dispatch #218\'s retry, the DATA INCOMPLETE banner) only reacts to an ' +
  'error object actually arriving.',
  'A timed-out page now produces a synthetic error that dispatch #218\'s own retry ' +
  'classification already treats as retryable (the same bucket as a raw network failure), so ' +
  'it reuses that exact retry-then-give-up path -- no new UI, no new failure mode, just an ' +
  'escape hatch for a case nothing previously handled.',
  '6 new tests (dispatch-fetchall-page-timeout.test.js) -- a hang that clears on retry, a hang ' +
  'on every attempt (matches dispatch #218\'s existing give-up shape exactly), and a regression ' +
  'guard that the happy path still schedules no lingering timer. Full suite 480 files/4598 ' +
  'tests, all passing. Build clean, eager budget 537.54 KB / 850 KB (unchanged).',
]};
