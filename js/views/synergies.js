import { html, icon, img } from '../ui.js';
import { state, go } from '../state.js';
import { charName, charPreview, buildOf, rankableBuilds } from '../data.js';
import { avatar, roleTag, charMeta, enhancedTag } from '../components.js';
import { pickerHtml, wirePicker, resolveKey } from './picker.js';

const base = (k) => String(k).split('b')[0];

/** All teams in the data: [{ anchor, members: [anchor, ...mates] }]. */
function allTeams() {
  const out = [];
  for (const key of rankableBuilds(state.owned)) {
    const b = buildOf(key);
    (b?.teams || []).forEach((mates, i) => out.push({ anchor: key, members: [key, ...mates.slice(0, 3)], idx: i }));
  }
  return out;
}

export function renderSynergies(root, arg) {
  const key = resolveKey(arg);
  const me = base(key);
  const ownedBase = new Set([...state.owned].map(base));
  const teams = allTeams();
  const own = teams.filter((t) => t.anchor === key || base(t.anchor) === me);
  const featured = teams.filter((t) => base(t.anchor) !== me && t.members.some((m) => base(m) === me));
  const partners = new Map();
  for (const t of [...own, ...featured]) {
    for (const m of t.members) if (base(m) !== me) partners.set(base(m), (partners.get(base(m)) || 0) + 1);
  }
  const topPartners = [...partners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  const fieldable = state.profile
    ? teams.map((t) => ({ ...t, have: t.members.filter((m) => ownedBase.has(base(m))).length }))
      .filter((t) => t.have >= 3).sort((a, b) => b.have - a.have).slice(0, 6)
    : [];

  root.innerHTML = String(html`<div class="split">
    ${pickerHtml(key)}
    <div class="stack" style="gap:14px">
      <section class="card spot" style="padding:24px">
        <span class="eyebrow">Synergies</span>
        <div class="row" style="gap:16px;margin-top:10px">${avatar(key, { size: 64 })}
          <div class="grow"><h2 class="title"><em>${charName(key)}</em></h2>
            <div class="row" style="gap:8px;margin-top:8px">${charMeta(key)}${roleTag(key)}${enhancedTag(key)}</div></div>
          <a class="btn sm" href="#/builds/${key}">Build ${icon('arrow')}</a>
        </div>
      </section>

      <section class="card spot">
        <div class="card-head"><h3>Recommended teams</h3><span class="faint" style="font-size:12px">from optimizer simulations</span></div>
        ${own.length ? html`<div class="stack" style="gap:22px" data-stagger>${own.map((t, i) => teamRow(t, me, ownedBase, i === 0 ? 'Simulation team' : 'Leaderboard team'))}</div>`
          : html`<p class="muted" style="margin:0;font-size:13.5px">No team data for ${charName(key)} yet${featured.length ? ', but they appear in the teams below' : ''}.</p>`}
      </section>

      ${topPartners.length ? html`<section class="card spot">
        <div class="card-head"><h3>Frequent partners</h3><span class="faint" style="font-size:12px">shared recommended teams</span></div>
        <div class="partners" data-stagger>${topPartners.map(([id, n]) => html`<a class="partner" href="#/synergies/${id}">${avatar(id, { size: 28, owned: ownedBase.has(id) })}<span>${charName(id)}</span><span class="mono">×${n}</span></a>`)}</div>
      </section>` : ''}

      ${featured.length ? html`<section class="card spot">
        <div class="card-head"><h3>Also slots into</h3><span class="faint" style="font-size:12px">teams built around other characters</span></div>
        <div class="stack" style="gap:22px" data-stagger>${featured.slice(0, 6).map((t) => teamRow(t, me, ownedBase, `${charName(t.anchor)}'s team`))}</div>
      </section>` : ''}

      ${state.profile ? html`<section class="card spot">
        <div class="card-head"><h3>Teams you can field</h3><span class="faint" style="font-size:12px">3 or 4 members in your showcase</span></div>
        ${fieldable.length ? html`<div class="stack" style="gap:22px" data-stagger>${fieldable.map((t) => teamRow(t, me, ownedBase, `${charName(t.anchor)} · ${t.have}/4 owned`))}</div>`
          : html`<p class="muted" style="margin:0;font-size:13.5px">None of the recommended teams have 3+ members in your showcase. Showcase only shows 8 characters, so you may own more.</p>`}
      </section>` : ''}
    </div>
  </div>`);
  wirePicker(root, key, 'synergies');
  root.querySelectorAll('[data-member]').forEach((el) => el.addEventListener('click', () => go('#/synergies/' + el.dataset.member)));
}

function teamRow(t, me, ownedBase, label) {
  const have = t.members.filter((m) => ownedBase.has(base(m))).length;
  return html`<div>
    <div class="row" style="justify-content:space-between;margin-bottom:10px">
      <span class="eyebrow">${label}</span>
      ${state.profile ? html`<span class="tag ${have === 4 ? 'ok' : have >= 3 ? 'info' : ''}">${have}/4 in showcase</span>` : ''}
    </div>
    <div class="team">${t.members.map((m) => {
      const has = ownedBase.has(base(m));
      return html`<button class="member ${base(m) === me ? 'self' : ''} ${state.profile && !has ? 'missing' : ''}" data-member="${m}" style="background:none;border:0;padding:0;color:inherit">
        <span class="art">${img(charPreview(m), { alt: '' })}</span>
        <b>${charName(m)}</b>${roleTag(m)}
      </button>`;
    })}</div>
  </div>`;
}

