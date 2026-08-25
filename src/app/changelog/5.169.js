// @ts-nocheck
export default {version:'5.169', date:'2026-08-25', changes:[
  'Fix: SAGE topbar quick-access button did nothing on click (dead-link symptom, owner-reported).\n\n'
  + 'Root cause: the SAGE button (`shell.js`\'s `AppTopbar`) calls `onOpenModal(\'sage\')`, but '
  + '`App.js` passes `AppTopbar` a separate, narrower `onOpenModal` handler than `AppSidebar`\'s '
  + '(only `settings`/`help`/`proj-brief`) -- there was never a `sage` case in it, so the click had '
  + 'nowhere to go. Added the missing case, matching `AppSidebar`\'s existing behavior exactly '
  + '(`setShowSage(true); setSageMin(false);`).\n\n'
  + 'Full suite 2498/2498 passing, clean build, no bundle-size effect.',
]};
