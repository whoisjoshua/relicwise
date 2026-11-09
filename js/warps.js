// Warp (gacha) history: fetch via the game's warp-history link, analyze pity and 50/50s, and rate luck
// against a Monte Carlo model of the published/community-measured rates.
import { D } from './data.js';
import { apiUrl, getJson, sleep } from './net.js';

export const BANNERS = {
  11: { name: 'Character Event', short: 'Character', kind: 'char', limited: true, hard: 90, soft: 74, base: 0.006, ramp: 0.06, rate: 0.5 },
  12: { name: 'Light Cone Event', short: 'Light Cone', kind: 'lc', limited: true, hard: 80, soft: 66, base: 0.008, ramp: 0.07, rate: 0.75 },
  21: { name: 'Collab Character', short: 'Collab Char', kind: 'char', limited: true, hard: 90, soft: 74, base: 0.006, ramp: 0.06, rate: 0.5, collab: true },
  22: { name: 'Collab Light Cone', short: 'Collab LC', kind: 'lc', limited: true, hard: 80, soft: 66, base: 0.008, ramp: 0.07, rate: 0.75, collab: true },
  1: { name: 'Stellar Warp', short: 'Standard', kind: 'std', limited: false, hard: 90, soft: 74, base: 0.006, ramp: 0.06 },
  2: { name: 'Departure Warp', short: 'Departure', kind: 'std', limited: false, hard: 50, soft: 50, base: 0.006, ramp: 0 },
};
export const BANNER_ORDER = ['11', '12', '21', '22', '1', '2'];

// Standard-pool 5★s: getting one of these on an event banner means the 50/50 (or 75/25) was lost.
// Any 5★ pulled on the Stellar Warp is added to this set at analysis time, so new standard units are caught too.
export const STANDARD_5 = new Set([
  '1003', '1004', '1101', '1104', '1107', '1209', '1211', // Himeko, Welt, Bronya, Gepard, Clara, Yanqing, Bailu
  '23000', '23002', '23003', '23004', '23005', '23012', '23013', // their light cones + Night on the Milky Way etc.
]);

/** Probability of a 5★ on the n-th pull since the last one (1-based), soft pity ramp model. */
export function fiveRate(cfg, n) {
  if (n >= cfg.hard) return 1;
  if (n < cfg.soft) return cfg.base;
  return Math.min(1, cfg.base + cfg.ramp * (n - cfg.soft + 1));
}
/** Expected pulls per 5★ under the model. */
export function expectedPity(cfg) {
  let surv = 1;
  let e = 0;
  for (let n = 1; n <= cfg.hard; n++) {
    const p = fiveRate(cfg, n);
    e += n * surv * p;
    surv *= 1 - p;
  }
  return e;
}

const cmpId = (a, b) => (a.id.length - b.id.length) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Normalize one record from the API / UIGF / SRGF into our shape. */
export function normRecord(x) {
  return {
    id: String(x.id),
    gacha_type: String(x.gacha_type),
    gacha_id: x.gacha_id != null ? String(x.gacha_id) : '',
    item_id: String(x.item_id ?? ''),
    name: x.name || '',
    item_type: x.item_type || '',
    rank_type: String(x.rank_type ?? ''),
    time: x.time || '',
  };
}

export function analyze(records) {
  const std = new Set(STANDARD_5);
  for (const r of records) if (r.gacha_type === '1' && r.rank_type === '5') std.add(r.item_id);
  const byBanner = {};
  for (const type of BANNER_ORDER) {
    const list = records.filter((r) => r.gacha_type === type).sort(cmpId);
    if (!list.length) continue;
    const cfg = BANNERS[type];
    let since = 0;
    let since4 = 0;
    let guaranteed = false;
    const fives = [];
    let fours = 0;
    const pities = [];
    for (const r of list) {
      since += 1;
      since4 += 1;
      if (r.rank_type === '4') { fours += 1; since4 = 0; }
      if (r.rank_type !== '5') continue;
      let outcome = 'standard';
      if (cfg.limited) {
        const lost = std.has(r.item_id);
        if (guaranteed) { outcome = 'guaranteed'; guaranteed = false; } else if (lost) { outcome = 'loss'; guaranteed = true; } else outcome = 'win';
      }
      fives.push({ ...r, pity: since, outcome });
      pities.push(since);
      since = 0;
    }
    const wins = fives.filter((f) => f.outcome === 'win').length;
    const losses = fives.filter((f) => f.outcome === 'loss').length;
    byBanner[type] = {
      type, cfg, total: list.length, fives, fours, pity: since, pity4: since4, guaranteed,
      avgPity: pities.length ? pities.reduce((a, b) => a + b, 0) / pities.length : null,
      wins, losses, featured: fives.filter((f) => f.outcome !== 'standard' && f.outcome !== 'loss').length,
      first: list[0]?.time, last: list[list.length - 1]?.time,
    };
  }
  const limited = Object.values(byBanner).filter((b) => b.cfg.limited);
  const totals = {
    pulls: records.length,
    limitedPulls: limited.reduce((a, b) => a + b.total, 0),
    featured: limited.reduce((a, b) => a + b.featured, 0),
    fives: Object.values(byBanner).reduce((a, b) => a + b.fives.length, 0),
    wins: limited.reduce((a, b) => a + b.wins, 0),
    losses: limited.reduce((a, b) => a + b.losses, 0),
    jade: records.length * 160,
  };
  return { byBanner, totals, luck: luckRating(byBanner) };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simulate `pulls` pulls on a limited banner; returns the number of featured 5★ obtained. */
function simBanner(cfg, pulls, rand) {
  let since = 0;
  let guaranteed = false;
  let featured = 0;
  for (let i = 0; i < pulls; i++) {
    since += 1;
    if (rand() < fiveRate(cfg, since)) {
      since = 0;
      if (guaranteed || rand() < cfg.rate) { featured += 1; guaranteed = false; } else guaranteed = true;
    }
  }
  return featured;
}

/**
 * Luck = percentile of your featured 5★ count among simulated accounts that made the exact same number
 * of pulls on each limited banner. 50 = perfectly average, 90 = luckier than 90% of players.
 */
export function luckRating(byBanner, trials = 4000) {
  const banners = Object.values(byBanner).filter((b) => b.cfg.limited && b.total > 0);
  if (!banners.length) return null;
  const mine = banners.reduce((a, b) => a + b.featured, 0);
  const rand = rng(1337 + banners.reduce((a, b) => a + b.total, 0));
  let below = 0;
  let equal = 0;
  let sum = 0;
  const hist = new Map();
  for (let t = 0; t < trials; t++) {
    let f = 0;
    for (const b of banners) f += simBanner(b.cfg, b.total, rand);
    sum += f;
    hist.set(f, (hist.get(f) || 0) + 1);
    if (f < mine) below += 1; else if (f === mine) equal += 1;
  }
  const percentile = (below + equal / 2) / trials;
  const expected = sum / trials;
  // 50/50 luck on its own: binomial percentile of wins among (wins + losses) coin flips
  const flips = banners.reduce((a, b) => a + b.wins + b.losses, 0);
  const wins = banners.reduce((a, b) => a + b.wins, 0);
  const p5050 = flips ? binomPercentile(wins, flips, weightedRate(banners)) : null;
  const pityStats = banners.filter((b) => b.avgPity != null).map((b) => ({ type: b.type, avg: b.avgPity, expected: expectedPity(b.cfg) }));
  return {
    percentile, expected, mine, flips, wins, p5050, pityStats,
    hist: [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ k, p: v / trials })),
    ...ratingLabel(percentile),
  };
}
function weightedRate(banners) {
  const n = banners.reduce((a, b) => a + b.wins + b.losses, 0);
  return n ? banners.reduce((a, b) => a + (b.wins + b.losses) * b.cfg.rate, 0) / n : 0.5;
}
function binomPercentile(k, n, p) {
  let below = 0;
  let pk = 0;
  for (let i = 0; i <= n; i++) {
    const pr = Math.exp(lnChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
    if (i < k) below += pr; else if (i === k) pk = pr;
  }
  return below + pk / 2;
}
function lnChoose(n, k) { return lnFact(n) - lnFact(k) - lnFact(n - k); }
function lnFact(n) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }

export function ratingLabel(p) {
  if (p >= 0.9) return { grade: 'S', label: 'Blessed', blurb: 'Luckier than 9 in 10 Trailblazers with the same pulls.' };
  if (p >= 0.7) return { grade: 'A', label: 'Lucky', blurb: 'Comfortably above the average account.' };
  if (p >= 0.3) return { grade: 'B', label: 'Average', blurb: 'Right around what the rates predict.' };
  if (p >= 0.1) return { grade: 'C', label: 'Unlucky', blurb: 'The odds have not been kind lately.' };
  return { grade: 'D', label: 'Cursed', blurb: 'Unluckier than 90% of accounts. Your next 50/50 owes you.' };
}

// ---------------------------------------------------------------- fetching
const AUTH_ERRORS = {
  '-100': 'That warp link is invalid. Copy a fresh one with the script.',
  '-101': 'That warp link has expired (they last about a day). Open Warp > View Details in game, then run the script again.',
  '-110': 'Requests are being rate-limited. Wait a few seconds and retry.',
};

/** Parse a pasted warp link (or any text containing one) into its query params. */
export function parseWarpUrl(text) {
  const m = String(text).match(/https:\/\/\S+?(?:getGachaLog|getLdGachaLog)\?\S+/);
  const raw = m ? m[0] : String(text).trim();
  let url;
  try { url = new URL(raw); } catch (e) { throw new Error('Paste the full warp history link (it starts with https:// and contains authkey=).'); }
  const q = url.searchParams;
  if (!q.get('authkey')) throw new Error('That link has no authkey. Run the script again after opening warp history in game.');
  for (const k of ['page', 'size', 'end_id', 'gacha_type', 'begin_id']) q.delete(k);
  if (!q.get('game_biz')) q.set('game_biz', url.hostname.includes('mihoyo.com') ? 'hkrpg_cn' : 'hkrpg_global');
  q.set('lang', 'en');
  return q;
}

export async function fetchHistory(text, { known = new Set(), onProgress = () => {} } = {}) {
  const params = parseWarpUrl(text);
  const out = [];
  let uid = null;
  let tz = null;
  for (const type of BANNER_ORDER) {
    const endpoint = type.length === 2 && type[0] === '2' ? 'getLdGachaLog' : 'getGachaLog';
    let endId = '0';
    let page = 1;
    let done = false;
    while (!done) {
      const q = new URLSearchParams(params);
      q.set('gacha_type', type);
      q.set('page', String(page));
      q.set('size', '20');
      q.set('end_id', endId);
      q.set('endpoint', endpoint);
      let attempt = 0;
      let res;
      for (;;) {
        res = await getJson(apiUrl('/api/gacha?' + q.toString()));
        const rc = res.body?.retcode;
        if (rc === -110 && attempt < 4) { attempt += 1; await sleep(1200 * attempt); continue; }
        break;
      }
      const rc = res.body?.retcode;
      if (rc !== 0) {
        if (BANNERS[type].collab) { done = true; break; } // collab endpoint unavailable for this account/region: skip
        throw new Error(AUTH_ERRORS[String(rc)] || res.body?.message || `Warp API error (${res.status}).`);
      }
      const list = res.body.data?.list || [];
      tz = res.body.data?.region_time_zone ?? tz;
      if (!list.length) break;
      for (const item of list) {
        uid = uid || item.uid;
        if (known.has(String(item.id))) { done = true; break; }
        out.push(normRecord(item));
      }
      onProgress({ type, banner: BANNERS[type].name, count: out.length });
      endId = String(list[list.length - 1].id);
      page += 1;
      await sleep(260);
    }
  }
  return { uid, tz, records: out };
}

// ---------------------------------------------------------------- import / export
export function parseImport(json) {
  if (Array.isArray(json?.hkrpg)) { // UIGF v4
    const acc = json.hkrpg[0];
    return { uid: String(acc?.uid ?? ''), records: (acc?.list || []).map(normRecord) };
  }
  if (Array.isArray(json?.list)) { // SRGF v1
    return { uid: String(json.info?.uid ?? ''), records: json.list.map(normRecord) };
  }
  if (Array.isArray(json?.records)) return { uid: String(json.uid ?? ''), records: json.records.map(normRecord) };
  throw new Error('Unrecognized file. relicwise imports UIGF v4, SRGF v1 or its own export.');
}

export function toUIGF(uid, records, tz = 8) {
  return {
    info: { export_timestamp: Math.floor(Date.now() / 1000), export_app: 'relicwise', export_app_version: '1.0', version: 'v4.0' },
    hkrpg: [{ uid, timezone: tz, lang: 'en-us', list: records.map((r) => ({ ...r, count: '1' })) }],
  };
}

/** Merge new records into stored ones (dedupe by id). */
export function mergeRecords(a, b) {
  const map = new Map(a.map((r) => [r.id, r]));
  for (const r of b) map.set(r.id, r);
  return [...map.values()];
}

// ---------------------------------------------------------------- demo
/** Deterministic synthetic history (clearly labelled in the UI) so the tab can be explored without a link. */
export function demoHistory() {
  const rand = rng(20260308);
  const chars = Object.values(D.game.characters);
  const lcs = Object.entries(D.game.lightCones).map(([id, v]) => ({ id, ...v }));
  const limitedChars = chars.filter((c) => c.rarity === 5 && !STANDARD_5.has(c.id) && !c.id.startsWith('80') && Number(c.id) < 1500);
  const stdChars = chars.filter((c) => STANDARD_5.has(c.id));
  const fourChars = chars.filter((c) => c.rarity === 4 && !c.id.startsWith('80'));
  const limitedLc = lcs.filter((l) => l.rarity === 5 && !STANDARD_5.has(l.id) && Number(l.id) >= 23000);
  const stdLc = lcs.filter((l) => STANDARD_5.has(l.id));
  const fourLc = lcs.filter((l) => l.rarity === 4);
  const threeLc = lcs.filter((l) => l.rarity === 3);
  const pick = (arr) => arr[(rand() * arr.length) | 0];
  const records = [];
  let id = 1700000000000000000n;
  const start = Date.now() - 170 * 864e5;
  const plan = { 11: 620, 12: 190, 1: 140, 2: 50 };
  let feat = 0;
  for (const [type, n] of Object.entries(plan)) {
    const cfg = BANNERS[type];
    let since = 0;
    let since4 = 0;
    let guaranteed = false;
    for (let i = 0; i < n; i++) {
      since += 1;
      since4 += 1;
      let rank = '3';
      let item;
      if (rand() < fiveRate(cfg, since)) {
        rank = '5';
        since = 0;
        if (cfg.limited) {
          const win = guaranteed || rand() < cfg.rate;
          guaranteed = !win;
          if (win) feat += 1;
          item = cfg.kind === 'lc' ? (win ? limitedLc[feat % limitedLc.length] : pick(stdLc)) : (win ? limitedChars[(feat * 7) % limitedChars.length] : pick(stdChars));
        } else item = rand() < 0.5 ? pick(stdChars) : pick(stdLc);
      } else if (since4 >= 10 || rand() < 0.051) {
        rank = '4';
        since4 = 0;
        item = rand() < 0.5 ? pick(fourChars) : pick(fourLc);
      } else item = pick(threeLc);
      id += BigInt(1 + ((rand() * 1000) | 0));
      const t = new Date(start + (i / n) * 168 * 864e5 + rand() * 36e5);
      records.push({
        id: id.toString(), gacha_type: type, gacha_id: '', item_id: item.id, name: item.name,
        item_type: item.path && item.element ? 'Character' : 'Light Cone', rank_type: rank,
        time: t.toISOString().slice(0, 19).replace('T', ' '),
      });
    }
  }
  return { uid: 'demo', records };
}
