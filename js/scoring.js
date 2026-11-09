// Relic scoring. Pure functions over normalized relics:
//   { set, slot, rarity, level, main: { stat, value }, subs: [{ stat, value, rolls, steps }] }
//
// Score = weighted substat value in "max rolls", divided by the best relic that could exist
// with the same main stat for that character (6 rolls in the best stat + 1 in each of the next three).
// So 100 = a perfect relic, ~85+ = every roll landed in useful stats.
import { D, buildOf, rankableBuilds, setOf } from './data.js';
import { SUBSTATS, rollUnits, avgQuality, upgradesLeft, NEW_LINE_WEIGHT, MAIN_OPTIONS } from './stats.js';

// A flat ATK/HP/DEF roll is worth ~40% of a percent roll at endgame base stats.
export const FLAT_FACTOR = 0.4;

export const GRADES = [
  ['SS', 92], ['S', 80], ['A', 65], ['B', 50], ['C', 35], ['D', 20], ['F', -Infinity],
];
export const gradeOf = (pct) => GRADES.find(([, t]) => pct >= t)[0];

const weightCache = new Map();
export function effWeights(buildKey) {
  if (weightCache.has(buildKey)) return weightCache.get(buildKey);
  const b = buildOf(buildKey);
  const w = {};
  for (const k of SUBSTATS) {
    const raw = b?.weights?.[k] ?? 0;
    w[k] = (k === 'HP' || k === 'ATK' || k === 'DEF') ? raw * FLAT_FACTOR : raw;
  }
  weightCache.set(buildKey, w);
  return w;
}
export function clearCaches() { weightCache.clear(); idealCache.clear(); dropCache.clear(); }

const idealCache = new Map();
export function idealScore(w, mainStat, cacheKey) {
  const ck = cacheKey + '|' + mainStat;
  if (idealCache.has(ck)) return idealCache.get(ck);
  const c = SUBSTATS.filter((k) => k !== mainStat).map((k) => w[k]).sort((a, b) => b - a);
  const v = 6 * c[0] + c[1] + c[2] + c[3];
  idealCache.set(ck, v);
  return v;
}

export function substatScore(relic, w) {
  let s = 0;
  for (const sub of relic.subs) s += (w[sub.stat] || 0) * rollUnits(sub.stat, sub.value);
  return s;
}

/** 1 = main stat the character wants; lower = wrong main stat. Head/Hands are fixed. */
export function mainFit(buildKey, relic) {
  if (relic.slot === 'Head' || relic.slot === 'Hands') return 1;
  const b = buildOf(buildKey);
  const list = b?.parts?.[relic.slot];
  if (!list || list.length === 0) {
    // Optimizer leaves the slot open: any main is acceptable, the ones it weights are better.
    const w = Math.min(1, b?.weights?.[relic.main.stat] ?? 0);
    return 0.75 + 0.25 * w;
  }
  return list.includes(relic.main.stat) ? 1 : 0.3;
}

/** 1 = recommended set; less for sets the build doesn't list. */
export function setFit(buildKey, relic) {
  const b = buildOf(buildKey);
  const set = String(relic.set);
  const planar = setOf(set)?.planar ?? set.startsWith('3');
  if (planar) {
    if (!b?.ornamentSets?.length) return 0.9;
    const i = b.ornamentSets.indexOf(set);
    return i === 0 ? 1 : i > 0 ? 0.97 : 0.75;
  }
  if (!b?.relicSets?.length) return 0.9;
  let best = 0.8;
  b.relicSets.forEach(([x, y], i) => {
    if (x === set && y === set) best = Math.max(best, i === 0 ? 1 : 0.97);
    else if (x === set || y === set) best = Math.max(best, 0.95);
  });
  return best;
}

/**
 * Distribution of the final substat score after the remaining upgrades, assuming average-quality rolls.
 * Enumerates how many upgrades each line receives (multinomial), plus which stat a 3-line relic gains.
 */
export function potential(relic, w, ideal) {
  let left = upgradesLeft(relic);
  const base = substatScore(relic, w);
  if (left === 0 || ideal <= 0) return null;
  const branches = [];
  const lines = relic.subs.map((s) => s.stat);
  if (lines.length < 4) {
    const pool = SUBSTATS.filter((k) => k !== relic.main.stat && !lines.includes(k));
    const tot = pool.reduce((a, k) => a + NEW_LINE_WEIGHT[k], 0);
    for (const k of pool) branches.push({ p: NEW_LINE_WEIGHT[k] / tot, add: (w[k] || 0) * avgQuality(k), lines: [...lines, k] });
    left -= 1;
  } else {
    branches.push({ p: 1, add: 0, lines });
  }
  const out = []; // [score, prob]
  for (const br of branches) {
    const gains = br.lines.map((k) => (w[k] || 0) * avgQuality(k));
    const n = br.lines.length;
    // enumerate compositions of `left` upgrades over n lines
    const rec = (i, rem, acc, coef) => {
      if (i === n - 1) {
        const c = coef / factorial(rem);
        out.push([acc + rem * gains[i], br.p * c * factorial(left) / Math.pow(n, left)]);
        return;
      }
      for (let k = 0; k <= rem; k++) rec(i + 1, rem - k, acc + k * gains[i], coef / factorial(k));
    };
    rec(0, left, base + br.add, 1);
  }
  let mean = 0;
  for (const [s, p] of out) mean += s * p;
  const pct = (s) => Math.min(100, (s / ideal) * 100);
  const atLeast = (t) => out.reduce((a, [s, p]) => a + (pct(s) >= t - 1e-9 ? p : 0), 0);
  const maxGain = Math.max(...relic.subs.map((s) => w[s.stat] || 0), 0);
  return {
    left: upgradesLeft(relic),
    mean: pct(mean),
    best: pct(base + upgradesLeft(relic) * Math.max(maxGain, relic.subs.length < 4 ? Math.max(...SUBSTATS.map((k) => w[k] || 0)) : 0)),
    pA: atLeast(65),
    pS: atLeast(80),
    pTotal: out.reduce((a, [, p]) => a + p, 0), // ≈1, sanity check
  };
}
const FACT = [1, 1, 2, 6, 24, 120, 720];
const factorial = (n) => FACT[n] ?? Infinity;

/** Full score of one relic for one character build. */
export function scoreRelic(relic, buildKey) {
  const w = effWeights(buildKey);
  const ideal = idealScore(w, relic.main.stat, buildKey);
  const raw = substatScore(relic, w);
  const pct = ideal > 0 ? Math.min(100, (raw / ideal) * 100) : 0;
  const pot = relic.rarity >= 4 ? potential(relic, w, ideal) : null;
  const expected = pot ? pot.mean : pct;
  const mf = mainFit(buildKey, relic);
  const sf = setFit(buildKey, relic);
  const fit = expected * mf * sf;
  return {
    buildKey, pct, grade: gradeOf(pct), potential: pot, expected,
    mainFit: mf, setFit: sf, fit, fitGrade: gradeOf(fit), weights: w,
  };
}

/** Rank every character for a relic. ownedKeys: Set of build keys the player has. */
export function rankOwners(relic, ownedKeys = new Set(), limit = 12) {
  const rows = rankableBuilds(ownedKeys).map((k) => ({ ...scoreRelic(relic, k), owned: ownedKeys.has(k) }));
  rows.sort((a, b) => b.fit - a.fit);
  return limit ? rows.slice(0, limit) : rows;
}

/** Keep/level/fodder advice from the best fits. */
export function verdict(relic, ranked) {
  const best = ranked[0];
  if (!best) return { key: 'unknown', title: 'Unscored', text: 'No build data for this relic.' };
  const pot = best.potential;
  if (relic.rarity < 5) return { key: 'fodder', title: 'Fodder', text: `${relic.rarity}★ relics can't compete with 5★ pieces. Feed it to something better.` };
  if (pot) {
    if (best.fit >= 50 || pot.pA >= 0.3) return { key: 'level', title: 'Level it', text: `${Math.round(pot.pA * 100)}% chance to reach A or better for its best owner if you level it.` };
    if (best.fit >= 38 || pot.pA >= 0.1) {
      const next = Math.min(15, (Math.floor((relic.level || 0) / 3) + 1) * 3);
      return { key: 'maybe', title: 'Gamble', text: `Only ${Math.round(pot.pA * 100)}% chance to reach A. Level it to +${next}, see where the roll lands, then decide.` };
    }
    return { key: 'fodder', title: 'Fodder', text: `Under ${Math.max(1, Math.round(pot.pA * 100))}% chance to become good for anyone. Use it as EXP.` };
  }
  if (best.fit >= 65) return { key: 'keep', title: 'Keeper', text: 'Strong for at least one character. Lock it.' };
  if (best.fit >= 50) return { key: 'usable', title: 'Usable', text: 'Solid filler until something better drops.' };
  return { key: 'replace', title: 'Replace', text: 'Weak for every character. Replace it when you can.' };
}

// ---------------------------------------------------------------- random-drop percentile
// "Better than X% of drops": simulate fully levelled 5★ relics with the same main stat and compare.
const dropCache = new Map();
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
function dropSamples(buildKey, mainStat, n = 3000) {
  const ck = buildKey + '|' + mainStat;
  if (dropCache.has(ck)) return dropCache.get(ck);
  const w = effWeights(buildKey);
  const ideal = idealScore(w, mainStat, buildKey);
  const rand = rng(0x5eed ^ ck.length * 7919);
  const pool = SUBSTATS.filter((k) => k !== mainStat);
  const qual = [0.8, 0.9, 1]; // low / mid / high roll ≈ fraction of a max roll
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lines = [];
    const avail = pool.slice();
    const pick = () => {
      const tot = avail.reduce((a, k) => a + NEW_LINE_WEIGHT[k], 0);
      let x = rand() * tot;
      for (let j = 0; j < avail.length; j++) {
        x -= NEW_LINE_WEIGHT[avail[j]];
        if (x <= 0) return avail.splice(j, 1)[0];
      }
      return avail.pop();
    };
    const start = rand() < 0.2 ? 4 : 3;
    let score = 0;
    for (let j = 0; j < start; j++) { const k = pick(); lines.push(k); score += w[k] * qual[(rand() * 3) | 0]; }
    let ups = 5;
    if (lines.length < 4) { const k = pick(); lines.push(k); score += w[k] * qual[(rand() * 3) | 0]; ups -= 1; }
    for (let j = 0; j < ups; j++) score += w[lines[(rand() * 4) | 0]] * qual[(rand() * 3) | 0];
    out[i] = ideal > 0 ? Math.min(100, (score / ideal) * 100) : 0;
  }
  out.sort();
  dropCache.set(ck, out);
  return out;
}
/** Share of random fully-levelled drops (same main stat) that this score beats, 0..1. */
export function dropPercentile(buildKey, mainStat, pct) {
  const arr = dropSamples(buildKey, mainStat);
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < pct) lo = mid + 1; else hi = mid; }
  return lo / arr.length;
}

// ---------------------------------------------------------------- characters
export function setCounts(relics) {
  const counts = {};
  for (const r of relics) counts[r.set] = (counts[r.set] || 0) + 1;
  return counts;
}

/** Approximate total SPD: base × (1 + SPD%) + flat SPD from relics/traces. Ignores light cone passives. */
export function speedOf(ch) {
  const c = D.game.characters[String(ch.id).split('b')[0]];
  if (!c) return null;
  let flat = 0;
  let pct = 0;
  const unlocked = ch.traces?.length ? new Set(ch.traces.map(String)) : null;
  for (const [node, stats] of Object.entries(c.traces || {})) {
    if (unlocked && !unlocked.has(node)) continue;
    flat += stats.SPD || 0;
    pct += stats.SPD_P || 0;
  }
  for (const r of ch.relics) {
    if (r.main.stat === 'SPD') flat += r.main.value;
    for (const s of r.subs) if (s.stat === 'SPD') flat += s.value;
  }
  for (const [set, n] of Object.entries(setCounts(ch.relics))) {
    const s = setOf(set);
    if (!s) continue;
    if (n >= 2) pct += s.bonus?.[0]?.SPD_P || 0;
    if (n >= 4 && !s.planar) pct += s.bonus?.[1]?.SPD_P || 0;
  }
  return c.spd * (1 + pct) + flat;
}

/** Action-value breakpoints: k actions within the first N cycles (150 AV, then +100 per cycle). */
export function speedBreakpoints(maxCycles = 5) {
  const list = [];
  for (let n = 1; n <= maxCycles; n++) {
    const av = 150 + 100 * (n - 1);
    for (let k = 1; k <= 12; k++) {
      const spd = (k * 10000) / av;
      if (spd >= 100 && spd <= 210) list.push({ spd, actions: k, cycles: n });
    }
  }
  list.sort((a, b) => a.spd - b.spd);
  return list.filter((x, i) => i === 0 || Math.abs(x.spd - list[i - 1].spd) > 0.05);
}
export function nextBreakpoint(spd) {
  if (spd == null) return null;
  return speedBreakpoints().find((b) => b.spd > spd + 1e-6) || null;
}
export function currentBreakpoint(spd) {
  if (spd == null) return null;
  return [...speedBreakpoints()].reverse().find((b) => b.spd <= spd + 1e-6) || null;
}

/** Score a whole equipped build. */
export function analyzeCharacter(ch) {
  const key = ch.build;
  const bySlot = {};
  for (const r of ch.relics) bySlot[r.slot] = { relic: r, s: scoreRelic(r, key) };
  const slots = ['Head', 'Hands', 'Body', 'Feet', 'PlanarSphere', 'LinkRope'];
  const fits = slots.map((sl) => (bySlot[sl] ? bySlot[sl].s.fit : 0));
  const score = fits.reduce((a, b) => a + b, 0) / 6;
  let weakest = null;
  for (const sl of slots) {
    const e = bySlot[sl];
    if (!e) { weakest = { slot: sl, missing: true }; break; }
    if (!weakest || e.s.fit < weakest.fit) weakest = { slot: sl, fit: e.s.fit };
  }
  const counts = setCounts(ch.relics);
  const b = buildOf(key);
  const sets = Object.entries(counts).filter(([, n]) => n >= 2).map(([id, n]) => {
    const planar = setOf(id)?.planar;
    let rec = false;
    if (planar) rec = !!b?.ornamentSets?.includes(id);
    else rec = !!b?.relicSets?.some(([x, y]) => (n >= 4 ? x === id && y === id : x === id || y === id));
    return { id, n: planar ? 2 : (n >= 4 ? 4 : 2), planar, recommended: rec };
  });
  const spd = speedOf(ch);
  return { bySlot, score, grade: gradeOf(score), weakest, sets, spd, next: nextBreakpoint(spd), at: currentBreakpoint(spd) };
}

export const validMain = (slot, stat) => (MAIN_OPTIONS[slot] || []).includes(stat);
