// Fetch a public showcase from Enka.Network (via the proxy) and normalize it.
import { D, buildKey, pieceOf } from './data.js';
import { ENKA_TYPE_SLOT, PROP_TO_KEY, inferRolls } from './stats.js';
import { apiUrl, getJson } from './net.js';
import { store } from './store.js';

const ENKA_ERRORS = {
  400: 'That UID format looks wrong. HSR UIDs are 9 digits.',
  404: 'No player with that UID. Check the number and the server.',
  424: 'The game is under maintenance or just updated. Enka will catch up shortly; try again later.',
  429: 'Too many lookups right now. Wait a minute and try again.',
  500: 'Enka.Network had a server error. Try again in a bit.',
  503: 'Enka.Network is temporarily down. Try again later.',
};

export const validUid = (uid) => /^\d{9,10}$/.test(String(uid).trim());

export async function fetchProfile(uid, { force = false } = {}) {
  uid = String(uid).trim();
  if (!validUid(uid)) throw new Error(ENKA_ERRORS[400]);
  const cached = store.get('profile:' + uid);
  if (!force && cached && Date.now() < cached.expires) return normalizeProfile(cached.raw, { fetchedAt: cached.fetchedAt });
  const { status, ok, body } = await getJson(apiUrl('/api/enka/' + uid));
  if (!ok || !body?.detailInfo) {
    if (cached) return normalizeProfile(cached.raw, { fetchedAt: cached.fetchedAt, stale: true });
    throw new Error(ENKA_ERRORS[status] || `Enka.Network returned an error (${status}).`);
  }
  const ttl = Math.max(60, Number(body.ttl) || 60) * 1000;
  const entry = { raw: body, fetchedAt: Date.now(), expires: Date.now() + ttl };
  store.set('profile:' + uid, entry);
  rememberUid(uid, body.detailInfo.nickname);
  return normalizeProfile(body, { fetchedAt: entry.fetchedAt });
}

export function rememberUid(uid, nickname) {
  const list = (store.get('recent') || []).filter((x) => x.uid !== uid);
  list.unshift({ uid, nickname: nickname || '' });
  store.set('recent', list.slice(0, 5));
  store.set('lastUid', uid);
}

export function normalizeProfile(json, extra = {}) {
  const di = json.detailInfo || {};
  const rec = di.recordInfo || {};
  const characters = (di.avatarDetailList || []).map(normalizeAvatar).filter(Boolean);
  // A character can be both in the showcase and the support slot; keep the first occurrence.
  const seen = new Set();
  const unique = characters.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
  return {
    uid: String(di.uid ?? json.uid ?? ''),
    nickname: di.nickname || 'Trailblazer',
    signature: di.signature || '',
    level: di.level || 0,
    worldLevel: di.worldLevel ?? null,
    avatarCount: rec.avatarCount ?? null,
    achievementCount: rec.achievementCount ?? null,
    relicCount: rec.relicCount ?? null,
    characters: unique,
    fetchedAt: extra.fetchedAt || Date.now(),
    stale: !!extra.stale,
    demo: !!extra.demo,
  };
}

function normalizeAvatar(a) {
  const id = String(a.avatarId);
  if (!D.game.characters[id]) return null;
  const enhanced = !!a.enhancedId;
  const ch = {
    id,
    build: buildKey(id, enhanced),
    enhanced,
    level: a.level || 1,
    promotion: a.promotion || 0,
    eidolon: a.rank || 0,
    traces: (a.skillTreeList || []).map((t) => String(t.pointId)),
    lightCone: a.equipment ? {
      id: String(a.equipment.tid), level: a.equipment.level || 1, superimposition: a.equipment.rank || 1,
    } : null,
    relics: [],
  };
  ch.relics = (a.relicList || []).map((r) => normalizeEnkaRelic(r, ch.build)).filter(Boolean);
  return ch;
}

export function normalizeEnkaRelic(r, owner) {
  const piece = pieceOf(String(r.tid));
  const level = r.level || 0;
  let main;
  let subs;
  if (piece && D.game.mainAffix[piece.main]?.[r.mainAffixId] && D.game.subAffix[piece.sub]) {
    const m = D.game.mainAffix[piece.main][r.mainAffixId];
    main = { stat: m.stat, value: m.base + m.step * level };
    subs = (r.subAffixList || []).map((s) => {
      const a = D.game.subAffix[piece.sub][s.affixId];
      if (!a) return null;
      const rolls = s.cnt ?? 1;
      const steps = s.step ?? 0;
      return { stat: a.stat, value: a.base * rolls + a.step * steps, rolls, steps };
    }).filter(Boolean);
  } else {
    // Unknown piece (newer than our data): fall back to Enka's flattened props (main first, then subs)
    const props = r._flat?.props || [];
    if (!props.length) return null;
    const k = (p) => PROP_TO_KEY[p.type];
    main = { stat: k(props[0]), value: props[0].value };
    subs = props.slice(1).filter(k).map((p) => {
      const inf = inferRolls(k(p), p.value);
      return { stat: k(p), value: p.value, rolls: inf?.rolls ?? 1, steps: inf?.steps ?? 0 };
    });
  }
  const slot = piece?.slot || ENKA_TYPE_SLOT[r.type];
  return {
    key: `${owner}-${slot}`,
    tid: String(r.tid),
    name: piece?.name,
    set: String(piece?.set ?? r._flat?.setID ?? ''),
    slot,
    rarity: piece?.rarity ?? 5,
    level,
    main,
    subs,
    owner,
    source: 'enka',
  };
}

export async function loadDemoProfile() {
  const res = await fetch(new URL('../data/demo-profile.json', import.meta.url));
  const json = await res.json();
  return normalizeProfile(json, { demo: true });
}
