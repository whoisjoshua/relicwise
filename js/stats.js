// Stat vocabulary + relic roll math. Pure functions (no DOM) so they can be unit tested in Node.

export const SUBSTATS = ['HP', 'ATK', 'DEF', 'HP_P', 'ATK_P', 'DEF_P', 'SPD', 'CR', 'CD', 'EHR', 'RES', 'BE'];
export const FLAT = new Set(['HP', 'ATK', 'DEF', 'SPD']);
export const SLOTS = ['Head', 'Hands', 'Body', 'Feet', 'PlanarSphere', 'LinkRope'];
export const SLOT_LABEL = { Head: 'Head', Hands: 'Hands', Body: 'Body', Feet: 'Feet', PlanarSphere: 'Sphere', LinkRope: 'Rope' };
export const ENKA_TYPE_SLOT = { 1: 'Head', 2: 'Hands', 3: 'Body', 4: 'Feet', 5: 'PlanarSphere', 6: 'LinkRope' };

export const STAT_LABEL = {
  HP: 'HP', ATK: 'ATK', DEF: 'DEF', HP_P: 'HP%', ATK_P: 'ATK%', DEF_P: 'DEF%', SPD: 'SPD', SPD_P: 'SPD%',
  CR: 'CRIT Rate', CD: 'CRIT DMG', EHR: 'Effect Hit Rate', RES: 'Effect RES', BE: 'Break Effect',
  ERR: 'Energy Regen Rate', OHB: 'Outgoing Healing', Elation: 'Elation', DMG: 'DMG Boost',
  Physical_DMG: 'Physical DMG', Fire_DMG: 'Fire DMG', Ice_DMG: 'Ice DMG', Lightning_DMG: 'Lightning DMG',
  Wind_DMG: 'Wind DMG', Quantum_DMG: 'Quantum DMG', Imaginary_DMG: 'Imaginary DMG',
};
export const STAT_SHORT = {
  ...STAT_LABEL, CR: 'CR', CD: 'CD', EHR: 'EHR', RES: 'RES', BE: 'BE', ERR: 'ERR', OHB: 'Heal',
  Physical_DMG: 'Phys%', Fire_DMG: 'Fire%', Ice_DMG: 'Ice%', Lightning_DMG: 'Light%', Wind_DMG: 'Wind%',
  Quantum_DMG: 'Quan%', Imaginary_DMG: 'Imag%',
};

// Game property names (StarRailRes / Enka `_flat.props`) -> our keys. Mirrors tools/build_data.py.
export const PROP_TO_KEY = {
  HPDelta: 'HP', AttackDelta: 'ATK', DefenceDelta: 'DEF', HPAddedRatio: 'HP_P', AttackAddedRatio: 'ATK_P',
  DefenceAddedRatio: 'DEF_P', SpeedDelta: 'SPD', SpeedAddedRatio: 'SPD_P',
  CriticalChanceBase: 'CR', CriticalChance: 'CR', CriticalDamageBase: 'CD', CriticalDamage: 'CD',
  StatusProbabilityBase: 'EHR', StatusProbability: 'EHR', StatusResistanceBase: 'RES', StatusResistance: 'RES',
  BreakDamageAddedRatioBase: 'BE', BreakDamageAddedRatio: 'BE', HealRatioBase: 'OHB', HealRatio: 'OHB',
  SPRatioBase: 'ERR', SPRatio: 'ERR', PhysicalAddedRatio: 'Physical_DMG', FireAddedRatio: 'Fire_DMG',
  IceAddedRatio: 'Ice_DMG', ThunderAddedRatio: 'Lightning_DMG', WindAddedRatio: 'Wind_DMG',
  QuantumAddedRatio: 'Quantum_DMG', ImaginaryAddedRatio: 'Imaginary_DMG', ElationDamageAddedRatioBase: 'Elation',
};

export const ELEMENT_DMG = {
  Physical: 'Physical_DMG', Fire: 'Fire_DMG', Ice: 'Ice_DMG', Thunder: 'Lightning_DMG',
  Wind: 'Wind_DMG', Quantum: 'Quantum_DMG', Imaginary: 'Imaginary_DMG',
};
const ELEMENT_KEYS = Object.values(ELEMENT_DMG);

export const MAIN_OPTIONS = {
  Head: ['HP'],
  Hands: ['ATK'],
  Body: ['HP_P', 'ATK_P', 'DEF_P', 'CR', 'CD', 'OHB', 'EHR'],
  Feet: ['HP_P', 'ATK_P', 'DEF_P', 'SPD'],
  PlanarSphere: ['HP_P', 'ATK_P', 'DEF_P', ...ELEMENT_KEYS],
  LinkRope: ['HP_P', 'ATK_P', 'DEF_P', 'BE', 'ERR'],
};

// Approximate odds of each stat being picked when a 3-line relic gains its 4th line
// (community-datamined weights; flat/percent HP/ATK/DEF are the most common).
export const NEW_LINE_WEIGHT = { HP: 10, ATK: 10, DEF: 10, HP_P: 10, ATK_P: 10, DEF_P: 10, SPD: 4, CR: 6, CD: 6, EHR: 8, RES: 8, BE: 8 };

export const isPercent = (k) => !FLAT.has(k);

export function fmtStat(key, v, { sign = false } = {}) {
  if (v == null || Number.isNaN(v)) return '–';
  // Match the game: values are truncated, not rounded (0.03888 shows as 3.8%)
  let s;
  if (isPercent(key)) s = (Math.floor(v * 1000 + 1e-6) / 10).toFixed(1) + '%';
  else if (key === 'SPD') s = (Math.floor(v * 10 + 1e-6) / 10).toString();
  else s = Math.floor(v + 1e-6).toString();
  return sign ? '+' + s : s;
}

// ---- roll tables (5★ sub affix group "5"), filled from game.json by data.js
let ROLL = null;
export function setRollTable(subAffixGroup) {
  ROLL = {};
  for (const a of Object.values(subAffixGroup)) {
    ROLL[a.stat] = { base: a.base, step: a.step, steps: a.steps ?? 2, max: a.base + (a.steps ?? 2) * a.step, avg: a.base + a.step };
  }
}
export const rollInfo = (stat) => ROLL?.[stat];
/** A substat's value expressed in "max rolls" (one perfect 5★ roll = 1.0). */
export const rollUnits = (stat, value) => (ROLL?.[stat] ? value / ROLL[stat].max : 0);
/** Average roll quality relative to a max roll (≈0.9). */
export const avgQuality = (stat) => (ROLL?.[stat] ? ROLL[stat].avg / ROLL[stat].max : 0.9);

/**
 * Recover (rolls, steps) from a displayed substat value. Used for OCR + imports where only the number is known.
 * value: fraction for percent stats (0.058 = 5.8%), raw number for flat. Returns null if nothing fits.
 */
export function inferRolls(stat, value) {
  const r = ROLL?.[stat];
  if (!r || !(value > 0)) return null;
  // The game truncates what it shows (1 decimal for percents, whole numbers for flat stats), so the true value
  // lies in [shown, shown + one display step). If nothing fits, fall back to a rounding window.
  const pct = isPercent(stat);
  const step = pct ? 0.001 : 1;
  const search = (lo, hi) => {
    let best = null;
    for (let rolls = 1; rolls <= 6; rolls++) {
      for (let steps = 0; steps <= rolls * r.steps; steps++) {
        const v = r.base * rolls + r.step * steps;
        if (v < lo - 1e-9 || v >= hi - 1e-9) continue;
        const err = Math.abs(v - (lo + hi) / 2);
        if (!best || err < best.err - 1e-9 || (Math.abs(err - best.err) < 1e-9 && rolls < best.rolls)) best = { rolls, steps, err, value: v };
      }
    }
    return best;
  };
  return search(value, value + step) || search(value - step / 2, value + step / 2);
}

export function upgradesDone(level) { return Math.floor((level || 0) / 3); }
export function upgradesLeft(relic) {
  const max = relic.rarity === 5 ? 5 : relic.rarity === 4 ? 4 : relic.rarity === 3 ? 3 : 2;
  return Math.max(0, max - upgradesDone(relic.level));
}
