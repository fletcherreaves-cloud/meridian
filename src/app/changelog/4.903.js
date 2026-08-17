// @ts-nocheck
export default {version:'4.903', date:'2026-08-08', changes:[
  'Register Audit: refund COUNT had refund DOLLARS added into it. The visible symptom was stray cents in the total; the real damage was the amber warning thresholds firing on dollar amounts, so anyone with cashless refund activity looked like an outlier. Split into a count and a dollar total.',
  'The afternoon daypart is now labelled Snack rather than PM.',
]};
