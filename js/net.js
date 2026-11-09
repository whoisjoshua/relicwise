// Proxy resolution + small fetch helpers. Enka and HoYoverse's warp API don't send CORS headers,
// so the browser can't call them directly; worker/ (or tools/dev_server.py locally) forwards the request.
import { CONFIG, IS_LOCAL } from './config.js';
import { store } from './store.js';

export function proxyBase() {
  const saved = store.get('proxy');
  if (saved) return saved.replace(/\/+$/, '');
  if (CONFIG.proxy) return CONFIG.proxy.replace(/\/+$/, '');
  if (IS_LOCAL) return '';
  return null;
}

export class ProxyMissing extends Error {
  constructor() {
    super('No proxy is configured. Deploy the included Cloudflare Worker (free, about 2 minutes) and paste its URL in Settings, or try the demo.');
    this.code = 'NO_PROXY';
  }
}

export function apiUrl(path) {
  const base = proxyBase();
  if (base === null) throw new ProxyMissing();
  return base + path;
}

export async function getJson(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const err = new Error('Network error: the proxy could not be reached. Check the URL in Settings.');
    err.code = 'NETWORK';
    throw err;
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON error page */ }
  return { status: res.status, ok: res.ok, body };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
