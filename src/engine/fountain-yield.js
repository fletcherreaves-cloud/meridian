// @ts-nocheck
// ── Fountain-beverage yield look-back baselines (task #52) ───────────────────────────────────────
// Self-serve beverage towers run structurally short (guests take allowed free refills we can't meter),
// so a fountain item short-with-zero-waste is EXPECTED there and shouldn't read as a loss. But "expected"
// has a ceiling: if this month's fountain shorts run FAR beyond the store's OWN historical norm, that's
// worth a look (BIB connections / syrup-to-water ratios / a real leak), tower or not. This builds each
// store's fountain-short baseline from prior months so the bib-yield check can tell structural from
// abnormal. Pure + tested. Beverage matcher mirrors the bib-yield check so the two agree.

export const FOUNTAIN_BEV_RE = /\b(COKE|SPRITE|FANTA|HI ?C|DR ?PEPPER|MINUTE MAID|MM |LEMONADE|ICED TEA|TEA\/|FRUIT PUNCH|REFRESHER|BIB|LAVABURST|POWERADE|BARQ|SWEET TEA)\b/i;

// Total $ short on fountain beverages with ~zero waste logged (the yield signal) for one period's rows.
export function fountainShortTotal(varRows) {
  return (varRows || [])
    .filter(v => (Number(v.dolDiff) || 0) < 0 && FOUNTAIN_BEV_RE.test(v.descr || '')
      && ((Number(v.rawWaste) || 0) + (Number(v.compWaste) || 0) < 0.01))
    .reduce((s, v) => s + Math.abs(Number(v.dolDiff) || 0), 0);
}

// Baseline from an array of PRIOR monthly fountain-short totals ($). {n, mean, sd}.
export function fountainBaseline(series) {
  const vals = (series || []).map(Number).filter(v => !isNaN(v));
  if (!vals.length) return { n: 0, mean: null, sd: null };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = vals.length >= 2 ? Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) : null;
  return { n: vals.length, mean, sd };
}

// Is `current` fountain-short $ abnormally beyond the store's own baseline? Needs ≥2 months of history.
// Abnormal when it's both above the mean AND (≥ sigma std devs out OR ≥ ratio× the mean).
export function fountainVerdict(current, baseline, { sigma = 2, ratio = 1.6, minAbs = 75 } = {}) {
  const cur = Math.abs(Number(current) || 0);
  if (!baseline || baseline.mean == null || !(baseline.n >= 2)) return { abnormal: false, reason: 'no-baseline', z: null, ratio: null, mean: baseline?.mean ?? null };
  const z = baseline.sd > 0 ? (cur - baseline.mean) / baseline.sd : (cur > baseline.mean ? Infinity : 0);
  const r = baseline.mean > 0 ? cur / baseline.mean : null;
  const abnormal = cur >= minAbs && cur > baseline.mean && (z >= sigma || (r != null && r >= ratio));
  return { abnormal, z, ratio: r, mean: baseline.mean, sd: baseline.sd, n: baseline.n };
}
