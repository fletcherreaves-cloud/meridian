// @ts-nocheck
export default {version:'5.780', date:'2026-11-14', changes:[
  '**Fix: QSRSoft Employee Pay History Pull upsert failure (GH issue #1698).** The pull was ' +
  'failing on 15/28 stores (`ON CONFLICT DO UPDATE command cannot affect row a second time`) ' +
  'because QSRSoft genuinely returns a distinct row per job title within one pay period -- an ' +
  'employee who worked two different job titles in the same period collided the old 5-column ' +
  'primary key. Owner ran the permanent fix: widened `qsr_employee_pay_period_history`\'s ' +
  'primary key to include `job_title_code` (DDL + backfill of pre-existing nulls to the new ' +
  '\'\' sentinel, confirmed live via the Management API) rather than the lossy alternative of ' +
  'merging colliding rows in the script, which would have silently blended two different jobs\' ' +
  'hours/rate/dollars together on every future occurrence in what is meant to be the real ' +
  'historical wage ground truth. `scripts/qsrsoft-pay-history-pull.mjs` updated to match: ' +
  '`mapRow()` now writes the `\'\'` sentinel instead of `null` for a missing job title, and the ' +
  'upsert\'s conflict target includes `job_title_code`. End-to-end verified live against the ' +
  'production table with two synthetic rows reproducing the exact collision shape, not just ' +
  'unit tests. Full findings: memory/finding-pay-history-pk-widen-2026-11-14.md.',
]};
