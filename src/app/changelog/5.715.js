// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
  '**🎯 Bullseye tile — ring counts + 3 new metric tabs (owner-directed 2026-11-09).** '+
  '"Add numbers to the bands to represent the different rings" — each ring label now shows a '+
  'dynamic count ("BEATING (5)", "AT TARGET (2)", "BELOW TARGET (20)") of the CURRENT scope\'s own '+
  'stores in that band (All vs a single state vs a single patch each show their own real '+
  'distribution), using the exact same band classification the dots themselves already use.\n\n'+
  '**3 new tabs**, reusing the same store.p/store.t shape (buildStore()/DEFAULT_TARGETS) the '+
  'existing 4 already read, each confirmed against a real field before adding: R2P (`p.r2p`/'+
  '`t.tR2p`), KVS Time (`p.kvst`/`t.tKvst`), Healthy Use of KVS/Side 2 (`p.kvsu`/`t.tKvsu`).',
]};
