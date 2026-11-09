// @ts-nocheck
export default {version:'5.704', date:'2026-11-09', changes:[
  '**Fixed: Curated Home crashed on a fresh app load when it is the default landing panel.** '+
  '`computeMorningBrief(ds, ...)` assumed `ds` itself was always an object, but App.js\'s `ds` '+
  'state starts as `useState(null)` until Supabase/IDB hydration resolves — a user whose default '+
  'landing panel is Curated Home (task #68) hit "Cannot read properties of null (reading '+
  '\'laborRows\')" on that very first render, caught live via the owner\'s own browser console. '+
  'Defaults `ds` to `{}` once at the top of `computeMorningBrief` rather than guarding every '+
  'read site individually.',
]};
