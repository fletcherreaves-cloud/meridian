# Dispatch #128 — Speed of Service: real per-store target color bar + fix the underlying metric

**Owner's ask (2026-08-25), across several messages.** Opening ask: *"For Speed of Service > let's
add a color bar based on each locations targets > The target should each locations threshold for
green."* Design question raised back to the owner (per-station target coverage) and answered:
*"Unable to select other metrics on my end, they only show in boxes on top... KVS and R2P are both
part of yearly targets. You are correct on Beverage, no target currently. For OEPE throughout
always remember to use the OEPE w/o park metric as that is the one that is utilized."*

That reply changes the scope in two real ways, both binding:

1. **The panel's underlying DT metric is currently WRONG, not just uncolored** — fix this first,
   the color bar is worthless on top of a bad number.
2. **Every station needs the same interactive treatment DT gets** (trend chart, daypart
   breakdown), not just a static avg box — today only DT has that; the other three stations are
   static numbers with nothing to click into.

## Part 1 — Fix the metric: use `oepeSeconds()`, not raw `dt_untilserve/dt_trans_cnt`

`src/views/dt-speedofservice.js` currently computes DT time as `Σr.dt_untilserve / Σr.dt_trans_cnt`
directly (see `DtTrendChart`'s reducer, and the district-avg number elsewhere in the file) — this
is NOT the reconciled OEPE-without-park formula the rest of the app uses and the owner just
confirmed is "the one that is utilized." The correct, already-shared, already-reconciled formula
lives in **`src/utils/oepe.js`**:
```js
export const oepeSeconds = (x) => (x.dt_untilstore || 0) > 0
  ? _secOf((x.dt_untilserve - x.dt_untilstore) - (x.dt_heldtime || 0), x.dt_trans_cnt)
  : null;
```
This is the one reconciled EXACTLY against a real QSRSoft Service report (#183/#185, r=0.9958) and
is explicitly the basis `tOepe` (the per-store target) was calibrated against — the file's own
comment says the WITH-park variant (`oepeWithParkSeconds`) is "never scored, never tOepe's basis."
**Every place in `dt-speedofservice.js` that currently sums `dt_untilserve`/`dt_trans_cnt` raw
needs to switch to summing the `oepeSeconds()` components** (`dt_untilserve`, `dt_untilstore`,
`dt_heldtime`, `dt_trans_cnt`) and applying the same formula, so this panel's number finally
matches every other panel's OEPE number instead of being its own uncalibrated calculation. Import
and reuse `oepeSeconds`/the shared helper — do not re-derive the formula inline.

## Part 2 — Per-store, per-station color targets

Replace the flat `DT_GREEN=200`/`DT_AMB=240` constants with real per-store thresholds, mapped by
station to the correct `DEFAULT_TARGETS` field (confirmed via `src/lib/supabase.js`'s yearly-
targets mapping, not guessed):

| Station (panel key) | Target field | Confirmed via |
|---|---|---|
| DT (drive-thru) | `tOepe` (seconds) | already used by `location-intel.js`'s `oepeTgt=t.tOepe\|\|240` |
| Front Counter (`fc`) | `tR2p` (seconds) | `supabase.js:2164` — "R2P (Receipt to Print, sec) = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt" — an `fc_*`-sourced metric |
| Kitchen/MFY (`kitchen`) | `tKvst` (seconds) | `supabase.js:2190` — "KVS Time per GC (seconds) = total MFY serve time ÷ total MFY transaction count" — an `mfy*_*`-sourced metric |
| Beverage (`bev`) | **none today** — owner confirmed | keep the flat 200/240 bands OR mark explicitly "no target set" (see below) |

Do not use `tKvsu` for anything color-bar-related — it's KVS *utilization* (a 0–1 fraction,
confirmed at `supabase.js:2186` "KVS Healthy Usage... healthy ÷ (healthy+unhealthy)"), a
completely different kind of metric than a seconds-based speed threshold. It has nothing to do
with this dispatch.

Band definition per station-with-a-target: green `< target`, amber `< target+40`, red `≥
target+40` — reusing the existing 40s amber buffer from the current flat bands, just relocated
per-store per-station. For Beverage (no target): keep the current flat 200/240 bands, but the
color bar / summary UI must make it visually obvious this store's beverage threshold is a
**fallback default**, not a calibrated target — e.g. a distinct visual treatment (dashed border,
"(default)" label) rather than rendering identically to a real per-store target. Don't silently
present a guessed number as if it were as trustworthy as `tOepe`/`tR2p`/`tKvst`.

Render as a color bar (gauge-style: 0 → red-threshold, colored zones, a marker at the current
value) per store per station, replacing or supplementing the current flat-colored number boxes.

## Part 3 — Make every station interactive, not just DT

Confirmed by reading the file: `DtTrendChart`/`DtDaypartChart` (the interactive trend + daypart
charts, with period/org filters) are wired ONLY to the district-wide DT number. The "Speed of
Service by Station" block (~line 425-433) renders Front Counter/Kitchen/Beverage as static
`stationData.map(...)` avg boxes with no click/select affordance — this is the owner's "unable to
select other metrics... they only show in boxes on top" complaint. Add a station selector (tabs or
a dropdown alongside the existing period/org filters) so `DtTrendChart`/`DtDaypartChart` can render
for whichever station is selected (DT/FC/Kitchen/Beverage), each using that station's own
`untilserve`/`trans_cnt` fields (already computed per-station in `stationData`'s reducer — reuse
that field mapping, don't re-derive it) and its own color thresholds from Part 2.

## Scope

`src/views/dt-speedofservice.js` only. `src/utils/oepe.js` is imported from, not modified. Do not
touch `DEFAULT_TARGETS`/`constants.js` (the target fields already exist) or any other panel that
also renders OEPE/KVS/R2P numbers (e.g. `location-intel.js`, `morning-brief.js`) — those already
use the correct sourcing and are out of scope here.

## Verification bar

- Confirm (grep + a real before/after screenshot or rendered-value comparison) that the panel's DT
  number now matches `oepeSeconds()` output for the same underlying rows — pick a real store/day
  and show the before (raw untilserve/trans) vs after (oepeSeconds) values differ and the after
  value matches what e.g. Location Intel or Morning Brief already show for that store/day.
- Render the color bar for at least 3 stores with meaningfully different `tOepe`/`tR2p`/`tKvst`
  values (the DEFAULT_TARGETS spread is huge — e.g. `tOepe` ranges 75s–210s across real stores)
  and confirm each store's green/amber/red bands are genuinely different, not the same flat
  200/240 for all of them.
- Confirm Beverage's fallback-default treatment is visually distinct from a real per-store target
  station.
- Confirm the station selector actually switches `DtTrendChart`/`DtDaypartChart`'s data source and
  color thresholds for all 4 stations, not just DT.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean.

## Do NOT

- Do not use `tKvsu` for any speed/color-bar logic — it's a utilization fraction, not a time
  threshold.
- Do not invent new per-store target fields for Beverage — the owner confirmed none exist; use the
  fallback-default treatment instead.
- Do not touch other panels that already source OEPE/KVS/R2P correctly.
