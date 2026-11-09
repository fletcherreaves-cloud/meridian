// @ts-nocheck
export default {version:'5.716', date:'2026-11-09', changes:[
  '**🖼️ Curated Home — Checklist/Bullets/Narrative consolidated into one in-panel "View" control '+
  '(owner-directed 2026-11-09: "Checklist, Bullets and Narrative are all the same except the '+
  'look... give user preference in how they want to see the data... add an in panel view options '+
  '... That way only the one they chose is visible. Also, can drop the word Format at this point '+
  'as well.").** These three used to be three separate always-visible buttons in the main picker, '+
  'alongside Game Plan/Shift Scoreboard/The Patch/The Ledger. They now collapse into a SINGLE '+
  'picker entry (labeled dynamically with whichever of the three is currently chosen), and the '+
  'actual Checklist/Bullets/Narrative choice moves to a small "View" control rendered in-panel, '+
  'right alongside the data itself — only the one you\'ve picked is ever on screen at once. The '+
  'word "Format" is gone from the main picker entirely.\n\n'+
  '**Zero data loss for existing preferences.** A format value saved before this consolidation '+
  '(a user who had explicitly picked Checklist, Bullets, or Narrative) migrates losslessly on '+
  'load into the new shape — the single picker entry plus that exact style, never reset to a '+
  'default. Two separate per-user settings now persist this (`curated_home_format` for the '+
  'top-level picker choice, new `curated_home_data_view` for which of the three styles), same '+
  'Supabase `user_settings` + localStorage-mirror pattern every other preference in this panel '+
  'already uses. Game Plan / Shift Scoreboard / The Patch / The Ledger are untouched — this only '+
  'affects the three stylistic variants of the same underlying item list.',
]};
