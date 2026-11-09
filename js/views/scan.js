import { html, icon, toast, hydrate } from '../ui.js';
import { state, saveScans } from '../state.js';
import { ensureOcr, ocrReady, scanFrame, unchanged, resetScanner, currentRoi } from '../ocr.js';
import { rankOwners } from '../scoring.js';
import { charName } from '../data.js';
import { SLOT_LABEL } from '../stats.js';
import { ledgerRow, openRelic } from '../components.js';

let stream = null;
let timer = null;
let busy = false;
let video = null;
let rootRef = null;

export function teardownScan() {
  stopShare();
}

export function renderScan(root) {
  rootRef = root;
  const canShare = !!navigator.mediaDevices?.getDisplayMedia;
  root.innerHTML = String(html`
    <section class="section" style="margin-top:6px">
      <div class="section-head">
        <div><span class="eyebrow">Scanner · beta</span><h2 class="title" style="margin-top:8px">Scan relics from your <em>screen</em></h2></div>
        <span class="faint" style="font-size:12.5px;max-width:420px">Runs entirely in your browser. Your screen never leaves this device.</span>
      </div>
      <div class="bento">
        <div class="card span-8" style="padding:14px">
          <div class="scan-stage" id="stage">
            <div class="scan-empty" id="stageEmpty">
              ${icon('monitor')}
              <b style="color:var(--text)">Share the game window, then click through your relics</b>
              <span style="font-size:13px">Inventory → Relics, or a character's relic page. Any resolution, windowed or full screen.</span>
            </div>
          </div>
          <div class="row" style="margin-top:12px">
            ${canShare ? html`<button class="btn primary" id="shareBtn">${icon('play')} Share screen</button>` : html`<span class="tag warn">Screen sharing isn't available in this browser. Upload screenshots instead.</span>`}
            <label class="btn" for="shotInput">${icon('upload')} Screenshots</label>
            <input type="file" id="shotInput" accept="image/*" multiple hidden>
            <div class="scan-status grow"><span class="dot" id="scanDot"></span><span id="scanMsg">${ocrReady() ? 'OCR ready' : 'OCR engine loads on first use (~4 MB)'}</span></div>
          </div>
          <div class="progress" id="ocrProg" hidden style="margin-top:10px"><i></i></div>
        </div>
        <div class="card span-4 how">
          <h3 style="margin-bottom:6px">How it works</h3>
          <ol>
            <li>Finds the relic by reading its <b>name</b>. Each piece name belongs to exactly one set and slot, so no pixel positions or templates are needed.</li>
            <li>Reads the main stat and substats under the name, sized relative to the detected text.</li>
            <li>Checks every number against the game's roll table to recover roll counts and catch misreads.</li>
            <li>Scores it for every character instantly.</li>
          </ol>
          <p class="faint" style="font-size:12px;margin:10px 0 0">Set the game to English. If a value looks off, open the relic again; duplicates are merged.</p>
          <div class="dropzone" id="drop" style="margin-top:12px">Drop screenshots here</div>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="section-head">
        <div><span class="eyebrow">Captured</span><h2 class="title" style="margin-top:8px"><span id="scanCount">${state.scans.length}</span> scanned <em>relics</em></h2></div>
        <div class="row">
          <button class="btn sm" id="exportScans" ${state.scans.length ? '' : 'disabled'}>${icon('download')} Export</button>
          <button class="btn sm ghost" id="clearScansBtn" ${state.scans.length ? '' : 'disabled'}>${icon('trash')} Clear</button>
        </div>
      </div>
      <div class="ledger" id="scanList"></div>
    </section>
  `);
  drawList();

  const $ = (s) => root.querySelector(s);
  $('#shareBtn')?.addEventListener('click', () => (stream ? stopShare() : startShare()));
  $('#shotInput').addEventListener('change', (e) => scanFiles([...e.target.files]));
  const drop = $('#drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); scanFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); });
  drop.addEventListener('click', () => $('#shotInput').click());
  $('#clearScansBtn').addEventListener('click', () => { state.scans = []; saveScans(); drawList(); });
  $('#exportScans').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ source: 'relicwise', version: 1, relics: state.scans }, null, 1)], { type: 'application/json' }));
    a.download = 'relicwise-scanned-relics.json';
    a.click();
  });
  $('#scanList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); state.scans = state.scans.filter((r) => r.key !== del.dataset.del); saveScans(); drawList(); return; }
    const row = e.target.closest('[data-relic]');
    const r = row && state.scans.find((x) => x.key === row.dataset.relic);
    if (r) openRelic(r, rankOwners(r, state.owned, 1)[0]?.buildKey);
  });
  if (stream) attachVideo();
}

function status(msg, mode = '') {
  const m = rootRef?.querySelector('#scanMsg');
  const d = rootRef?.querySelector('#scanDot');
  if (m) m.textContent = msg;
  if (d) d.className = 'dot ' + mode;
}

async function boot() {
  if (ocrReady()) return;
  const prog = rootRef.querySelector('#ocrProg');
  prog.hidden = false;
  status('Loading OCR engine…', 'busy');
  await ensureOcr((m) => {
    const bar = rootRef?.querySelector('#ocrProg i');
    if (bar) bar.style.width = Math.round(m.progress * 100) + '%';
    status(`${m.status[0].toUpperCase()}${m.status.slice(1)}…`, 'busy');
  });
  prog.hidden = true;
}

async function startShare() {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
  } catch (e) {
    stream = null;
    if (e.name !== 'NotAllowedError') toast('Screen sharing failed: ' + e.message, { err: true });
    return;
  }
  stream.getVideoTracks()[0].addEventListener('ended', stopShare);
  resetScanner();
  attachVideo();
  try { await boot(); } catch (e) { toast(e.message, { err: true }); stopShare(); return; }
  status('Watching for relics…', 'live');
  loop();
}

function attachVideo() {
  const stage = rootRef.querySelector('#stage');
  rootRef.querySelector('#stageEmpty')?.remove();
  if (!video) {
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
  }
  video.srcObject = stream;
  video.play().catch(() => {});
  stage.prepend(video);
  let roi = stage.querySelector('.roi');
  if (!roi) { roi = document.createElement('div'); roi.className = 'roi'; roi.hidden = true; stage.appendChild(roi); }
  const btn = rootRef.querySelector('#shareBtn');
  if (btn) btn.innerHTML = String(html`${icon('stop')} Stop sharing`);
}

function stopShare() {
  clearTimeout(timer);
  timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) { video.srcObject = null; video.remove(); }
  const btn = rootRef?.querySelector('#shareBtn');
  if (btn) btn.innerHTML = String(html`${icon('play')} Share screen`);
  rootRef?.querySelector('.roi')?.setAttribute('hidden', '');
  status(ocrReady() ? 'Stopped' : 'OCR engine loads on first use (~4 MB)');
}

async function loop() {
  if (!stream) return;
  if (!busy && video.videoWidth && document.visibilityState === 'visible') {
    const W = video.videoWidth;
    const H = video.videoHeight;
    if (!unchanged(video, W, H)) {
      busy = true;
      status('Reading…', 'busy');
      try {
        const res = await scanFrame(video, W, H);
        handle(res);
      } catch (e) {
        status('OCR error: ' + e.message);
      }
      busy = false;
      if (stream) status(lastMsg || 'Watching for relics…', 'live');
    }
  }
  timer = setTimeout(loop, 700);
}

let lastMsg = '';
function handle(res, quiet = false) {
  drawRoi(res.roi || currentRoi());
  if (res.miss) { lastMsg = res.miss; return false; }
  const r = res.relic;
  r.scannedAt = Date.now();
  const dup = state.scans.findIndex((x) => x.key === r.key);
  if (dup >= 0) { lastMsg = `Already have ${r.name} · move to the next relic`; return false; }
  // Same physical relic seen at a different level: replace the older read
  const sameish = state.scans.findIndex((x) => x.name === r.name && x.main.stat === r.main.stat && x.subs.map((s) => s.stat).join() === r.subs.map((s) => s.stat).join());
  if (sameish >= 0 && state.scans[sameish].level <= r.level) state.scans.splice(sameish, 1);
  state.scans.unshift(r);
  saveScans();
  const best = rankOwners(r, state.owned, 1)[0];
  lastMsg = `Captured ${r.name} (${SLOT_LABEL[r.slot]})${best ? ` · best for ${charName(best.buildKey)} ${Math.round(best.fit)}` : ''}${res.issues.length ? ' · check values' : ''}`;
  if (!quiet) toast(lastMsg);
  drawList();
  return true;
}

function drawRoi(roi) {
  const stage = rootRef?.querySelector('#stage');
  const box = stage?.querySelector('.roi');
  if (!box || !video?.videoWidth) return;
  if (!roi) { box.hidden = true; return; }
  // account for object-fit: contain letterboxing
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  const k = Math.min(sw / video.videoWidth, sh / video.videoHeight);
  const dw = video.videoWidth * k;
  const dh = video.videoHeight * k;
  const ox = (sw - dw) / 2;
  const oy = (sh - dh) / 2;
  box.hidden = false;
  Object.assign(box.style, { left: `${ox + roi.x * dw}px`, top: `${oy + roi.y * dh}px`, width: `${roi.w * dw}px`, height: `${roi.h * dh}px` });
}

async function scanFiles(files) {
  if (!files.length) return;
  try { await boot(); } catch (e) { toast(e.message, { err: true }); return; }
  let got = 0;
  for (const [i, f] of files.entries()) {
    status(`Reading screenshot ${i + 1} of ${files.length}…`, 'busy');
    try {
      const bmp = await createImageBitmap(f);
      resetScanner();
      const res = await scanFrame(bmp, bmp.width, bmp.height);
      if (handle(res, true)) got += 1;
      else if (res.miss) toast(`${f.name}: ${res.miss}`, { err: true });
    } catch (e) {
      toast(`${f.name}: ${e.message}`, { err: true });
    }
  }
  status(`Captured ${got} of ${files.length}`, '');
  if (got) toast(`Captured ${got} relic${got > 1 ? 's' : ''}`);
}

function drawList() {
  const list = rootRef?.querySelector('#scanList');
  if (!list) return;
  rootRef.querySelector('#scanCount').textContent = state.scans.length;
  rootRef.querySelector('#exportScans').disabled = !state.scans.length;
  rootRef.querySelector('#clearScansBtn').disabled = !state.scans.length;
  if (!state.scans.length) {
    list.innerHTML = String(html`<div class="empty card"><h3>Nothing scanned yet</h3><span>Captured relics appear here with their best owners.</span></div>`);
    return;
  }
  list.innerHTML = String(html`${state.scans.map((r) => {
    const top = rankOwners(r, state.owned, 4);
    return html`<div class="row" style="flex-wrap:nowrap;gap:8px"><div class="grow">${ledgerRow(r, top[0], top)}</div><button class="icon-btn" data-del="${r.key}" aria-label="Remove ${r.name}" style="width:32px;height:32px;flex:none">${icon('x')}</button></div>`;
  })}`);
  list.setAttribute('data-stagger', '');
  hydrate(list);
}
