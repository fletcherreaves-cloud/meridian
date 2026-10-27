// @ts-nocheck
export default {version:'5.591', date:'2026-10-27', changes:[
  '**Made SAGE usable for the two deeper gaps flagged in v5.590** (owner: "do what is needed to ' +
  'make it usable, yes to all") -- raised the tool-calling round budget and built the two tool ' +
  'capabilities SAGE never had: daypart (time-of-day) queries and staffing-presence queries.',
  '`MAX_TOOL_ROUNDS` raised from 3 to 8 (9 total model calls per turn) -- a genuinely complex ' +
  'multi-state, multi-window, multi-metric question plausibly needs more than the 4 calls the ' +
  'old budget allowed. The final-round "stop planning, answer now" nudge (v5.590) still fires ' +
  'regardless of where the new ceiling lands.',
  '**`query_daily_activity` can now be scoped to a time-of-day window** via new optional ' +
  'hour_slot_min/hour_slot_max params, and now returns real oepe_avg_sec/kvs_avg_sec/r2p_avg_sec ' +
  '(the same formulas the in-app panels use, reused verbatim from src/utils/oepe.js and the ' +
  'graded-visits.js/metric-provenance.js formulas confirmed earlier today) alongside the existing ' +
  'dt_avg_sec, which is unchanged. **Bug found and fixed in the same pass**: the aggregation keyed ' +
  'its per-store map by qsr_daily_activity\'s raw zero-padded loc ("0003708") and looked store ' +
  'names up in an unpadded dict -- the lookup could never match, so every query_daily_activity ' +
  'response named every store "Store 00XXXXX" instead of its real name. Extracted the whole ' +
  'aggregation into daily-activity-agg.js (same pattern as paginate.js/stream-events.js) so this ' +
  'is directly tested.',
  '**New tool: `query_staffing_presence`** -- answers "who/what role worked a shift" from raw ' +
  'clock punches (qsr_punch_times), classified by role (GM/DM-AM/SM/crew) using the same job-code ' +
  'mapping src/engine/tenure-roles.js already uses for performance reviews, reused rather than ' +
  're-derived. Optional after_local_hour param scopes to shifts starting at/after a given local ' +
  'clock hour (e.g. closing/night coverage). This tool structurally never selects or returns ' +
  'employee_name or a raw geid -- only role-level, store-level counts -- and its tool description ' +
  'tells SAGE explicitly that GM/DM are commonly salaried-exempt and invisible to this data, so a ' +
  'zero result must never be reported as "no GM worked." Extracted into staffing-presence.js, ' +
  'same testable-module pattern.',
  'buildSystemPrompt (src/views/sage.js) updated and renumbered for all 13 tools (was 12), since ' +
  'an undocumented or mis-numbered tool list is how this has gone stale before.',
  'Full suite 667/667 files, 6198/6198 tests green (26 new). Build clean, bundle essentially ' +
  'unchanged (entry gzip 408.22 KB vs 408.24 KB -- text-only change in sage.js, no new imports).',
]};
