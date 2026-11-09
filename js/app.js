// Boot, routing, header controls and settings.
import { loadData, D } from './data.js';
import { html, icon, hydrate, toast, closeDrawer, reducedMotion, $, $$ } from './ui.js';
import { state, setProfile, onRender } from './state.js';
import { store } from './store.js';
import { normalizeProfile, loadDemoProfile } from './enka.js';
import { updateUidChip, loadDemo } from './actions.js';
import { drawerClick } from './components.js';
import { proxyBase } from './net.js';
import { renderHome } from './views/home.js';
import { renderRelics } from './views/relics.js';
import { renderBuilds } from './views/builds.js';
import { renderSynergies } from './views/synergies.js';
import { renderWarps } from './views/warps.js';
import { renderScan, teardownScan } from './views/scan.js';

const TABS = [
  ['relics', 'Relics', 'relics'],
  ['builds', 'Builds', 'builds'],
  ['synergies', 'Synergies', 'synergy'],
  ['warps', 'Warps', 'warps'],
  ['scan', 'Scanner', 'scan'],
];
const VIEWS = {
  '': renderHome, relics: renderRelics, builds: renderBuilds, synergies: renderSynergies, warps: renderWarps, scan: renderScan,
  demo: () => { loadDemo(); }, // shareable link: #/demo loads the sample showcase
};
const TITLES = { '': 'relicwise', relics: 'Relics', builds: 'Builds', synergies: 'Synergies', warps: 'Warps', scan: 'Scanner' };

const viewEl = $('#view');
let currentName = null;

function route() {
  const [name = '', arg = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: VIEWS[name] ? name : '', arg: decodeURIComponent(arg) };
}

function render() {
  const { name, arg } = route();
  if (currentName === 'scan' && name !== 'scan') teardownScan();
  const first = currentName === null;
  const changed = name !== currentName;
  currentName = name;
  closeDrawer();
  const draw = () => {
    const page = document.createElement('div');
    viewEl.replaceChildren(page);
    VIEWS[name](page, arg);
    hydrate(page);
    updateTabs(name);
    document.title = name ? `${TITLES[name]} · relicwise` : 'relicwise · HSR relic intelligence';
  };
  if (changed && !first && document.startViewTransition && !reducedMotion() && document.visibilityState === 'visible') {
    // Safety net: if the browser never runs the transition callback, render anyway.
    let done = false;
    const once = () => { if (!done) { done = true; draw(); } };
    try { document.startViewTransition(once); } catch (e) { once(); }
    setTimeout(once, 450);
  } else {
    draw();
    if (changed && !reducedMotion()) { viewEl.classList.remove('enter'); void viewEl.offsetWidth; viewEl.classList.add('enter'); }
  }
  if (changed) window.scrollTo(0, 0);
}
onRender(render);

function buildTabs() {
  const nav = $('#tabs');
  nav.insertAdjacentHTML('beforeend', String(html`${TABS.map(([k, label, ic]) => html`<a class="tab" href="#/${k}" data-tab="${k}">${icon(ic)}<span class="lbl">${label}</span></a>`)}`));
}
function updateTabs(name) {
  const ind = $('.tab-ind');
  let active = null;
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.toggleAttribute('aria-current', false);
    if (on) { t.setAttribute('aria-current', 'page'); active = t; }
  });
  if (!active) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '1';
  ind.style.width = active.offsetWidth + 'px';
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}
window.addEventListener('resize', () => updateTabs(currentName));

// ---------------------------------------------------------------- theme
function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function paintThemeBtn() {
  $('#themeBtn').innerHTML = String(icon(effectiveTheme() === 'dark' ? 'sun' : 'moon'));
  document.querySelector('meta[name="theme-color"]').content = effectiveTheme() === 'dark' ? '#08080a' : '#f6f5f1';
}
$('#themeBtn').addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  const apply = () => { document.documentElement.dataset.theme = next; store.set('theme', next); paintThemeBtn(); };
  if (document.startViewTransition && !reducedMotion()) document.startViewTransition(apply).finished.then(() => render());
  else { apply(); render(); }
});

// ---------------------------------------------------------------- settings
const dlg = $('#settingsDlg');
$('#settingsBtn').innerHTML = String(icon('gear'));
$('#settingsClose').innerHTML = String(icon('x'));
$('#drawerClose').innerHTML = String(icon('x'));
$('#settingsBtn').addEventListener('click', () => {
  $('#proxyInput').value = store.get('proxy') || '';
  $('#proxyMsg').textContent = proxyBase() === null ? 'No proxy configured yet.' : `Using: ${proxyBase() || 'this site (/api)'}`;
  dlg.showModal();
});
$('#proxySave').addEventListener('click', () => {
  const v = $('#proxyInput').value.trim();
  if (v && !/^https?:\/\//.test(v)) { $('#proxyMsg').textContent = 'Use a full URL starting with https://'; return; }
  if (v) store.set('proxy', v); else store.del('proxy');
  $('#proxyMsg').textContent = 'Saved.';
  toast('Proxy saved');
});
$('#proxyTest').addEventListener('click', async () => {
  const v = $('#proxyInput').value.trim().replace(/\/+$/, '');
  const base = v || proxyBase();
  if (base === null) { $('#proxyMsg').textContent = 'Enter a URL first.'; return; }
  $('#proxyMsg').textContent = 'Testing…';
  try {
    const r = await fetch(base + '/api/health');
    const j = await r.json();
    $('#proxyMsg').textContent = j.ok ? 'Connected ✓' : 'Reached, but it did not look like the relicwise proxy.';
  } catch (e) {
    $('#proxyMsg').textContent = 'Could not reach it. Check the URL and the ALLOWED_ORIGINS setting.';
  }
});
$('#clearProfiles').addEventListener('click', () => {
  store.keys('profile:').forEach((k) => store.del(k));
  store.del('recent');
  store.del('lastUid');
  setProfile(null);
  updateUidChip();
  toast('Profiles forgotten');
  render();
});
$('#clearWarps').addEventListener('click', () => {
  store.keys('warps').forEach((k) => store.del(k));
  toast('Warp history deleted');
  location.reload();
});
$('#clearScans').addEventListener('click', () => {
  state.scans = [];
  store.del('scans');
  toast('Scanned relics deleted');
  render();
});

// ---------------------------------------------------------------- drawer + header
$('#scrim').addEventListener('click', closeDrawer);
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerBody').addEventListener('click', drawerClick);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
$('#uidChip').addEventListener('click', () => { location.hash = '#/relics'; });

// ---------------------------------------------------------------- boot
async function boot() {
  buildTabs();
  paintThemeBtn();
  viewEl.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  try {
    await loadData();
  } catch (e) {
    viewEl.innerHTML = String(html`<div class="callout err"><b>Couldn't load game data.</b> ${e.message}. If you opened index.html directly, serve the folder instead (see README).</div>`);
    return;
  }
  // Restore the last profile from cache without hitting the network
  const last = store.get('lastUid');
  if (last === 'demo') setProfile(await loadDemoProfile());
  else if (last) {
    const cached = store.get('profile:' + last);
    if (cached?.raw) {
      try { setProfile(normalizeProfile(cached.raw, { fetchedAt: cached.fetchedAt })); } catch (e) { /* stale cache shape: ignore */ }
    }
  }
  updateUidChip();
  window.addEventListener('hashchange', render);
  render();
  console.info(`relicwise · ${Object.keys(D.builds).length} builds · data ${D.meta?.generated || ''}`);
}
boot();
