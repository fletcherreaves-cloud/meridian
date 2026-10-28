// @ts-nocheck
export default {version:'5.592', date:'2026-10-27', changes:[
  '**Live-tested v5.591 against the original owner-reported complex question and found it still ' +
  'failed -- a genuine remaining bug, not a leftover from the earlier narration-loop fix.** Re-ran ' +
  'the exact same night-shift planning prompt against the deployed function with a buffer-flush- ' +
  'corrected test harness (ruling out the test script itself as the cause): 84.9s elapsed, 7 tool ' +
  'rounds, stream died with no [DONE] and no error event -- the connection was cut from outside the ' +
  "function's own try/catch, not a JS exception.",
  '**Root-caused and fixed: `fetchAllRows` (paginate.js) paged strictly serially** -- one network ' +
  'round trip per 1000-row page, awaited one at a time. Measured directly against production: a ' +
  'district-wide 90-day query_daily_activity pull is 59 pages and took 10.7s; a wide-range ' +
  'query_staffing_presence pull hit 120 pages and took 43.2s. The night-shift question needs ' +
  '90-day + YTD + last-year windows across two states -- several such calls in one turn summed to ' +
  'more than whatever external timeout was killing the stream. Raising MAX_TOOL_ROUNDS in v5.591 ' +
  'made this worse, not better: more rounds just means more serial multi-second calls before the ' +
  'cutoff. fetchAllRows now fires pages in concurrent batches (6 at a time) instead of one at a ' +
  'time -- same correctness guarantees (ordered reassembly, short-page/empty-page end detection, ' +
  'error short-circuit), several times faster wall-clock for a wide-range pull.',
  '**Also fixed: tool calls within a single model round ran sequentially** (`for...await`) despite ' +
  'the system prompt telling the model it can call multiple tools at once for a question spanning ' +
  'domains. Now `Promise.all`, with tool_result ordering preserved to match the tool_use blocks ' +
  'positionally (required by the Anthropic API).',
  'sage-paginate.test.js rewritten for the new concurrent-batch behavior: the old tests asserted an ' +
  'exact serial call count, which is no longer the contract. New tests assert the invariants that ' +
  'still matter (correct total rows at every boundary, in-order reassembly despite out-of-order ' +
  'completion, error short-circuit) plus a direct concurrency assertion (peak simultaneous in-flight ' +
  'requests > 1 under injected per-page latency) that would fail against a reverted, serial version.',
  '**Re-verified live after deploy -- this does NOT fully fix the original question, and the real ' +
  'cause is a Supabase Edge Function platform limit, not an app bug this dispatch can finish ' +
  'closing.** Re-ran the identical complex prompt four more times (incl. with the outbound proxy ' +
  'properly enabled, and with tool-level parallelism isolated out) -- still dies with no [DONE], ' +
  'every time, always during a large aggregation call, at wildly different elapsed times (25-93s). ' +
  "That variance is the tell: Supabase Edge Functions cap actual CPU TIME per invocation (reported " +
  "200ms-2s, excluding I/O wait), not wall clock -- exceeding it is a silent runtime-level " +
  "CPUTime shutdown that bypasses this function's own try/catch, so no error ever reaches the " +
  'client. This dispatch\'s pagination fix cuts network-WAIT time, which is real and verified (a ' +
  'simple question now completes in 12.5s end-to-end), but does not reduce the actual CPU-bound ' +
  'JSON-parsing/aggregation work a 90-day+YTD+LY, multi-state, multi-metric question needs -- that ' +
  'is the real constraint. OOM, connection-pool exhaustion, and the test harness/proxy were each ' +
  'directly measured and ruled out. Full investigation + what the real fix looks like (server-side ' +
  'SQL aggregation, not yet started): memory/finding-sage-cpu-time-limit-2026-10-27.md.',
  'Full suite 667/667 files, 6200/6200 tests green (paginate suite: 20/20, rewritten). Build clean, ' +
  'bundle unchanged (edge-function-only change, no client bundle impact).',
]};
