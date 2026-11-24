import json, os, statistics, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter

# Reuses build.py's shared setup (data loads, metrics_for(), smart_adj(), trend_display(),
# LABELS, UNIT_FMT, SECTION_COLORS, set_cell(), CELL_BORDER, etc.) -- same pattern build_b.py
# already uses, so this file carries zero data-sourcing logic of its own.
_build_py_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py')
exec(open(_build_py_path).read().split("def _END_OF_SHARED_SETUP")[0])

# Owner ask (2026-11-24): a per-LOCATION view of the same RESTRUCTURED data (metric-as-row
# instead of store-as-row) so a GM/supervisor conversation about one store's targets has
# everything in one place: the real original 2026 target, the real 2026 actual, which way
# it's trending and why, the stretch applied, the proposed 2027 number, and a place to record
# an actual request (not just a bare override number) -- who asked, why, and what they want
# instead. Same category groupings ORIGINAL_LAYOUT's Table 1 already uses, just inside one tab
# per store instead of columns-across-all-stores.
GROUPS = [
    ('OEPE Peak Periods', ['oepe_7_9', 'oepe_11_2', 'oepe_5_7']),
    ('KVS Peak Periods', ['kvs_pace_7_9', 'kvs_pace_11_2', 'kvs_pace_5_7']),
    ('R2P Peak Periods', ['r2p_7_9', 'r2p_11_2', 'r2p_5_7']),
    ('Park % Peak Periods', ['park_pct_7_9', 'park_pct_11_2', 'park_pct_5_7']),
    ('Healthy Use 2nd Side Peak Periods', ['kvs_healthy_7_9', 'kvs_healthy_11_2', 'kvs_healthy_5_7']),
    ('Service -- 3 Peaks Combined', ['oepe_peak_combined', 'kvs_peak_combined', 'r2p_peak_combined', 'park_peak_combined', 'healthy_peak_combined']),
    ('Service Total Day / Sales & Traffic', ['oepe_pace', 'park_pct', 'kvs_pace', 'kvs_healthy', 'r2p_pace', 'sales', 'gc']),
    ('Customer Satisfaction (SMG VOICE)', ['osat_b2b', 'osat_pace', 'voice_ead', 'contacts_1800']),
    ('Digital Execution', ['digital_pct', 'digital_gcrd', 'mcd_gcrd', 'mcd_wait', 'mcd_stars']),
    ('People', ['crew_staff_target', 'shift_leader_target', 'gmdm_target', 'headcount_target', 'turnover_ttm', 'turnover_3mo']),
    ('Labor & Food Over Base', ['tpph', 'labor_pct', 'fob_pct', 'act_sched', 'act_need']),
]
ALL_KEYS = [k for _, keys in GROUPS for k in keys]

print('computing per-store metrics once (cached, reused across all 27 sheets)...')
METRICS_BY_LOC = {loc: metrics_for(loc) for loc in LOCS}

# Peer (district) context: median of the TRAILING/actual reading across all 27 stores, for
# rate-type metrics only (direction lower/higher/variance) -- a 'total' metric (Sales, GC) is a
# raw dollar/count that doesn't compare meaningfully store-to-store without normalizing for
# size, so it's intentionally left out of peer comparison rather than shown misleadingly.
def compute_peer_medians():
    out = {}
    for key in ALL_KEYS:
        vals = []
        for loc in LOCS:
            mdef = METRICS_BY_LOC[loc][key]
            if mdef['direction'] == 'total':
                continue
            if mdef.get('trailing') is not None:
                vals.append(mdef['trailing'])
        out[key] = statistics.median(vals) if vals else None
    return out
PEER_MEDIAN = compute_peer_medians()

# Mirrors metric_row()'s own Target-formula construction in build.py exactly (same direction/
# cap/round-grain branches) -- kept as a literal copy rather than a shared refactor so this new,
# separate workbook can't destabilize the already-shipped RESTRUCTURED/ORIGINAL_LAYOUT builds.
# If that logic ever changes, update both.
def target_formula_str(key, mdef, trail_ref, adj_ref):
    direction, unit = mdef['direction'], mdef['unit']
    if direction == 'lower':
        formula = f'{trail_ref}*(1-{adj_ref})'
    elif direction == 'higher':
        formula = f'{trail_ref}*(1+{adj_ref})'
    elif direction == 'variance':
        formula = f'{trail_ref}+{adj_ref}'
    elif direction == 'total':
        days_base = mdef.get('days_elapsed_override') or DAYS_ELAPSED_2026
        formula = f'{trail_ref}/{days_base}*365*(1+{adj_ref})'
    cap = SCALE_CAP.get(unit)
    if cap is not None and direction == 'higher':
        formula = f'MIN({formula},{cap})'
    grain = ROUND_GRAIN.get(key)
    if grain is not None:
        formula = f'MROUND({formula},{grain})'
    return formula

# direction-aware "is this store already at/ahead of its real 2026 target" check, for the
# summary strip. 'total' (no real 2026 target ever exists for Sales/GC) and 'variance'
# (no single good/bad sign without more context) are deliberately excluded -- same reasoning
# as the peer-median exclusion above.
def ahead_of_2026_target(mdef):
    t26, trailing, direction = mdef.get('target2026'), mdef.get('trailing'), mdef['direction']
    if t26 is None or trailing is None or direction not in ('lower', 'higher'):
        return None
    return trailing <= t26 if direction == 'lower' else trailing >= t26

HDRS = ['Category', 'Metric', '2026 Target (Original)', '2026 Actual', 'Trend',
        'District Median (Peer)', 'Stretch Applied', '2027 Proposed Target',
        'Requested By', 'Reason for Request', 'Your Requested Target']
COL_W = [26, 30, 16, 14, 20, 16, 13, 16, 16, 28, 18]
REQ_FILL = PatternFill('solid', fgColor='DDEBF7')
CAT_FILL = PatternFill('solid', fgColor='E7E6E6')
GOOD_FONT = Font(name=FONT_NAME, bold=True, color='006100')
BAD_FONT = Font(name=FONT_NAME, bold=True, color='9C0006')

def build_store_sheet(wb, loc):
    org, sup, op = ORG_INFO[loc]
    ws = wb.create_sheet(f'{loc}')
    sc = SECTION_COLORS['Sales & Traffic']  # neutral yellow header band, matches Summary tab
    ws.sheet_properties.tabColor = sc['fill']

    set_cell(ws, 1, 1, f'{STORE_NAMES[loc]}  (#{loc})', font=Font(name=FONT_NAME, bold=True, size=18))
    ws.merge_cells('A1:F1')
    set_cell(ws, 2, 1, f'{ORG_LABEL[org]}  |  Supervisor: {sup}  |  Owner/Operator: {op}',
             font=Font(name=FONT_NAME, italic=True, size=11, color='555555'))
    ws.merge_cells('A2:F2')

    mvals = METRICS_BY_LOC[loc]
    flags = [ahead_of_2026_target(mvals[k]) for k in ALL_KEYS]
    n_ahead = sum(1 for f in flags if f is True)
    n_behind = sum(1 for f in flags if f is False)
    n_na = sum(1 for f in flags if f is None)
    set_cell(ws, 3, 1,
             f'Summary: {n_ahead} of {n_ahead+n_behind} graded metrics already at/ahead of their 2026 target, '
             f'{n_behind} behind.  ({n_na} metrics have no single-direction 2026 target to grade against.)',
             font=Font(name=FONT_NAME, bold=True, size=11),
             fill=PatternFill('solid', fgColor='E2EFDA' if n_behind == 0 else ('FCE4D6' if n_behind > n_ahead else 'FFF2CC')))
    ws.merge_cells('A3:K3')
    ws.row_dimensions[1].height = 26
    ws.row_dimensions[2].height = 18
    ws.row_dimensions[3].height = 20

    hdr_row = 5
    for i, h in enumerate(HDRS):
        set_cell(ws, hdr_row, i+1, h, font=Font(name=FONT_NAME, bold=True, color='FFFFFF'),
                  fill=PatternFill('solid', fgColor=sc['fill']), wrap=True, border=CELL_BORDER, align='center')
    ws.row_dimensions[hdr_row].height = 32

    row = hdr_row + 1
    for group_title, keys in GROUPS:
        set_cell(ws, row, 1, group_title, font=Font(name=FONT_NAME, bold=True), fill=CAT_FILL, border=CELL_BORDER)
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=len(HDRS))
        row += 1
        for key in keys:
            mdef = mvals[key]
            direction, unit = mdef['direction'], mdef['unit']
            fmt = FMT_OVERRIDE.get(key) or UNIT_FMT.get(unit, NUM0)
            set_cell(ws, row, 1, '', border=CELL_BORDER)
            set_cell(ws, row, 2, LABELS[key], font=BOLD, border=CELL_BORDER, wrap=True)

            t26 = mdef.get('target2026')
            t26_comment = ("Pulled from your original 2026 targets upload (this store's own individualized "
                            "target)." if t26 is not None else
                            "No 2026 target for this metric exists in the original upload.")
            set_cell(ws, row, 3, t26 if t26 is not None else 'n/a', fmt=fmt if t26 is not None else None,
                      comment=t26_comment, border=CELL_BORDER, align='center')

            trailing = mdef.get('trailing')
            set_cell(ws, row, 4, trailing if trailing is not None else 'needs data source',
                      fmt=fmt if trailing is not None else None, comment=mdef.get('source'),
                      border=CELL_BORDER, align='center')

            if trailing is None:
                for c in (5, 6, 8):
                    set_cell(ws, row, c, 'n/a', border=CELL_BORDER, align='center')
                set_cell(ws, row, 7, None, border=CELL_BORDER)
                for c in (9, 10):
                    set_cell(ws, row, c, None, fill=REQ_FILL, border=CELL_BORDER)
                set_cell(ws, row, 11, None, fill=REQ_FILL, fmt=fmt, border=CELL_BORDER, align='center')
                row += 1
                continue

            trend_text, trend_pct, trend_note = trend_display(key, mdef)
            trend_font = (GOOD_FONT if (trend_pct is not None and trend_pct > 0.005) else
                          BAD_FONT if (trend_pct is not None and trend_pct < -0.005) else
                          Font(name=FONT_NAME, bold=True, color='7F7F7F'))
            set_cell(ws, row, 5, trend_text, font=trend_font, comment=trend_note, border=CELL_BORDER, align='center')

            peer = PEER_MEDIAN.get(key)
            set_cell(ws, row, 6, peer if peer is not None else 'n/a', fmt=fmt if peer is not None else None,
                      comment='District median of all 27 stores’ own current actual reading for this metric.' if peer is not None else
                               'Not peer-comparable (a district total, not a per-store rate).',
                      border=CELL_BORDER, align='center')

            default_adj = smart_adj(key, mdef)
            adj_fmt = NUM0 if (direction == 'variance' and unit == 'num') else PCT
            set_cell(ws, row, 7, default_adj, font=BLUE, fill=YELLOW_FILL, fmt=adj_fmt, border=CELL_BORDER, align='center',
                      comment='Default is this store’s own recent trend, not a flat guess -- edit freely to test a different stretch.')

            trail_ref = f'{get_column_letter(4)}{row}'
            adj_ref = f'{get_column_letter(7)}{row}'
            formula = target_formula_str(key, mdef, trail_ref, adj_ref)
            target_comment = None
            if mdef.get('days_elapsed_override'):
                target_comment = (f"This store opened mid-2026 -- annualized off its own "
                                   f"{mdef['days_elapsed_override']} real operating days, not the district's "
                                   f"{DAYS_ELAPSED_2026}.")
            set_cell(ws, row, 8, '=' + formula, fmt=fmt, font=Font(name=FONT_NAME, bold=True), border=CELL_BORDER,
                      align='center', comment=target_comment)

            set_cell(ws, row, 9, None, fill=REQ_FILL, border=CELL_BORDER)
            set_cell(ws, row, 10, None, fill=REQ_FILL, wrap=True, border=CELL_BORDER)
            set_cell(ws, row, 11, None, fill=REQ_FILL, fmt=fmt, border=CELL_BORDER, align='center',
                      comment='Blank by default. If this store/supervisor wants a different 2027 target than the '
                               'proposed one, write the real number they’re requesting here -- along with who’s '
                               'asking and why in the two columns before it.')
            ws.row_dimensions[row].height = 18
            row += 1

    ws.freeze_panes = f'C{hdr_row+1}'
    for i, w in enumerate(COL_W):
        ws.column_dimensions[get_column_letter(i+1)].width = w
    ws.sheet_view.showGridLines = False
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.fitToPage = True
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = f'{hdr_row}:{hdr_row}'
    ws.print_area = f'A1:K{row-1}'
    return ws

def build_readme_location(wb):
    ws = wb.create_sheet('Read Me', 0)
    ws.column_dimensions['A'].width = 100
    lines = [
        ('2027 Targets -- Per-Location Review Sheets', True, 14),
        ('', False, 11),
        (f'As of data pull: {AS_OF}. One tab per store (27 total) -- the same real data as the '
         'RESTRUCTURED/ORIGINAL_LAYOUT workbooks, reorganized so every metric for ONE store reads '
         'top to bottom, grouped by category, for a real target-change conversation with that '
         'store’s GM/supervisor.', False, 11),
        ('', False, 11),
        ('Columns, left to right:', True, 12),
        ('- 2026 Target (Original): this store’s own individualized target from the real original '
         '2026 upload. "n/a" where that metric never had one there.', False, 11),
        ('- 2026 Actual: this store’s real year-to-date 2026 result.', False, 11),
        ('- Trend: arrow + signed % -- is this store’s own recent performance improving or '
         'declining lately, and by how much. Positive always means improving, whatever the metric’s '
         'own direction of "better" -- hover the cell for the exact comparison window.', False, 11),
        ('- District Median (Peer): where the other 26 stores currently stand on this same metric, '
         'for context on whether an ask is fair relative to the rest of the group. Left "n/a" for '
         'Sales/GC (district totals, not a per-store rate -- not peer-comparable).', False, 11),
        ('- Stretch Applied: the %/pt change applied to 2026 Actual to propose the 2027 Target. '
         'Blue/yellow = editable, same as the category workbooks -- the default is this store’s own '
         'measured trend, not a flat guess.', False, 11),
        ('- 2027 Proposed Target: a live formula off 2026 Actual and Stretch Applied -- change the '
         'stretch, this updates automatically.', False, 11),
        ('- Requested By / Reason for Request / Your Requested Target: blank, for a real decision. '
         'If this store/supervisor wants a different number than the proposed one, record who asked, '
         'why, and the actual number requested -- not just a bare override with no record of the '
         'conversation.', False, 11),
        ('', False, 11),
        ('The summary line at the top of each store’s tab counts how many of its metrics with a real '
         '2026 target are already at or ahead of it versus behind -- a quick read on whether this is '
         'mostly a "keep doing what you’re doing" conversation or a "here’s where we need to close '
         'gaps" one, before reading all the rows.', False, 11),
        ('', False, 11),
        ('Same data-sourcing rules as the other two workbooks in this folder -- see this folder’s own '
         'README.md and the companion Claude Doc "2027 Restaurant Targets Methodology" for the full '
         'rationale, known data gaps, and how to re-run this build.', False, 11),
    ]
    for i, (text, bold, size) in enumerate(lines, start=1):
        set_cell(ws, i, 1, text, font=Font(name=FONT_NAME, bold=bold, size=size), wrap=True)
    ws.page_setup.orientation = 'portrait'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_setup.fitToPage = True
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_area = f'A1:A{len(lines)}'
    return ws

def build_workbook_c():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    build_readme_location(wb)
    for loc in LOCS:
        build_store_sheet(wb, loc)
    out = f'{BASE}/Restaurant_Annual_Targets_Workbook_PER_LOCATION.xlsx'
    wb.save(out)
    print('saved', out)

build_workbook_c()
