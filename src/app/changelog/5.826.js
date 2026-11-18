// @ts-nocheck
export default {version:'5.826', date:'2026-11-18', changes:[
  '**LifeLenz DAR now backs GC/OEPE/R2P/KVS Time/Labor %/Actual Hrs too, as-is — with a ' +
  'disclaimer, not another reconciliation project.** Owner decision: "for practicality purposes, ' +
  'just use LifeLenz as is for the metrics and put a disclaimer somewhere." Added as a fallback ' +
  '(auto-before-manual order preserved) in all 7 chains: `gc`, `actHrs`, `oepe`, `r2p`, `kvst`, ' +
  '`laborPct`. Still correct math, not naive averaging: speed-of-service fields are a ' +
  'transaction-weighted daily average (the best available proxy — LifeLenz has no per-station ' +
  'transaction count to weight exactly by); Labor % is a sales-weighted daily average, which is ' +
  'mathematically EXACT, not an approximation, and is converted from LifeLenz\'s wire percent to ' +
  'this app\'s fraction convention at the source. The disclaimer lives in the existing Metric ' +
  'Lineage / KPI-ⓘ transparency system (`metric-provenance.js`) rather than a new UI element — ' +
  'auto-appended to any metric reading from LifeLenz DAR, plus the two hand-curated OEPE/R2P ' +
  'entries. Full writeup: memory/finding-lifelenz-dar-schema-2026-11-17.md.',
]};
