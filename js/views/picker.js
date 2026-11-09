// Character picker rail shared by the Builds and Synergies tabs.
import { html, img } from '../ui.js';
import { D, charName, charIcon, charOf, rankableBuilds, buildOf, ROLE_LABEL } from '../data.js';
import { state, go } from '../state.js';

let query = '';
let role = 'all';

export function pickerKeys() {
  const keys = rankableBuilds(state.owned);
  const ownedBase = new Set([...state.owned].map((k) => k.split('b')[0]));
  return keys.sort((a, b) => {
    const oa = ownedBase.has(a.split('b')[0]) ? 0 : 1;
    const ob = ownedBase.has(b.split('b')[0]) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const ra = charOf(a)?.rarity || 0;
    const rb = charOf(b)?.rarity || 0;
    if (ra !== rb) return rb - ra;
    return Number(b.split('b')[0]) - Number(a.split('b')[0]); // newest first
  });
}

export function defaultKey() {
  const first = state.profile?.characters?.[0];
  if (first) return first.build;
  return D.builds['1308'] ? '1308' : pickerKeys()[0];
}

/** Resolve a route arg (base id or build key) to a build key. */
export function resolveKey(arg) {
  if (!arg) return defaultKey();
  if (D.builds[arg]) {
    // prefer the version the player owns
    const base = arg.split('b')[0];
    const owned = [...state.owned].find((k) => k.split('b')[0] === base);
    return owned && arg === base ? owned : arg;
  }
  const base = arg.split('b')[0];
  return D.builds[base] ? base : (D.builds[base + 'b1'] ? base + 'b1' : defaultKey());
}

export function pickerHtml(selected) {
  const roles = ['all', ...new Set(Object.values(D.builds).map((b) => b.role))];
  return html`<aside class="card picker">
    <input class="search" id="pickSearch" type="search" placeholder="Search characters" value="${query}" autocomplete="off" spellcheck="false" aria-label="Search characters">
    <div class="pills" id="pickRoles">${roles.map((r) => html`<button class="pill" data-role="${r}" aria-pressed="${role === r}">${r === 'all' ? 'All' : ROLE_LABEL[r] || r}</button>`)}</div>
    <div class="grid" id="pickGrid">${gridItems(selected)}</div>
  </aside>`;
}

function gridItems(selected) {
  const ownedBase = new Set([...state.owned].map((k) => k.split('b')[0]));
  const q = query.trim().toLowerCase();
  return pickerKeys()
    .filter((k) => (role === 'all' || buildOf(k)?.role === role) && (!q || charName(k).toLowerCase().includes(q)))
    .map((k) => html`<button class="pick ${ownedBase.has(k.split('b')[0]) ? 'owned' : ''}" data-pick="${k}" aria-current="${k === selected}" title="${charName(k)}">
      ${img(charIcon(k), { alt: charName(k) })}${charOf(k)?.rarity === 5 ? html`<span class="r5"></span>` : ''}</button>`);
}

export function wirePicker(root, selected, base) {
  const grid = root.querySelector('#pickGrid');
  const redraw = () => { grid.innerHTML = String(html`${gridItems(selected)}`); };
  root.querySelector('#pickSearch').addEventListener('input', (e) => { query = e.target.value; redraw(); });
  root.querySelector('#pickRoles').addEventListener('click', (e) => {
    const b = e.target.closest('[data-role]');
    if (!b) return;
    role = b.dataset.role;
    root.querySelectorAll('#pickRoles .pill').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    redraw();
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) go(`#/${base}/${b.dataset.pick}`);
  });
  requestAnimationFrame(() => grid.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
}
