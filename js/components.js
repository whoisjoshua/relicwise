// Relic + character building blocks shared by several views, and the relic detail drawer.
import { html, icon, ring, bar, img, gradeBadge, openDrawer, pctText } from './ui.js';
import {
  charName, charIcon, charOf, relicIcon, relicName, setOf, setIcon, buildOf, prydwenUrl,
  ROLE_LABEL, elementIcon, pathIcon, pathName, isEnhanced,
} from './data.js';
import { STAT_LABEL, STAT_SHORT, SLOT_LABEL, fmtStat, rollInfo, upgradesLeft } from './stats.js';
import { scoreRelic, rankOwners, verdict, dropPercentile, gradeOf } from './scoring.js';
import { state } from './state.js';

export function avatar(id, { size = 40, owned = false, sq = false, title = null } = {}) {
  return html`<span class="av ${owned ? 'owned' : ''} ${sq ? 'sq' : ''}" style="--s:${size}px" title="${title ?? charName(id)}">${img(charIcon(id), { alt: '' })}</span>`;
}

export function enhancedTag(id) {
  return isEnhanced(id) ? html`<span class="tag acc" title="Enhanced kit">Enhanced</span>` : '';
}

export function roleTag(key) {
  const b = buildOf(key);
  return b ? html`<span class="tag">${ROLE_LABEL[b.role] || b.role}</span>` : '';
}

export function charMeta(id) {
  const c = charOf(id);
  if (!c) return '';
  return html`<span class="row" style="gap:6px">${img(elementIcon(c.element), { cls: 'el', alt: c.element })}${img(pathIcon(c.path), { cls: 'el path-ic', alt: '' })}<span>${pathName(c.path)}</span></span>`;
}

/** Value of one substat in rolls, as pips; opacity hints at roll quality. */
function pips(sub) {
  const n = Math.max(1, Math.min(6, sub.rolls || 1));
  const r = rollInfo(sub.stat);
  const q = r ? Math.max(0.45, Math.min(1, sub.value / (n * r.max))) : 1;
  return html`<span class="pips" style="--q:${q.toFixed(2)}" title="${n} roll${n > 1 ? 's' : ''}">${Array.from({ length: 6 }, (_, i) => html`<i class="${i < n ? 'on' : ''}"></i>`)}</span>`;
}

export function relicTile(relic, s, { weak = false } = {}) {
  if (!relic) return html`<div class="relic-tile empty"></div>`;
  return html`<button class="relic-tile g-${s.fitGrade}${weak ? ' weak' : ''}" data-relic="${relic.key}" title="${relicName(relic)}: ${Math.round(s.fit)} for ${charName(s.buildKey)}">
    <span class="lv">+${relic.level}</span>
    ${img(relicIcon(relic), { alt: SLOT_LABEL[relic.slot] })}
    <span class="gr">${s.fitGrade}</span>
    ${bar(s.fit, s.fitGrade)}
  </button>`;
}

export function subsInline(relic, weights) {
  return html`<span class="subs-inline">${relic.subs.map((x) => html`<span class="${weights && weights[x.stat] >= 0.75 ? 'hi' : ''}">${STAT_SHORT[x.stat]} <b>${fmtStat(x.stat, x.value)}</b></span>`)}</span>`;
}

export function ledgerRow(relic, s, top) {
  return html`<div class="ledger-row" data-relic="${relic.key}" role="button" tabindex="0">
    ${img(relicIcon(relic), { cls: 'ri', alt: '' })}
    <span class="nm"><b>${relicName(relic)}</b><span>${SLOT_LABEL[relic.slot]} · ${STAT_LABEL[relic.main.stat]} · +${relic.level}</span></span>
    ${subsInline(relic, s.weights)}
    <span class="best-stack" title="Best owners">${(top || []).slice(0, 4).map((t) => avatar(t.buildKey, { size: 26, owned: t.owned, title: `${charName(t.buildKey)} · ${Math.round(t.fit)}` }))}</span>
    <span class="row" style="justify-content:flex-end;gap:8px"><span class="mono" style="font-size:13px">${Math.round(s.fit)}</span>${gradeBadge(s.fitGrade)}</span>
  </div>`;
}

// ---------------------------------------------------------------- drawer
let current = null;

export function openRelic(relic, focus = relic.owner) {
  const ranked = rankOwners(relic, state.owned, 10);
  current = { relic, ranked, focus: focus || ranked[0]?.buildKey };
  openDrawer(relicDetail());
}

export function drawerClick(e) {
  const row = e.target.closest('[data-focus]');
  if (!row || !current || e.target.closest('a')) return;
  current.focus = row.dataset.focus;
  const body = document.getElementById('drawerBody');
  const top = body.scrollTop;
  openDrawer(relicDetail());
  body.scrollTop = top;
}

function relicDetail() {
  const { relic, ranked, focus } = current;
  const s = scoreRelic(relic, focus);
  const set = setOf(relic.set);
  const v = verdict(relic, ranked);
  const left = upgradesLeft(relic);
  const dp = relic.rarity === 5 && left === 0 ? dropPercentile(focus, relic.main.stat, s.pct) : null;
  const wearer = relic.owner && relic.owner === focus;
  const rows = ranked.some((r) => r.buildKey === focus) ? ranked : [...ranked, { ...s, owned: state.owned.has(focus) }];
  const b = buildOf(focus);
  const mainNote = s.mainFit >= 1 ? html`<span class="tag ok">Main stat fits</span>`
    : s.mainFit >= 0.75 ? html`<span class="tag">Any main works</span>` : html`<span class="tag bad">Wrong main stat</span>`;
  const setNote = s.setFit >= 1 ? html`<span class="tag ok">Best set</span>`
    : s.setFit >= 0.95 ? html`<span class="tag ok">Recommended set</span>`
      : s.setFit >= 0.9 ? html`<span class="tag">No set data</span>` : html`<span class="tag warn">Off-set</span>`;

  return html`
    <div class="relic-hero rise">
      <div class="icon-wrap">${img(relicIcon(relic), { alt: '', lazy: false })}</div>
      <div>
        <h2>${relicName(relic)}</h2>
        <div class="meta">
          <span class="tag">${img(setIcon(relic.set), { alt: '' })}${set?.name || 'Unknown set'}</span>
          <span class="tag">${SLOT_LABEL[relic.slot]}</span>
          <span class="tag mono">+${relic.level}</span>
          <span class="stars">${'★'.repeat(relic.rarity || 5)}</span>
          ${relic.source === 'ocr' ? html`<span class="tag info">Scanned</span>` : ''}
        </div>
      </div>
    </div>

    <div class="card rise" style="--i:1;padding:16px">
      <div class="row" style="gap:16px;align-items:center">
        ${ring(s.fit, { size: 76, stroke: 6, grade: s.fitGrade, label: s.fitGrade })}
        <div class="grow">
          <div class="eyebrow">Score for</div>
          <div class="row" style="gap:8px;margin-top:6px">${avatar(focus, { size: 26 })}<b style="font-size:16px">${charName(focus)}</b>${enhancedTag(focus)}</div>
          <div class="row" style="gap:6px;margin-top:8px">${mainNote}${setNote}
            ${dp != null ? html`<span class="tag acc" title="Compared with 3,000 simulated fully levelled drops with the same main stat">${dp >= 0.99 ? 'Top 1% of drops' : `Beats ${pctText(dp)} of drops`}</span>` : ''}
          </div>
        </div>
      </div>
      ${s.potential ? html`<div class="potential" style="margin-top:14px">
        <div class="g-${gradeOf(s.potential.mean)}"><b>${Math.round(s.potential.mean)}</b><span>Expected at +15</span></div>
        <div class="g-${gradeOf(s.potential.best)}"><b>${Math.round(s.potential.best)}</b><span>Best case</span></div>
        <div><b>${Math.round(s.potential.pA * 100)}%</b><span>Chance of A+</span></div>
      </div>` : ''}
    </div>

    <div class="verdict rise" style="--i:2">
      <span class="tag ${({ keep: 'ok', level: 'ok', usable: 'info', maybe: 'warn', replace: 'bad', fodder: 'bad' })[v.key] || ''}" style="height:28px;padding:0 12px;font-size:12.5px">${v.title}</span>
      <div><p style="margin:0">${v.text}</p></div>
    </div>

    <div class="rise" style="--i:3">
      <div class="main-stat"><span>${STAT_LABEL[relic.main.stat]}</span><b>${fmtStat(relic.main.stat, relic.main.value)}</b></div>
      <div class="substats" style="margin-top:6px">
        ${relic.subs.map((x) => {
          const w = s.weights[x.stat] || 0;
          return html`<div class="sub-row ${w === 0 ? 'dead' : ''} ${w >= 0.75 ? 'g-A' : w > 0 ? 'g-B' : ''}">
            <span>${STAT_LABEL[x.stat]}</span><span class="v">${fmtStat(x.stat, x.value)}</span>${pips(x)}<span class="w" title="Weight for ${charName(focus)}">×${+(b?.weights?.[x.stat] ?? 0).toFixed(2)}</span>
          </div>`;
        })}
      </div>
    </div>

    <div class="rise" style="--i:4">
      <div class="card-head" style="margin-bottom:8px"><h3>Best owners</h3><span class="faint" style="font-size:12px">tap to rescore</span></div>
      <div class="owners">
        ${rows.map((r) => html`<div class="owner ${r.buildKey === focus ? 'sel' : ''}" data-focus="${r.buildKey}">
          ${avatar(r.buildKey, { size: 34, owned: r.owned })}
          <span class="nm"><b>${charName(r.buildKey)}${r.buildKey === relic.owner ? ' · wearing' : ''}</b>
            <span>${roleTag(r.buildKey)}${r.mainFit < 0.75 ? html`<span class="tag bad">wrong main</span>` : ''}${r.setFit < 0.9 ? html`<span class="tag warn">off-set</span>` : ''}
            <a class="ext" href="${prydwenUrl(r.buildKey)}" target="_blank" rel="noopener">Prydwen ${icon('ext')}</a></span></span>
          ${bar(r.fit, r.fitGrade)}
          <span class="pct g-${r.fitGrade}">${Math.round(r.fit)}</span>
        </div>`)}
      </div>
    </div>
    <p class="faint rise" style="--i:5;font-size:12px;margin:0">Scores use per-character stat weights, main stats and sets from the Fribbels HSR Optimizer.
      100 = a perfect relic. ${wearer ? '' : html`This relic is worn by ${relic.owner ? charName(relic.owner) : 'nobody in your showcase'}.`}</p>
  `;
}

