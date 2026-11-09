// Relic scanner: OCR in the browser (Tesseract.js, WebAssembly). Resolution agnostic by design:
//  1. The frame is normalised to ~1080p and read in "sparse text" mode.
//  2. The relic is found by its NAME: every line (and pair of lines, for wrapped names) is fuzzy-matched
//     against all 5★ piece names. A piece name maps to exactly one set + slot.
//  3. The stat block is cropped relative to the detected name's text height (not fixed pixels), upscaled,
//     and read again. Stat labels are matched against a closed vocabulary.
//  4. Every substat value is checked against the game's roll table (inferRolls), which recovers roll
//     counts and catches misreads.
// Nothing leaves the browser.
import { CONFIG } from './config.js';
import { D } from './data.js';
import { MAIN_OPTIONS, SUBSTATS, inferRolls, isPercent } from './stats.js';

let worker = null;
let booting = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load the OCR engine. Check your connection.'));
    document.head.appendChild(s);
  });
}

export function ocrReady() { return !!worker; }

export async function ensureOcr(onProgress = () => {}) {
  if (worker) return worker;
  if (!booting) {
    booting = (async () => {
      await loadScript(CONFIG.tesseract);
      const w = await window.Tesseract.createWorker('eng', 1, {
        logger: (m) => { if (m.status && typeof m.progress === 'number') onProgress(m); },
      });
      await w.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%+.,'-:&• ",
        preserve_interword_spaces: '1',
      });
      worker = w;
      return w;
    })().catch((e) => { booting = null; throw e; });
  }
  return booting;
}

// ---------------------------------------------------------------- fuzzy matching
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
const sim = (a, b) => {
  const L = Math.max(a.length, b.length);
  if (!L) return 0;
  const max = Math.ceil(L * 0.35);
  const d = lev(a, b, max);
  return d > max ? 0 : 1 - d / L;
};

let NAMES = null;
function names() {
  if (!NAMES) NAMES = Object.entries(D.game.ocrNames).map(([name, v]) => ({ name, n: norm(name), ...v }));
  return NAMES;
}

const STAT_VOCAB = [
  ['HP', 'HP'], ['ATK', 'ATK'], ['DEF', 'DEF'], ['SPD', 'SPD'], ['CRIT Rate', 'CR'], ['CRIT DMG', 'CD'],
  ['Effect Hit Rate', 'EHR'], ['Effect RES', 'RES'], ['Break Effect', 'BE'], ['Outgoing Healing Boost', 'OHB'],
  ['Energy Regeneration Rate', 'ERR'], ['Physical DMG Boost', 'Physical_DMG'], ['Fire DMG Boost', 'Fire_DMG'],
  ['Ice DMG Boost', 'Ice_DMG'], ['Lightning DMG Boost', 'Lightning_DMG'], ['Wind DMG Boost', 'Wind_DMG'],
  ['Quantum DMG Boost', 'Quantum_DMG'], ['Imaginary DMG Boost', 'Imaginary_DMG'],
].map(([label, key]) => ({ label, key, n: norm(label) }));

/** "CRIT DMG  12.3%" -> { stat: 'CD', value: 0.123 } */
export function parseStatLine(text) {
  const t = text.replace(/[|©®@*•·_]/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^([A-Za-z][A-Za-z .'-]*?)\s*[:+]?\s*\+?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(%?)\s*$/);
  if (!m) return null;
  const label = norm(m[1]);
  if (!label) return null;
  let best = null;
  for (const v of STAT_VOCAB) {
    const s = v.n.length <= 3 ? (label === v.n ? 1 : sim(label, v.n) >= 0.66 && label.length <= 4 ? 0.7 : 0) : sim(label, v.n);
    if (!best || s > best.s) best = { ...v, s };
  }
  if (!best || best.s < 0.7) return null;
  const pct = m[3] === '%';
  const num = parseFloat(m[2].replace(',', '.'));
  let key = best.key;
  if (['HP', 'ATK', 'DEF'].includes(key) && pct) key += '_P';
  if (key === 'SPD' && pct) key = 'SPD_P';
  const value = isPercent(key) ? num / 100 : num;
  return { stat: key, value, raw: m[2].replace(',', '.'), conf: best.s };
}

/**
 * Small decimal points are the most common OCR miss ("7.7%" -> "77%" / "7%", "11.6%" -> "1.6%").
 * A real substat must be a sum of valid rolls, so try the likely misreads and keep the first that fits.
 */
export function repairValue(stat, raw) {
  const pct = isPercent(stat);
  const cands = [raw];
  if (pct) {
    if (!raw.includes('.')) {
      if (raw.length >= 2) cands.push(raw.slice(0, -1) + '.' + raw.slice(-1));
      if (raw.length === 1) cands.push(raw + '.' + raw);
    } else {
      const [a, b] = raw.split('.');
      cands.push(a[0] + a + '.' + b);
      cands.push(a + b[0] + '.' + b.slice(1 || 0));
    }
  }
  for (const [i, c] of [...new Set(cands)].entries()) {
    const v = pct ? parseFloat(c) / 100 : parseFloat(c);
    const inf = inferRolls(stat, v);
    if (inf) return { ...inf, repaired: i > 0 };
  }
  return null;
}

// ---------------------------------------------------------------- image prep
function prep(src, sx, sy, sw, sh, scale) {
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = l;
    hist[l | 0] += 1;
    sum += l;
  }
  const n = d.length / 4;
  const invert = sum / n < 128; // HSR UI is light text on dark panels: Tesseract prefers dark on light
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let v = ((d[i] - lo) * 255) / span;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

async function readLines(canvas, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
  const { data } = await worker.recognize(canvas);
  return (data.lines || []).map((l) => ({ text: l.text.trim(), bbox: l.bbox, conf: l.confidence })).filter((l) => l.text);
}

function findName(lines) {
  let best = null;
  const cands = [];
  lines.forEach((l, i) => {
    cands.push({ text: l.text, box: l.bbox, h: l.bbox.y1 - l.bbox.y0 });
    const nx = lines[i + 1];
    if (nx) {
      const h = l.bbox.y1 - l.bbox.y0;
      if (Math.abs(nx.bbox.x0 - l.bbox.x0) < h * 2 && nx.bbox.y0 - l.bbox.y1 < h * 1.2 && nx.bbox.y0 > l.bbox.y0) {
        cands.push({ text: l.text + ' ' + nx.text, box: { x0: Math.min(l.bbox.x0, nx.bbox.x0), y0: l.bbox.y0, x1: Math.max(l.bbox.x1, nx.bbox.x1), y1: nx.bbox.y1 }, h });
      }
    }
  });
  for (const c of cands) {
    const n = norm(c.text);
    if (n.length < 8) continue;
    for (const nm of names()) {
      const s = sim(n, nm.n);
      if (s >= 0.78 && (!best || s > best.s)) best = { ...nm, s, box: c.box, h: c.h };
    }
  }
  return best;
}

// ---------------------------------------------------------------- pipeline
let lastRoi = null; // fractions of the frame, reused while the panel stays put
let lastThumb = null;

function thumb(src, w, h) {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 27;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h, 0, 0, 48, 27);
  const d = g.getImageData(0, 0, 48, 27).data;
  const out = new Uint8Array(48 * 27);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return out;
}
/** True when the frame barely changed since the last scan (skip OCR). */
export function unchanged(src, w, h) {
  const t = thumb(src, w, h);
  let diff = 0;
  if (lastThumb) for (let i = 0; i < t.length; i++) diff += Math.abs(t[i] - lastThumb[i]);
  const same = lastThumb && diff / t.length < 1.2;
  lastThumb = t;
  return same;
}
export function resetScanner() { lastRoi = null; lastThumb = null; }
export const currentRoi = () => lastRoi;

/**
 * Scan one frame (video, ImageBitmap, canvas or image). Returns { relic, roi, name, issues } or { miss: reason }.
 */
export async function scanFrame(src, W, H) {
  if (!worker) throw new Error('OCR engine not loaded');
  let roi = null;
  let name = null;
  let lines = null;
  // Fast path: re-read the previous panel region
  if (lastRoi) {
    roi = { x: lastRoi.x * W, y: lastRoi.y * H, w: lastRoi.w * W, h: lastRoi.h * H };
    const scale = Math.min(4, Math.max(0.75, 46 / (lastRoi.lh * H)));
    lines = await readLines(prep(src, roi.x, roi.y, roi.w, roi.h, scale), 6);
    lines = lines.map((l) => ({ ...l, bbox: mapBox(l.bbox, roi, scale) }));
    name = findName(lines);
    if (!name) { lastRoi = null; roi = null; }
  }
  if (!name) {
    // Full-frame pass at ~1080p to locate the name anywhere on screen
    const s = Math.min(2, Math.max(0.5, 1080 / H));
    const full = await readLines(prep(src, 0, 0, W, H, s), 11);
    const mapped = full.map((l) => ({ ...l, bbox: mapBox(l.bbox, { x: 0, y: 0 }, s) }));
    const hit = findName(mapped);
    if (!hit) return { miss: 'No relic name found. Open a relic\'s detail panel.' };
    const lh = Math.max(8, hit.h);
    roi = {
      x: Math.max(0, hit.box.x0 - lh * 1.5),
      y: Math.max(0, hit.box.y0 - lh * 1.2),
    };
    roi.w = Math.min(W - roi.x, lh * 24);
    roi.h = Math.min(H - roi.y, lh * 18);
    lastRoi = { x: roi.x / W, y: roi.y / H, w: roi.w / W, h: roi.h / H, lh: lh / H };
    const scale = Math.min(4, Math.max(0.75, 46 / lh));
    lines = (await readLines(prep(src, roi.x, roi.y, roi.w, roi.h, scale), 6)).map((l) => ({ ...l, bbox: mapBox(l.bbox, roi, scale) }));
    name = findName(lines) || hit;
  }
  return parsePanel(lines, name, roi, W, H);
}

function mapBox(b, off, scale) {
  return { x0: b.x0 / scale + off.x, y0: b.y0 / scale + off.y, x1: b.x1 / scale + off.x, y1: b.y1 / scale + off.y };
}

export const debug = { lines: [] };

function parsePanel(lines, name, roi, W, H) {
  debug.lines = lines.map((l) => l.text);
  const below = lines.filter((l) => l.bbox.y0 >= name.box.y1 - name.h * 0.3).sort((a, b) => a.bbox.y0 - b.bbox.y0);
  let level = null;
  const stats = [];
  for (const l of below) {
    const text = l.text.replace(/\s+/g, ' ').trim();
    if (level == null) {
      const m = text.match(/^\+\s?(\d{1,2})$/) || text.match(/\+\s?(\d{1,2})\b/);
      if (m && Number(m[1]) <= 15 && !/[a-z]{4,}/i.test(text.replace(/\+\s?\d+/, ''))) { level = Number(m[1]); continue; }
    }
    if (text.length > 34) { if (stats.length >= 4) break; continue; } // set-bonus sentences
    const st = parseStatLine(text);
    if (st) stats.push(st);
    if (stats.length >= 5) break;
  }
  const slot = name.slot;
  const issues = [];
  let main = stats[0];
  let subs = stats.slice(1);
  if (!main || !MAIN_OPTIONS[slot].includes(main.stat)) {
    if (slot === 'Head' || slot === 'Hands') {
      main = { stat: slot === 'Head' ? 'HP' : 'ATK', value: null };
      subs = stats.filter((s) => s !== stats[0] || !MAIN_OPTIONS[slot].includes(s.stat));
    } else {
      return { miss: `Found ${name.name} but couldn't read its main stat.`, name };
    }
  }
  subs = subs.filter((s) => SUBSTATS.includes(s.stat) && s.stat !== main.stat);
  const seen = new Set();
  subs = subs.filter((s) => (seen.has(s.stat) ? false : seen.add(s.stat))).slice(0, 4);
  if (subs.length < 2) return { miss: `Found ${name.name} but couldn't read its substats.`, name };
  const outSubs = subs.map((s) => {
    const inf = repairValue(s.stat, s.raw);
    if (!inf || inf.repaired) issues.push(s.stat);
    return { stat: s.stat, value: inf ? inf.value : s.value, rolls: inf?.rolls ?? 1, steps: inf?.steps ?? 0, check: !inf || inf.repaired };
  });
  const rolls = outSubs.reduce((a, s) => a + s.rolls, 0);
  if (level == null) level = Math.min(15, Math.max(0, (rolls - 4) * 3));
  if (rolls > 4 + Math.floor(level / 3) + 1) issues.push('rolls');
  const relic = {
    set: String(name.set), slot, rarity: 5, level, tid: name.tid, name: name.name,
    main: { stat: main.stat, value: main.value ?? 0 }, subs: outSubs, owner: null, source: 'ocr',
  };
  relic.key = 'scan-' + fingerprint(relic);
  return { relic, roi: { x: roi.x / W, y: roi.y / H, w: roi.w / W, h: roi.h / H }, name, issues, partial: subs.length < 3 };
}

export function fingerprint(r) {
  return [r.set, r.slot, r.main.stat, r.level, ...r.subs.map((s) => s.stat + ':' + (isPercent(s.stat) ? (s.value * 1000).toFixed(0) : Math.round(s.value)))].join('|');
}
