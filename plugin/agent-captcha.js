// ============================================================================
// Agent Captcha — حل کپچای متنی آفلاین با ddddocr (ONNX q8) — v5.1
// پایپ‌لاین تست‌شده: resize h=64 → gray → /255 → [1,1,64,W] → argmax → CTC
// لایه ۲: fallback بینایی LLM (Pollinations vision) — لایه ۳: اسلایدر (agent-slider.js)
// ============================================================================

const CAPTCHA_BASE = 'agent/captcha/';
let captchaSession = null;
let captchaCharset = null;
let captchaInitPromise = null;

async function captchaInit() {
  if (captchaSession && captchaCharset) return true;
  if (captchaInitPromise) return captchaInitPromise;
  captchaInitPromise = (async () => {
    if (typeof ort === 'undefined') {
      importScripts(chrome.runtime.getURL(CAPTCHA_BASE + 'ort.wasm.min.js'));
    }
    ort.env.wasm.wasmPaths = chrome.runtime.getURL(CAPTCHA_BASE);
    ort.env.wasm.numThreads = 1;
    const modelBuf = await fetch(chrome.runtime.getURL(CAPTCHA_BASE + 'common_q8.onnx')).then((r) => r.arrayBuffer());
    captchaSession = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
    captchaCharset = await fetch(chrome.runtime.getURL(CAPTCHA_BASE + 'charsets.json')).then((r) => r.json());
    return true;
  })();
  try {
    return await captchaInitPromise;
  } catch (e) {
    captchaInitPromise = null;
    throw e;
  }
}

// bitmapData: {w,h,data(rgba)} از کپچا decode شده
function captchaPreprocess(img) {
  const h0 = img.h;
  const w0 = img.w;
  const w = Math.max(4, Math.round(w0 * (64 / h0)));
  const cnv = new OffscreenCanvas(w, 64);
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  // gray در دو مرحله: اول رندر با مقیاس، بعد خاکستری‌سازی
  const src = new OffscreenCanvas(w0, h0);
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), w0, h0), 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, 64);
  const d = ctx.getImageData(0, 0, w, 64).data;
  const t = new Float32Array(64 * w);
  for (let i = 0, p = 0; i < t.length; i++, p += 4) {
    t[i] = (d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114) / 255.0;
  }
  return { tensor: t, width: w };
}

async function captchaPredict(img) {
  await captchaInit();
  const { tensor, width } = captchaPreprocess(img);
  const input = new ort.Tensor('float32', tensor, [1, 1, 64, width]);
  const feed = {};
  feed[captchaSession.inputNames[0]] = input;
  const out = await captchaSession.run(feed);
  const logits = Object.values(out)[0]; // [seq,1,8210]
  const seq = logits.dims[0];
  const classes = logits.dims[2];
  const data = logits.data;
  let last = -1;
  let text = '';
  for (let s = 0; s < seq; s++) {
    let best = 0;
    let bestV = -Infinity;
    const off = s * classes;
    for (let c = 0; c < classes; c++) {
      if (data[off + c] > bestV) {
        bestV = data[off + c];
        best = c;
      }
    }
    if (best !== last && best !== 0) {
      if (best < captchaCharset.length) text += captchaCharset[best];
    }
    last = best;
  }
  return text.trim();
}

// ---------- کشف تصویر کپچا در صفحه ----------

const CAPTCHA_IMG_FN = function () {
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 18 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  }
  const cand = Array.from(document.querySelectorAll('img, canvas')).filter((el) => {
    if (!visible(el)) return false;
    const idc = (el.id + ' ' + el.className + ' ' + (el.parentElement ? el.parentElement.className : '')).toLowerCase();
    if (/captcha|verify|code|kapcha/.test(idc)) return true;
    const r = el.getBoundingClientRect();
    return r.width >= 90 && r.width <= 420 && r.height >= 26 && r.height <= 130;
  });
  if (!cand.length) return null;
  const el = cand[0];
  const src = el.tagName === 'IMG' ? el.src : (el.toDataURL ? el.toDataURL() : null);
  return { src, rect: el.getBoundingClientRect().toJSON(), tag: el.tagName };
};

const CAPTCHA_INPUT_FN = function (code) {
  const inputs = Array.from(document.querySelectorAll('input')).filter((i) => {
    const idc = (i.id + ' ' + i.name + ' ' + (i.placeholder || '')).toLowerCase();
    return /captcha|verif|code|kapcha|کد/.test(idc) && i.type !== 'hidden';
  });
  const target = inputs[0];
  if (!target) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(target, code);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

async function captchaGrabFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'MAIN',
    func: CAPTCHA_IMG_FN
  });
  const hit = (results || []).map((r) => r.result).find(Boolean);
  if (!hit || !hit.src) return null;
  return hit;
}

async function captchaFillInput(tabId, code) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: CAPTCHA_INPUT_FN,
      args: [code]
    });
    return (results || []).some((r) => r.result === true);
  } catch {
    return false;
  }
}

async function captchaFetchImage(src) {
  const res = await fetch(src, { credentials: 'include' });
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const cnv = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { w: bmp.width, h: bmp.height, data: d.data };
}

// حل کامل: پیدا کردن تصویر → ddddocr → درج در فیلد (اختیاری)
async function agentSolveTextCaptcha(tabId, run, { fill = true } = {}) {
  try {
    const hit = await captchaGrabFromTab(tabId);
    if (!hit) {
      sliderLog(run, 'کپچای متنی: تصویری پیدا نشد.');
      return null;
    }
    sliderLog(run, 'کپچای متنی شناسایی شد؛ OCR آفلاین…');
    const img = await captchaFetchImage(hit.src);
    const text = await captchaPredict(img);
    sliderLog(run, `نتیجهٔ OCR: «${text}»`);
    if (!text) return null;
    if (fill) {
      const ok = await captchaFillInput(tabId, text);
      sliderLog(run, ok ? 'کد در فیلد کپچا درج شد.' : 'فیلد کپچا پیدا نشد؛ کد را دستی وارد کن.');
    }
    return text;
  } catch (e) {
    sliderLog(run, `کپچای متنی خطا: ${e?.message || '?'}`);
    return null;
  }
}

// لایهٔ fallback: بینایی LLM رایگان (Pollinations vision) — وقتی OCR نامطمئن است
async function agentVisionCaptcha(tabId, run) {
  try {
    const hit = await captchaGrabFromTab(tabId);
    if (!hit) return null;
    const dataUrl = hit.src.startsWith('data:') ? hit.src : await sliderFetchImageAsData(hit.src);
    if (!dataUrl) return null;
    sliderLog(run, 'بینایی LLM: تلاش دوم برای خواندن کپچا…');
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'This is a CAPTCHA image. Return ONLY the characters you see, nothing else. No explanation.' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ]
      })
    });
    const text = (await res.text()).trim();
    const clean = text.replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
    sliderLog(run, `بینایی گفت: «${clean}»`);
    return clean || null;
  } catch (e) {
    sliderLog(run, `بینایی خطا: ${e?.message || '?'}`);
    return null;
  }
}
