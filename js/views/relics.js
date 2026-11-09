import { html, icon, ring, bar, img, hydrate, timeAgo } from '../ui.js';
import { state, go } from '../state.js';
import { uidForm, wireUidForms, loadUid } from '../actions.js';
import { charName, charPreview, charOf, elementColor, lcOf, lcIcon, setOf, setIcon } from '../data.js';
import { SLOTS, SLOT_LABEL } from '../stats.js';
import { analyzeCharacter, rankOwners, scoreRelic, GRADES } from '../scoring.js';
import { avatar, relicTile, ledgerRow, openRelic, enhancedTag, roleTag, charMeta } from '../components.js';

let slotFilter = 'all';

export function renderRelics(root) {
  const p = state.profile;
  if (!p) {
    root.innerHTML = String(html`
      <section class="section" style="margin-top:12px">
        <div class="section-head"><div><span class="eyebrow">Relics</span><h2 class="title" style="margin-top:8px">Start with a <em>UID</em></h2></div></div>
        <div class="card" style="padding:24px;display:grid;gap:14px;max-width:640px">${uidForm({ compact: true })}</div>
      </section>
      ${scansSection()}`);
    wireUidForms(root);
    wireLedger(root, allRelicsIndex());
    return;
  }

  const analyses = p.characters.map((ch) => ({ ch, a: analyzeCharacter(ch) }));
  const relics = p.characters.flatMap((ch) => ch.relics);
  const scored = relics.map((r) => ({ r, s: scoreRelic(r, r.owner) }));
  const avg = scored.length ? scored.reduce((a, x) => a + x.s.fit, 0) / scored.length : 0;
  const dist = GRADES.map(([g]) => ({ g, n: scored.filter((x) => x.s.fitGrade === g).length }));
  const maxN = Math.max(1, ...dist.map((d) => d.n));
  const best = [...scored].sort((a, b) => b.s.fit - a.s.fit)[0];

  root.innerHTML = String(html`
    <section class="bento" data-stagger>
      <div class="card spot span-7">
        <div class="profile">
          <div class="best-stack" style="--s:52px">${p.characters.slice(0, 4).map((c) => avatar(c.id, { size: 52 }))}</div>
          <div class="who grow">
            <span class="eyebrow">${p.demo ? 'Demo profile' : 'UID ' + p.uid}</span>
            <h2 style="margin-top:6px">${p.nickname}</h2>
          </div>
          ${p.demo ? '' : html`<button class="btn sm" id="refreshBtn" title="Fetch the latest showcase">${icon('refresh')} Refresh</button>`}
        </div>
        ${p.signature ? html`<p class="muted" style="margin:12px 0 0;font-size:13.5px">“${p.signature}”</p>` : ''}
        <div class="stats-inline">
          <div class="stat-mini"><b data-count="${p.level}">0</b><span>Trailblaze level</span></div>
          ${p.worldLevel != null ? html`<div class="stat-mini"><b>${p.worldLevel}</b><span>Equilibrium</span></div>` : ''}
          ${p.avatarCount != null ? html`<div class="stat-mini"><b data-count="${p.avatarCount}">0</b><span>Characters</span></div>` : ''}
          ${p.achievementCount != null ? html`<div class="stat-mini"><b data-count="${p.achievementCount}">0</b><span>Achievements</span></div>` : ''}
          <div class="stat-mini"><b data-count="${relics.length}">0</b><span>Relics analysed</span></div>
        </div>
        <p class="faint" style="font-size:12px;margin:14px 0 0">${p.demo ? 'Anonymised sample showcase.' : `Updated ${timeAgo(p.fetchedAt)}${p.stale ? ' (offline copy)' : ''}.`}</p>
      </div>
      <div class="card spot span-5">
        <div class="card-head"><h3>Showcase relic grades</h3><span class="faint" style="font-size:12px">for their wearers</span></div>
        <div class="row" style="gap:20px;align-items:center">
          ${ring(avg, { size: 96, stroke: 7, grade: gradeOfAvg(avg), label: 'AVG' })}
          <div class="dist grow">
            ${dist.map((d) => html`<div class="dist-row g-${d.g}"><span class="grade">${d.g}</span>${bar((d.n / maxN) * 100, d.g)}<span class="mono faint">${d.n}</span></div>`)}
          </div>
        </div>
        ${best ? html`<p class="muted" style="font-size:12.5px;margin:14px 0 0">Best piece: <b style="color:var(--text)">${charName(best.r.owner)}'s ${SLOT_LABEL[best.r.slot].toLowerCase()}</b> (${Math.round(best.s.fit)}).</p>` : ''}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><span class="eyebrow">Showcase</span><h2 class="title" style="margin-top:8px">Your <em>characters</em></h2></div>
        <span class="faint" style="font-size:12.5px">Tap a relic for its full breakdown · <span class="tag bad" style="height:18px">fix</span> marks each build's weakest slot</span>
      </div>
      <div class="chars" data-stagger>
        ${analyses.map(({ ch, a }) => charCard(ch, a))}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><span class="eyebrow">Ledger</span><h2 class="title" style="margin-top:8px">Every relic, <em>ranked</em></h2></div>
        <div class="pills" id="slotPills">
          ${['all', ...SLOTS].map((sl) => html`<button class="pill" data-slot="${sl}" aria-pressed="${slotFilter === sl}">${sl === 'all' ? 'All' : SLOT_LABEL[sl]}</button>`)}
        </div>
      </div>
      <div class="ledger" id="ledger"></div>
    </section>
    ${scansSection()}
  `);

  const index = allRelicsIndex();
  const drawLedger = () => {
    const rows = scored
      .filter((x) => slotFilter === 'all' || x.r.slot === slotFilter)
      .sort((a, b) => b.s.fit - a.s.fit)
      .map((x) => ledgerRow(x.r, x.s, rankOwners(x.r, state.owned, 4)));
    const el = root.querySelector('#ledger');
    el.innerHTML = String(html`${rows}`);
    el.setAttribute('data-stagger', '');
    hydrate(el);
  };
  drawLedger();
  root.querySelector('#slotPills').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    slotFilter = b.dataset.slot;
    root.querySelectorAll('#slotPills .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    drawLedger();
  });
  root.querySelector('#refreshBtn')?.addEventListener('click', (e) => loadUid(p.uid, { force: true, btn: e.currentTarget, navigate: false }).then((ok) => ok && go('#/relics')));
  root.querySelectorAll('[data-char-go]').forEach((el) => el.addEventListener('click', () => go('#/builds/' + el.dataset.charGo)));
  wireLedger(root, index);
}

const gradeOfAvg = (v) => GRADES.find(([, t]) => v >= t)[0];

function charCard(ch, a) {
  const c = charOf(ch.id);
  const lc = ch.lightCone && lcOf(ch.lightCone.id);
  const weakSlot = a.weakest && !a.weakest.missing ? a.weakest.slot : null;
  return html`<article class="card spot char-card">
    <div class="char-art" style="--ec:${elementColor(c.element)}">${img(charPreview(ch.id), { alt: '' })}<span class="elem-glow"></span></div>
    <div class="char-body">
      <div class="char-top">
        <div class="grow">
          <h3><a href="#/builds/${ch.build}" title="Open build guide">${charName(ch.id)}</a>${enhancedTag(ch.build)}<span class="tag mono">E${ch.eidolon}</span></h3>
          <div class="sub"><span>Lv. ${ch.level}</span>${charMeta(ch.id)}${roleTag(ch.build)}</div>
        </div>
        ${ring(a.score, { size: 58, stroke: 5, grade: a.grade, label: a.grade })}
      </div>
      ${lc ? html`<div class="lc">${img(lcIcon(ch.lightCone.id), { alt: '' })}<span>${lc.name} · S${ch.lightCone.superimposition}</span></div>` : ''}
      <div class="sets-line">
        ${a.sets.map((s) => html`<span class="tag ${s.recommended ? 'ok' : 'warn'}" title="${s.recommended ? 'Recommended for this character' : 'Not in the recommended sets'}">${img(setIcon(s.id), { alt: '' })}${s.n}pc ${shortSet(setOf(s.id)?.name)}</span>`)}
        ${a.sets.length ? '' : html`<span class="tag warn">No set bonus</span>`}
      </div>
      ${a.spd != null ? html`<div class="spd-chip">${icon('bolt', 'width="14" height="14"')} SPD ≈ <b>${a.spd.toFixed(1)}</b>
        ${a.next ? html`<span class="faint">· next tier ${a.next.spd.toFixed(1)} (+${gap(a.next.spd - a.spd)}): ${a.next.actions} actions in the first ${a.next.cycles > 1 ? a.next.cycles + ' cycles' : 'cycle'}</span>` : ''}</div>` : ''}
      <div class="relic-row">
        ${SLOTS.map((sl) => {
          const e = a.bySlot[sl];
          return e ? relicTile(e.relic, e.s, { weak: sl === weakSlot && e.s.fit < 65 }) : relicTile(null);
        })}
      </div>
    </div>
  </article>`;
}

const gap = (d) => (d < 1 ? Math.max(0.01, d).toFixed(2) : d.toFixed(1));
const shortSet = (name = '') => name.replace(/^(The |As )/, '').split(/[ ,:]/)[0];

function allRelicsIndex() {
  const map = new Map();
  for (const ch of state.profile?.characters || []) for (const r of ch.relics) map.set(r.key, r);
  for (const r of state.scans) map.set(r.key, r);
  return map;
}

function wireLedger(root, index) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-relic]');
    if (!el) return;
    const r = index.get(el.dataset.relic);
    if (r) openRelic(r);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target.closest('.ledger-row[data-relic]');
    const r = el && index.get(el.dataset.relic);
    if (r) openRelic(r);
  });
}

function scansSection() {
  if (!state.scans.length) return '';
  const rows = state.scans.map((r) => {
    const top = rankOwners(r, state.owned, 4);
    return ledgerRow(r, top[0], top);
  });
  return html`<section class="section">
    <div class="section-head"><div><span class="eyebrow">Scanner</span><h2 class="title" style="margin-top:8px">Scanned <em>relics</em></h2></div>
      <a class="btn sm" href="#/scan">${icon('scan')} Open scanner</a></div>
    <div class="ledger" data-stagger>${rows}</div>
    <p class="faint" style="font-size:12px">Scanned relics are scored for their best owner.</p>
  </section>`;
}

