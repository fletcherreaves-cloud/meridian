// @ts-nocheck
export default {version:'5.365', date:'2026-09-05', changes:[
  'Fixed: after v5.364\'s store id-field fix, the PEAK bulk-capture script correctly resolved all ' +
  '17 stores by name but reported "0 total visit(s)" for every one -- GetStoreDetails\' response ' +
  'array is under a key firstArray() did not check for (same class of bug as v5.364, one step ' +
  'further down the chain). Broadened firstArray()\'s candidate keys (visits/Visits/visitHistory/' +
  'etc.) and added a fallback that accepts ANY array-valued property on the response instead of ' +
  'only a named list, so an unguessed key still works. Also added a raw-response console log for ' +
  'the first store\'s GetStoreDetails call, matching the existing Stores/Paged page-1 log, so the ' +
  'next run is diagnosable in one shot if this guess is still wrong.',
]};
