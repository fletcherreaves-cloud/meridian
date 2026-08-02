-- ── SMG FullScale response count (Notes 36 #7) ──────────────────────────────────────────────────
-- Adds the per-store OSAT response count `n` so district/patch/org roll-ups can n-weight the CSAT
-- percentages (Σ pct·n / Σ n) instead of averaging averages (the standing "never average averages"
-- rule). Safe to re-run. After running this, RE-UPLOAD the latest SMG FullScale file so existing
-- rows get their n populated (the parser now reads it from the "Data Only" layout's OSAT-n column).
-- Until then the roll-up falls back to a simple mean automatically (null n).

alter table public.smg_fullscale add column if not exists n integer;
