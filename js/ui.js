// DOM helpers, shared components and motion. Templates are built with an auto-escaping `html` tag:
// every interpolated value is escaped unless it's already a trusted html`` fragment (or raw()).
import { CONFIG } from './config.js';

class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
function val(v) {
  if (v == null || v === false) return '';
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += val(vals[i]); });
  return new Safe(out);
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- icons (24px stroke set)
const P = {
  relics: '<path d="M12 3 4 9l8 12 8-12-8-6Z"/><path d="M4 9h16M9 9l3 12 3-12M9 9l3-6 3 6"/>',
  builds: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 17.5 9 4.5 9-4.5" opacity=".5"/>',
  synergy: '<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.3 8.4 10.6 16M15.7 8.4 13.4 16M8.5 7h7"/>',
  warps: '<path d="M12 2.5c.7 4.8 3.7 7.8 8.5 8.5-4.8.7-7.8 3.7-8.5 8.5-.7-4.8-3.7-7.8-8.5-8.5 4.8-.7 7.8-3.7 8.5-8.5Z"/><path d="M19 17.5c.2 1.4 1.1 2.3 2.5 2.5-1.4.2-2.3 1.1-2.5 2.5-.2-1.4-1.1-2.3-2.5-2.5 1.4-.2 2.3-1.1 2.5-2.5Z"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M7 12h10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  play: '<path d="M7 4.5v15l12.5-7.5L7 4.5Z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  spark: '<path d="M12 3c.6 4.4 3.6 7.4 8 8-4.4.6-7.4 3.6-8 8-.6-4.4-3.6-7.4-8-8 4.4-.6 7.4-3.6 8-8Z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
};
export const icon = (name, extra = '') => raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[name] || ''}</svg>`);

// ---------------------------------------------------------------- components
export function gradeBadge(grade, title = '') {
  return html`<span class="grade-badge g-${grade}" title="${title}">${grade}</span>`;
}

export function ring(pct, { size = 64, stroke = 5, grade = null, label = '', text = null, fontSize = null } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  const fs = fontSize || Math.round(size * 0.27);
  return html`<span class="ring ${grade ? 'g-' + grade : ''}" style="width:${size}px;height:${size}px;--rs:${fs}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-ring="${(c * (1 - p / 100)).toFixed(2)}"/>
    </svg>
    <span class="val"><b ${text == null ? raw(`data-count="${p.toFixed(0)}"`) : ''}>${text == null ? '0' : text}</b>${label ? html`<small>${label}</small>` : ''}</span>
  </span>`;
}

export function bar(pct, grade = null) {
  const p = Math.max(0, Math.min(100, pct || 0));
  return html`<span class="bar ${grade ? 'g-' + grade : ''}"><i data-w="${p.toFixed(1)}"></i></span>`;
}

export function img(src, { cls = '', alt = '', w = null, h = null, lazy = true } = {}) {
  if (!src) return '';
  return html`<img src="${src}" alt="${alt}" class="${cls}" ${w ? raw(`width="${w}"`) : ''} ${h ? raw(`height="${h}"`) : ''} ${lazy ? raw('loading="lazy"') : ''} decoding="async">`;
}

// Images: retry once from the GitHub-raw mirror if jsDelivr fails.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (!(t instanceof HTMLImageElement) || t.dataset.fb) return;
  t.dataset.fb = '1';
  if (t.src.startsWith(CONFIG.assetBase)) t.src = CONFIG.assetFallback + t.src.slice(CONFIG.assetBase.length);
  else t.style.visibility = 'hidden';
}, true);

// ---------------------------------------------------------------- motion
/** Run entrance animations for freshly rendered content: rings, bars, counters, staggered reveals. */
export function hydrate(root = document) {
  const still = reducedMotion();
  $$('[data-stagger]', root).forEach((wrap) => {
    [...wrap.children].forEach((el, i) => { el.classList.add('rise'); el.style.setProperty('--i', Math.min(i, 14)); });
  });
  const go = () => {
    $$('[data-ring]', root).forEach((el) => { el.style.strokeDashoffset = el.dataset.ring; el.removeAttribute('data-ring'); });
    $$('[data-w]', root).forEach((el) => { el.style.width = el.dataset.w + '%'; el.removeAttribute('data-w'); });
    $$('[data-count]', root).forEach((el) => countUp(el, Number(el.dataset.count), still ? 0 : 900, el.dataset.dec ? Number(el.dataset.dec) : 0));
  };
  if (still) go();
  else requestAnimationFrame(() => requestAnimationFrame(go));
}

export function countUp(el, to, ms = 900, dec = 0) {
  el.removeAttribute('data-count');
  if (!ms) { el.textContent = to.toFixed(dec); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, Math.max(0, (t - t0) / ms)); // rAF timestamps can precede t0
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = (to * e).toFixed(dec);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Pointer spotlight on cards (one listener for the whole page)
document.addEventListener('pointermove', (e) => {
  const card = e.target.closest?.('.spot');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}, { passive: true });

// ---------------------------------------------------------------- toasts / drawer
export function toast(msg, { err = false, ms = 3800 } = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

let lastFocus = null;
export function openDrawer(content) {
  const d = $('#drawer');
  const body = $('#drawerBody');
  body.innerHTML = String(content);
  body.scrollTop = 0;
  hydrate(body);
  if (!d.classList.contains('open')) lastFocus = document.activeElement;
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  const s = $('#scrim');
  s.hidden = false;
  requestAnimationFrame(() => s.classList.add('on'));
  $('#drawerClose').focus({ preventScroll: true });
}
export function closeDrawer() {
  const d = $('#drawer');
  if (!d.classList.contains('open')) return;
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
  const s = $('#scrim');
  s.classList.remove('on');
  setTimeout(() => { s.hidden = true; }, 300);
  lastFocus?.focus?.({ preventScroll: true });
}

export function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('loading', on);
  btn.disabled = on;
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const pctText = (p) => (p >= 0.995 ? 'top 1%' : p <= 0.005 ? 'bottom 1%' : `${Math.round(p * 100)}%`);
