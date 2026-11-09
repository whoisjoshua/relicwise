/**
 * relicwise proxy: a tiny Cloudflare Worker that forwards the two requests a static site can't make
 * itself (Enka.Network and HoYoverse don't send CORS headers). Free tier is plenty.
 *
 *   GET /api/health
 *   GET /api/enka/<uid>      -> https://enka.network/api/hsr/uid/<uid>   (cached at the edge for the TTL Enka returns)
 *   GET /api/gacha?<query>   -> HoYoverse warp history; only the two official hosts, never cached, never logged
 *
 * Set ALLOWED_ORIGINS (comma separated) in wrangler.toml so only your site can use it.
 */
const UA = 'relicwise/1.0 (+https://github.com/whoisjoshua/relicwise)';
const GACHA_HOSTS = {
  hkrpg_global: 'https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/',
  hkrpg_cn: 'https://public-operation-hkrpg.mihoyo.com/common/gacha_record/api/',
};
const ENDPOINTS = new Set(['getGachaLog', 'getLdGachaLog']);

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || (origin && allowed.includes(origin));
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : (ok ? origin : allowed[0] || ''),
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  };
}

const json = (status, obj, headers) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const c = cors(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: c.headers });
    if (request.method !== 'GET') return json(405, { error: 'method not allowed' }, c.headers);
    // Browsers always send Origin on cross-origin fetches; block other sites from borrowing the proxy.
    if (origin && !c.ok) return json(403, { error: 'origin not allowed' }, c.headers);

    if (url.pathname === '/api/health') return json(200, { ok: true, service: 'relicwise-proxy' }, c.headers);

    const enka = url.pathname.match(/^\/api\/enka\/(\d{9,10})$/);
    if (enka) {
      const cacheKey = new Request(`https://cache.relicwise/enka/${enka[1]}`);
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) return new Response(hit.body, { status: hit.status, headers: { ...Object.fromEntries(hit.headers), ...c.headers, 'X-Cache': 'HIT' } });
      const res = await fetch(`https://enka.network/api/hsr/uid/${enka[1]}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      const body = await res.text();
      const out = new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json', ...c.headers } });
      if (res.ok) {
        let ttl = 60;
        try { ttl = Math.max(60, Number(JSON.parse(body).ttl) || 60); } catch (e) { /* keep default */ }
        const stored = new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` } });
        ctx.waitUntil(cache.put(cacheKey, stored));
      }
      return out;
    }

    if (url.pathname === '/api/gacha') {
      const q = new URLSearchParams(url.search);
      const endpoint = q.get('endpoint') || 'getGachaLog';
      q.delete('endpoint');
      const base = GACHA_HOSTS[q.get('game_biz') || 'hkrpg_global'];
      if (!ENDPOINTS.has(endpoint) || !base || !q.get('authkey')) return json(400, { retcode: -1, message: 'bad request' }, c.headers);
      const res = await fetch(`${base}${endpoint}?${q}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...c.headers } });
    }

    return json(404, { error: 'not found' }, c.headers);
  },
};
