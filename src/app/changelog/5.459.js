// @ts-nocheck
export default {version:'5.459', date:'2026-09-16', changes:[
  'P2 panel scorecard (Task #76): found and fixed two panels that were dead by default -- ' +
  'GM Coaching Brief (Management -> Coaching Letters) and Forecast Brief (Analytics -> ' +
  'location intelligence brief) both required a personal Anthropic API key ' +
  '(localStorage mf_anthropic_key) and called api.anthropic.com directly from the browser. ' +
  'No user, including the owner, has ever set that key, so both always threw ' +
  '"No Anthropic API key set" / showed "API key required" and never generated anything.',
  'Fixed by routing both through the already-deployed sage-chat Edge Function instead -- ' +
  'extracted the streaming SSE client out of the SAGE panel into a new shared ' +
  'src/lib/sage-client.js (callSageStream, unchanged behavior; new callSageOnce ' +
  'convenience wrapper for one-shot, non-streaming callers). coaching.js\'s callClaude and ' +
  'analytics.js\'s LocationBrief.generateBrief now call callSageOnce -- no API key required, ' +
  'no server redeploy needed (sage-chat is already live). The other 7 files still on the ' +
  'legacy mf_anthropic_key pattern are a separate, larger follow-up, not touched this pass.',
  '11 new tests (sage-client.test.js: the extracted SSE client\'s parsing contract + the new ' +
  'wrapper; dispatch-p2-scorecard-sage-brief-migration.test.js: renders the real ' +
  'GMCoachingBrief/LocationBrief components with no API key set and asserts callSageOnce is ' +
  'what actually gets called, not fetch/localStorage -- so a revert of the wiring, not just ' +
  'the helper, would fail here). Findings + scope: memory/finding-p2-scorecard-sage-brief-fix-2026-09-16.md.',
]};
