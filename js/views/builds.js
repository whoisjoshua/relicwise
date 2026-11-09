import { html, icon, ring, bar, img } from '../ui.js';
import { state } from '../state.js';
import {
  charName, charOf, charPortrait, buildOf, setOf, setIcon, lcOf, lcIcon, prydwenUrl, FOCUS_LABEL, isEnhanced,
} from '../data.js';
import { STAT_LABEL, SLOT_LABEL, SUBSTATS, SLOTS } from '../stats.js';
import { analyzeCharacter, speedBreakpoints } from '../scoring.js';
import { relicTile, openRelic, roleTag, charMeta, enhancedTag } from '../components.js';
import { pickerHtml, wirePicker, resolveKey } from './picker.js';

export function renderBuilds(root, arg) {
  const key = resolveKey(arg);
  const b = buildOf(key);
  const c = charOf(key);
  const owned = state.profile?.characters.find((ch) => ch.build === key || ch.id === key.split('b')[0]);
  const analysis = owned ? analyzeCharacter(owned) : null;

  root.innerHTML = String(html`<div class="split">
    ${pickerHtml(key)}
    <div class="stack" style="gap:14px" data-stagger>
      <section class="card char-hero spot">
        <div class="portrait">${img(charPortrait(key), { alt: '', lazy: false })}</div>
        <span class="eyebrow">Build guide${owned ? ' · in your showcase' : ''}</span>
        <h2>${charName(key)}</h2>
        <div class="row" style="gap:8px">${charMeta(key)}<span class="stars">${'★'.repeat(c?.rarity || 4)}</span>${roleTag(key)}${enhancedTag(key)}
          ${b?.focus ? html`<span class="tag">${FOCUS_LABEL[b.focus] || b.focus}</span>` : ''}</div>
        <div class="row" style="gap:8px;margin-top:6px">
          <a class="btn sm" href="${prydwenUrl(key)}" target="_blank" rel="noopener">Prydwen guide ${icon('ext')}</a>
          <a class="btn sm ghost" href="#/synergies/${key}">Teams ${icon('arrow')}</a>
        </div>
        <span class="faint" style="font-size:11.5px">${b?.source === 'inferred' ? 'Inferred from the kit: no optimizer data yet.' : html`Data: Fribbels HSR Optimizer (MIT)${b?.borrowed ? html` · ${isEnhanced(key) ? 'base' : 'enhanced'} kit's ${b.borrowed.join(' & ').replace('relicSets', 'sets').replace('ornamentSets', 'ornaments')}` : ''}`}</span>
      </section>

      ${analysis ? yourBuild(owned, analysis, b) : ''}

      <div class="bento">
        <section class="card spot span-7">
          <div class="card-head"><h3>Relic sets</h3><span class="faint" style="font-size:12px">best first</span></div>
          ${b?.relicSets?.length ? b.relicSets.slice(0, 4).map(([x, y], i) => setOption(x, y, i)) : html`<p class="muted" style="margin:0;font-size:13.5px">The optimizer has no set recommendation for this character yet. Check the <a href="${prydwenUrl(key)}" target="_blank" rel="noopener" style="text-decoration:underline">Prydwen guide</a>.</p>`}
        </section>
        <section class="card spot span-5">
          <div class="card-head"><h3>Planar ornaments</h3></div>
          ${b?.ornamentSets?.length ? b.ornamentSets.slice(0, 4).map((o, i) => setOption(o, null, i, true)) : html`<p class="muted" style="margin:0;font-size:13.5px">No ornament recommendation yet.</p>`}
        </section>
        <section class="card spot span-6">
          <div class="card-head"><h3>Main stats</h3></div>
          <div class="mains">
            ${['Body', 'Feet', 'PlanarSphere', 'LinkRope'].map((sl) => html`<div><span class="slot">${SLOT_LABEL[sl]}</span>
              <span class="pills">${b?.parts?.[sl]?.length ? b.parts[sl].map((st, i) => html`<span class="tag ${i === 0 ? 'acc' : ''}">${STAT_LABEL[st] || st}</span>`) : html`<span class="tag">Any</span>`}</span></div>`)}
          </div>
        </section>
        <section class="card spot span-6">
          <div class="card-head"><h3>Substat priority</h3><span class="faint" style="font-size:12px">weight</span></div>
          <div class="weights">
            ${SUBSTATS.filter((k) => (b?.weights?.[k] || 0) > 0).sort((x, y) => b.weights[y] - b.weights[x]).map((k) => html`<div>
              <span>${STAT_LABEL[k]}</span>${bar(b.weights[k] * 100, b.weights[k] >= 1 ? 'S' : b.weights[k] >= 0.75 ? 'A' : 'B')}<span class="mono">${b.weights[k]}</span></div>`)}
          </div>
          <p class="faint" style="font-size:11.5px;margin:12px 0 0">Flat ATK/HP/DEF count for about 40% of a % roll when scoring.</p>
        </section>
        ${b?.lightCone && lcOf(b.lightCone) ? html`<section class="card spot span-4">
          <div class="card-head"><h3>Signature light cone</h3></div>
          <div class="row" style="gap:14px">${img(lcIcon(b.lightCone), { alt: '', w: 64, h: 64 })}<div><b>${lcOf(b.lightCone).name}</b><div class="stars">${'★'.repeat(lcOf(b.lightCone).rarity)}</div></div></div>
        </section>` : ''}
        <section class="card spot ${b?.lightCone ? 'span-8' : 'span-12'}">
          <div class="card-head"><h3>Speed tiers</h3><span class="faint" style="font-size:12px">actions before the cycle ends</span></div>
          ${speedTiers(analysis?.spd)}
        </section>
      </div>
    </div>
  </div>`);
  wirePicker(root, key, 'builds');
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-relic]');
    if (!t || !owned) return;
    const r = owned.relics.find((x) => x.key === t.dataset.relic);
    if (r) openRelic(r);
  });
}

function setOption(x, y, i, planar = false) {
  const a = setOf(x);
  if (!a) return '';
  const four = y && x === y;
  const two = y && x !== y ? setOf(y) : null;
  return html`<div class="set-opt">
    <div class="icons">${img(setIcon(x), { alt: '' })}${two ? img(setIcon(y), { alt: '' }) : ''}</div>
    <div>
      <div class="row" style="gap:8px"><span class="rank">#${i + 1}</span><b>${planar ? a.name : four ? `4pc ${a.name}` : `2pc ${a.name} + 2pc ${two?.name || ''}`}</b></div>
      <p>${planar || !four ? html`<b class="faint">2pc</b> ${a.desc[0]}` : html`<b class="faint">2pc</b> ${a.desc[0]}<br><b class="faint">4pc</b> ${a.desc[1] || ''}`}
        ${two ? html`<br><b class="faint">2pc</b> ${two.desc[0]}` : ''}</p>
    </div>
  </div>`;
}

function speedTiers(spd) {
  const common = speedBreakpoints().filter((x) => [120, 133.33, 142.86, 160, 171.43, 200].some((t) => Math.abs(x.spd - t) < 0.02));
  return html`<div class="weights">
    ${common.map((t) => html`<div>
      <span class="mono">${t.spd.toFixed(1)}</span>
      ${bar(spd ? Math.min(100, (spd / t.spd) * 100) : 0, spd && spd >= t.spd - 1e-6 ? 'C' : 'D')}
      <span class="mono" style="text-align:right">${spd && spd >= t.spd - 1e-6 ? '✓' : ''}</span>
    </div>
    <p class="faint" style="margin:-4px 0 4px 120px;font-size:12px">${t.actions} actions in the first ${t.cycles} cycle${t.cycles > 1 ? 's' : ''}</p>`)}
  </div>
  ${spd ? html`<p class="muted" style="font-size:12.5px;margin:10px 0 0">Your showcase build: ≈ <b style="color:var(--text)">${spd.toFixed(1)}</b> SPD (relics, traces and set bonuses; light cone passives not included).</p>` : html`<p class="faint" style="font-size:12px;margin:10px 0 0">Load a UID with this character in the showcase to see where you stand.</p>`}`;
}

function yourBuild(ch, a, b) {
  const weak = a.weakest;
  const slot = weak?.slot;
  const mains = b?.parts?.[slot]?.length ? b.parts[slot].map((s) => STAT_LABEL[s]).join(' or ') : null;
  const subs = SUBSTATS.filter((k) => (b?.weights?.[k] || 0) > 0 && !['HP', 'ATK', 'DEF'].includes(k)).sort((x, y) => b.weights[y] - b.weights[x]).slice(0, 3).map((k) => STAT_LABEL[k]);
  const advice = slot ? `Biggest upgrade: ${SLOT_LABEL[slot].toLowerCase()}${weak.missing ? ' (empty)' : ` (${Math.round(weak.fit)})`}. Look for ${mains && !['Head', 'Hands'].includes(slot) ? mains + ' main with ' : ''}${subs.join(', ')} subs.` : '';
  return html`<section class="card spot">
    <div class="card-head"><h3>Your build</h3><a class="btn sm ghost" href="#/relics">All relics ${icon('arrow')}</a></div>
    <div class="row" style="gap:18px;align-items:center">
      ${ring(a.score, { size: 84, stroke: 6, grade: a.grade, label: a.grade })}
      <div class="stack" style="gap:10px;flex:1 1 280px;min-width:0">
        <div class="relic-row" style="max-width:520px">${SLOTS.map((sl) => (a.bySlot[sl] ? relicTile(a.bySlot[sl].relic, a.bySlot[sl].s, { weak: sl === slot && a.bySlot[sl].s.fit < 65 }) : relicTile(null)))}</div>
        <div class="row" style="gap:6px">${a.sets.map((s) => html`<span class="tag ${s.recommended ? 'ok' : 'warn'}">${img(setIcon(s.id), { alt: '' })}${s.n}pc ${setOf(s.id)?.name}${s.recommended ? ' ✓' : ''}</span>`)}</div>
        <p class="muted" style="margin:0;font-size:13px">${advice}</p>
      </div>
    </div>
  </section>`;
}

