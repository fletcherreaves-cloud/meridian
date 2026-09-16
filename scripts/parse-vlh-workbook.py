#!/usr/bin/env python3
"""One-off offline extraction tool, NOT part of the app or CI (this repo is otherwise
Node-only -- Python here purely because pdfplumber's word-coordinate extraction was the
fastest path to a reliable parse of a genuinely irregular PDF table layout). Re-run this
only if the VLH Workbook itself is ever replaced by a newer edition; day-to-day the repo
just ships its output, scripts/data/vlh-guide-2022-seed.json, via
scripts/seed-vlh-guide.mjs. Requires `pip install pdfplumber`.
    python3 scripts/parse-vlh-workbook.py
Reads the two source PDFs from docs/, writes vlh_guide_raw.json (nested, for inspection)
next to this script -- the actual seed file was produced by flattening that output; see
memory/finding-vlh-guide-tables-2026-09-16.md for the flattening step and full validation.

Parse the 2022 VLH Workbook PDFs (High Productivity + Standard) into structured JSON.

Scope: ONLY the "Drive Thru" and "In-Store" tables per config page (the two tables with
an unambiguous DAR guest-count mapping: dt_transactions / is_transactions). Every other
labor-position table (Order Takers, Assemblers, Curbside, Table Service, BDAP, McCafe,
Hash Browns & Fries, Sandwiches) is intentionally NOT extracted here -- their guest-count
driver is not confirmed from the PDF's own text, and guessing would risk shipping wrong
labor guidance. See memory/finding-vlh-guide-tables-2026-09-16.md.

Layout, reverse-engineered from word-level (x0, top) coordinates (all 49 pages of both
books share one fixed template):
  - 5 daypart column BANDS, each ~104pt wide, x0 in [84,188), [188,292), [292,396),
    [396,500), [500,604) for Breakfast/Lunch/Afternoon/Dinner/Late Night respectively.
  - Within a band, each row is a (Hours-tier, Start, End) triad. Tables STACK vertically
    in the same x0 band with no repeated header row for the later ones (Drive Thru's
    header is at top~107, In-Store's at top~226, but Order Takers/Assemblers/etc reuse
    the same band with no header at all) -- so tables can't be split by label position
    alone (a table's last row can visually sit BELOW the next table's text label, e.g.
    In-Store's tier-3 row for Late Night at top=270 sits below the "Order Takers:" label
    at top=264).
  - The reliable split is TIER RESET: Drive Thru tiers run 1,2,3...; In-Store (and every
    table after it) starts back at 0. So within a band, walking top-to-bottom, a new
    table begins whenever the tier number is <= the previous tier in the current table.
    Segment 0 = Drive Thru, segment 1 = In-Store (verified against every page's own
    "Labor Guest Count" / "Hours Start End" header words, which are anchored at fixed
    tops for exactly these first two tables and nowhere else).
  - "No Drive Thru" pages keep the Drive Thru shell with '-' placeholders instead of
    numbers (5 dashed rows) -- those are simply non-numeric and get skipped, so segment 0
    naturally becomes empty and segment 1 (still numeric) is In-Store.
"""
import json
import os
import re
import sys
from collections import defaultdict

import pdfplumber

DAYPARTS = ['breakfast', 'lunch', 'afternoon', 'dinner', 'late_night']
BAND_EDGES = [84, 188, 292, 396, 500, 604]  # 5 bands of ~104pt each

CONFIG_PAGES_NOTES = None  # filled from TOC page if needed


def band_of(x0):
    for i in range(5):
        if BAND_EDGES[i] <= x0 < BAND_EDGES[i + 1]:
            return i
    return None


def is_num(text):
    return bool(re.fullmatch(r'\d+', text))


def parse_config_header(text):
    """Pull AOT / Drive Thru type / In-Store service / Kitchen / Guide from the page's
    'Configuration' block (first ~5 lines of extract_text())."""
    m_aot = re.search(r'\|\s*(AOT|Non-AOT)\s*Kitchen', text)
    aot = (m_aot.group(1) == 'AOT') if m_aot else None
    m_dt = re.search(r'Drive Thru:\s*([^\n]+)', text)
    m_is = re.search(r'In-Store:\s*([^\n]+)', text)
    m_kitchen = re.search(r'Kitchen:\s*([^\n]+?)\s*(?:HOME)?\s*\n', text)
    m_guide = re.search(r'\n(Standard|HPG)\s*\|', text)
    return {
        'aot': aot,
        'dt_raw': m_dt.group(1).strip() if m_dt else None,
        'in_store_raw': m_is.group(1).strip() if m_is else None,
        'kitchen_raw': m_kitchen.group(1).strip() if m_kitchen else None,
    }

DT_TYPE_MAP = {
    'Side By Side / Tandem': 'side_tandem',
    'Single Lane 2 Booth': 'single_2booth',
    'Single Lane 1 Booth': 'single_1booth',
    'No Drive Thru': 'no_dt',
}
IN_STORE_MAP = {'Self Serve': 'self_serve', 'Crew Pour': 'crew_pour'}
KITCHEN_MAP = {
    'Fryer Same Side': 'fryer_same', 'Fryer Opposite Side': 'fryer_opp',
    'OPL': 'opl', 'COPL': 'copl',
}


def extract_ipo(text):
    return [float(x) for x in re.findall(r'IPO:\s*([\d.]+)', text)]


def parse_page(page, guide_label):
    text = page.extract_text() or ''
    cfg = parse_config_header(text)
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)

    # numeric words only, grouped by band. Row grouping tolerates +/-3pt 'top' jitter --
    # the tier digit and its Start/End values on the same visual row can land 1-2pt apart
    # in pdfplumber's word boxes (different glyph baselines), so exact-top grouping
    # silently drops rows (measured: tiers 1 and 6 disappeared on page 2 before this fix).
    by_band = defaultdict(list)  # band -> [(top, x0, text)]
    for w in words:
        if not is_num(w['text']):
            continue
        b = band_of(w['x0'])
        if b is None:
            continue
        by_band[b].append((w['top'], w['x0'], w['text']))

    TOP_TOL = 3.5

    def cluster_rows(items):
        items = sorted(items, key=lambda t: t[0])
        clusters = []
        for top, x0, text in items:
            if clusters and top - clusters[-1]['top0'] <= TOP_TOL:
                clusters[-1]['items'].append((x0, text))
                clusters[-1]['top0'] = (clusters[-1]['top0'] + top) / 2
            else:
                clusters.append({'top0': top, 'items': [(x0, text)]})
        return clusters

    per_band_tables = []  # per band: list of segments, each a list of (tier, start, end)
    for b in range(5):
        rows = []
        for cluster in cluster_rows(by_band[b]):
            toks = sorted(cluster['items'], key=lambda t: t[0])
            if len(toks) != 3:
                continue  # a real Hours/Start/End row always has exactly 3 numeric tokens
            tier, start, end = (int(toks[0][1]), int(toks[1][1]), int(toks[2][1]))
            rows.append((tier, start, end))
        segments = []
        prev_tier = None
        for tier, start, end in rows:
            if prev_tier is None or tier <= prev_tier:
                segments.append([])
            segments[-1].append({'tier': tier, 'guestStart': start, 'guestEnd': end})
            prev_tier = tier
        per_band_tables.append(segments)

    def segment(idx):
        out = {}
        for b in range(5):
            segs = per_band_tables[b]
            out[DAYPARTS[b]] = segs[idx] if idx < len(segs) else []
        return out

    # On "No Drive Thru" pages the Drive Thru shell is all '-' placeholders (non-numeric),
    # so segment 0 in the tier-reset walk is actually the FIRST real table -- In-Store --
    # not Drive Thru. Confirmed by content (segment 0 there starts 0-4/5-70/... matching
    # the page's own printed In-Store row, and segment 1 there is Order Takers' 0-32/...,
    # not In-Store) rather than assumed from the label alone.
    if cfg['dt_raw'] == 'No Drive Thru':
        drive_thru = {dp: [] for dp in DAYPARTS}
        in_store = segment(0)
    else:
        drive_thru = segment(0)
        in_store = segment(1)

    return {
        'guide': guide_label,
        'aot': cfg['aot'],
        'dtTypeRaw': cfg['dt_raw'],
        'dtType': DT_TYPE_MAP.get(cfg['dt_raw']),
        'inStoreRaw': cfg['in_store_raw'],
        'inStoreType': IN_STORE_MAP.get(cfg['in_store_raw']),
        'kitchenRaw': cfg['kitchen_raw'],
        'kitchen': KITCHEN_MAP.get(cfg['kitchen_raw']),
        'ipoByDaypart': dict(zip(DAYPARTS, extract_ipo(text))),
        'driveThru': drive_thru,
        'inStore': in_store,
    }


def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    books = [
        ('hpg', os.path.join(repo_root, 'docs', '2022_VLH_Workbook_High_Productivity_Guides.pdf')),
        ('standard', os.path.join(repo_root, 'docs', '2022_VLH_Workbook_Standard_Guides.pdf')),
    ]
    all_configs = []
    for guide_label, path in books:
        with pdfplumber.open(path) as pdf:
            for i in range(1, len(pdf.pages)):  # skip page 1 (TOC)
                page = pdf.pages[i]
                parsed = parse_page(page, guide_label)
                parsed['sourcePage'] = i + 1
                parsed['sourceFile'] = os.path.basename(path)
                all_configs.append(parsed)
    print(f"Parsed {len(all_configs)} config pages total", file=sys.stderr)
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vlh_guide_raw.json')
    with open(out_path, 'w') as f:
        json.dump(all_configs, f, indent=1)
    print(f"Wrote {out_path} -- flatten this into scripts/data/vlh-guide-2022-seed.json's shape "
          f"before seeding (see memory/finding-vlh-guide-tables-2026-09-16.md).", file=sys.stderr)


if __name__ == '__main__':
    main()
