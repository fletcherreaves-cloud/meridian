// @ts-nocheck
export default {version:'4.510', date:'2026-07-24', changes:[
  'Data Manager Sync buttons now confirm which stream actually got triggered. If you click one source (e.g. LifeLenz Schedule) but the server starts a different sync, the toast warns you loudly instead of silently trusting it — the tell-tale sign the sync Edge Function needs a redeploy. Each toast also names the stream it dispatched.',
]};
