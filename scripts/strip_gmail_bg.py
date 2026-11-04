#!/usr/bin/env python3
"""Remove the personal-Gmail feature (Gmail Real: OAuth + quick feed + aliases) from background.js."""
import re, sys

PATH = '/home/z/my-project/plugin/background.js'
with open(PATH, encoding='utf-8') as f:
    lines = f.readlines()  # 0-indexed; file line N == lines[N-1]

def expect(idx, needle, desc):
    """idx is 1-based line number; assert needle appears in that line."""
    if needle not in lines[idx - 1]:
        print(f'ANCHOR FAIL at line {idx} ({desc}): expected "{needle}" in: {lines[idx-1]!r}')
        sys.exit(1)

# ---- sanity anchors ----
expect(1519, 'Gmail Real', 'block start')
expect(2292, 'async function getMailState()', 'block end')
expect(2910, 'gmailQuickActive', 'poll')
expect(3355, "case 'GMAIL_GET_STATUS'", 'handlers start')
expect(3471, "case 'MAIL_FETCH_DOMAINS'", 'handlers end')
expect(3479, "msg.provider === 'gmail_real'", 'create branch')

# bottom-up edits -----------------------------------------------------------

# 4) MAIL_CREATE_INBOX: drop gmail_real branch (lines 3478-3489)
new_create = [
    "          const mb = await createTempMailbox(\n",
    "            msg.provider || 'hd',\n",
    "            msg.customUser || '',\n",
    "            msg.domain || ''\n",
    "          );\n",
]
lines[3477:3489] = new_create

# 3) GMAIL_* message handlers (lines 3355-3470)
del lines[3354:3470]

# 2) polling: quick-mode routing block (lines 2943-2967) and per-box skips
del lines[2942:2967]   # comment + if(gmailQuickActive...){...}
del lines[2924:2927]   # if (gmailQuickActive && ... continue;)
del lines[2907:2918]   # comment + gmailQuickActive/firstGmailBoxId/quickCandidateAddrs decls

# 1) the whole Gmail Real block (lines 1518-2291)
del lines[1517:2291]

with open(PATH, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('background.js: gmail block stripped, new line count =', len(lines))
