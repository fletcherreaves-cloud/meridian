// @ts-nocheck
export default {version:'5.807', date:'2026-11-16', changes:[
  '**Manual Pull Triggers** — real feature, not just a plan. Data Manager now flags exactly ' +
  'which store needs a manual eBOS Purchases or Forms Completion Report pull, driven by signals ' +
  'that already exist (FOB tolerance status, graded-visit cadence) rather than a blanket weekly ' +
  'pull across every store. Also: CoachQ confirmed Forms Completion Report is already an ' +
  'above-store, multi-store report (not one-store-at-a-time like eBOS/Security Events), and that ' +
  'none of the three can be added to the schedulable email list without a QSRSoft Support ' +
  'request. A real gap caught before shipping: no Security Events trigger exists yet, because ' +
  'none of the 4 POS-Controls metrics (Cash O/S, T-Red Before/After, Discount) has an official ' +
  'target in the workbook — confirmed empirically, not assumed, and left as an explicit open ' +
  'item rather than a guessed threshold. Full writeup: ' +
  'memory/plan-manual-pull-schedule-2026-11-16.md.',
]};
