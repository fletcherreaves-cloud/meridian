// @ts-nocheck
export default {version:'5.808', date:'2026-11-16', changes:[
  '**Register Audit now honors a target override, and the Security Events Manual Pull Trigger ' +
  'is wired up.** Found a real bug while answering the owner\'s "aren\'t we already computing ' +
  'targets for Controls thresholds" question: Register Audit\'s target-aware flagging ' +
  '(Cash O/S/T-Red/POS-Over/Refund) was hardwired to the literal DEFAULT_TARGETS constant and ' +
  'could never honor a Monthly/Yearly Targets workbook override, even though the override ' +
  'already flows correctly everywhere else. Fixed, and the Manual Pull Trigger\'s previously-' +
  'open Security Events gap now reuses that same (now override-aware) flagging engine directly ' +
  '— no new threshold invented. Full audit of what persisted-override UI does and doesn\'t exist ' +
  'yet for these 5 metrics: memory/finding-controls-target-override-architecture-2026-11-16.md.',
]};
