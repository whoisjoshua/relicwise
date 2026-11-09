// localStorage wrapper that never throws (private mode, blocked storage, quota) and namespaces keys.
const P = 'rw:';
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(P + key);
      if (v == null) return fallback;
      return v[0] === '{' || v[0] === '[' || v[0] === '"' ? JSON.parse(v) : v;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try {
      localStorage.setItem(P + key, typeof value === 'string' ? value : JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  },
  del(key) { try { localStorage.removeItem(P + key); } catch (e) { /* ignore */ } },
  keys(prefix = '') {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith(P + prefix)).map((k) => k.slice(P.length));
    } catch (e) { return []; }
  },
};
