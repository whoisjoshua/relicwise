// Loads data/*.json (built by tools/build_data.py) and exposes lookups. No DOM access.
import { CONFIG } from './config.js';
import { setRollTable, ELEMENT_DMG } from './stats.js';

export const D = { game: null, builds: null, meta: null, ready: false };

export async function loadData(base = 'data/') {
  const get = (f) => fetch(base + f, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`Couldn't load ${f} (${r.status})`);
    return r.json();
  });
  const [game, builds, meta] = await Promise.all([get('game.json'), get('builds.json'), get('meta.json')]);
  setData(game, builds, meta);
}

export function setData(game, builds, meta = {}) {
  D.game = game;
  D.builds = builds;
  D.meta = meta;
  setRollTable(game.subAffix['5']);
  D.ready = true;
}

export const asset = (p) => (p ? CONFIG.assetBase + p : '');
export const assetFallback = (p) => (p ? CONFIG.assetFallback + p : '');

/** Character record for an id, including enhanced ids like "1005b1". */
export function charOf(id) {
  if (!id) return null;
  const base = String(id).split('b')[0];
  return D.game.characters[base] || null;
}
export const isEnhanced = (id) => String(id).includes('b');
export function charName(id) {
  const c = charOf(id);
  return c ? c.name : `#${id}`;
}
export const charIcon = (id) => asset(charOf(id)?.icon);
export const charPreview = (id) => asset(charOf(id)?.preview);
export const charPortrait = (id) => asset(charOf(id)?.portrait);
export const elementIcon = (el) => asset(D.game.elements[el]?.icon);
export const elementName = (el) => D.game.elements[el]?.name || el;
export const elementColor = (el) => D.game.elements[el]?.color || '#ffffff';
export const pathIcon = (p) => asset(D.game.paths[p]?.icon);
export const pathName = (p) => D.game.paths[p]?.name || p;
export const elementDmgKey = (el) => ELEMENT_DMG[el];

export const setOf = (id) => D.game.sets[id] || null;
export const setIcon = (id) => asset(setOf(id)?.icon);
export const lcOf = (id) => D.game.lightCones[id] || null;
export const lcIcon = (id) => asset(lcOf(id)?.icon);
export const pieceOf = (tid) => D.game.pieces[tid] || null;

/** Relic icon: per-piece icons are "<set>_<slotIndex>.png". */
export function relicIcon(relic) {
  if (relic.tid && D.game.pieces[relic.tid]) return asset(D.game.pieces[relic.tid].icon);
  const idx = { Head: 0, Hands: 1, Body: 2, Feet: 3, PlanarSphere: 0, LinkRope: 1 }[relic.slot];
  return asset(`icon/relic/${relic.set}_${idx}.png`);
}
export function relicName(relic) {
  if (relic.name) return relic.name;
  const p = Object.values(D.game.pieces).find((x) => x.set === String(relic.set) && x.slot === relic.slot && x.rarity === 5);
  return p ? p.name : setOf(relic.set)?.name || 'Relic';
}

/** The build key for a character: enhanced versions have their own optimizer configs. */
export function buildKey(id, enhanced) {
  const s = String(id);
  if (enhanced && D.builds[s + 'b1']) return s + 'b1';
  return D.builds[s] ? s : (D.builds[s + 'b1'] ? s + 'b1' : s);
}
export const buildOf = (key) => D.builds[key] || null;

/**
 * Characters to rank relics against: one entry per distinct character (Trailblazer caelus/stelle collapsed;
 * base/enhanced collapsed onto whichever the player owns, otherwise the enhanced kit if one exists).
 */
export function rankableBuilds(ownedKeys = new Set()) {
  const out = new Map();
  for (const key of Object.keys(D.builds)) {
    const b = D.builds[key];
    if (b.alias) continue;
    let base = key.split('b')[0];
    // Trailblazer ids come in caelus/stelle pairs (8001/8002 …): treat each pair as one character
    if (base.startsWith('80')) base = String(Number(base) - (Number(base) % 2 === 0 ? 1 : 0));
    const ownedKey = ownedKeys.has(key) ? key : null;
    const prev = out.get(base);
    if (!prev) out.set(base, key);
    else if (ownedKey) out.set(base, key);
    else if (!ownedKeys.has(prev) && key.endsWith('b1')) out.set(base, key);
  }
  return [...out.values()];
}

export const ROLE_LABEL = { dps: 'DPS', break: 'Break DPS', dot: 'DoT', debuff: 'Debuffer', support: 'Support', sustain: 'Sustain' };
export const FOCUS_LABEL = {
  ULT: 'Ultimate damage', SKILL: 'Skill damage', BASIC: 'Basic ATK damage', FUA: 'Follow-up damage', DOT: 'DoT damage',
  BREAK: 'Break damage', MEMO_SKILL: 'Memosprite skill', MEMO_TALENT: 'Memosprite talent', ELATION_SKILL: 'Elation skill',
  ATK: 'ATK scaling', HP: 'HP scaling', DEF: 'DEF scaling', SPD: 'Speed', EHR: 'Effect Hit Rate', BE: 'Break Effect',
};

/** Prydwen URL guess from the display name (Prydwen blocks automated lookups, so slugs aren't verified). */
export function prydwenUrl(id) {
  const c = charOf(id);
  if (!c) return CONFIG.prydwen;
  let name = c.name;
  if (name.startsWith('Trailblazer · ')) name = 'trailblazer ' + name.split('· ')[1];
  else name = name.replace(/ · .*$/, '');
  const slug = name.toLowerCase().normalize('NFKD').replace(/[•.]/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return CONFIG.prydwen + slug;
}
