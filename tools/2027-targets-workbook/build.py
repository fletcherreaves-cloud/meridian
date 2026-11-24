import json, os, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter
from openpyxl.drawing.image import Image as XLImage

# Standalone offline tool (not a live Meridian app feature -- no Supabase writes, nothing wired
# into the app). SCRIPT_DIR/DATA_DIR are path-portable: this runs correctly from any checkout,
# not just the sandbox session it was first built in. BASE is the OUTPUT directory (the two
# generated workbooks land next to this script); DATA_DIR holds its real source data (the
# already-pulled/derived JSON files, the two logo PNGs, and the owner's original 2026/2027
# targets upload) -- see README.md in this folder for what's in there and how to refresh it.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
BASE = SCRIPT_DIR
LOGO_PATH = {'OK': f'{DATA_DIR}/logo-ok-chip-final.png', 'FL': f'{DATA_DIR}/logo-fl-chip-final.png'}

def insert_org_logos(ws, subtotal_rows):
    """Drops a small circular MCDOK/Emerald Arches badge into column A of that org's own subtotal
    row (A-D are blank there) -- both badges built to match the same circle + bottom text-band
    language, sized to sit cleanly inside the subtotal row's own height without crowding any real
    data, on-screen only (A-D are outside the print area, same as the rest of the identity block)."""
    for org, r in subtotal_rows.items():
        if r is None:
            continue
        img = XLImage(LOGO_PATH[org])
        ws.add_image(img, f'A{r}')
peak_extra = json.load(open(f'{DATA_DIR}/peak-period-service-extra.json'))
osat_fix = json.load(open(f'{DATA_DIR}/osat-top2-fix.json'))
mcd3po_fix = json.load(open(f'{DATA_DIR}/mcdelivery-3po-fix.json'))
voice_ead_fix = json.load(open(f'{DATA_DIR}/voice-ead-fix.json'))
mcd_gcrd_fix = json.load(open(f'{DATA_DIR}/mcdelivery-gcrd-combined-fix.json'))
fullscale_fix = json.load(open(f'{DATA_DIR}/fullscale-report-fix.json'))
trendb2b_full = json.load(open(f'{DATA_DIR}/trendreport-b2b-full-fix.json'))
master = json.load(open(f'{DATA_DIR}/master-data.json'))
up = json.load(open(f'{DATA_DIR}/uploaded-files-extract.json'))
gapfill = json.load(open(f'{DATA_DIR}/gap-fill-data.json'))
smart_trend = json.load(open(f'{DATA_DIR}/smart-trend-data.json'))
lindsay18213 = json.load(open(f'{DATA_DIR}/lindsay-18213-profile.json'))
contacts = json.load(open(f'{DATA_DIR}/contacts-data.json'))
turnover_ly = json.load(open(f'{DATA_DIR}/turnover-ly.json'))
digital_gcrd_data = json.load(open(f'{DATA_DIR}/digital-gcrd.json'))
sales_gc_growth = json.load(open(f'{DATA_DIR}/sales-gc-growth.json'))
ytd = json.load(open(f'{DATA_DIR}/ytd-data.json'))
ytd_files = json.load(open(f'{DATA_DIR}/ytd-files-data.json'))
lindsay_ytd = json.load(open(f'{DATA_DIR}/lindsay-18213-ytd.json'))
roster_current = json.load(open(f'{DATA_DIR}/roster-current.json'))
hours_per_day = json.load(open(f'{DATA_DIR}/hours-per-day.json'))

# ---- 2026 Target, pulled directly from the owner's real original uploaded workbook ----
# (the "whammy" request's first column). Measured directly against that file's real structure,
# not assumed: each of its 6 category groups repeats a '[Restaurant#][LY][Target]' column pattern
# per metric, anchored by its own 'Restaurant' store-number column; the per-store value in the
# TARGET half of each pair is this store's real, individualized 2026 target (distinct from, and
# not a copy of, row 4's single flat "Org. Target -->" reference number for that metric).
_ORIG_PATH = os.path.join(DATA_DIR, '2027_Restaurant_Targets_Original_Upload.xlsx')
# key -> (anchor column holding the store #, target column for that metric)
_TARGET_2026_COLMAP = {
    'oepe_7_9': (6, 8), 'oepe_11_2': (6, 10), 'oepe_5_7': (6, 12),
    'oepe_peak_combined': (15, 17), 'park_peak_combined': (15, 19),
    'kvs_peak_combined': (15, 21), 'healthy_peak_combined': (15, 23), 'r2p_peak_combined': (15, 25),
    'osat_pace': (28, 30), 'voice_ead': (28, 32), 'osat_b2b': (28, 34), 'contacts_1800': (28, 36),
    'digital_pct': (39, 41), 'digital_gcrd': (39, 43), 'mcd_gcrd': (39, 45),
    # mcd_wait/mcd_stars deliberately NOT mapped (owner-confirmed 2026-11-23): the original file's
    # values at these columns ("< 3 Minutes", ">4.5") are the identical universal threshold for
    # every store, not a real individualized per-store target -- copying that same number into
    # every row would misrepresent it as one. 2026 Target reads n/a for these two; the 2027 Target
    # formula is untouched and still proposes a real number off this store's own actual results
    # (trailing + smart adjustment), same as every other metric. The owner will set the real
    # per-store 2026/2027 number after meeting with operators, via the Override column.
    'crew_staff_target': (53, 55), 'shift_leader_target': (53, 57),
    'gmdm_target': (53, 59), 'headcount_target': (53, 61), 'turnover_ttm': (53, 63),
    'tpph': (70, 71), 'labor_pct': (70, 74), 'fob_pct': (70, 77),
}
# No 2026 target exists anywhere in the original file for these -- confirmed by reading its full
# 77-column structure, not assumed: Sales $/Guest Counts aren't tracked there at all; the "total
# day" OEPE/Park/KVS/Healthy/R2P blends and the per-peak breakouts for Park/KVS/Healthy/R2P don't
# exist either -- only OEPE itself got split into 3 peak periods there, every other peak metric
# was only ever tracked as one combined number (oepe_peak_combined etc., mapped above). Act vs.
# Scheduled/Needed labor isn't in the file at all. mcd_wait/mcd_stars ARE in the file, but their
# values are a universal threshold, not a per-store target (owner-confirmed 2026-11-23 -- see the
# comment at their entry above, deliberately left out of the colmap). turnover_3mo is deliberately
# left unmapped too, not missing by oversight: the file's closest-named columns ("0-90 Day Crew
# T/O", a new-hire cohort metric, and "YTD Crew T/O", a Jan-1-to-date cumulative figure) are each a
# different real-world measure from this metric's own trailing-3-calendar-month definition, and
# guessing between two wrong-but-plausible mappings is worse than leaving it n/a. Per the owner
# (2026-11-23), this -- along with turnover_ttm's own possible cohort mismatch against the file's
# "TTM Shift Leader T/O" column -- is bundled into a larger open item (turnover AND staffing/
# headcount forecasting both need review, possibly against McDonald's PDW data) the owner is
# deliberately deferring to a later pass, not asking to be resolved now.
_target2026_wb = openpyxl.load_workbook(_ORIG_PATH, data_only=True)
_target2026_ws = _target2026_wb['Table 1']

def _target2026_value(raw):
    import datetime as _dt
    if raw is None:
        return None
    if isinstance(raw, _dt.time):
        return round(raw.hour * 60 + raw.minute + raw.second / 60, 2)
    if isinstance(raw, str):
        s = raw.strip().lstrip('<>= ').strip()
        try:
            return float(s)
        except ValueError:
            return None
    return raw

TARGET_2026_BY_KEY = {}
for _key, (_anchor_col, _target_col) in _TARGET_2026_COLMAP.items():
    _by_loc = {}
    for _r in range(5, 48):
        _loc_raw = _target2026_ws.cell(row=_r, column=_anchor_col).value
        if _loc_raw is None:
            continue
        _loc = str(_loc_raw).strip()
        _v = _target2026_value(_target2026_ws.cell(row=_r, column=_target_col).value)
        if _v is not None:
            _by_loc[_loc] = _v
    TARGET_2026_BY_KEY[_key] = _by_loc
print(f'2026 targets loaded from original upload: {sum(len(v) for v in TARGET_2026_BY_KEY.values())} store-metric values across {len(TARGET_2026_BY_KEY)} metrics')

STORE_NAMES = {
 '3708':'Ardmore-Broadway','5183':'Chickasha-So 4th','5985':'Durant-US Hwy 70/22','6972':'Ada-Country Club',
 '10422':'Atoka-Mississippi','10915':'Seminole-Milt Phillips','11657':'Purcell','13113':'Madill-Hwy 70',
 '18213':'Lindsay-Wal-Mart','44689':'Lindsay','20475':'OKC-I240/Sooner','24471':'Ardmore-Cooper/12th',
 '29760':'Duncan-Hwy 81','31357':'Pauls Valley-Ballard Rd','32525':'Sulphur','33109':'Marietta','33222':'Elgin',
 '33704':'Tecumseh','34222':'Harrah','35064':'Holdenville','43380':'Tishomingo-Main & Refuge',
 '6178':'Chipley-St Rd 77','6838':'Defuniak Springs','10034':'Bonifay','35242':'Cottondale',
 '37566':'Mossy Head','38609':'Freeport','43701':'Ponce de Leon-Hwy 81/I-10',
}
# Supervisor/patch assignments updated 2026-11-23 per the owner's Organization Structure table
# (screenshot, 27 rows) -- a real territory restructure, not a typo fix: Zukaar Eaves is a new OK
# supervisor (split off Robert Spencer's/Ashley Podroza's old patch), and Mary Ratliff is a new FL
# supervisor (took over most of what was all Brad Denley before; he keeps Cottondale/Freeport/
# Ponce de Leon). Tuple stays (org, sup, op) -- sup -> Supervisor/Patch column, op -> Owner/Operator.
ORG_INFO = {
 '3708':('OK','Zukaar Eaves','Ryan Thorley'),'5183':('OK','Krystiana Langford','Gary Mornhinweg'),
 '5985':('OK','Ashley Podroza','Rick/Kathy Thorley'),'6972':('OK','Robert Spencer','Ryan Thorley'),
 '10422':('OK','Ashley Podroza','Rick/Kathy Thorley'),'10915':('OK','Steven Vaughn','Ryan Thorley'),
 '11657':('OK','Amanda Estrada','Gary Mornhinweg'),'13113':('OK','Robert Spencer','Rick/Kathy Thorley'),
 '18213':('OK','Krystiana Langford','Gary Mornhinweg'),'44689':('OK','Krystiana Langford','Gary Mornhinweg'),
 '20475':('OK','Amanda Estrada','Gary Mornhinweg'),'24471':('OK','Zukaar Eaves','Ryan Thorley'),
 '29760':('OK','Krystiana Langford','Ryan Thorley'),'31357':('OK','Amanda Estrada','Ryan Thorley'),
 '32525':('OK','Robert Spencer','Ryan Thorley'),'33109':('OK','Ashley Podroza','Rick/Kathy Thorley'),
 '33222':('OK','Krystiana Langford','Ryan Thorley'),'33704':('OK','Steven Vaughn','Gary Mornhinweg'),
 '34222':('OK','Steven Vaughn','Gary Mornhinweg'),'35064':('OK','Robert Spencer','Rick/Kathy Thorley'),
 '43380':('OK','Zukaar Eaves','Ryan Thorley'),
 '6178':('FL','Mary Ratliff','Jacob Thorley'),'6838':('FL','Mary Ratliff','Jacob Thorley'),
 '10034':('FL','Mary Ratliff','Ryan Thorley'),'35242':('FL','Brad Denley','Jacob Thorley'),
 '37566':('FL','Mary Ratliff','Ryan Thorley'),'38609':('FL','Brad Denley','Jacob Thorley'),
 '43701':('FL','Brad Denley','Ryan Thorley'),
}
ORG_LABEL = {'OK':'MCDOK','FL':'Emerald Arches'}

# Sort: OK (MCDOK) group first, then FL (Emerald Arches) group, each sorted by store number --
# per owner request: keep the two orgs separate, but sort by loc number within each, no special
# pinning. 44689 (Lindsay) sits in the MCDOK group at its natural numeric position; 18213
# (Lindsay-Wal-Mart, its predecessor, same staff/owner/supervisor) is dropped from the roster.
_ACTIVE_LOCS = [l for l in STORE_NAMES.keys() if l != '18213']
LOCS = sorted(_ACTIVE_LOCS, key=lambda l: (0 if ORG_INFO[l][0] == 'OK' else 1, int(l)))
LOCS_OK = [l for l in LOCS if ORG_INFO[l][0] == 'OK']
LOCS_FL = [l for l in LOCS if ORG_INFO[l][0] == 'FL']

# Font + palette matched to the owner's own 2026/2027 workbook (Calibri, vivid per-section header
# colors, 22pt group titles) per their explicit "use the original file upload for formatting
# guidance" instruction -- this overrides the xlsx skill's generic Arial-everywhere default.
FONT_NAME = 'Calibri'
BLUE = Font(name=FONT_NAME, color='0000FF')
BLACK = Font(name=FONT_NAME, color='000000')
WHITE = Font(name=FONT_NAME, color='FFFFFF')
BOLD = Font(name=FONT_NAME, bold=True)
HDR_FILL = PatternFill('solid', fgColor='D9E1F2')
YELLOW_FILL = PatternFill('solid', fgColor='FFFF00')
GREY_FILL = PatternFill('solid', fgColor='F0EFEC')
PCT = '0.0%'
SEC = '0.0"s"'
NUM0 = '#,##0'
CUR0 = '$#,##0'

from openpyxl.styles import Border, Side
THIN = Side(style='thin', color='999999')
MEDIUM = Side(style='medium', color='333333')
ROW_BORDER = Border(top=MEDIUM, bottom=THIN, left=THIN, right=THIN)
CELL_BORDER = Border(top=THIN, bottom=THIN, left=THIN, right=THIN)

# Matched directly to the owner's real original uploaded workbook's own per-category-group
# header fills (measured from 2027_Restaurant_Targets_-_OK_-_FL.xlsx 'Table 1', row 3 fills):
#   OEPE Peak Periods group            -> 00B0F0 (cyan)
#   Combination-of-Peaks/Park/KVS/      -> FFFF00 (yellow)
#     Healthy/R2P "total" group
#   Customer Satisfaction group        -> FFC000 (gold)
#   Digital Execution group            -> 00B050 (green)
#   People Targets group (theme5/.4)   -> F4B183 (light orange, "Accent2 Lighter 40%")
#   Labor & Food Over Base (theme6/0)  -> A5A5A5 (gray, "Accent3")
SECTION_COLORS = {
    'Speed':           {'fill': '00B0F0', 'text': 'black', 'name': 'cyan'},
    'Sales & Traffic':  {'fill': 'FFFF00', 'text': 'black', 'name': 'yellow'},
    'Labor':            {'fill': 'A5A5A5', 'text': 'black', 'name': 'gray'},
    'CSAT':             {'fill': 'FFC000', 'text': 'black', 'name': 'gold'},
    'Digital':          {'fill': '00B050', 'text': 'white', 'name': 'green'},
    'Turnover':         {'fill': 'F4B183', 'text': 'black', 'name': 'light orange'},
    # Speed/Service split into 7 tabs (owner-requested). The original workbook only breaks OEPE
    # out into its own peak-period group (cyan) -- KVS/R2P/Park/Healthy's peak numbers, the
    # 3-peaks-combined blends, AND the full-day numbers all sit together in the original's single
    # second ("yellow") group, so all of those tabs here share that same yellow.
    'OEPE Peak':        {'fill': '00B0F0', 'text': 'black', 'name': 'cyan'},
    'KVS Peak':         {'fill': 'FFFF00', 'text': 'black', 'name': 'yellow'},
    'R2P Peak':         {'fill': 'FFFF00', 'text': 'black', 'name': 'yellow'},
    'Park Peak':        {'fill': 'FFFF00', 'text': 'black', 'name': 'yellow'},
    'Healthy Peak':     {'fill': 'FFFF00', 'text': 'black', 'name': 'yellow'},
    'Peaks Combined':   {'fill': 'FFFF00', 'text': 'black', 'name': 'yellow'},
    'Service Total Day':{'fill': 'FFFF00', 'text': 'black', 'name': 'yellow'},
}

def set_cell(ws, r, c, value, font=None, fill=None, fmt=None, bold_hdr=False, comment=None, wrap=False, border=None, align=None):
    cell = ws.cell(row=r, column=c, value=value)
    cell.font = font or BLACK
    if fill: cell.fill = fill
    if fmt: cell.number_format = fmt
    if wrap: cell.alignment = Alignment(wrap_text=True, vertical='center', horizontal=align or 'center')
    elif align: cell.alignment = Alignment(horizontal=align, vertical='center')
    if comment: cell.comment = Comment(comment, 'Analysis')
    if border: cell.border = border
    return cell

def get(d, loc, default=None):
    v = d.get(loc)
    return v if v is not None else default

print('data loaded, building workbooks for', len(LOCS), 'stores')

# ---------------------------------------------------------------------------
# Per-store metric values, assembled once, reused by both workbook variants.
# direction: 'lower' (seconds/park/r2p/turnover - lower target is better),
#            'higher' (osat/digital/mcdelivery/healthy-use - higher is better),
#            'variance' (act-vs-sched/needed - target is a tolerance band around 0),
#            'total' (sales/GC - annual total with a growth rate)
# ---------------------------------------------------------------------------
# 44689 (Lindsay, relocated 2026-11-09) has only ~8 days of its own real data -- far too thin for
# a trailing baseline. Per owner instruction: backfill every missing metric from 18213 (Lindsay-
# Wal-Mart, same staff/owner/supervisor/org, superseded by 44689), since operational RATES
# (seconds, %, ratios) transfer across the relocation. VOLUME metrics (Sales $, Guest Counts) are
# scaled up, since the new freestanding build has materially more capacity than the old in-line
# Wal-Mart location -- +15% is a clearly-flagged placeholder assumption, not a measurement; the
# owner should correct it with real knowledge of the new store's capacity.
LINDSAY_VOLUME_SCALE = 1.15

def metrics_for(loc):
    m = master.get(loc, {})
    peak = up['peakSliceTrailing'].get(loc, {})
    is_lindsay_backfill = (loc == '44689')
    bf = lindsay18213 if is_lindsay_backfill else {}
    bf_note = ' [backfilled from 18213 -- same staff/owner/supervisor, relocated 2026-11-09]'

    # "Trailing Baseline" everywhere below = full YTD 2026 (per owner instruction: anchor 2027
    # targets to this year's actual results, not a short trailing window). T3M/T6W are kept ONLY
    # as the 'recent'/'prior' pair that sizes the smart Adjustment default's trend direction --
    # they no longer set the baseline LEVEL itself.
    peakYTD = ytd_files['peakSliceYTD'].get(loc, {})
    out = {
        'oepe_7_9':   {'ly': None, 'trailing': peakYTD.get('7am-9am'), 'recent': peak.get('7am-9am'), 'prior': peakYTD.get('7am-9am'),
                        'direction':'lower', 'unit':'sec', 'source':'3_Peaks export (Service sheet), full YTD 2026'},
        'oepe_11_2':  {'ly': None, 'trailing': peakYTD.get('11am-2pm'), 'recent': peak.get('11am-2pm'), 'prior': peakYTD.get('11am-2pm'),
                        'direction':'lower', 'unit':'sec', 'source':'3_Peaks export (Service sheet), full YTD 2026'},
        'oepe_5_7':   {'ly': None, 'trailing': peakYTD.get('5pm-7pm'), 'recent': peak.get('5pm-7pm'), 'prior': peakYTD.get('5pm-7pm'),
                        'direction':'lower', 'unit':'sec', 'source':'3_Peaks export (Service sheet), full YTD 2026'},
        'oepe_pace':  {'ly': m.get('oepeLY'), 'trailing': ytd['oepeYTD'].get(loc),
                        'recent': m.get('oepeT6W'), 'prior': m.get('oepeT3M'),
                        'direction':'lower', 'unit':'sec', 'source':'qsr_daily_activity_rollup, full YTD 2026'},
        'park_pct':   {'ly': m.get('parkLY'), 'trailing': ytd['parkYTD'].get(loc),
                        'recent': m.get('parkT6W'), 'prior': m.get('parkT3M'),
                        'direction':'lower', 'unit':'pct', 'source':'qsr_daily_activity_rollup, full YTD 2026'},
        'kvs_pace':   {'ly': gapfill['kvsPaceLY'].get(loc), 'trailing': ytd['kvsPaceYTD'].get(loc),
                        'recent': gapfill['kvsPaceT6W'].get(loc), 'prior': gapfill['kvsPaceT3M'].get(loc),
                        'direction':'lower', 'unit':'sec', 'source':'qsr_daily_activity_rollup (mfy_untilserve/mfy_trans_cnt), full YTD 2026'},
        'kvs_healthy':{'ly': gapfill['kvsHealthyLY'].get(loc), 'trailing': ytd['kvsHealthyYTD'].get(loc),
                        'recent': gapfill['kvsHealthyT6W'].get(loc), 'prior': gapfill['kvsHealthyT3M'].get(loc),
                        'direction':'higher', 'unit':'pct', 'source':'qsr_daily_activity_rollup (healthy_count/unhealthy_count), full YTD 2026'},
        'r2p_pace':   {'ly': m.get('r2pLY'), 'trailing': ytd['r2pYTD'].get(loc),
                        'recent': m.get('r2pT6W'), 'prior': m.get('r2pT3M'),
                        'direction':'lower', 'unit':'sec', 'source':'qsr_daily_activity_rollup, full YTD 2026'},
        'sales':      {'ly': m.get('salesLY'), 'trailing': m.get('salesYTD26'),
                        'growth': sales_gc_growth['salesGrowth'].get(loc),
                        'direction':'total', 'unit':'usd', 'source':'qsr_daily_activity_rollup (product_sales), full YTD 2026',
                        'days_elapsed_override': DAYS_ELAPSED_OVERRIDE.get(loc)},
        'gc':         {'ly': m.get('gcLY'), 'trailing': m.get('gcYTD26'),
                        'growth': sales_gc_growth['gcGrowth'].get(loc),
                        'direction':'total', 'unit':'num', 'source':'qsr_daily_activity_rollup (transactions), full YTD 2026',
                        'days_elapsed_override': DAYS_ELAPSED_OVERRIDE.get(loc)},
        'tpph':       {'ly': gapfill['tpphLY'].get(loc), 'trailing': ytd['tpphYTD'].get(loc),
                        'recent': gapfill['tpphT6W'].get(loc), 'prior': gapfill['tpphT3M'].get(loc),
                        'direction':'higher', 'unit':'num', 'source':'qsr_daily_activity_rollup (transactions/actual_punched_hours), full YTD 2026'},
        'labor_pct':  {'ly': None, 'trailing': ytd['laborPctYTD'].get(loc),
                        'recent': gapfill['laborPctT6W'].get(loc), 'prior': None,
                        'direction':'lower', 'unit':'pct',
                        'source':f"daily_glimpse_daily (labor_pct), full available window -- this emailed stream has a hard floor at {gapfill['glimpseEarliestDate']}, so no LY (2025) reading exists or ever will for this specific field"},
        'fob_pct':    {'ly': None, 'trailing': ytd_files['fobTargetYTD'].get(loc), 'recent': up['fobTargetTrailingMedian'].get(loc), 'prior': ytd_files['fobTargetYTD'].get(loc),
                        'direction':'lower', 'unit':'pct', 'source':"Food_Over_Base_Targets export, median of your own full-YTD-2026 entries -- export only covers 2026, no LY"},
        'act_sched':  {'ly': None, 'trailing': m.get('actVsSchedPartial2026'),
                        'recent': smart_trend['actSchedRecentHalf'].get(loc), 'prior': smart_trend['actSchedPriorHalf'].get(loc),
                        'direction':'variance', 'unit':'pct', 'source':'qsr_daily_activity_rollup, 2026-05-13 onward only (the only real 2026 window this field has) -- 2025 is a confirmed full-year gap',
                        'basis_hrs_per_day': hours_per_day['schedHrsPerDay'].get(loc)},
        'act_need':   {'ly': m.get('actVsNeedLY'), 'trailing': ytd['actVsNeedYTD'].get(loc), 'recent': m.get('actVsNeedT6W'), 'prior': m.get('actVsNeedLY'),
                        'direction':'variance', 'unit':'pct', 'source':'qsr_daily_activity_rollup, full YTD 2026',
                        'basis_hrs_per_day': hours_per_day['needHrsPerDay'].get(loc)},
        # Fixed (was wrongly sourced from osat_avg, a 1-5 scale, alongside osat_b2b's real
        # percentage -- showed as "4.39" next to "88.0%" and read as reversed/broken). VOICE OSAT
        # is the real Top-2-Box % (smg_fullscale.osat_top2), matching CLAUDE.md's own "OSAT >=90%"
        # convention and the same field already used for the presentation-slide figure. Re-pulled
        # directly (osat-top2-fix.json): smg_fullscale's real data only runs through 2026-07 as of
        # this pull -- 4 months stale, a data-freshness finding worth flagging on its own, separate
        # from this fix. Note Top-2-Box typically reads a few points BELOW Overall Satisfaction
        # B2B for the same store/month (measured directly, every sampled store) -- they're
        # different cuts of the same survey, not duplicates, so OSAT isn't always the larger number.
        # Trailing baseline upgraded again (owner-uploaded FullScale_Report.xlsx, 2026-11-23): a
        # single Jan-Oct 2026 aggregate, 3 months fresher than the live smg_fullscale pull above
        # (through July) and covering all 27 stores directly (cross-checked against the live pull:
        # 3708 Top-2-Box 85.0% here vs 85.1% there -- same real number, just more current). Used for
        # the Trailing Baseline LEVEL; Recent/Prior (T3M trend signal for the smart Adjustment
        # default) still come from the monthly smg_fullscale pull, since this aggregate has no
        # month-by-month breakdown to compute a trend from.
        'osat_pace':  {'ly': osat_fix['osatTop2LY'].get(loc), 'trailing': fullscale_fix['osatTop2Full'].get(loc, osat_fix['osatTop2YTD'].get(loc)),
                        'recent': osat_fix['osatTop2T3M'].get(loc), 'prior': osat_fix['osatTop2Prior3mo'].get(loc),
                        'direction':'higher', 'unit':'pct', 'source':'FullScale_Report.xlsx (Overall Satisfaction, 5+4 star), full YTD 2026 through Oct'},
        # Reworked (owner-uploaded TrendReport.xlsx, 2026-11-23) -- the FullScale-only version
        # above was flagged as wrong: Freeport (38609) was hitting a hard MIN(...,100%) cap because
        # its stale Recent/Prior (old smg_fullscale pull) produced an oversized Adjustment on an
        # already-high 96% trailing baseline (96.0% x 1.064 = 102.2%, capped flat at a suspicious-
        # looking "100%"). TrendReport gives real per-store MONTHLY B2B data (unlike EAD, not
        # suppressed here), so Trailing/Recent/Prior are now all real measured monthly averages
        # instead of one static aggregate plus a stale trend. Same column-polarity confirmation as
        # EAD: TrendReport's "Score" is the needs-attention/failure rate (confirmed via the Jan
        # district actuals, 5.66% here vs FullScale's matching column "1"), so real B2B% = 1-Score.
        # Direction corrected (owner caught it): this is a lower-is-better rate (the raw Score IS
        # the real metric -- Freeport's real figure is ~3.7%, not "96.3%"), not a satisfaction
        # percentage to maximize. Un-inverted below -- same column, same data, no flip applied.
        # 'ly' deliberately left blank, not carried over from the old m.get('csatB2bLY') -- that
        # value came from the live smg_fullscale pull on the OPPOSITE (high-is-good) convention, so
        # pairing it with this corrected low-is-good Trailing would show a wrong, misleading "huge
        # improvement already achieved" story. No LY exists yet on the right convention.
        # LY filled in (owner-uploaded TrendReport_2025_Detailed.xlsx, 2026-11-23) -- real full-year
        # 2025 monthly data, same "Overall Satisfaction B2B" measure, same low-is-better polarity
        # (cross-checked: this file's 2026 monthly figures reproduce the prior TrendReport.xlsx
        # parse exactly, to several decimals, for every store sampled -- confirms both extractions
        # agree before trusting the new LY numbers alongside them).
        'osat_b2b':   {'ly': trendb2b_full['b2bLY2025'].get(loc), 'trailing': trendb2b_full['b2bYTD2026'].get(loc),
                        'recent': trendb2b_full['b2bT3M2026'].get(loc), 'prior': trendb2b_full['b2bPrior3mo2026'].get(loc),
                        'direction':'lower', 'unit':'pct', 'source':'TrendReport.xlsx ("Overall Satisfaction B2B"), real per-store monthly data, 2025 LY + Jan-Oct 2026'},
        # Sourced (owner-uploaded VOICE export, 2026-11-23) -- "Overall Sat %" from the dedicated
        # VOICE 2026-01-01 to 2026-11-22 export. This is a different, lower-magnitude composite
        # than osat_top2 (e.g. 3708 ~70% here vs ~85% top2) -- it blends DT/FC Accuracy/Clean/Fast/
        # Friendly sub-scores, matching what "Execute As Designed" means (did the visit execute to
        # standard across every dimension at once), not a simple guest-satisfaction top-box. Fresh
        # through 2026-11. Only covers the 20 MCDOK stores -- the export has no FL rows at all (not
        # a bug on this end; FL is honestly 'n/a' below until a comparable FL export exists), and
        # no 44689 either.
        # Replaced entirely (owner-confirmed field: "Pull Forward - Executed as Designed (Yes)",
        # 2026-11-23) -- the earlier "Overall Sat %" composite is gone. Sourced from
        # FullScale_Report.xlsx's per-store Jan-Oct 2026 aggregate, all 27 stores. Column choice
        # was corrected, not assumed: the report gives two unlabeled sub-columns (1/2) under this
        # header, and a SEPARATE TrendReport.xlsx (owner-uploaded) gives the same metric as one
        # clearly-labeled "Score" per month -- its district-wide Jan 2026 Score (0.403) matches
        # FullScale's column "1" (0.4037) almost exactly, not column "2" (0.596). So "1" is the
        # real Yes rate; my first read of this metric (reported last turn as ~74% for 3708) had it
        # backwards -- the real number is ~26%. No per-store trend available: every store's own
        # monthly reading is vendor-suppressed ('**', sample too small) in TrendReport.xlsx, so
        # Recent/Prior are left blank rather than faked -- smart_adj falls back to a flat, modest
        # default for this one metric instead of a trend it can't actually measure.
        'voice_ead':  {'ly': None, 'trailing': fullscale_fix['eadPullForward'].get(loc), 'recent': None, 'prior': None,
                        'direction':'higher', 'unit':'pct',
                        'source': f"FullScale_Report.xlsx (\"Pull Forward - Executed as Designed\", column confirmed via TrendReport.xlsx), Jan-Oct 2026, n={fullscale_fix['eadPullForwardN'].get(loc)}"},
        'contacts_1800': {'ly': None, 'trailing': ytd['contactsYTDPerMonth'].get(loc),
                           'recent': contacts['contactsRecentPerMonth'].get(loc), 'prior': None,
                           'direction':'lower', 'unit':'num',
                           'source':"smg_comments, VOICE comment volume per month, full YTD 2026 -- re-checked the QSRSoft KB directly: the REAL 1-800 metric comes from a separate CRCP complaint-email feed into MyQSRSoft's 'Customer Feedback' page, which Meridian does not currently ingest at all. This is a real but imperfect proxy (survey comments, not literal 1-800 calls), and has no LY since smg_comments starts 2026-03-16."},
        'digital_pct': {'ly': None, 'trailing': ytd_files['digitalPctYTD'].get(loc), 'recent': up['digitalAppPctSalesTrailing'].get(loc), 'prior': ytd_files['digitalPctYTD'].get(loc),
                        'direction':'higher', 'unit':'pct', 'source':'Digital_App export, full YTD 2026'},
        'digital_gcrd': {'ly': None, 'trailing': ytd_files['digitalGcrdYTD'].get(loc), 'recent': digital_gcrd_data.get(loc), 'prior': ytd_files['digitalGcrdYTD'].get(loc),
                        'direction':'higher', 'unit':'num', 'source':'Digital_App export ("Digital App" sheet, GC/R/D column), full YTD 2026'},
        # Fixed (owner-uploaded GC/R/D McDelivery export, 2026-11-23): the old figure only read the
        # Digital_App export's single ambiguous "GMA Delivery" column, which turns out to be just
        # DoorDash's GMA-Delivery slice -- one of 6 vendor x channel streams (UE/DD/GH x 3PO/GMAD).
        # DD 3PO alone (DoorDash's regular third-party-ordered delivery) runs ~11x bigger than that
        # one slice for a typical store, so the old number was badly incomplete, not just low.
        # Fixed to the real combined total: "All Vendors" sheet's "All Delivery GC" (verified sums
        # exactly to all 6 per-vendor GC columns added together) / days in month.
        'mcd_gcrd':   {'ly': None,
                        'trailing': mcd_gcrd_fix['mcdGcrdYTD'].get(loc) if mcd_gcrd_fix['mcdGcrdYTD'].get(loc) is not None else ytd_files['mcdGcrdYTD'].get(loc),
                        'recent': mcd_gcrd_fix['mcdGcrdT3M'].get(loc) if mcd_gcrd_fix['mcdGcrdT3M'].get(loc) is not None else up['mcdeliveryGcrdTrailing'].get(loc),
                        'prior': mcd_gcrd_fix['mcdGcrdPrior3mo'].get(loc) if mcd_gcrd_fix['mcdGcrdPrior3mo'].get(loc) is not None else ytd_files['mcdGcrdYTD'].get(loc),
                        'direction':'higher', 'unit':'num',
                        'source': ('GC/R/D McDelivery export ("All Vendors" sheet, "All Delivery GC"), full YTD 2026'
                                   if mcd_gcrd_fix['mcdGcrdYTD'].get(loc) is not None else
                                   "Digital_App export (GMA Delivery sheet) -- the combined export only covers MCDOK, so FL still falls back to this narrower figure (confirmed only ~1/11th of the real combined total for the MCDOK stores that DO have both sources -- likely similarly understated here, not a fixed number)")},
        # Sourced (owner-uploaded MCDelivery 3PO export, 2026-11-23). Per the owner directly:
        # McDelivery Wait Time = "Restaurant Time" column (the restaurant-side portion of the 3PO
        # transaction, as opposed to "McDelivery Time" or "Total Experience Time"); McDelivery Star
        # Rating = the "CSAT" column (a real 1-5 rating, not a %). Fresh through 2026-11. Same MCDOK-
        # only coverage as voice_ead above, but DOES include 44689.
        'mcd_wait':   {'ly': None, 'trailing': mcd3po_fix['mcdWaitYTD'].get(loc), 'recent': mcd3po_fix['mcdWaitT3M'].get(loc), 'prior': mcd3po_fix['mcdWaitPrior3mo'].get(loc),
                        'direction':'lower', 'unit':'min',
                        'source':'MCDelivery 3PO export ("Restaurant Time"), full YTD 2026 -- MCDOK only, no FL rows in this export'
                                 + (" [only 1 real month (Nov 2026) -- new store, no 18213 equivalent in this export; low-confidence until more months accrue]" if loc == '44689' else '')},
        'mcd_stars':  {'ly': None, 'trailing': mcd3po_fix['mcdStarsYTD'].get(loc), 'recent': mcd3po_fix['mcdStarsT3M'].get(loc), 'prior': mcd3po_fix['mcdStarsPrior3mo'].get(loc),
                        'direction':'higher', 'unit':'num5',
                        'source':'MCDelivery 3PO export ("CSAT", a real 1-5 rating), full YTD 2026 -- MCDOK only, no FL rows in this export'},
        'turnover_ttm': {'ly': turnover_ly.get(loc, {}).get('ttm'), 'trailing': ytd['turnoverYTD'].get(loc),
                        'recent': m.get('turnoverTTM'), 'prior': turnover_ly.get(loc, {}).get('ttm'),
                        'direction':'lower', 'unit':'pct', 'source':'turnover_monthly, average of each 2026 month\'s own annualized rate (monthly_annual_turnover) -- genuinely YTD 2026, not the smoothed trailing-12-month figure; LY = the real 2025-11 TTM reading (12 months back)'},
        'turnover_3mo': {'ly': turnover_ly.get(loc, {}).get('threeMo'), 'trailing': m.get('turnover3Mo'),
                        'recent': m.get('turnover3Mo'), 'prior': turnover_ly.get(loc, {}).get('threeMo'),
                        'direction':'lower', 'unit':'pct', 'source':'turnover_monthly, latest 3-month reading; LY = the real 2025-11 3-month reading (12 months back)'},
    }

    # People headcount targets -- real CURRENT counts from Roster_Statistics (actuals, not an
    # assumption), Target defaults to "hold current" (Adjustment = 0, additive) since Meridian has
    # no budgeted/ideal-headcount source to compute a real fill-rate target against (the original
    # workbook's own ">90%" convention is a fill rate vs. a BUDGETED number this data doesn't have).
    roster = roster_current.get(loc) or (roster_current.get('18213') if is_lindsay_backfill else None)
    roster_note = ' [no budgeted/ideal headcount source available -- Target defaults to holding the current actual count; type in a real budgeted number if you have one]'
    out['crew_staff_target'] = {'ly': None, 'trailing': roster.get('crewStaff') if roster else None, 'recent': roster.get('crewStaff') if roster else None, 'prior': None,
                        'direction':'variance', 'unit':'num', 'source':'Roster_Statistics export, current actual count' + roster_note}
    out['shift_leader_target'] = {'ly': None, 'trailing': roster.get('shiftStaff') if roster else None, 'recent': roster.get('shiftStaff') if roster else None, 'prior': None,
                        'direction':'variance', 'unit':'num', 'source':'Roster_Statistics export, current actual count' + roster_note}
    out['gmdm_target'] = {'ly': None, 'trailing': roster.get('gmDmStaff') if roster else None, 'recent': roster.get('gmDmStaff') if roster else None, 'prior': None,
                        'direction':'variance', 'unit':'num', 'source':'Roster_Statistics export, current actual count' + roster_note}
    out['headcount_target'] = {'ly': None, 'trailing': roster.get('rosterSize') if roster else None, 'recent': roster.get('rosterSize') if roster else None, 'prior': None,
                        'direction':'variance', 'unit':'num', 'source':'Roster_Statistics export, current actual total roster size' + roster_note}

    # Peak-period KVS/R2P/Parked%/Healthy-Use-2nd-Side -- same 3_Peaks export (Service sheet) as
    # OEPE above, columns that were already sitting in the file unused. YTD = simple mean of every
    # monthly reading Jan-Nov 2026; recent/prior (T3M) = simple mean of the last 3 months -- the
    # exact method already proven against OEPE's own real numbers before reusing it here. No LY:
    # the export only covers 2026.
    thin_note_44689 = (" [only 1 real month (Nov 2026) in this store's own history -- new store, "
                        "no 18213 equivalent exists for this metric (18213 has zero rows in this "
                        "export at all); treat as low-confidence until more months accrue]") if loc == '44689' else ''
    def _peak_metric(ytd_key, t3m_key, direction, unit):
        y, t = peak_extra[ytd_key].get(loc, {}), peak_extra[t3m_key].get(loc, {})
        mk = lambda slice_name: {'ly': None, 'trailing': y.get(slice_name), 'recent': t.get(slice_name), 'prior': y.get(slice_name),
                                  'direction': direction, 'unit': unit,
                                  'source': '3_Peaks export (Service sheet), full YTD 2026' + thin_note_44689}
        return mk('7am-9am'), mk('11am-2pm'), mk('5pm-7pm')
    out['kvs_pace_7_9'], out['kvs_pace_11_2'], out['kvs_pace_5_7'] = _peak_metric('kvsPaceYTD', 'kvsPaceT3M', 'lower', 'sec')
    out['r2p_7_9'], out['r2p_11_2'], out['r2p_5_7'] = _peak_metric('r2pYTD', 'r2pT3M', 'lower', 'sec')
    out['park_pct_7_9'], out['park_pct_11_2'], out['park_pct_5_7'] = _peak_metric('parkPctYTD', 'parkPctT3M', 'lower', 'pct')
    out['kvs_healthy_7_9'], out['kvs_healthy_11_2'], out['kvs_healthy_5_7'] = _peak_metric('kvsHealthyYTD', 'kvsHealthyT3M', 'higher', 'pct')

    # "3 Peaks Combined" -- a single blended reading per metric, simple average across the 3 peak
    # periods (distinct from the full-day "Service Total Day" metrics, which include off-peak hours).
    def _blend(m79, m112, m57):
        avg = lambda f: (sum(v for v in (m79.get(f), m112.get(f), m57.get(f)) if v is not None) /
                          max(1, sum(1 for v in (m79.get(f), m112.get(f), m57.get(f)) if v is not None))) \
                         if any(m.get(f) is not None for m in (m79, m112, m57)) else None
        return {'ly': avg('ly'), 'trailing': avg('trailing'), 'recent': avg('recent'), 'prior': avg('prior'),
                'direction': m79['direction'], 'unit': m79['unit'],
                'source': 'Simple average of the 3 peak-period readings (7-9a / 11-2p / 5-7p)'}
    out['oepe_peak_combined'] = _blend(out['oepe_7_9'], out['oepe_11_2'], out['oepe_5_7'])
    out['kvs_peak_combined'] = _blend(out['kvs_pace_7_9'], out['kvs_pace_11_2'], out['kvs_pace_5_7'])
    out['r2p_peak_combined'] = _blend(out['r2p_7_9'], out['r2p_11_2'], out['r2p_5_7'])
    out['park_peak_combined'] = _blend(out['park_pct_7_9'], out['park_pct_11_2'], out['park_pct_5_7'])
    out['healthy_peak_combined'] = _blend(out['kvs_healthy_7_9'], out['kvs_healthy_11_2'], out['kvs_healthy_5_7'])

    if is_lindsay_backfill:
        lbf = lindsay18213  # has real 2025 LY
        lytd = lindsay_ytd  # has 18213's own full-YTD-2026 reading, used as 44689's Trailing Baseline
        backfill_map = {
            'oepe_7_9': ('peakLY', 'peakYTD', 'oepe_7_9'), 'oepe_11_2': ('peakLY', 'peakYTD', 'oepe_11_2'), 'oepe_5_7': ('peakLY', 'peakYTD', 'oepe_5_7'),
            'oepe_pace': ('oepeLY', 'oepeYTD', None), 'park_pct': ('parkLY', 'parkYTD', None), 'r2p_pace': ('r2pLY', 'r2pYTD', None),
            'kvs_pace': ('kvsPaceLY', 'kvsPaceYTD', None), 'kvs_healthy': ('kvsHealthyLY', 'kvsHealthyYTD', None),
            'tpph': ('tpphLY', 'tpphYTD', None), 'act_need': ('actVsNeedLY', 'actVsNeedYTD', None),
            'turnover_ttm': (None, 'turnoverYTD', None), 'turnover_3mo': (None, None, None),
            'labor_pct': (None, 'laborPctYTD', None),
        }
        for key, (ly_key, ytd_key, sub) in backfill_map.items():
            # ALWAYS prefer 18213 over 44689's own reading for these rate metrics, even when 44689
            # already has a non-null value -- ~8-12 days of its own data is too thin to trust as a
            # trailing baseline regardless of whether it happens to compute a number (TPPH on that
            # thin a window came out at 1.6/hr, nonsense next to every peer store's 5-7/hr).
            ly_v = (lbf.get(ly_key) or {}).get(sub) if sub and ly_key else lbf.get(ly_key) if ly_key else None
            ytd_v = (lytd.get(ytd_key) or {}).get(sub) if sub and ytd_key else (lytd.get(ytd_key) if ytd_key else None)
            if ly_v is not None or ytd_v is not None:
                out[key]['ly'] = ly_v
                out[key]['trailing'] = ytd_v
                out[key]['recent'] = ytd_v
                out[key]['prior'] = ly_v
                out[key]['source'] = out[key]['source'].split(' [backfilled')[0] + bf_note
        # osat_pace/osat_b2b handled separately (not in backfill_map above) since their real source
        # is now osat_top2/FullScale_Report (osat_fix/fullscale_fix), not the old csatLY/csatYTD
        # scale dicts the rest of this block uses. 18213 has real rows in both.
        out['osat_pace']['ly'] = osat_fix['osatTop2LY'].get('18213')
        out['osat_pace']['trailing'] = fullscale_fix['osatTop2Full'].get('18213', osat_fix['osatTop2YTD'].get('18213'))
        out['osat_pace']['recent'] = osat_fix['osatTop2T3M'].get('18213')
        out['osat_pace']['prior'] = osat_fix['osatTop2Prior3mo'].get('18213')
        out['osat_pace']['source'] = out['osat_pace']['source'].split(' through Oct')[0] + bf_note
        out['osat_b2b']['ly'] = trendb2b_full['b2bLY2025'].get('18213')
        out['osat_b2b']['trailing'] = trendb2b_full['b2bYTD2026'].get('18213')
        out['osat_b2b']['recent'] = trendb2b_full['b2bT3M2026'].get('18213')
        out['osat_b2b']['prior'] = trendb2b_full['b2bPrior3mo2026'].get('18213')
        out['osat_b2b']['source'] = out['osat_b2b']['source'] + bf_note
        # Volume metrics: scale 18213's real totals up for the new freestanding store model.
        # ALWAYS override 'trailing' too, not just 'ly' -- 44689's own ~1-2 days of real data
        # (sales trailing was reading $4,539, i.e. one day) was previously left in place and fed
        # straight into the Target formula (trailing/days*365), producing a near-zero 2027 target
        # for a real, operating store. This was a genuine bug, not a placeholder: it silently wiped
        # out the entire volume gain from the relocation (the owner's explicit "higher sales
        # projected... the difference can be safely added to 2027 forecast as a gain"). The scaled
        # 18213 YTD figure IS that gain, now actually flowing into 44689's (and OK's) target.
        for key, (bf_ly_key, bf_ytd_key) in (('sales', ('salesLY', 'salesYTD26')), ('gc', ('gcLY', 'gcYTD26'))):
            out[key]['ly'] = lbf.get(bf_ly_key, 0) * LINDSAY_VOLUME_SCALE
            out[key]['trailing'] = lbf.get(bf_ytd_key, 0) * LINDSAY_VOLUME_SCALE
            out[key]['source'] = out[key]['source'] + bf_note + f' , scaled x{LINDSAY_VOLUME_SCALE} for the new freestanding store model -- EDIT THIS once real capacity is known'
        if out['sales'].get('growth') is None:
            bf_sales_ly, bf_sales_26 = lbf.get('salesLY'), lbf.get('salesYTD26')
            if bf_sales_ly and bf_sales_26:
                out['sales']['growth'] = bf_sales_26 / bf_sales_ly * (365 / DAYS_ELAPSED_2026) - 1
        if out['gc'].get('growth') is None:
            bf_gc_ly, bf_gc_26 = lbf.get('gcLY'), lbf.get('gcYTD26')
            if bf_gc_ly and bf_gc_26:
                out['gc']['growth'] = bf_gc_26 / bf_gc_ly * (365 / DAYS_ELAPSED_2026) - 1

    for key in out:
        out[key]['target2026'] = TARGET_2026_BY_KEY.get(key, {}).get(loc)

    return out

print('metric builder ready')

AS_OF = '2026-11-17'
DAYS_ELAPSED_2026 = 321

# 43701 (Ponce de Leon) opened 2026-03-13 -- it was only trading for 250 of the district's 321
# elapsed 2026 days. Annualizing its real $ total with the shared 321-day denominator (every other
# store's real day count) understates its true daily run rate by diluting it across ~71 days the
# store didn't exist. Its own 250-day count is the correct denominator for its Sales/GC Target and
# "% +/- vs 2026" formulas only -- the raw Trailing Baseline figure itself (a real YTD $ total) is
# untouched and still sums correctly into the FL/Combined subtotals.
DAYS_ELAPSED_OVERRIDE = {'43701': 250}

UNIT_FMT = {'sec': SEC, 'pct': PCT, 'usd': CUR0, 'num': NUM0, 'num5': '0.00', 'min': '0.0"m"'}
# Per-key overrides of the above, where a specific metric needs more precision than its unit's
# default (owner-requested, Labor tab): TPPH, Labor %, FOB % all display to 2 decimals.
FMT_OVERRIDE = {'tpph': '0.00', 'labor_pct': '0.00%', 'fob_pct': '0.00%'}
FALLBACK_ADJ = {'lower': 0.02, 'higher': 0.02, 'variance': 0.0, 'total': 0.02}

# District median TTM turnover, used to size each store's turnover ask to its actual gap rather
# than a flat percentage -- the exact approach the methodology doc recommends. Computed once from
# every real (non-backfilled) store's latest TTM reading.
_turnover_ttms = sorted(v for v in (master.get(l, {}).get('turnoverTTM') for l in LOCS if l != '44689') if v is not None)
DISTRICT_MEDIAN_TURNOVER = _turnover_ttms[len(_turnover_ttms) // 2] if _turnover_ttms else 1.5

def smart_adj(key, mdef):
    """Data-driven default for the Adj. %/pts cell -- replaces a flat guess with each store's own
    measured trend (recent vs. prior trailing window), per the owner's explicit instruction that
    the flat 3%/2% defaults were 'an innocent by-product' of the old process, not a real forecast.
    Still just a DEFAULT: every cell stays a plain, editable number, never a formula, so typing
    over it works exactly like it always has."""
    direction = mdef['direction']
    recent, prior = mdef.get('recent'), mdef.get('prior')

    if direction == 'total':
        # Sales / GC: the store's own real growth rate -- median of T3W/T6W/T3M, each vs the same
        # calendar window last year (the Smart Targets "Simple" model's own method, the proven
        # winner over every engineered model per the methodology doc), not a single noisy window.
        # Floored at 0%, capped at +15%: measured broadly, guest-count traffic is genuinely down
        # this year almost everywhere (confirmed across all three windows independently, not a
        # short-window artifact) -- real and worth knowing, but a 2027 TARGET default should never
        # itself read as "the plan is to keep shrinking." A declining store's default target holds
        # this year's pace flat (0%) rather than baking the decline forward; a real upside trend
        # still flows through untouched. Still just a default -- fully editable per store.
        g = mdef.get('growth')
        if g is None: return FALLBACK_ADJ['total']
        return max(min(g, 0.15), 0)

    if key in ('crew_staff_target', 'shift_leader_target', 'gmdm_target', 'headcount_target'):
        # Headcount targets: hold the current actual count by default (no budgeted/ideal number
        # to compute a real gap against) -- owner types in a real target if they have a budget.
        return 0

    if direction == 'variance':
        # Act vs. Scheduled/Needed: close half of the CURRENT gap toward zero, not a flat 0.
        if recent is None: return FALLBACK_ADJ['variance']
        return round(-0.5 * recent, 4)

    if key in ('turnover_ttm', 'turnover_3mo'):
        # Size the ask to the real gap above the district median (the methodology doc's own
        # recommendation), not a flat cut -- a store already at/below median gets a small
        # maintenance ask; a store far above gets a much bigger one.
        if recent is None or recent <= 0: return FALLBACK_ADJ['lower']
        gap_factor = max((recent - DISTRICT_MEDIAN_TURNOVER) / recent, 0)
        return round(min(max(gap_factor * 0.5, 0.02), 0.30), 4)

    if recent is None:
        return FALLBACK_ADJ[direction]
    if prior is None or prior == 0:
        return FALLBACK_ADJ[direction]

    if direction == 'lower':
        trend = (prior - recent) / abs(prior)   # positive = already improving (recent below prior)
    else:  # higher
        trend = (recent - prior) / abs(prior)   # positive = already improving (recent above prior)
    return round(min(max(trend, 0.01), 0.08), 4)

NO_TREND_KEYS = ('crew_staff_target', 'shift_leader_target', 'gmdm_target', 'headcount_target')

def trend_display(key, mdef):
    """The 'whammy' workbook's Trend column: a plain-language read of whether this store's own
    real performance is moving the right way lately, not a target ask. Reuses the exact same
    recent-vs-prior signal smart_adj() already sizes the Adjustment default from (so Trend and
    the Adjustment next to it are never telling two different stories) -- just surfaced here
    uncapped and unrounded, as a real number, instead of folded invisibly into one Python value.
    Sign convention throughout: positive = improving, regardless of the metric's own polarity
    (a seconds metric dropping, a % metric rising, a gap closing are all '+' here) -- so the
    arrow and the number always agree on whether it's good news."""
    direction = mdef['direction']
    recent, prior = mdef.get('recent'), mdef.get('prior')

    if key in NO_TREND_KEYS:
        return ('n/a', None, 'Headcount targets have no recent-vs-prior trend to show -- there is only a current actual count.')

    if direction == 'total':
        g = mdef.get('growth')
        if g is None:
            return ('n/a', None, 'No growth-rate data available for this store/metric.')
        pct = g
        basis = 'own T3W/T6W/T3M median growth vs. the same windows last year'
    elif direction == 'variance':
        if recent is None or prior is None or prior == 0:
            return ('n/a', None, 'No recent/prior gap data available for this store/metric.')
        pct = (abs(prior) - abs(recent)) / abs(prior)   # gap shrinking = improving
        basis = "the gap's own recent-half vs. prior-half magnitude"
    else:
        if recent is None or prior is None or prior == 0:
            return ('n/a', None, 'No recent/prior data available for this store/metric.')
        if direction == 'lower':
            pct = (prior - recent) / abs(prior)
        else:
            pct = (recent - prior) / abs(prior)
        basis = 'recent vs. prior trailing window (see Adjustment comment for this metric\'s exact windows)'

    if pct > 0.005:
        arrow, word = '↑', 'Improving'
    elif pct < -0.005:
        arrow, word = '↓', 'Declining'
    else:
        arrow, word = '→', 'Flat'
    text = f'{arrow} {word} {pct:+.1%}'
    note = f'Based on {basis}. Positive always means improving, whatever this metric\'s own direction of "better."'
    return (text, pct, note)

# Metrics whose "higher is better" target can't exceed a hard scale ceiling -- a flat 3% lift on an
# already-high trailing reading pushed B2B/CSAT targets past 100% (e.g. loc 38609's B2B: 100.0%
# trailing -> 103.0% target) before this cap. MIN() wraps the formula so it's self-correcting even
# if the Adjustment cell is edited later.
SCALE_CAP = {'pct': 1.0, 'num5': 5.0}

# Round every Target to a manager-friendly number (owner-requested, Speed + Labor tabs): timing
# targets round to the nearest 5 (seconds), Park % to the nearest whole percent, KVS Healthy Use
# to the nearest 5 percentage points, Labor %/FOB % to the nearest 0.05 percentage point. MROUND
# wraps the capped formula so the displayed number is always exactly what a GM would say out loud.
ROUND_GRAIN = {
    'oepe_7_9': 5, 'oepe_11_2': 5, 'oepe_5_7': 5, 'oepe_pace': 5, 'kvs_pace': 5, 'r2p_pace': 5,
    'park_pct': 0.01, 'kvs_healthy': 0.05, 'labor_pct': 0.0005, 'fob_pct': 0.0005,
    'kvs_pace_7_9': 5, 'kvs_pace_11_2': 5, 'kvs_pace_5_7': 5, 'kvs_peak_combined': 5,
    'r2p_7_9': 5, 'r2p_11_2': 5, 'r2p_5_7': 5, 'r2p_peak_combined': 5,
    'park_pct_7_9': 0.01, 'park_pct_11_2': 0.01, 'park_pct_5_7': 0.01, 'park_peak_combined': 0.01,
    'kvs_healthy_7_9': 0.05, 'kvs_healthy_11_2': 0.05, 'kvs_healthy_5_7': 0.05, 'healthy_peak_combined': 0.05,
    'oepe_peak_combined': 5,
}

# Column plan per metric block, left to right (col+0 .. col+6, +7 for an extra_col metric):
#   0  Last Year / Ref.              [hidden -- legacy detail, unchanged]
#   1  2026 Target (Original)        [NEW -- pulled from the owner's real original upload]
#   2  2026 Actual                   [was "Trailing Baseline" -- same number, new name/position]
#   3  Trend                         [NEW -- see trend_display()]
#   4  Adj. Applied (edit me)        [was hidden; now visible -- the "math" step the owner asked for]
#   5  2027 Target (Proposed)        [was col+3 -- same formula, shifted]
#   6  2027 Target -- Your Override  [NEW -- blank, freely editable]
#   7  extra_col (% +/- vs 2026 / +/- Hrs/Day), only for sales/gc/act_sched/act_need
OVERRIDE_FILL = PatternFill('solid', fgColor='DDEBF7')
TREND_GOOD = Font(name=FONT_NAME, bold=True, color='006100')
TREND_BAD = Font(name=FONT_NAME, bold=True, color='9C0006')
TREND_FLAT = Font(name=FONT_NAME, bold=True, color='7F7F7F')

def metric_header(ws, row, col, label, section_color, note, extra_col_label=None):
    hdr_fill = PatternFill('solid', fgColor=section_color['fill'])
    hdr_font = WHITE if section_color['text'] == 'white' else Font(name=FONT_NAME, bold=True, color='000000')
    span = 8 if extra_col_label else 7
    c = set_cell(ws, row, col, label, font=hdr_font, fill=hdr_fill, wrap=True, border=CELL_BORDER)
    ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col+span-1)
    if note: c.comment = Comment(note, 'Analysis')
    # Row 4 (these sub-header labels) is hidden by default throughout -- owner-requested, redundant
    # once only the Target column is visible on print; still written so the row is correct and
    # readable the moment someone unhides it.
    sub = ['Last Year / Ref.', '2026 Target (Original)', '2026 Actual', 'Trend',
           'Adj. Applied (edit me)', '2027 Target (Proposed)', '2027 Target -- Your Override']
    if extra_col_label: sub = sub + [extra_col_label]
    for i, s in enumerate(sub):
        set_cell(ws, row+1, col+i, s, font=BOLD, fill=GREY_FILL, wrap=True, border=CELL_BORDER)

def metric_row(ws, row, col, key, mdef, as_of_label=True, extra_col=False):
    direction, unit = mdef['direction'], mdef['unit']
    fmt = FMT_OVERRIDE.get(key) or UNIT_FMT.get(unit, NUM0)
    ly, trailing = mdef.get('ly'), mdef.get('trailing')
    ly_comment = None if ly is not None else mdef.get('source')
    set_cell(ws, row, col, ly if ly is not None else 'n/a', fmt=fmt if ly is not None else None,
             comment=ly_comment, border=CELL_BORDER, align='center')
    target26 = mdef.get('target2026')
    if target26 is not None:
        t26_comment = "Pulled directly from your original 2026 targets upload (this store's own individualized target, not the sheet's single org-wide reference number)."
    else:
        t26_comment = "No 2026 target for this metric exists in your original upload -- left n/a per your instruction, rather than guessed."
    set_cell(ws, row, col+1, target26 if target26 is not None else 'n/a', fmt=fmt if target26 is not None else None,
             comment=t26_comment, border=CELL_BORDER, align='center')
    set_cell(ws, row, col+2, trailing if trailing is not None else 'needs data source', fmt=fmt if trailing is not None else None,
             comment=mdef.get('source'), border=CELL_BORDER, align='center')
    if trailing is None:
        set_cell(ws, row, col+3, 'n/a', border=CELL_BORDER, align='center')
        set_cell(ws, row, col+4, None, border=CELL_BORDER)
        set_cell(ws, row, col+5, 'n/a', border=CELL_BORDER, align='center')
        set_cell(ws, row, col+6, None, fill=OVERRIDE_FILL, border=CELL_BORDER)
        if extra_col: set_cell(ws, row, col+7, 'n/a', border=CELL_BORDER, align='center')
        return
    trend_text, trend_pct, trend_note = trend_display(key, mdef)
    trend_font = TREND_GOOD if (trend_pct is not None and trend_pct > 0.005) else \
                 TREND_BAD if (trend_pct is not None and trend_pct < -0.005) else TREND_FLAT
    set_cell(ws, row, col+3, trend_text, font=trend_font, comment=trend_note, border=CELL_BORDER, align='center')
    default_adj = smart_adj(key, mdef)
    # Headcount targets (variance + num) take a whole-number +/- people adjustment, not a percent.
    adj_fmt = NUM0 if (direction == 'variance' and unit == 'num') else PCT
    set_cell(ws, row, col+4, default_adj, font=BLUE, fill=YELLOW_FILL, fmt=adj_fmt, border=CELL_BORDER, align='center',
             comment='Default is this store\'s own recent trend, not a flat guess -- edit freely.')
    cell_trail = f'{get_column_letter(col+2)}{row}'
    cell_adj = f'{get_column_letter(col+4)}{row}'
    if direction == 'lower':
        formula = f'{cell_trail}*(1-{cell_adj})'
    elif direction == 'higher':
        formula = f'{cell_trail}*(1+{cell_adj})'
    elif direction == 'variance':
        formula = f'{cell_trail}+{cell_adj}'
    elif direction == 'total':
        days_base = mdef.get('days_elapsed_override') or DAYS_ELAPSED_2026
        formula = f'{cell_trail}/{days_base}*365*(1+{cell_adj})'
    cap = SCALE_CAP.get(unit)
    if cap is not None and direction == 'higher':
        formula = f'MIN({formula},{cap})'
    grain = ROUND_GRAIN.get(key)
    if grain is not None:
        formula = f'MROUND({formula},{grain})'
    target_comment = None
    if mdef.get('days_elapsed_override'):
        target_comment = (f"This store opened mid-2026 -- annualized off its own "
                           f"{mdef['days_elapsed_override']} real operating days, not the district's "
                           f"{DAYS_ELAPSED_2026}, so its true daily pace isn't diluted by the days before it existed.")
    set_cell(ws, row, col+5, '=' + formula, fmt=fmt, font=Font(name=FONT_NAME, bold=True), border=CELL_BORDER, align='center',
             comment=target_comment)
    set_cell(ws, row, col+6, None, fill=OVERRIDE_FILL, fmt=fmt, border=CELL_BORDER, align='center',
             comment='Blank by default -- the proposed 2027 Target (previous column) applies. Type your own number here any time to override it; nothing else on this row recalculates off this cell.')
    if extra_col == 'pct_vs_ty':
        # % +/- forecast vs. this year's annualized run rate -- kept visible (not grouped/hidden)
        # even when Last Year/Trailing/Adjustment are collapsed, so the growth story stays in view.
        target_cell = f'{get_column_letter(col+5)}{row}'
        days_base = mdef.get('days_elapsed_override') or DAYS_ELAPSED_2026
        pct_formula = f'={target_cell}/({cell_trail}/{days_base}*365)-1'
        note = "This Next-Year Target vs. this year's annualized YTD run rate."
        if mdef.get('days_elapsed_override'):
            note += f" Annualized using this store's own {days_base} operating days in 2026 (opened mid-year), not the district's {DAYS_ELAPSED_2026}."
        set_cell(ws, row, col+7, pct_formula, fmt=PCT, font=Font(name=FONT_NAME, bold=True), border=CELL_BORDER, align='center',
                 comment=note)
    elif extra_col == 'hours_per_day':
        # The % target translated into +/- hours/day -- a percentage of labor hours is abstract;
        # hours/day is what a GM actually schedules against. basis_hrs_per_day is a real measured
        # average (avg daily scheduled or needed hours for this store), passed in via mdef.
        target_cell = f'{get_column_letter(col+5)}{row}'
        basis = mdef.get('basis_hrs_per_day')
        if basis is not None:
            hrs_formula = f'={target_cell}*{basis}'
            set_cell(ws, row, col+7, hrs_formula, fmt='+0.0;-0.0', font=Font(name=FONT_NAME, bold=True), border=CELL_BORDER, align='center',
                     comment=f"Target % x this store's own avg daily base hours ({basis:.1f} hrs/day, measured) = +/- hours/day.")
        else:
            set_cell(ws, row, col+7, 'n/a', border=CELL_BORDER, align='center')

print('writer functions ready')

LABELS = {
 'oepe_7_9':'OEPE w/o Park: 7am-9am','oepe_11_2':'OEPE w/o Park: 11am-2pm','oepe_5_7':'OEPE w/o Park: 5pm-7pm',
 # "PACE" removed throughout (owner: a relic of the old process, not needed, may confuse) --
 # oepe_pace renamed to name what it actually is: the full-day combined OEPE.
 'oepe_pace':'OEPE w/o Parked Total Day', 'park_pct':'Park %', 'kvs_pace':'KVS Time/GC', 'kvs_healthy':'KVS Healthy Use (2nd Side)',
 'r2p_pace':'FC R2P', 'sales':'Yearly $ Sales','gc':'Yearly Guest Counts',
 'kvs_pace_7_9':'KVS Time/GC: 7am-9am','kvs_pace_11_2':'KVS Time/GC: 11am-2pm','kvs_pace_5_7':'KVS Time/GC: 5pm-7pm',
 'r2p_7_9':'R2P: 7am-9am','r2p_11_2':'R2P: 11am-2pm','r2p_5_7':'R2P: 5pm-7pm',
 'park_pct_7_9':'Park %: 7am-9am','park_pct_11_2':'Park %: 11am-2pm','park_pct_5_7':'Park %: 5pm-7pm',
 'kvs_healthy_7_9':'Healthy Use 2nd Side: 7am-9am','kvs_healthy_11_2':'Healthy Use 2nd Side: 11am-2pm','kvs_healthy_5_7':'Healthy Use 2nd Side: 5pm-7pm',
 'oepe_peak_combined':'OEPE w/o Park (3 Peaks Combined)','kvs_peak_combined':'KVS Time/GC (3 Peaks Combined)',
 'r2p_peak_combined':'R2P (3 Peaks Combined)','park_peak_combined':'Park % (3 Peaks Combined)',
 'healthy_peak_combined':'Healthy Use 2nd Side (3 Peaks Combined)',
 'tpph':'TPPH','labor_pct':'Labor %','fob_pct':'Food Over Base %','act_sched':'Act vs. Scheduled Hrs',
 'act_need':'Act vs. Needed Hrs','osat_pace':'VOICE OSAT','osat_b2b':'Overall Satisfaction B2B',
 'voice_ead':'VOICE Execute As Designed','contacts_1800':'1-800 Contacts','digital_pct':'Digital App % of Sales',
 'digital_gcrd':'Digital App GC/R/D','mcd_gcrd':'McDelivery GC/R/D','mcd_wait':'McDelivery Wait Time','mcd_stars':'McDelivery Star Rating',
 'turnover_ttm':'TTM Turnover','turnover_3mo':'3-Month Turnover',
 'crew_staff_target':'Crew Staffing Target','shift_leader_target':'Shift Leader Target',
 'gmdm_target':'GM/DM/Swing Mgr Target','headcount_target':'Total Headcount Target (All Hourly)',
}

# Column plan per sheet: A-D = Index/Org/Owner/Patch (sorting & lookup reference only -- these
# are excluded from the print area, same convention the original workbook uses, since F5 in the
# original file itself holds a raw location NUMBER, not a store name -- confirmed by reading the
# uploaded file directly). E = store name (reference). F = LOCATION NUMBER, the actual per-row
# identifier for printing, bold and in the section's own color. Metric blocks start at G.
IDENT_HEADERS = ['Index','Organization','Owner/Operator','Supervisor/Patch','Restaurant Name']

def write_identity_block(ws, r, i, loc, section_color):
    org, sup, op = ORG_INFO[loc]
    set_cell(ws, r, 1, i, font=BLACK, border=CELL_BORDER, align='center')
    set_cell(ws, r, 2, ORG_LABEL[org], font=BLACK, border=CELL_BORDER, align='center')
    set_cell(ws, r, 3, op, font=BLACK, border=CELL_BORDER, align='center')
    set_cell(ws, r, 4, sup, font=BLACK, border=CELL_BORDER, align='center')
    set_cell(ws, r, 5, STORE_NAMES[loc], font=Font(name=FONT_NAME, italic=True, size=10), border=CELL_BORDER, align='left')
    loc_fill = PatternFill('solid', fgColor=section_color['fill'])
    loc_font = Font(name=FONT_NAME, bold=True, size=14, color=('FFFFFF' if section_color['text'] == 'white' else '000000'))
    set_cell(ws, r, 6, loc, font=loc_font, fill=loc_fill, border=ROW_BORDER, align='center')

def freeze_and_width(ws, ncols, section_color):
    ws.sheet_view.showOutlineSymbols = True
    ws.freeze_panes = 'G5'
    ws.column_dimensions['A'].width = 7
    ws.column_dimensions['B'].width = 13
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 22
    ws.column_dimensions['F'].width = 12
    for c in range(7, ncols+1): ws.column_dimensions[get_column_letter(c)].width = 13
    ws.print_title_rows = '1:4'
    ws.print_title_cols = 'F:F'
    # One page per tab (owner-requested): landscape (more columns fit before text has to shrink)
    # + fit-to-1x1 instead of the old fit-width-2/unbounded-height, which let every sheet spill
    # across several vertical page tiles.
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.fitToPage = True
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_area = f'F1:{get_column_letter(ncols)}{4+len(LOCS)+3}'  # +3 for the OK/FL/combined subtotal rows
    ws.sheet_properties.tabColor = section_color['fill']

EXTRA_COL = {'sales': 'pct_vs_ty', 'gc': 'pct_vs_ty', 'act_sched': 'hours_per_day', 'act_need': 'hours_per_day'}
EXTRA_COL_LABEL = {'pct_vs_ty': '% +/- vs 2026', 'hours_per_day': '+/- Hrs/Day'}
EXTRA_COL_FMT = {'pct_vs_ty': PCT, 'hours_per_day': '+0.0;-0.0'}

# direction -> how to roll a column up into a subtotal/average row. 'total' metrics SUM; every
# rate/variance/headcount metric AVERAGEs across the group's stores (plain, not volume-weighted --
# simplest and most standard for a summary row; a weighted version is a bigger conversation).
ROLLUP_FN = {'lower': 'AVERAGE', 'higher': 'AVERAGE', 'variance': 'AVERAGE', 'total': 'SUM'}

def build_category_sheet(wb, sheet_name, metric_keys, group_title):
    ws = wb.create_sheet(sheet_name)
    sc = SECTION_COLORS[sheet_name]
    for i, h in enumerate(IDENT_HEADERS):
        set_cell(ws, 3, i+1, h, font=BOLD, fill=HDR_FILL, wrap=True, border=CELL_BORDER)
    set_cell(ws, 3, 6, 'LOCATION #', font=Font(name=FONT_NAME, bold=True, size=12,
             color=('FFFFFF' if sc['text'] == 'white' else '000000')),
             fill=PatternFill('solid', fgColor=sc['fill']), wrap=True, border=CELL_BORDER)
    total_width = sum(8 if key in EXTRA_COL else 7 for key in metric_keys)
    # Title merge starts at G, not F -- F (LOCATION #) is a repeating print-title column on every
    # horizontal page tile, and a long merged title spanning into it renders as overlapping,
    # sliced text on later tiles. Keeping F out of the merge keeps LOCATION # clean on every tile.
    set_cell(ws, 2, 7, group_title, font=Font(name=FONT_NAME, bold=True, size=20), wrap=True, align='center')
    ws.merge_cells(start_row=2, start_column=7, end_row=2, end_column=6+total_width)
    ws.row_dimensions[2].height = 50
    ws.row_dimensions[3].height = 40
    col_of = {}  # key -> its starting column, reused for both the data rows and the subtotal rows
    col = 7
    for key in metric_keys:
        col_of[key] = col
        extra = EXTRA_COL.get(key)
        metric_header(ws, 3, col, LABELS[key], sc, note=None, extra_col_label=EXTRA_COL_LABEL.get(extra))
        # Only Last Year / Ref. (col+0) stays collapsible (outline level 1, collapsed by default)
        # -- it's legacy detail the new goal-tracking sequence doesn't need visible. Everything
        # else in the sequence the owner asked for (2026 Target -> 2026 Actual -> Trend -> Adj. ->
        # 2027 Target -> Override) is visible by default now; a collapsed/hidden column is still
        # skipped on print automatically, so Last Year/Ref. stays out of the printed page too.
        cl = get_column_letter(col)
        ws.column_dimensions[cl].outlineLevel = 1
        ws.column_dimensions[cl].hidden = True
        col += 8 if extra else 7
    # Row 4 (the Last Year/Trailing/Adjustment/Target sub-header labels) is hidden outright
    # throughout -- owner-requested, redundant once only Target (+ an extra column here and
    # there) is visible by default.
    ws.row_dimensions[4].hidden = True

    row = 5
    group_rows = {'OK': [], 'FL': []}
    for i, loc in enumerate(LOCS, start=1):
        write_identity_block(ws, row, i, loc, sc)
        mvals = metrics_for(loc)
        col = 7
        for key in metric_keys:
            metric_row(ws, row, col, key, mvals[key], extra_col=EXTRA_COL.get(key))
            col += 8 if key in EXTRA_COL else 7
        ws.row_dimensions[row].height = 20
        group_rows[ORG_INFO[loc][0]].append(row)
        row += 1

    def subtotal_row(label, rows, fill):
        nonlocal row
        r_used = row
        set_cell(ws, row, 5, label, font=Font(name=FONT_NAME, bold=True, italic=True), fill=fill, border=CELL_BORDER, align='right')
        # The label also goes in column F (LOCATION #) -- A-E are outside the print area (same
        # convention as the store rows), so F is the only column guaranteed visible/printed; a
        # subtotal row with a blank F prints as an unlabeled grey bar.
        set_cell(ws, row, 6, label, font=Font(name=FONT_NAME, bold=True, size=9), fill=fill, border=ROW_BORDER, align='center', wrap=True)
        for c in range(1, 5):
            set_cell(ws, row, c, '', fill=fill, border=CELL_BORDER)
        r0, r1 = rows[0], rows[-1]
        for key in metric_keys:
            c0 = col_of[key]
            fn = ROLLUP_FN[metrics_for(LOCS[0])[key]['direction']]
            # LY (0), 2026 Target (1), 2026 Actual (2), 2027 Target (5) all roll up -- the extra
            # column (7) only for a key that actually has one. Trend (3), Adj. (4) and the
            # Override column (6) are deliberately left blank below: Trend is a text readout
            # (arrow + word), not a number to average; Adj. was already excluded before this
            # layout changed (a district subtotal has no single "adjustment applied" of its own);
            # Override is per-store manual input with nothing to roll up by default. Iterating
            # unconditionally here used to spill a spurious, unformatted rollup into the NEXT
            # metric's own LY column (immediately overwritten there, but left as a stray
            # unformatted cell after the very last metric in the row) -- and even for a key that
            # does have an extra column, it always wrote with no number format at all, so a
            # subtotal "% +/- vs 2026" or "+/- Hrs/Day" cell showed as a raw, unformatted decimal
            # instead of matching its own column's per-row format.
            sub_offs = (0, 1, 2, 5) + ((7,) if key in EXTRA_COL else ())
            for sub_off in sub_offs:
                cc = c0 + sub_off
                rng = f'{get_column_letter(cc)}{r0}:{get_column_letter(cc)}{r1}'
                fmt = EXTRA_COL_FMT.get(EXTRA_COL.get(key)) if sub_off == 7 else (FMT_OVERRIDE.get(key) or UNIT_FMT.get(metrics_for(LOCS[0])[key]['unit'], NUM0))
                # The extra column (% +/- vs 2026, +/- Hrs/Day) is always a rate, never a total --
                # it must always AVERAGE across the group's stores even when its parent metric
                # (Sales/GC) itself SUMs, or a district subtotal summed 20 stores' own % growth
                # figures into something like -17% with no real meaning (found while fixing the
                # format above -- same root cause, this rollup function was never metric-specific).
                roll_fn = 'AVERAGE' if sub_off == 7 else fn
                # COUNT guard: when a metric's whole subtotal range is 'n/a' text (no 2026
                # Target exists in the original upload for it at all), SUM(range) legitimately
                # returns 0 -- not an error IFERROR catches -- which would misleadingly print as
                # a real $0 total next to other metrics' real dollar subtotals. Showing 'n/a'
                # instead makes 'no data' and 'a real zero' visually distinct.
                set_cell(ws, row, cc, f'=IF(COUNT({rng})=0,"n/a",IFERROR({roll_fn}({rng}),""))', fmt=fmt, font=Font(name=FONT_NAME, bold=True), fill=fill, border=CELL_BORDER, align='center')
            for blank_off in (3, 4, 6):
                set_cell(ws, row, c0+blank_off, '', fill=fill, border=CELL_BORDER)
        ws.row_dimensions[row].height = 34
        row += 1
        return r_used

    SUBTOTAL_FILL = PatternFill('solid', fgColor='D9D9D9')
    GRANDTOTAL_FILL = PatternFill('solid', fgColor='A6A6A6')
    subtotal_rows = {'OK': None, 'FL': None}
    if group_rows['OK']:
        subtotal_rows['OK'] = subtotal_row('MCDOK Subtotal / Avg', group_rows['OK'], SUBTOTAL_FILL)
    if group_rows['FL']:
        subtotal_rows['FL'] = subtotal_row('Emerald Arches Subtotal / Avg', group_rows['FL'], SUBTOTAL_FILL)
    subtotal_row('Combined District Total / Avg', group_rows['OK'] + group_rows['FL'], GRANDTOTAL_FILL)
    insert_org_logos(ws, subtotal_rows)
    freeze_and_width(ws, col-1, sc)
    return ws, col_of

def build_summary_sheet(wb, sheet_specs):
    """One combined page (owner-requested): Location printed once, then every sheet's Target
    column (only -- not the LY/Trailing/Adjustment detail those sheets already carry) laid out
    side by side, cross-sheet formula-linked so it never drifts from the detail tabs. Each
    metric's own header keeps that source sheet's section color, so the summary still reads as
    "which category is this" at a glance."""
    ws = wb.create_sheet('Summary', 1)
    sc = SECTION_COLORS['Sales & Traffic']
    for i, h in enumerate(IDENT_HEADERS):
        set_cell(ws, 3, i+1, h, font=BOLD, fill=HDR_FILL, wrap=True, border=CELL_BORDER)
    set_cell(ws, 3, 6, 'LOCATION #', font=Font(name=FONT_NAME, bold=True, size=12, color='000000'),
             fill=PatternFill('solid', fgColor=sc['fill']), wrap=True, border=CELL_BORDER)
    set_cell(ws, 2, 7, 'All 2027 Targets -- One Combined View', font=Font(name=FONT_NAME, bold=True, size=18), wrap=True, align='center')
    ws.row_dimensions[2].height = 36
    ws.row_dimensions[3].height = 46

    col = 7
    col_map = {}  # (sheet_name, key) -> summary column, used below to point formulas at the right cell
    for sheet_name, source_col_of, metric_keys in sheet_specs:
        sheet_sc = SECTION_COLORS.get(sheet_name, sc)
        for key in metric_keys:
            label = LABELS[key]
            hdr_font = WHITE if sheet_sc['text'] == 'white' else Font(name=FONT_NAME, bold=True, color='000000')
            set_cell(ws, 3, col, label, font=hdr_font, fill=PatternFill('solid', fgColor=sheet_sc['fill']), wrap=True, border=CELL_BORDER)
            col_map[(sheet_name, key)] = col
            col += 1

    row = 5
    group_rows = {'OK': [], 'FL': []}
    for i, loc in enumerate(LOCS, start=1):
        write_identity_block(ws, row, i, loc, sc)
        col = 7
        for sheet_name, source_col_of, metric_keys in sheet_specs:
            for key in metric_keys:
                target_col_letter = get_column_letter(source_col_of[key] + 5)
                unit = metrics_for(LOCS[0])[key]['unit']
                fmt = FMT_OVERRIDE.get(key) or UNIT_FMT.get(unit, NUM0)
                formula = f"=IFERROR('{sheet_name}'!{target_col_letter}{row},\"n/a\")"
                set_cell(ws, row, col, formula, fmt=fmt, font=Font(name=FONT_NAME), border=CELL_BORDER, align='center')
                col += 1
        ws.row_dimensions[row].height = 20
        group_rows[ORG_INFO[loc][0]].append(row)
        row += 1

    all_keys_in_order = [(sheet_name, key) for sheet_name, _, metric_keys in sheet_specs for key in metric_keys]

    def subtotal_row(label, rows, fill):
        nonlocal row
        set_cell(ws, row, 5, label, font=Font(name=FONT_NAME, bold=True, italic=True), fill=fill, border=CELL_BORDER, align='right')
        set_cell(ws, row, 6, label, font=Font(name=FONT_NAME, bold=True, size=9), fill=fill, border=ROW_BORDER, align='center', wrap=True)
        for c in range(1, 5):
            set_cell(ws, row, c, '', fill=fill, border=CELL_BORDER)
        r0, r1 = rows[0], rows[-1]
        for sheet_name, key in all_keys_in_order:
            cc = col_map[(sheet_name, key)]
            fn = ROLLUP_FN[metrics_for(LOCS[0])[key]['direction']]
            unit = metrics_for(LOCS[0])[key]['unit']
            fmt = FMT_OVERRIDE.get(key) or UNIT_FMT.get(unit, NUM0)
            rng = f'{get_column_letter(cc)}{r0}:{get_column_letter(cc)}{r1}'
            set_cell(ws, row, cc, f'=IFERROR({fn}({rng}),"")', fmt=fmt, font=Font(name=FONT_NAME, bold=True), fill=fill, border=CELL_BORDER, align='center')
        ws.row_dimensions[row].height = 34
        row += 1

    SUBTOTAL_FILL = PatternFill('solid', fgColor='D9D9D9')
    GRANDTOTAL_FILL = PatternFill('solid', fgColor='A6A6A6')
    subtotal_rows = {'OK': None, 'FL': None}
    if group_rows['OK']:
        subtotal_rows['OK'] = row
        subtotal_row('MCDOK Subtotal / Avg', group_rows['OK'], SUBTOTAL_FILL)
    if group_rows['FL']:
        subtotal_rows['FL'] = row
        subtotal_row('Emerald Arches Subtotal / Avg', group_rows['FL'], SUBTOTAL_FILL)
    subtotal_row('Combined District Total / Avg', group_rows['OK'] + group_rows['FL'], GRANDTOTAL_FILL)
    insert_org_logos(ws, subtotal_rows)
    freeze_and_width(ws, col-1, sc)
    return ws

def build_multi_group_sheet(wb, sheet_name, groups, tab_color_key):
    """Like build_category_sheet, but several titled groups share ONE sheet -- used for the
    ORIGINAL_LAYOUT workbook's single 'Table 1', matching the owner's real 2026/2027 workbook's
    own convention of several category groups side by side on one tab, each in its own color."""
    ws = wb.create_sheet(sheet_name)
    tab_sc = SECTION_COLORS[tab_color_key]
    for i, h in enumerate(IDENT_HEADERS):
        set_cell(ws, 3, i+1, h, font=BOLD, fill=HDR_FILL, wrap=True, border=CELL_BORDER)
    set_cell(ws, 3, 6, 'LOCATION #', font=Font(name=FONT_NAME, bold=True, size=12,
             color=('FFFFFF' if tab_sc['text'] == 'white' else '000000')),
             fill=PatternFill('solid', fgColor=tab_sc['fill']), wrap=True, border=CELL_BORDER)
    ws.row_dimensions[2].height = 50
    ws.row_dimensions[3].height = 40
    ws.row_dimensions[4].hidden = True

    col_of = {}
    col = 7
    for group_title, metric_keys, sc in groups:
        group_start_col = col
        for key in metric_keys:
            col_of[key] = col
            extra = EXTRA_COL.get(key)
            metric_header(ws, 3, col, LABELS[key], sc, note=None, extra_col_label=EXTRA_COL_LABEL.get(extra))
            cl = get_column_letter(col)
            ws.column_dimensions[cl].outlineLevel = 1
            ws.column_dimensions[cl].hidden = True
            col += 8 if extra else 7
        set_cell(ws, 2, group_start_col, group_title, font=Font(name=FONT_NAME, bold=True, size=16), wrap=True, align='center')
        ws.merge_cells(start_row=2, start_column=group_start_col, end_row=2, end_column=col-1)

    row = 5
    group_rows = {'OK': [], 'FL': []}
    all_keys = [key for _, keys, _ in groups for key in keys]
    for i, loc in enumerate(LOCS, start=1):
        write_identity_block(ws, row, i, loc, tab_sc)
        mvals = metrics_for(loc)
        for group_title, metric_keys, sc in groups:
            c = col_of[metric_keys[0]]
            for key in metric_keys:
                metric_row(ws, row, c, key, mvals[key], extra_col=EXTRA_COL.get(key))
                c += 8 if key in EXTRA_COL else 7
        ws.row_dimensions[row].height = 20
        group_rows[ORG_INFO[loc][0]].append(row)
        row += 1

    def subtotal_row(label, rows, fill):
        nonlocal row
        r_used = row
        set_cell(ws, row, 5, label, font=Font(name=FONT_NAME, bold=True, italic=True), fill=fill, border=CELL_BORDER, align='right')
        set_cell(ws, row, 6, label, font=Font(name=FONT_NAME, bold=True, size=9), fill=fill, border=ROW_BORDER, align='center', wrap=True)
        for c in range(1, 5):
            set_cell(ws, row, c, '', fill=fill, border=CELL_BORDER)
        r0, r1 = rows[0], rows[-1]
        for key in all_keys:
            c0 = col_of[key]
            fn = ROLLUP_FN[metrics_for(LOCS[0])[key]['direction']]
            sub_offs = (0, 1, 2, 5) + ((7,) if key in EXTRA_COL else ())
            for sub_off in sub_offs:
                cc = c0 + sub_off
                rng = f'{get_column_letter(cc)}{r0}:{get_column_letter(cc)}{r1}'
                fmt = EXTRA_COL_FMT.get(EXTRA_COL.get(key)) if sub_off == 7 else (FMT_OVERRIDE.get(key) or UNIT_FMT.get(metrics_for(LOCS[0])[key]['unit'], NUM0))
                # The extra column (% +/- vs 2026, +/- Hrs/Day) is always a rate, never a total --
                # it must always AVERAGE across the group's stores even when its parent metric
                # (Sales/GC) itself SUMs, or a district subtotal summed 20 stores' own % growth
                # figures into something like -17% with no real meaning (found while fixing the
                # format above -- same root cause, this rollup function was never metric-specific).
                roll_fn = 'AVERAGE' if sub_off == 7 else fn
                # COUNT guard: when a metric's whole subtotal range is 'n/a' text (no 2026
                # Target exists in the original upload for it at all), SUM(range) legitimately
                # returns 0 -- not an error IFERROR catches -- which would misleadingly print as
                # a real $0 total next to other metrics' real dollar subtotals. Showing 'n/a'
                # instead makes 'no data' and 'a real zero' visually distinct.
                set_cell(ws, row, cc, f'=IF(COUNT({rng})=0,"n/a",IFERROR({roll_fn}({rng}),""))', fmt=fmt, font=Font(name=FONT_NAME, bold=True), fill=fill, border=CELL_BORDER, align='center')
            for blank_off in (3, 4, 6):
                set_cell(ws, row, c0+blank_off, '', fill=fill, border=CELL_BORDER)
        ws.row_dimensions[row].height = 34
        row += 1
        return r_used

    SUBTOTAL_FILL = PatternFill('solid', fgColor='D9D9D9')
    GRANDTOTAL_FILL = PatternFill('solid', fgColor='A6A6A6')
    subtotal_rows = {'OK': None, 'FL': None}
    if group_rows['OK']:
        subtotal_rows['OK'] = subtotal_row('MCDOK Subtotal / Avg', group_rows['OK'], SUBTOTAL_FILL)
    if group_rows['FL']:
        subtotal_rows['FL'] = subtotal_row('Emerald Arches Subtotal / Avg', group_rows['FL'], SUBTOTAL_FILL)
    subtotal_row('Combined District Total / Avg', group_rows['OK'] + group_rows['FL'], GRANDTOTAL_FILL)
    insert_org_logos(ws, subtotal_rows)
    freeze_and_width(ws, col-1, tab_sc)
    return ws

print('sheet builder ready')

def build_readme(wb, variant_note):
    ws = wb.create_sheet('Read Me', 0)
    ws.column_dimensions['A'].width = 100
    lines = [
        ('Restaurant Annual Targets Workbook', True, 14),
        ('', False, 11),
        (f'As of data pull: {AS_OF}. {variant_note}', False, 11),
        ('', False, 11),
        ('How this works (read this before editing):', True, 12),
        ('- Grey header cells and black numbers are COMPUTED, not typed -- they come from a data pull script', False, 11),
        ('  (Supabase qsr_daily_activity_rollup / smg_fullscale / turnover_monthly, plus your QSRSoft exports).', False, 11),
        ('- Each metric is now 7 columns, left to right: 2026 Target (Original) | 2026 Actual | Trend |', False, 11),
        ('  Adj. Applied (edit me) | 2027 Target (Proposed) | 2027 Target -- Your Override | an extra column', False, 11),
        ('  on a few metrics (% +/- vs 2026, +/- Hrs/Day). A hidden "Last Year / Ref." column sits before all', False, 11),
        ('  of this (the +/- control above each sheet\'s columns expands it).', False, 11),
        ('- "2026 Target (Original)" is pulled directly from your real original 2026 targets upload -- this', False, 11),
        ('  store\'s own individualized target, not that sheet\'s single org-wide reference number. Reads', False, 11),
        ('  "n/a" where that metric never had a 2026 target in the original file at all (see each cell\'s', False, 11),
        ('  comment for which case applies) -- left blank per your instruction rather than guessed.', False, 11),
        ('- "2026 Actual" = full YTD 2026 (Jan 1 through the data-pull date above) -- your real results so far.', False, 11),
        ('- "Trend" reads this store\'s own recent-vs-prior movement as an arrow + a signed %, always with', False, 11),
        ('  positive meaning improving (green), negative meaning declining (red), regardless of whether the', False, 11),
        ('  metric itself is a "lower is better" or "higher is better" number. See the cell comment for the', False, 11),
        ('  exact windows compared for that metric.', False, 11),
        ('- Blue, yellow-highlighted "Adj. Applied" cells are YOUR input -- the math applied to 2026 Actual to', False, 11),
        ('  get the proposed 2027 Target (e.g. "+5.0%"). The DEFAULT is not a flat guess: it\'s computed from', False, 11),
        ('  each store\'s own recent trend (the same signal Trend displays), sized to a sensible range per', False, 11),
        ('  metric. Sales/Guest Counts use the store\'s own real matched-period growth rate directly. Every', False, 11),
        ('  cell is still a plain number, not a formula -- type over it any time; nothing else breaks.', False, 11),
        ('- Black "2027 Target (Proposed)" cells are FORMULAS off 2026 Actual and Adj. Applied -- change the', False, 11),
        ('  Adjustment, the target updates. Percentage/5-point-scale metrics (CSAT, Digital %, KVS Healthy', False, 11),
        ('  Use) are capped so a target can never exceed 100% or 5.0, however large the edit.', False, 11),
        ('- "2027 Target -- Your Override" is blank by default and never recalculates anything -- the Proposed', False, 11),
        ('  Target column is still the real number everything else (the Summary tab, subtotals) reads. Type', False, 11),
        ('  your own number in Override any time you want to replace the proposal with your own call; it is', False, 11),
        ('  simply a second place to write a number down, not a live substitute wired into other formulas.', False, 11),
        ('- Printing: this is a denser tracking view than before, by design -- the full 2026 Target through', False, 11),
        ('  Override sequence is visible by default (only the legacy "Last Year / Ref." column stays', False, 11),
        ('  collapsed/hidden and skipped on print). A tab with several metrics may now print smaller or', False, 11),
        ('  across more than one page to fit it all -- expand/collapse the Last Year column any time.', False, 11),
        ('- "needs data source" cells have no automated pull wired in -- the cell comment says exactly what', False, 11),
        ('  was checked and came up empty, so you know what to source rather than guessing why it\'s blank.', False, 11),
        ('  VOICE Execute As Designed, McDelivery Wait Time/Star Rating, and McDelivery GC/R/D are now all', False, 11),
        ('  real, sourced data (owner-supplied exports) -- remaining blanks are real coverage gaps in those', False, 11),
        ('  exports (mainly FL stores and 44689), not missing metrics. See each cell\'s comment for the source.', False, 11),
        ('- 1-800 Contacts uses VOICE comment volume as a proxy -- the real CRCP complaint-email feed', False, 11),
        ('  (MyQSRSoft\'s own "Customer Feedback" page) isn\'t ingested into Meridian at all today.', False, 11),
        ('- Loc 44689 (Lindsay, relocated 2026-11-09) has only ~8 days of its own data -- too thin to use.', False, 11),
        ('  Every rate metric (seconds, %, ratios) is backfilled from 18213 (Lindsay-Wal-Mart, same staff/', False, 11),
        ('  owner/supervisor) per your instruction; Sales $ and Guest Counts are scaled up 15% for the new', False, 11),
        ('  freestanding store model -- a flagged placeholder, not a measurement. Edit that scale factor', False, 11),
        ('  (see the cell comment) once you know the new store\'s real capacity.', False, 11),
        ('', False, 11),
        ('To refresh for next year: re-run the data-pull script (ask Claude Code to do this), which refreshes', False, 11),
        ('every Trailing Baseline, Last-Year cell, and the smart Adjustment default. Every Target formula', False, 11),
        ('recalculates automatically -- nothing else needs to be retyped. Any Adjustment cell you\'ve typed', False, 11),
        ('over yourself carries over untouched unless you want to change it.', False, 11),
        ('', False, 11),
        ('Full written methodology, the evidence behind it, and what\'s still open: see the companion doc', False, 11),
        ('"2027 Restaurant Targets Methodology".', False, 11),
    ]
    for i, (text, bold, size) in enumerate(lines, start=1):
        # wrap=True so a long line (the subtitle especially) wraps inside column A instead of
        # overflowing past it -- without this, the print_area below (needed for one-page fit)
        # clips any overflow at the column edge instead of letting it render past it.
        set_cell(ws, i, 1, text, font=Font(name=FONT_NAME, bold=bold, size=size), wrap=True)
    # One page (owner-requested) -- this sheet never had its own print setup before, so it printed
    # at Excel/LibreOffice defaults and spilled across several pages with text cut off mid-line.
    ws.page_setup.orientation = 'portrait'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.fitToPage = True
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_area = f'A1:A{len(lines)}'
    return ws

def _END_OF_SHARED_SETUP(): pass

def build_workbook_a():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    build_readme(wb, 'This is the RESTRUCTURED layout: one tab per category, each metric shown as 2026 Target (Original) | 2026 Actual | Trend | Adj. Applied | 2027 Target (Proposed) | Your Override. A "Summary" tab up front collects every sheet\'s 2027 Target (Proposed) column into one combined, one-page view.')
    CATEGORY_SHEETS = [
        ('OEPE Peak', ['oepe_7_9','oepe_11_2','oepe_5_7'], '2027 OEPE w/o Park (Peak Periods)'),
        ('KVS Peak', ['kvs_pace_7_9','kvs_pace_11_2','kvs_pace_5_7'], '2027 KVS (Peak Periods)'),
        ('R2P Peak', ['r2p_7_9','r2p_11_2','r2p_5_7'], '2027 R2P (Peak Periods)'),
        ('Park Peak', ['park_pct_7_9','park_pct_11_2','park_pct_5_7'], '2027 Parked % (Peak Periods)'),
        ('Healthy Peak', ['kvs_healthy_7_9','kvs_healthy_11_2','kvs_healthy_5_7'], '2027 Healthy Use 2nd Side (Peak Periods)'),
        ('Peaks Combined', ['oepe_peak_combined','kvs_peak_combined','r2p_peak_combined','park_peak_combined','healthy_peak_combined'], '2027 Service 3 Peaks Combined (7a-9a / 11a-2p / 5p-7p)'),
        ('Service Total Day', ['oepe_pace','park_pct','kvs_pace','kvs_healthy','r2p_pace'], '2027 Service Total Day'),
        ('Sales & Traffic', ['sales','gc'], 'Yearly Sales & Guest Counts'),
        ('Labor', ['tpph','labor_pct','fob_pct','act_sched','act_need'], 'Labor & Food Over Base'),
        ('CSAT', ['osat_b2b','osat_pace','voice_ead','contacts_1800'], 'Customer Satisfaction (SMG VOICE)'),
        ('Digital', ['digital_pct','digital_gcrd','mcd_gcrd','mcd_wait','mcd_stars'], 'Digital Execution'),
        ('Turnover', ['turnover_ttm','turnover_3mo','crew_staff_target','shift_leader_target','gmdm_target','headcount_target'], 'People / Turnover'),
    ]
    sheet_specs = []
    for sheet_name, metric_keys, group_title in CATEGORY_SHEETS:
        _, col_of = build_category_sheet(wb, sheet_name, metric_keys, group_title)
        sheet_specs.append((sheet_name, col_of, metric_keys))
    build_summary_sheet(wb, sheet_specs)
    out = f'{BASE}/Restaurant_Annual_Targets_Workbook_RESTRUCTURED.xlsx'
    wb.save(out)
    print('saved', out)

build_workbook_a()




