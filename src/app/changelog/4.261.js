// @ts-nocheck
export default {version:'4.261', date:'2026-07-02', changes:[
  'Fixed "Manifest: Syntax error" appearing twice on every load — index.html had stale /meridian/ paths for the manifest, favicon, and apple-touch-icon left over from GitHub Pages era. All three now point to / (Netlify root). Deleted stale root-level manifest.webmanifest with old paths.',
  'Fixed Supabase 400 error on pending report download — the Gmail poller pipeline was also picking up manually-uploaded reports (source=manual) and trying to download them from Storage, where they don\'t exist (they\'re stored as base64 in file_data). Filter now excludes source=manual; those are correctly handled by the cross-device sync block.',
]};
