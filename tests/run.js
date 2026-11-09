// Logic tests. No dependencies: `node tests/run.js` (Node 14+). Browser OCR test: open tests/ocr.html via the dev server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const { setData } = await import('../js/data.js');
setData(json('data/game.json'), json('data/builds.json'), json('data/meta.json'));
const S = await import('../js/stats.js');
const SC = await import('../js/scoring.js');
const { normalizeProfile } = await import('../js/enka.js');
const W = await import('../js/warps.js');
const { parseStatLine, repairValue } = await import('../js/ocr.js');

let pass = 0;
let fail = 0;
function t(name, fn) {
  try { fn(); pass += 1; console.log('  ✓', name); } catch (e) { fail += 1; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b, msg = '') { if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

console.log('stats');
t('inferRolls recovers rolls from displayed (truncated) values', () => {
  eq(S.inferRolls('CR', 0.058).rolls, 2, 'CR 5.8%');
  eq(S.inferRolls('CD', 0.116).rolls, 2, 'CD 11.6%');
  eq(S.inferRolls('CD', 0.181).rolls, 3, 'CD 18.1%');
  const spd = S.inferRolls('SPD', 7);
  ok(spd && spd.value >= 7 && spd.value < 8, 'SPD 7 must truncate to 7');
  eq(S.inferRolls('CR', 0.5), null, 'impossible value');
});
t('fmtStat truncates like the game', () => {
  eq(S.fmtStat('HP_P', 0.03888), '3.8%');
  eq(S.fmtStat('ATK', 35.98), '35');
  eq(S.fmtStat('SPD', 7.2), '7.2');
});
t('upgradesLeft', () => {
  eq(S.upgradesLeft({ rarity: 5, level: 0 }), 5);
  eq(S.upgradesLeft({ rarity: 5, level: 14 }), 1);
  eq(S.upgradesLeft({ rarity: 5, level: 15 }), 0);
  eq(S.upgradesLeft({ rarity: 4, level: 12 }), 0);
});

console.log('scoring');
const roll = (stat, n) => ({ stat, value: S.rollInfo(stat).max * n, rolls: n, steps: n * 2 });
const perfect = { set: '117', slot: 'Head', rarity: 5, level: 15, main: { stat: 'HP', value: 705 }, subs: [roll('CR', 6), roll('CD', 1), roll('SPD', 1), roll('ATK_P', 1)] };
const junk = { ...perfect, subs: [roll('DEF', 3), roll('HP_P', 2), roll('RES', 2), roll('DEF_P', 2)] };
t('perfect relic scores 100, junk scores ~0 (Acheron)', () => {
  ok(near(SC.scoreRelic(perfect, '1308').pct, 100, 1e-6), 'perfect');
  ok(SC.scoreRelic(junk, '1308').pct < 1, 'junk');
  eq(SC.scoreRelic(perfect, '1308').grade, 'SS');
});
t('wrong main stat is penalised', () => {
  const body = { ...perfect, slot: 'Body', main: { stat: 'DEF_P', value: 0.5 } };
  ok(SC.mainFit('1308', body) < 0.5);
  ok(SC.mainFit('1308', { ...body, main: { stat: 'CR', value: 0.3 } }) === 1);
});
t('potential distribution sums to 1 and is bounded', () => {
  const fresh = { ...perfect, level: 0, subs: [roll('CR', 1), roll('CD', 1), roll('DEF', 1)] };
  const w = SC.effWeights('1308');
  const ideal = SC.idealScore(w, 'HP', '1308');
  const p = SC.potential(fresh, w, ideal);
  ok(p && p.mean > 0 && p.mean <= 100 && p.best >= p.mean, JSON.stringify(p));
  ok(p.pA >= 0 && p.pA <= 1);
  ok(near(p.pTotal, 1, 1e-9), 'probabilities sum to ' + p.pTotal);
  const four = SC.potential({ ...fresh, subs: [...fresh.subs, roll('SPD', 1)] }, w, ideal);
  ok(near(four.pTotal, 1, 1e-9), '4-line sum ' + four.pTotal);
});
t('drop percentile is monotonic', () => {
  const a = SC.dropPercentile('1308', 'HP', 30);
  const b = SC.dropPercentile('1308', 'HP', 70);
  ok(a < b && b <= 1 && a >= 0, `${a} ${b}`);
});
t('speed breakpoints include the classic tiers', () => {
  const list = SC.speedBreakpoints().map((b) => +b.spd.toFixed(2));
  for (const v of [120, 133.33, 142.86, 160, 171.43, 200]) ok(list.includes(v), 'missing ' + v);
  eq(+SC.nextBreakpoint(134).spd.toFixed(2), 142.86);
});

console.log('enka');
const profile = normalizeProfile(json('data/demo-profile.json'));
t('demo profile normalizes 8 characters / 48 relics with valid stats', () => {
  eq(profile.characters.length, 8);
  const relics = profile.characters.flatMap((c) => c.relics);
  eq(relics.length, 48);
  for (const r of relics) {
    ok(S.SLOTS.includes(r.slot), 'slot ' + r.slot);
    ok(S.MAIN_OPTIONS[r.slot].includes(r.main.stat), `main ${r.main.stat} on ${r.slot}`);
    for (const s of r.subs) ok(S.SUBSTATS.includes(s.stat) && s.value > 0 && s.rolls >= 1);
  }
});
t('every showcase relic gets a ranked owner list', () => {
  const owned = new Set(profile.characters.map((c) => c.build));
  for (const r of profile.characters.flatMap((c) => c.relics)) ok(SC.rankOwners(r, owned, 3).length === 3);
});

console.log('warps');
const rec = (id, type, item, rank) => ({ id: String(id), gacha_type: type, item_id: item, name: item, rank_type: String(rank), time: '2026-01-01 00:00:00' });
t('50/50 win, loss and guarantee are tracked in order', () => {
  const list = [];
  let id = 1000;
  const pull = (n, item = '20000', rank = 3) => { for (let i = 0; i < n; i++) list.push(rec(id++, '11', i === n - 1 ? item : '20000', i === n - 1 ? rank : 3)); };
  pull(70, '1308', 5); // win
  pull(80, '1003', 5); // loss (Himeko)
  pull(10, '1407', 5); // guaranteed
  pull(12); // current pity 12
  const b = W.analyze(list).byBanner['11'];
  eq(b.fives.map((f) => f.outcome).join(), 'win,loss,guaranteed');
  eq(b.fives.map((f) => f.pity).join(), '70,80,10');
  eq(b.pity, 12);
  eq(b.guaranteed, false);
  eq(b.featured, 2);
});
t('luck rating is a percentile in [0,1]', () => {
  const a = W.analyze(W.demoHistory().records);
  ok(a.luck.percentile >= 0 && a.luck.percentile <= 1);
  ok(a.luck.expected > 0);
});
t('expected pity under the model is ~62 (char) / ~53 (LC)', () => {
  ok(Math.abs(W.expectedPity(W.BANNERS[11]) - 62.3) < 1);
  ok(Math.abs(W.expectedPity(W.BANNERS[12]) - 53.4) < 1);
});
t('parseWarpUrl keeps auth params and strips paging', () => {
  const q = W.parseWarpUrl('x https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/getGachaLog?authkey_ver=1&sign_type=2&authkey=a%2Bb&game_biz=hkrpg_global&page=3&size=5&end_id=9&gacha_type=11 y');
  eq(q.get('authkey'), 'a+b');
  eq(q.get('page'), null);
  eq(q.get('gacha_type'), null);
  eq(q.get('game_biz'), 'hkrpg_global');
});
t('UIGF export round-trips through import', () => {
  const recs = W.demoHistory().records.slice(0, 50);
  const back = W.parseImport(W.toUIGF('123', recs));
  eq(back.uid, '123');
  eq(back.records.length, 50);
  eq(back.records[7].id, recs[7].id);
});

console.log('ocr parsing');
t('stat lines map to keys (flat vs %)', () => {
  eq(parseStatLine('CRIT DMG     11.6%').stat, 'CD');
  eq(parseStatLine('ATK  7.7%').stat, 'ATK_P');
  eq(parseStatLine('ATK  35').stat, 'ATK');
  eq(parseStatLine('Effect Hit Rate 7.7%').stat, 'EHR');
  eq(parseStatLine('Break Effect 64.8%').stat, 'BE');
  eq(parseStatLine('2-Pc: ATK increases by 12%.'), null);
});
t('repairValue fixes dropped decimal points', () => {
  ok(near(repairValue('EHR', '77').value, 0.07776, 1e-6), 'EHR 77% -> 7.7%');
  ok(near(repairValue('CD', '181').value, 0.18144, 1e-6), 'CD 181% -> 18.1%');
  ok(near(repairValue('CD', '1.6').value, 0.11664, 1e-6), 'CD 1.6% -> 11.6%');
  eq(repairValue('CR', '5.8').repaired, false);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
