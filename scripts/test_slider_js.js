// تست پورت JS الگوریتم detect_gap روی دادهٔ واقعی (بایست معادل پایتون باشد)
const fs = require('fs');

function detectGap(bg, piece) {
  const H = bg.h, W = bg.w;
  const alphaMask = [], pvals = [];
  const pd = piece.data, ph = piece.h, pw = piece.w;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      if (pd[i + 3] > 180) {
        alphaMask.push([x, y]);
        pvals.push(pd[i] * 0.299 + pd[i + 1] * 0.587 + pd[i + 2] * 0.114);
      }
    }
  }
  if (!alphaMask.length) return null;
  const stride = alphaMask.length > 900 ? 2 : 1;
  const ptsSub = [], valsSub = [];
  for (let k = 0; k < alphaMask.length; k += stride) { ptsSub.push(alphaMask[k]); valsSub.push(pvals[k]); }

  const gray = new Float32Array(W * H);
  const bd = bg.data;
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = bd[p] * 0.299 + bd[p + 1] * 0.587 + bd[p + 2] * 0.114;

  let shapeLeft = Infinity;
  for (const [x] of alphaMask) if (x < shapeLeft) shapeLeft = x;

  const xs = 20, xe = Math.max(21, W - pw - 2), ye = Math.max(1, H - ph + 1);
  let best = null, bestScore = Infinity;
  const cand = [];
  for (const a of [0.4, 0.5, 0.6]) {
    const denom = 1 - a;
    for (let offy = 0; offy < ye; offy++) {
      for (let offx = xs; offx < xe; offx++) {
        let sum = 0;
        for (let k = 0; k < ptsSub.length; k++) {
          const px = ptsSub[k][0], py = ptsSub[k][1];
          const gx = offx + px, gy = offy + py;
          if (gx >= W || gy >= H) { sum += 200; continue; }
          const v = gray[gy * W + gx];
          sum += Math.abs((v - a * 255) / denom - valsSub[k]);
        }
        const score = sum / ptsSub.length;
        cand.push({ offx, offy, a, score });
        if (score < bestScore) { bestScore = score; best = { offx, offy, a }; }
      }
    }
  }
  cand.sort((s, t) => s.score - t.score);
  let refined = best, refinedScore = Infinity;
  for (const c of cand.slice(0, 4)) {
    let sum = 0;
    for (let k = 0; k < alphaMask.length; k++) {
      const px = alphaMask[k][0], py = alphaMask[k][1];
      const gx = c.offx + px, gy = c.offy + py;
      if (gx >= W || gy >= H) { sum += 200; continue; }
      const v = gray[gy * W + gx];
      sum += Math.abs((v - c.a * 255) / (1 - c.a) - pvals[k]);
    }
    const score = sum / alphaMask.length;
    if (score < refinedScore) { refinedScore = score; refined = { offx: c.offx, offy: c.offy, a: c.a }; }
  }
  return { dx: Math.round(refined.offx - shapeLeft), x: refined.offx, y: refined.offy, alpha: refined.a, score: Math.round(refinedScore * 10) / 10, shapeLeft, ms: 0 };
}

const bg = JSON.parse(fs.readFileSync('/tmp/slider/js_bg0.json'));
const piece = JSON.parse(fs.readFileSync('/tmp/slider/js_piece0.json'));
const t0 = Date.now();
const res = detectGap(bg, piece);
res.ms = Date.now() - t0;
console.log('JS result:', JSON.stringify(res));
console.log('truth: gx=96 → piece shape_left=0 → expected offx≈96, dx≈96');
console.log(Math.abs(res.x - 96) <= 10 ? 'PASS (±10px)' : 'FAIL');
