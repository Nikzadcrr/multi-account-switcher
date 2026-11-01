#!/usr/bin/env python3
"""Find app theme colors / gradients in bundle strings."""
import re, json

SRC = '/home/z/my-project/upload/app_decompile/bundle_strings.txt'
raw = open(SRC, encoding='utf-8', errors='replace').read()

hexes = re.findall(r'#[0-9a-fA-F]{6}\b', raw)
from collections import Counter
cnt = Counter(h.lower() for h in hexes)
common = [c for c, n in cnt.most_common(40) if n >= 3]
print('TOP HEX COLORS:', json.dumps(common, indent=0))

# gradient patterns
grads = re.findall(r'linear-gradient\([^)]{0,120}\)', raw)
print('\nLINEAR GRADIENTS:', json.dumps(sorted(set(grads))[:30], indent=0))

# rgba frequent
rgbas = re.findall(r'rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[0-9.]+)?\s*\)', raw)
rc = Counter(rgbas)
print('\nTOP RGBA:', json.dumps([r for r, n in rc.most_common(30) if n >= 3], indent=0))
