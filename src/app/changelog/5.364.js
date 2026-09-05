// @ts-nocheck
export default {version:'5.364', date:'2026-09-05', changes:[
  'Fixed: scripts/browser-peak-visit-detail-bulk-capture.js (v5.363) found 0 stores it could ' +
  'enumerate on its first live run -- confirmed by the owner\'s DevTools console log, ' +
  '{Name, ID, LocalCode, Address1, ...} is the real shape of a Stores/Paged store entry, and the ' +
  'id field is `ID` (all-caps). pickId() checked `Id`/`id`/`StoreId`/etc. but not plain uppercase ' +
  '`ID`, so all 17 stores this run found were skipped with "could not find an id field". Added ' +
  '`ID` as the first-checked candidate. Auth (the __RequestVerificationToken lookup) and the ' +
  'GetEntities/Stores/Paged calls themselves already worked correctly on this same run -- this was ' +
  'the one remaining shape gap the script\'s own header comment had flagged as unconfirmed.',
]};
