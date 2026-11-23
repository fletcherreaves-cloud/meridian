import json, os, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter
_build_py_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build.py')
exec(open(_build_py_path).read().split("def _END_OF_SHARED_SETUP")[0])
# ^ reuses everything through metric_header/metric_row/build_multi_group_sheet/build_readme --
# this file now just picks the GROUP layout and builds the single 'Table 1' sheet, matching the
# owner's real 2026/2027 workbook's own category grouping (new metrics folded into the group they
# belong to, per the owner's instruction), rather than RESTRUCTURED's one-sheet-per-category.

def build_workbook_b():
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    build_readme(wb, 'This is the ORIGINAL layout: one sheet ("Table 1"), grouped the same way your '
                      'real 2026/2027 workbook is grouped. Speed/Service is now split into the same '
                      '7 groups as RESTRUCTURED\'s 7 tabs (5 Peak-Periods detail groups, a 3-Peaks-'
                      'Combined blend, and Service Total Day -- Sales/GC folded into that last one). '
                      'Act vs. Scheduled/Needed folded into Labor & Food Over Base, headcount targets '
                      'folded into People. Same rounding, same smart Adjustment defaults, same OK/FL '
                      '+ combined subtotals as RESTRUCTURED.')
    groups = [
        ('2027 OEPE w/o Park (Peak Periods)', ['oepe_7_9', 'oepe_11_2', 'oepe_5_7'], SECTION_COLORS['OEPE Peak']),
        ('2027 KVS (Peak Periods)', ['kvs_pace_7_9', 'kvs_pace_11_2', 'kvs_pace_5_7'], SECTION_COLORS['KVS Peak']),
        ('2027 R2P (Peak Periods)', ['r2p_7_9', 'r2p_11_2', 'r2p_5_7'], SECTION_COLORS['R2P Peak']),
        ('2027 Parked % (Peak Periods)', ['park_pct_7_9', 'park_pct_11_2', 'park_pct_5_7'], SECTION_COLORS['Park Peak']),
        ('2027 Healthy Use 2nd Side (Peak Periods)', ['kvs_healthy_7_9', 'kvs_healthy_11_2', 'kvs_healthy_5_7'], SECTION_COLORS['Healthy Peak']),
        ('2027 Service 3 Peaks Combined', ['oepe_peak_combined', 'kvs_peak_combined', 'r2p_peak_combined', 'park_peak_combined', 'healthy_peak_combined'], SECTION_COLORS['Peaks Combined']),
        ('2027 Service Total Day / Yearly Sales & Traffic', ['oepe_pace', 'park_pct', 'kvs_pace', 'kvs_healthy', 'r2p_pace', 'sales', 'gc'], SECTION_COLORS['Service Total Day']),
        ('Customer Satisfaction (SMG VOICE)', ['osat_b2b', 'osat_pace', 'voice_ead', 'contacts_1800'], SECTION_COLORS['CSAT']),
        ('Digital Execution', ['digital_pct', 'digital_gcrd', 'mcd_gcrd', 'mcd_wait', 'mcd_stars'], SECTION_COLORS['Digital']),
        ('People', ['crew_staff_target', 'shift_leader_target', 'gmdm_target', 'headcount_target', 'turnover_ttm', 'turnover_3mo'], SECTION_COLORS['Turnover']),
        ('Labor & Food Over Base', ['tpph', 'labor_pct', 'fob_pct', 'act_sched', 'act_need'], SECTION_COLORS['Labor']),
    ]
    build_multi_group_sheet(wb, 'Table 1', groups, tab_color_key='Sales & Traffic')
    out = f'{BASE}/Restaurant_Annual_Targets_Workbook_ORIGINAL_LAYOUT.xlsx'
    wb.save(out)
    print('saved', out)

build_workbook_b()
