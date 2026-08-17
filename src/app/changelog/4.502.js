// @ts-nocheck
export default {version:'4.502', date:'2026-07-24', changes:[
  'Fix: SAGE\'s 📚 Prompts library (and the 🐞 Log modal) opened but ignored all clicks/typing — the modals were trapped inside SAGE\'s stacking context and covered by other app layers. They now render at the top level (portal) above everything, so they\'re fully interactive.',
  'Fix: the 🐞 Log button was capturing the wrong prompt — if you\'d answered a SAGE suggestion with "Yes, please", that thin reply became the logged context. It now walks back to the actual substantive prompt and captures the last few turns of the conversation, so multi-prompt sessions log accurately.',
]};
