// Site-wide settings. Edit `proxy` after deploying worker/ so every visitor uses it without opening Settings.
export const CONFIG = {
  // e.g. 'https://relicwise-proxy.<your-account>.workers.dev'. Empty = same origin (tools/dev_server.py locally).
  proxy: '',
  // Character art, relic icons, etc. (StarRailRes on jsDelivr, with GitHub raw as a fallback)
  assetBase: 'https://cdn.jsdelivr.net/gh/Mar-7th/StarRailRes@master/',
  assetFallback: 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/',
  // OCR engine, loaded only when the Scanner tab is used
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  prydwen: 'https://www.prydwen.gg/star-rail/characters/',
  optimizer: 'https://fribbels.github.io/hsr-optimizer',
};

export const IS_LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(location.hostname);
