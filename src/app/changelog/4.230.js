// @ts-nocheck
export default {version:'4.230', date:'2026-06-27', changes:[
  'Performance Reviews — Competencies: each item now has an active/inactive toggle (checkbox). Inactive items are hidden from the rating UI and excluded from behavioral scoring, but keep their index so existing ratings stay intact. Also supports custom behavioral categories: use "+ Category" in Customize → Competencies to add your own categories (editable label, deletable).',
  'Performance Reviews — Weights: metric rows now show "Active" instead of "Scored" with a clearer label. Delete button (×) per metric removes it from scoring calculations (KPI data is preserved). Deactivating via checkbox excludes from scoring without removing the metric.',
  'Performance Reviews — Rating Thresholds: "Current Meaning" column now shows actual values with direction context (e.g. "4 ≥+5% · 3 ≥0% · 2 ≥-5% · 1 else") instead of generic t1/t2/t3 placeholders. Updated header explains what raising/lowering each threshold boundary does in plain English.',
  'Behavioral scoring engine updated to respect active/inactive competency flags and include custom categories in calculations.',
]};
