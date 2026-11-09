// User actions shared across views (loading profiles, header chip).
import { fetchProfile, loadDemoProfile, validUid } from './enka.js';
import { setProfile, state, go } from './state.js';
import { html, img, icon, toast, setLoading, $ } from './ui.js';
import { charIcon } from './data.js';
import { store } from './store.js';

export async function loadUid(uid, { force = false, btn = null, field = null, navigate = true } = {}) {
  uid = String(uid || '').replace(/\s+/g, '');
  if (!validUid(uid)) {
    field?.classList.remove('invalid');
    void field?.offsetWidth;
    field?.classList.add('invalid');
    toast('Enter a 9-digit HSR UID.', { err: true });
    return false;
  }
  setLoading(btn, true);
  try {
    const p = await fetchProfile(uid, { force });
    setProfile(p);
    updateUidChip();
    if (!p.characters.length) toast('Profile found, but no characters are in its showcase. Add some in game, then refresh.', { err: true, ms: 6000 });
    else if (p.stale) toast('Showing the last saved copy. Enka could not be reached.', { err: true });
    if (navigate) go('#/relics');
    return true;
  } catch (e) {
    toast(e.message, { err: true, ms: 7000 });
    return false;
  } finally {
    setLoading(btn, false);
  }
}

export async function loadDemo() {
  const p = await loadDemoProfile();
  setProfile(p);
  store.set('lastUid', 'demo');
  updateUidChip();
  go('#/relics');
}

export function updateUidChip() {
  const chip = $('#uidChip');
  const p = state.profile;
  if (!p) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.innerHTML = String(html`${img(charIcon(p.characters[0]?.id), { alt: '' })}<span class="nick">${p.nickname}</span><span class="mono">${p.demo ? 'demo' : p.uid}</span>`);
}

export function uidForm({ compact = false } = {}) {
  const recent = (store.get('recent') || []).slice(0, 4);
  return html`
    <form class="uid-form" data-uid-form novalidate>
      <label class="field">
        <input name="uid" inputmode="numeric" autocomplete="off" placeholder=" " maxlength="10" value="${state.profile && !state.profile.demo ? state.profile.uid : ''}">
        <span>Your UID</span>
      </label>
      <button class="btn primary" type="submit">Analyze ${icon('arrow')}</button>
    </form>
    <div class="hint">
      ${recent.length ? html`<span>Recent</span>${recent.map((r) => html`<button class="pill" data-recent="${r.uid}">${r.nickname || r.uid}</button>`)}<span>·</span>` : ''}
      <button class="pill" data-demo>Try the demo</button>
      ${compact ? '' : html`<span>Uses your in-game showcase (the 8 characters on your profile card).</span>`}
    </div>`;
}

export function wireUidForms(root) {
  root.querySelectorAll('[data-uid-form]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      loadUid(form.uid.value, { btn: form.querySelector('button'), field: form.querySelector('.field') });
    });
  });
  root.querySelectorAll('[data-recent]').forEach((b) => b.addEventListener('click', () => loadUid(b.dataset.recent, { btn: b })));
  root.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => loadDemo()));
}
