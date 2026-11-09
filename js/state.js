// App-wide state shared by views.
import { store } from './store.js';

export const state = {
  profile: null, // normalized Enka profile
  owned: new Set(), // build keys of characters in the showcase
  scans: store.get('scans') || [], // relics captured by the scanner
};

export function setProfile(p) {
  state.profile = p;
  state.owned = new Set((p?.characters || []).map((c) => c.build));
}

export function saveScans() { store.set('scans', state.scans); }

let renderFn = null;
export const onRender = (fn) => { renderFn = fn; };
export const rerender = () => renderFn?.();
export function go(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}
