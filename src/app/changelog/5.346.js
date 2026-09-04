// @ts-nocheck
export default {version:'5.346', date:'2026-09-04', changes:[
  'Automated a new QSRSoft "Store Settings" endpoint (owner-captured live while exploring ' +
  'cash-control automation): weekly pull of per-store drawer/safe/instore cash-handling config ' +
  '(starting drawer bank, safe backup/petty cash, storewide/drawer max cash, deposit-validation ' +
  'requirements) into a new qsr_store_settings table -- scripts/qsrsoft-store-settings-pull.mjs.',
  'Distinct from the already-shipped Store Controls pull (storewide_controls, v5.328) -- different ' +
  'host (prod-green.ebos.qsrsoft.com, no /api/ prefix), overlapping but non-duplicate config ' +
  '(spot-checked: max_storewide_cash matches at 10 for store 3708; starting drawer-bank amount, ' +
  'deposit-validation requirements, and settingMaxDrawer have no counterpart in storewide_controls).',
  'Raw response preserved in full as JSONB; extractCashSettings() (src/engine/store-settings.js) ' +
  'projects a flattened cash-handling slice alongside it, tested against the real captured response.',
  'Two things left explicitly UNVERIFIED (this environment has no QSRSoft credentials to dry-run ' +
  'against): whether store_busn_dt is a real "as-of" date param (defaulted to today) or ' +
  'inert config-endpoint noise, and whether the shared eBOS SSO token actually authenticates ' +
  'against the prod-green host -- both flagged for the owner to confirm on the first live run. ' +
  'memory/project-qsrsoft-store-settings-endpoint.md has the full endpoint intel.',
  'No UI wiring yet (deliberately) -- the response also carries recipe yield-band ranges, waste ' +
  'limits, and full per-channel/per-day store hours+dayparts, none of it surfaced anywhere; the ' +
  'natural next home is alongside the existing Signals Store Controls tab.',
  '4 new tests (dispatch-store-settings-pull.test.js) against the real captured payload.',
]};
