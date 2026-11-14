// ============================================================================
// Agent Slider — حل خودکار اسلایدر Aliyun/Baxia (qwen و مشابه) — v5.1
// یافته‌های تست زندهٔ qwen:
//  - تصویر گپ: img.puzzle (data URL یا http) — قطعه: img با عرض 52 — دستگیره: .slider-move
//  - قطعه با transition نرم حرکت می‌کند → قبل از رها کردن باید settle کنیم
//  - مکث‌های طولانی وسط درگ ویجت را می‌کُشد → dispatch باید پیوسته باشد
//  - رنگ حلقهٔ دور گپ نیمه‌شفاف است و با پس‌زمینه عوض می‌شود → تشخیص هیبریدی
//    (چامفر روی ring-core خنثی + تطبیق کانتور روی نقشهٔ لبه)
// کشیدن با رویدادهای trusted از طریق chrome.debugger
// ============================================================================

const SLIDER_HELPER_FN = function () {
  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
  }

  function out(found, extra) {
    return Object.assign(
      {
        found: !!found,
        href: location.href,
        isTop: window === window.top,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0,
        vw: innerWidth,
        vh: innerHeight,
        iframes: window === window.top
          ? qa('iframe').filter(visible).map((f) => ({ src: f.src || '', rect: f.getBoundingClientRect().toJSON() }))
          : []
      },
      extra || {}
    );
  }

  // حالت A: Baxia/waf-nc درون‌صفحه‌ای (qwen) — img.puzzle + قطعهٔ ۵۲px + .slider-move
  const bgPuzzle = q('img.puzzle');
  const handleA = q('.slider-move') || q('[class*="slider-move"]');
  if (bgPuzzle && visible(bgPuzzle) && handleA && visible(handleA)) {
    const piece = qa('img').find((i) => Math.round(i.getBoundingClientRect().width) === 52) || q('img.puzzle-piece') || q('[class*="piece"] img');
    if (piece) {
      return out(true, {
        strategy: 'baxia_inline',
        bgSrc: bgPuzzle.src || '',
        bgRect: bgPuzzle.getBoundingClientRect().toJSON(),
        pieceSrc: piece.src || '',
        pieceRect: piece.getBoundingClientRect().toJSON(),
        handleRect: handleA.getBoundingClientRect().toJSON()
      });
    }
  }

  // حالت B: ویجت رسمی AliyunCaptcha
  const root = q('#captcha-element') || q('[id^="aliyunCaptcha-window"]');
  if (root && visible(root)) {
    const handleB =
      q('#aliyunCaptcha-sliding-slider', root) ||
      q('[id*="sliding-slider"]', root) ||
      q('.aliyunCaptcha-btn', root) ||
      qa('[class*="slider"]', root).filter(visible).find((el) => el.getBoundingClientRect().width < 80) ||
      null;
    const bgB =
      q('img[id*="jigsaw"]', root) ||
      q('canvas', root) ||
      qa('img', root).filter(visible).find((i) => i.getBoundingClientRect().width > 200) ||
      null;
    if (handleB && visible(handleB)) {
      const pieceB = qa('img', root).filter(visible).find((i) => i.getBoundingClientRect().width < 90 && i !== bgB) || null;
      return out(true, {
        strategy: 'aliyun_widget',
        bgSrc: bgB && bgB.tagName === 'IMG' ? bgB.src : '',
        bgCanvas: bgB && bgB.tagName === 'CANVAS' ? true : false,
        bgRect: bgB ? bgB.getBoundingClientRect().toJSON() : null,
        pieceSrc: pieceB ? pieceB.src : '',
        handleRect: handleB.getBoundingClientRect().toJSON()
      });
    }
  }

  // حالت C: صفحهٔ چالش مستقل WAF
  const wafMeta = document.querySelector('meta[name="aliyun_waf_aa"]');
  const wafMount = q('#captcha-element');
  return out(Boolean(wafMeta || (wafMount && visible(wafMount))), {
    strategy: 'waf_standalone',
    wafStandalone: Boolean(wafMeta)
  });
};

// کمک‌رندر داخل تب: خواندن وضعیت قطعه و دستگیره (برای settle)
const SLIDER_STATE_FN = function () {
  const b = document.querySelector('img.puzzle');
  const h = document.querySelector('.slider-move');
  const p = Array.from(document.querySelectorAll('img')).find((i) => Math.round(i.getBoundingClientRect().width) === 52);
  if (!b || !h || !p) return { gone: !h, done: !p };
  const br = b.getBoundingClientRect();
  const pr = p.getBoundingClientRect();
  const hr = h.getBoundingClientRect();
  const tr = h.parentElement ? h.parentElement.getBoundingClientRect() : null;
  return {
    gone: false,
    bgX: br.x, bgW: br.width,
    pieceX: pr.x - br.x,
    pieceW: pr.width,
    handleX: hr.x,
    handleW: hr.width,
    handleCX: hr.x + hr.width / 2,
    handleCY: hr.y + hr.height / 2,
    trackW: tr ? tr.width : br.width
  };
};

function sliderLog(run, text) {
  if (run && typeof agentEmit === 'function') agentEmit(run, {}, text);
  else if (typeof chatPush === 'function') chatPush('system', text).catch(() => {});
}

async function sliderInjectHelper(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'MAIN',
    func: SLIDER_HELPER_FN
  });
  return (results || []).map((r) => r.result).filter(Boolean);
}

async function sliderReadState(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: SLIDER_STATE_FN
    });
    return (results || []).map((r) => r.result).find((s) => s && !s.gone) || null;
  } catch {
    return null;
  }
}

async function sliderPickResult(results) {
  const found = results.filter((r) => r.found && r.strategy !== 'waf_standalone');
  return found.length ? found[0] : results.find((r) => r.found && r.strategy === 'waf_standalone') || null;
}

async function sliderApplyFrameOffset(pick, results) {
  if (!pick || pick.isTop) return pick;
  const top = results.find((r) => r.isTop);
  if (!top || !Array.isArray(top.iframes)) return pick;
  const match = top.iframes.find((f) => pick.href && (f.src === pick.href || pick.href.startsWith(f.src.split('?')[0])));
  if (match && pick.handleRect) {
    pick.handleRect.x += match.rect.x;
    pick.handleRect.y += match.rect.y;
    if (pick.bgRect) { pick.bgRect.x += match.rect.x; pick.bgRect.y += match.rect.y; }
  }
  return pick;
}

async function sliderFetchImage(src) {
  if (!src) return null;
  try {
    const res = await fetch(src, { credentials: 'include' });
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const cnv = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { w: bmp.width, h: bmp.height, data: d.data };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// تشخیص گپ — هیبریدی: (۱) chamfer روی ring-core خنثی، (۲) کانتور روی لبه
// خروجی: {dx, conf, method} در پیکسل طبیعی bg
// ---------------------------------------------------------------------------

function sliderDetectGap(bg, piece) {
  const H = bg.h, W = bg.w;
  const pd = piece.data, ph = piece.h, pw = piece.w;
  const bd = bg.data;

  // ماسک قطعه + کانتور
  const pm = new Uint8Array(ph * pw);
  const cont = new Uint8Array(ph * pw);
  for (let i = 0, p = 3; i < ph * pw; i++, p += 4) pm[i] = pd[p] > 100 ? 1 : 0;
  let contCount = 0;
  const contPts = [];
  for (let y = 1; y < ph - 1; y++) {
    for (let x = 1; x < pw - 1; x++) {
      const i = y * pw + x;
      if (pm[i] && !(pm[i - pw] && pm[i + pw] && pm[i - 1] && pm[i + 1])) {
        cont[i] = 1;
        contPts.push([x, y]);
        contCount++;
      }
    }
  }
  if (!contCount) return null;

  // نقشه‌های gray/sat/bg
  const gray = new Float32Array(W * H);
  const neutral = new Uint8Array(W * H); // خاکستری خنثی متوسط (حلقهٔ کاندید)
  const edge = new Float32Array(W * H);  // قدرت لبه
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const r = bd[p], g = bd[p + 1], b = bd[p + 2];
    const gr = (r + g + b) / 3;
    gray[i] = gr;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 18 && gr >= 92 && gr <= 155) neutral[i] = 1;
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) edge[y * W + x] += Math.abs(gray[y * W + x + 1] - gray[y * W + x]);
  }
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) edge[y * W + x] += Math.abs(gray[(y + 1) * W + x] - gray[y * W + x]);
  }

  // distance transform (chamfer 3-4) روی neutral
  const INF = 1e9;
  const dt = new Float32Array(W * H).fill(INF);
  for (let i = 0; i < W * H; i++) if (neutral[i]) dt[i] = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (dt[i] === 0) continue;
      let c = dt[i];
      if (y > 0) c = Math.min(c, dt[i - W] + 1);
      if (x > 0) c = Math.min(c, dt[i - 1] + 1);
      if (y > 0 && x > 0) c = Math.min(c, dt[i - W - 1] + 1.41);
      if (y > 0 && x < W - 1) c = Math.min(c, dt[i - W + 1] + 1.41);
      dt[i] = c;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let c = dt[i];
      if (y < H - 1) c = Math.min(c, dt[i + W] + 1);
      if (x < W - 1) c = Math.min(c, dt[i + 1] + 1);
      if (y < H - 1 && x < W - 1) c = Math.min(c, dt[i + W + 1] + 1.41);
      if (y < H - 1 && x > 0) c = Math.min(c, dt[i + W - 1] + 1.41);
      dt[i] = c;
    }
  }

  // جست‌وجو
  const rows = [];
  for (let y = 0; y < ph; y++) {
    let any = false;
    for (let x = 0; x < pw; x++) if (pm[y * pw + x]) { any = true; break; }
    if (any) rows.push(y);
  }
  const r0 = rows.length ? rows[0] : 0;
  const yhi = Math.max(0, Math.min(H - ph, r0 + 4));
  const ylo = Math.min(Math.max(0, r0 - 4), yhi);

  let bestCh = null, bestChSc = Infinity;
  let bestEd = null, bestEdSc = -1;
  const sub = contPts.length > 240 ? contPts.filter((_, k) => k % 2 === 0) : contPts;

  for (let offx = 4; offx <= W - pw; offx++) {
    for (let offy = ylo; offy <= yhi; offy++) {
      // چامفر
      let sum = 0, near = 0, bad = 0;
      for (let k = 0; k < sub.length; k++) {
        const gx = offx + sub[k][0];
        const gy = offy + sub[k][1];
        if (gx >= W || gy >= H) { bad++; continue; }
        const v = dt[gy * W + gx];
        const vv = v >= INF ? 30 : v;
        sum += vv;
        if (vv <= 2) near++;
      }
      if (!bad) {
        const scCh = sum / sub.length - 2.0 * (near / sub.length);
        if (scCh < bestChSc) { bestChSc = scCh; bestCh = { dx: offx, offy, near: near / sub.length }; }
      }
      // لبه
      let esum = 0, ebad = 0;
      for (let k = 0; k < sub.length; k++) {
        const gx = offx + sub[k][0];
        const gy = offy + sub[k][1];
        if (gx >= W || gy >= H) { ebad++; continue; }
        esum += edge[gy * W + gx];
      }
      if (!ebad) {
        const scEd = esum / sub.length;
        if (scEd > bestEdSc) { bestEdSc = scEd; bestEd = { dx: offx, offy, sc: scEd }; }
      }
    }
  }

  if (!bestCh && !bestEd) return null;

  // انتخاب روش با اطمینان بیشتر
  const ringEnough = bestCh && bestCh.near >= 0.35;
  if (ringEnough) {
    return { dx: bestCh.dx, conf: Math.min(1, bestCh.near + 0.3), method: 'ring_chamfer' };
  }
  if (bestEd && bestEd.sc > 25) {
    return { dx: bestEd.dx, conf: Math.min(1, bestEd.sc / 90), method: 'edge_contour', alt: bestCh };
  }
  if (bestCh) return { dx: bestCh.dx, conf: Math.min(1, bestCh.near), method: 'ring_chamfer_weak' };
  return { dx: bestEd.dx, conf: 0.25, method: 'edge_contour_weak' };
}

// ---------------------------------------------------------------------------
// کشیدن انسانی + settle — درس‌های تست زنده
// ---------------------------------------------------------------------------

async function sliderAttachDebugger(tabId) {
  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

function sliderDetachDebugger(tabId) {
  try { chrome.debugger.detach({ tabId }, () => {}); } catch {}
}

function sliderDispatch(tabId, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', params, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

function sliderRand(a, b) { return a + Math.random() * (b - a); }

async function sliderHumanDrag(tabId, x0, y0, targetDx, expectedPieceDx) {
  // مسیر: گام‌های ریز (≤۴px) با dispatch سریع تا pointer از handle جلو نزند
  // (درس تست زندهٔ qwen: پرش‌های بزرگ → قطع شدن رویدادهای handle → توقف قطعه)
  const overshoot = Math.round(targetDx + sliderRand(3, 6));
  const points = [];
  let x = 0;
  while (x < overshoot) {
    x = Math.min(overshoot, x + sliderRand(1.5, 4));
    points.push(x);
  }
  for (let i = 1; i <= 5; i++) {
    points.push(overshoot - (overshoot - targetDx) * (i / 5));
  }
  points.push(targetDx);

  await sliderDispatch(tabId, { type: 'mouseMoved', x: Math.round(x0), y: Math.round(y0), buttons: 0 });
  await agentSleep(sliderRand(160, 320));
  await sliderDispatch(tabId, {
    type: 'mousePressed', x: Math.round(x0), y: Math.round(y0), button: 'left', buttons: 1, clickCount: 1
  });
  await agentSleep(sliderRand(70, 160));

  let prev = 0;
  for (const p of points) {
    const ix = Math.round(p);
    if (ix === prev) continue;
    const jy = [0, 0, 0, -1, 1][Math.floor(Math.random() * 5)];
    await sliderDispatch(tabId, { type: 'mouseMoved', x: Math.round(x0 + ix), y: Math.round(y0 + jy), buttons: 1 });
    await agentSleep(sliderRand(3, 9)); // خیلی کوتاه — پیوستگی حفظ شود
    prev = ix;
  }
  await sliderDispatch(tabId, { type: 'mouseMoved', x: Math.round(x0 + targetDx), y: Math.round(y0), buttons: 1 });

  // settle: صبر تا قطعه transition را کامل کند (تا ۳.۵s) — درس تست زنده
  let settled = false;
  const t0 = Date.now();
  let lastSeen = -999;
  while (Date.now() - t0 < 3500) {
    await agentSleep(300);
    const st = await sliderReadState(tabId);
    if (!st || st.gone) { settled = true; break; } // ویجت رفت = موفق
    const px = st.pieceX;
    if (expectedPieceDx > 0 && Math.abs(px - expectedPieceDx) <= 3) { settled = true; break; }
    if (Math.abs(px - lastSeen) <= 1 && Math.abs(px) > 5) { settled = true; break; }
    lastSeen = px;
  }
  await agentSleep(sliderRand(120, 260));
  await sliderDispatch(tabId, {
    type: 'mouseReleased', x: Math.round(x0 + targetDx), y: Math.round(y0), button: 'left', buttons: 0, clickCount: 1
  });
  return settled;
}

// ---------------------------------------------------------------------------
// API عمومی
// ---------------------------------------------------------------------------

async function agentDetectSliderPresence(tabId) {
  try {
    const results = await sliderInjectHelper(tabId);
    const pick = await sliderPickResult(results);
    if (!pick) return false;
    if (pick.strategy !== 'waf_standalone') return true;
    const widget = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: () => {
        const el = document.querySelector('#captcha-element');
        return !!(el && el.querySelector('*'));
      }
    });
    return (widget || []).some((r) => r.result === true);
  } catch {
    return false;
  }
}

async function agentSolveAliyunSlider(tabId, run, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (run?.status === 'cancelled') return false;

    let results = await sliderInjectHelper(tabId).catch(() => []);
    let pick = await sliderPickResult(results);
    if (!pick || pick.strategy === 'waf_standalone') {
      await agentSleep(1500);
      results = await sliderInjectHelper(tabId).catch(() => []);
      pick = await sliderPickResult(results);
      if (!pick || pick.strategy === 'waf_standalone') {
        sliderLog(run, `اسلایدر: ویجت پیدا نشد (تلاش ${attempt}).`);
        continue;
      }
    }
    pick = await sliderApplyFrameOffset(pick, results);

    const bg = await sliderFetchImage(pick.bgSrc);
    const piece = await sliderFetchImage(pick.pieceSrc);
    if (!bg || !piece) {
      sliderLog(run, `اسلایدر: استخراج تصاویر ناموفق (${pick.strategy}).`);
      continue;
    }

    const det = sliderDetectGap(bg, piece);
    if (!det || !isFinite(det.dx) || det.dx <= 0) {
      sliderLog(run, `اسلایدر: گپ پیدا نشد (تلاش ${attempt}).`);
      continue;
    }

    // مقیاس نمایش→طبیعی
    let scale = 1;
    if (pick.bgRect && pick.bgRect.width > 10 && bg.w > 10) scale = pick.bgRect.width / bg.w;
    // جابه‌جایی مورد نیاز قطعه (css px)
    const pieceDx = det.dx * scale;
    // نسبت هندسی دستگیره→قطعه: (bgW-pieceW)/(trackW-handleW) — پیش‌فرض ۱
    let ratio = 1;
    try {
      const st0 = await sliderReadState(tabId);
      if (st0 && st0.trackW > st0.handleW && st0.bgW > st0.pieceW) {
        ratio = (st0.bgW - st0.pieceW) / (st0.trackW - st0.handleW);
        if (!(ratio > 0.5 && ratio < 1.6)) ratio = 1;
      }
    } catch {}
    // اگر نسبت واقعی متفاوت بود، settle-loop جبرانش می‌کند (تا نشستن صبر می‌کنیم)

    const handleCx = pick.handleRect.x + pick.handleRect.width / 2;
    const handleCy = pick.handleRect.y + pick.handleRect.height / 2;
    const handleDx = Math.round(pieceDx / ratio);

    sliderLog(
      run,
      `اسلایدر تلاش ${attempt}: گپ dx=${det.dx}px (${det.method}, conf=${det.conf.toFixed(2)}) → جابه‌جایی دستگیره ${handleDx}px`
    );

    await sliderAttachDebugger(tabId);
    try {
      await sliderHumanDrag(tabId, handleCx, handleCy, handleDx, pieceDx);
    } finally {
      sliderDetachDebugger(tabId);
    }
    await agentSleep(2200);

    const stillThere = await agentDetectSliderPresence(tabId);
    if (!stillThere) {
      sliderLog(run, 'اسلایدر حل شد ✓');
      return true;
    }
    sliderLog(run, 'اسلایدر پابرجاست؛ چالش تازه…');
    await agentSleep(1200);
  }
  return false;
}

// هوک داخل runAgentFlow پس از submit
async function agentPostSubmitChallengeHook(run, tabId) {
  try {
    await agentSleep(1400);
    const present = await agentDetectSliderPresence(tabId);
    if (!present) return false;
    agentEmit(run, {}, 'چالش اسلایدر علی‌بابا شناسایی شد؛ حل خودکار…');
    const solved = await agentSolveAliyunSlider(tabId, run);
    if (solved) {
      agentEmit(run, {}, 'اسلایدر حل شد؛ فرم دوباره ارسال می‌شود.');
      await agentSleep(1000);
      try {
        await agentSendTab(tabId, { type: 'AGENT_CLICK_SUBMIT' });
      } catch {}
      await agentSleep(2200);
      return true;
    }
    agentEmit(run, { status: 'waiting_captcha_manual' }, 'حل خودکار اسلایدر نشد؛ دستی حل کن و «ادامه» را بزن.');
    await agentWaitManualCaptcha(run);
    agentEmit(run, { status: 'running' }, 'ادامه…');
    return true;
  } catch {
    return false;
  }
}
