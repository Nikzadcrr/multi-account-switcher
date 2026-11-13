#!/bin/bash
# Batch vision test on all 30 captchas
cd /tmp/captchas
ok=0; total=0
for f in cap_*.png; do
  truth=$(echo "$f" | sed 's/cap_[0-9]*_\(.*\)\.png/\1/')
  z-ai vision -p "This is a CAPTCHA image. Read the exact characters shown. Output ONLY the characters, nothing else." -i "./$f" -o "/tmp/vres.json" >/dev/null 2>&1
  pred=$(python3 -c "import json;print(json.load(open('/tmp/vres.json'))['choices'][0]['message']['content'].strip())" 2>/dev/null)
  total=$((total+1))
  if [ "$(echo "$pred" | tr '[:upper:]' '[:lower:]')" = "$(echo "$truth" | tr '[:upper:]' '[:lower:]')" ]; then
    ok=$((ok+1)); echo "OK   truth=$truth pred=$pred"
  else
    echo "FAIL truth=$truth pred=$pred"
  fi
done
echo "=== VISION RESULT: $ok/$total = $((ok*100/total))% ==="
