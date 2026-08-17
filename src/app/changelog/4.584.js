// @ts-nocheck
export default {version:'4.584', date:'2026-07-29', changes:[
  'EOM Full report: the Unit/Qty Variance column was showing 0.0 for every item (it read a field that only exists on journey events) — it now shows the real quantity variance from the Variance Stat report alongside the $ variance.',
  'EOM Item Journeys: the report figure is now framed as one "Variance" with clear Qty and $ sub-values, and reconciliation now confirms BOTH — a "✓ Variance matches report" when the ledger $ and quantity both tie out, or a specific "⚠ doesn\'t fully match — $ off by … / qty off by …" when they don\'t. Quantity also shows an approximate full-case count where the case size is known.',
  'EOM "Ask SAGE" now closes the EOM dashboard when it hands off, so SAGE opens in front instead of behind the dashboard (it was opening hidden underneath).',
  'Leadership One-Pager review titles renamed: Owner→DO = Organization Business Review & Checkpoint, DO→Supervisor = Patch Business Review & Checkpoint, Supervisor→GM = Restaurant Business Review & Checkpoint.',
]};
