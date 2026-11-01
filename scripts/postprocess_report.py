#!/usr/bin/env python3
"""Post-process InstantMail_API_Report.docx per docx skill toc.md:
   1) remove empty <w:pgNumType/>  2) patch footer PAGE instrText (ROMAN / arabic)"""
import re, shutil, zipfile, sys

DOCX = '/home/z/my-project/download/InstantMail_API_Report.docx'
TMP = '/tmp/report_patch'

shutil.rmtree(TMP, ignore_errors=True)
with zipfile.ZipFile(DOCX) as z:
    z.extractall(TMP)

# 1) document.xml — remove empty pgNumType, map footers to sections
doc_path = f'{TMP}/word/document.xml'
doc = open(doc_path, encoding='utf-8').read()
doc, n_empty = re.subn(r'<w:pgNumType/>', '', doc)

# 1b) dedupe TOC entries (docx-js 9.x emits hyperlinked cached entries AND
#     add_toc_placeholders.py inserts plain ones → first heading shows twice).
#     Keep the FIRST TOC paragraph per visible text, drop later duplicates.
para_pattern = re.compile(r'<w:p>(?:(?!</?w:p[ >]).)*?</w:p>', re.S)

def para_text(p_xml):
    """Visible text key — drop trailing page-number run if it is pure digits."""
    ts = re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p_xml)
    if ts and ts[-1].strip().isdigit() and len(ts) > 1:
        ts = ts[:-1]
    return ''.join(ts).strip()

def is_toc_para(p_xml):
    return re.search(r'<w:pStyle w:val="TOC[123]"/>', p_xml) is not None

seen, removed = set(), 0
def dedupe(m):
    global removed
    p = m.group(0)
    if is_toc_para(p):
        t = para_text(p)
        if t in seen:
            removed += 1
            return ''
        seen.add(t)
    return p

doc = para_pattern.sub(dedupe, doc)
print(f'deduped {removed} duplicate TOC entries')

rels = open(f'{TMP}/word/_rels/document.xml.rels', encoding='utf-8').read()
rid_to_file = dict(re.findall(r'<Relationship Id="(rId\d+)"[^>]*Target="(footer\d+\.xml)"', rels))

roman_footers, arabic_footers = set(), set()
for sect in re.findall(r'<w:sectPr[^>]*>.*?</w:sectPr>', doc, re.S):
    fmt_m = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', sect)
    for rid in re.findall(r'<w:footerReference[^>]*r:id="(rId\d+)"', sect):
        f = rid_to_file.get(rid)
        if not f:
            continue
        if fmt_m and fmt_m.group(1) == 'upperRoman':
            roman_footers.add(f)
        else:
            arabic_footers.add(f)

open(doc_path, 'w', encoding='utf-8').write(doc)

# 2) patch footers
def patch_footer(fname, fmt_switch):
    path = f'{TMP}/word/{fname}'
    xml = open(path, encoding='utf-8').read()
    xml, n = re.subn(
        r'(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)',
        rf'\1 PAGE \\* {fmt_switch} \\* MERGEFORMAT \2', xml)
    open(path, 'w', encoding='utf-8').write(xml)
    return n

total = n_empty
for f in roman_footers:
    total += patch_footer(f, 'ROMAN')
for f in arabic_footers - roman_footers:
    total += patch_footer(f, 'arabic')

# repack
import os
out = zipfile.ZipFile(DOCX, 'w', zipfile.ZIP_DEFLATED)
for root, _, files in os.walk(TMP):
    for file in files:
        full = os.path.join(root, file)
        out.write(full, os.path.relpath(full, TMP))
out.close()
print(f'patched: {n_empty} empty pgNumType removed, footers roman={sorted(roman_footers)} arabic={sorted(arabic_footers - roman_footers)}, total subs={total}')
