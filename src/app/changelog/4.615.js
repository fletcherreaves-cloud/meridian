// @ts-nocheck
export default {version:'4.615', date:'2026-07-30', changes:[
  'KVS Time per GC now fills from the auto-pulled DAR — the report has no KVS field, but the KVS stations are the MFY make-lines, so it is computed as total MFY serve time ÷ total MFY transactions (reconciled exactly to QSRSoft\'s KVS Time Per GC column). With KVS Healthy Usage (v4.614), both KVS metrics are now cloud-fresh from the DAR and no longer depend on the manual Ops Report or the emailed Glimpse. KVS Healthy Usage measures whether a store opens the 2nd prep-table side when item volume calls for it (blank is correct when volume doesn\'t call for it — not a penalty).',
]};
