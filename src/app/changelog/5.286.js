// @ts-nocheck
export default {version:'5.286', date:'2026-08-31', changes:[
  'EOM Diagnosis report -- the Decision Guide table\'s grid lines were nearly invisible in both the ' +
  'in-app Draft view and the public Share-link report. Root cause: both used the "subtle" border ' +
  'token where a "visible" one already existed a step away -- the in-app table used --bdr (the ' +
  'theme system\'s own comment calls it "subtle border") instead of --bdr2 ("visible border"), and ' +
  'the Share-link table used #262b36 instead of #333a48, the shade the SAME file already uses for ' +
  'its own Refresh/Full-report buttons. Verified with a real Chromium render (not just a structural ' +
  'test) before and after -- table borders, header shading, and <hr> dividers on the Share-link ' +
  'version (it had none before) are now clearly visible in both places.'
]};
