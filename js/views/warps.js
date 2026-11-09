import { html, icon, ring, img, hydrate, toast, setLoading, reducedMotion } from '../ui.js';
import { store } from '../store.js';
import { charIcon, lcIcon, D } from '../data.js';
import {
  BANNERS, BANNER_ORDER, analyze, fetchHistory, parseImport, toUIGF, mergeRecords, demoHistory, expectedPity,
} from '../warps.js';

let charts = [];
let current = null; // { uid, tz, records, demo }

function loadStored() {
  const uid = store.get('warpsLast');
  if (!uid) return null;
  const d = store.get('warps:' + uid);
  return d?.records?.length ? d : null;
}

export function renderWarps(root, arg) {
  charts.forEach((c) => c.destroy());
  charts = [];
  if (arg === 'demo' && !current?.demo) current = { ...demoHistory(), demo: true, tz: 8 };
  if (!current) current = loadStored();
  const scriptUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}tools/get-warp-url.ps1`;
  const cmd = `irm ${scriptUrl} | iex`;

  root.innerHTML = String(html`
    <section class="section" style="margin-top:6px">
      <div class="section-head">
        <div><span class="eyebrow">Warp tracker</span><h2 class="title" style="margin-top:8px">How lucky are you, <em>really?</em></h2></div>
        ${current ? html`<div class="row"><button class="btn sm" id="exportBtn">${icon('download')} Export UIGF</button>${current.demo ? html`<span class="tag info">Demo data (simulated)</span>` : html`<span class="tag mono">UID ${current.uid}</span>`}</div>` : ''}
      </div>
      <div class="bento">
        <div class="card spot span-7">
          <div class="stack" style="gap:12px">
            <label class="field"><input id="warpUrl" type="url" placeholder=" " autocomplete="off" spellcheck="false"><span>Paste your warp history link</span></label>
            <div class="row">
              <button class="btn primary" id="fetchBtn">${icon('download')} Fetch history</button>
              <label class="btn" for="importFile">${icon('upload')} Import JSON</label>
              <input type="file" id="importFile" accept=".json,application/json" hidden>
              <button class="btn ghost" id="demoBtn">Try demo data</button>
              <span class="muted" id="fetchMsg" style="font-size:12.5px"></span>
            </div>
            <div class="progress" id="fetchProg" hidden><i></i></div>
          </div>
        </div>
        <details class="card how span-5" ${current ? '' : 'open'}>
          <summary>Where do I get the link? (PC)</summary>
          <ol>
            <li>Open the game and view <b>Warp → View Details → Records</b> once.</li>
            <li>Open PowerShell and run this. It only reads the game's local web cache and copies the link to your clipboard; nothing is uploaded.</li>
          </ol>
          <div class="copy-line"><code id="psCmd">${cmd}</code><button class="icon-btn" id="copyCmd" aria-label="Copy command">${icon('copy')}</button></div>
          <p class="faint" style="font-size:12px;margin:10px 0 0">Links expire after about a day. The game keeps 6 months of history; relicwise keeps everything it has fetched in this browser, so re-sync now and then. Also accepts UIGF v4 / SRGF exports from other trackers.</p>
        </details>
      </div>
    </section>
    <div id="warpResults">${current ? results(current) : ''}</div>
  `);

  const $ = (s) => root.querySelector(s);
  $('#copyCmd').addEventListener('click', () => navigator.clipboard?.writeText(cmd).then(() => toast('Command copied'), () => toast('Copy failed: select the text instead', { err: true })));
  $('#demoBtn').addEventListener('click', () => { current = { ...demoHistory(), demo: true, tz: 8 }; renderWarps(root); });
  $('#exportBtn')?.addEventListener('click', () => download(`relicwise-warps-${current.uid}.json`, toUIGF(current.uid, current.records, current.tz ?? 8)));
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { uid, records } = parseImport(JSON.parse(await f.text()));
      save(uid || 'imported', records, 8);
      toast(`Imported ${records.length} warps`);
      renderWarps(root);
    } catch (err) { toast(err.message, { err: true, ms: 6000 }); }
  });
  $('#fetchBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const text = $('#warpUrl').value;
    if (!text.trim()) { toast('Paste the warp history link first.', { err: true }); return; }
    setLoading(btn, true);
    const prog = $('#fetchProg');
    prog.hidden = false;
    const msg = $('#fetchMsg');
    try {
      const prev = loadStored();
      const known = new Set((prev?.records || []).map((r) => r.id));
      let step = 0;
      const res = await fetchHistory(text, {
        known,
        onProgress: ({ banner, count }) => {
          msg.textContent = `${banner} · ${count} new warps`;
          step = Math.min(95, step + 3);
          prog.firstElementChild.style.width = step + '%';
        },
      });
      const uid = res.uid || prev?.uid || 'unknown';
      const base = prev && prev.uid === uid ? prev.records : (store.get('warps:' + uid)?.records || []);
      save(uid, mergeRecords(base, res.records), res.tz ?? 8);
      toast(res.records.length ? `Synced ${res.records.length} new warps` : 'Already up to date');
      renderWarps(root);
    } catch (err) {
      toast(err.message, { err: true, ms: 8000 });
      msg.textContent = '';
    } finally {
      setLoading(btn, false);
      prog.hidden = true;
    }
  });
  hydrate(root);
  if (current) drawCharts(root, current);
}

function save(uid, records, tz) {
  current = { uid, tz, records, demo: false };
  if (!store.set('warps:' + uid, { uid, tz, records, updated: Date.now() })) toast('Browser storage is full; history will not be kept after reload.', { err: true });
  store.set('warpsLast', uid);
}

function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const itemIcon = (r) => (D.game.characters[r.item_id] ? charIcon(r.item_id) : lcIcon(r.item_id));

function results(cur) {
  const a = analyze(cur.records);
  cur.analysis = a;
  const L = a.luck;
  const banners = BANNER_ORDER.map((t) => a.byBanner[t]).filter(Boolean);
  const ch = a.byBanner['11'];
  const lc = a.byBanner['12'];
  const flips = a.totals.wins + a.totals.losses;
  return html`
    <section class="bento section" style="margin-top:18px" data-stagger>
      ${L ? html`<div class="card spot span-5">
        <div class="luck">
          ${ring(L.percentile * 100, { size: 132, stroke: 9, grade: L.grade, label: 'PERCENTILE', fontSize: 34 })}
          <div>
            <span class="eyebrow">Luck rating</span>
            <div class="big" style="margin-top:6px"><span class="grade g-${L.grade}" style="font-family:var(--serif);font-weight:400">${L.label}</span> <span class="grade-badge g-${L.grade}" style="vertical-align:6px">${L.grade}</span></div>
            <p class="muted" style="margin:8px 0 0;font-size:13.5px">${L.blurb}</p>
            <p class="faint" style="margin:8px 0 0;font-size:12.5px">${L.mine} limited 5★ from ${a.totals.limitedPulls} event pulls. An average account gets <b style="color:var(--text)">${L.expected.toFixed(1)}</b>.</p>
          </div>
        </div>
      </div>` : html`<div class="card span-5"><p class="muted" style="margin:0">No event-banner pulls yet, so there's no luck rating.</p></div>`}
      <div class="span-7 kpis">
        <div class="kpi"><b data-count="${a.totals.pulls}">0</b><span>Total warps</span><small>≈ ${(a.totals.jade).toLocaleString()} jade</small></div>
        <div class="kpi"><b>${a.totals.wins}<span class="faint">–</span>${a.totals.losses}</b><span>50/50 won–lost</span><small>${flips ? `${Math.round((a.totals.wins / flips) * 100)}% won` : 'no 50/50s yet'}${L?.p5050 != null ? ` · luckier than ${Math.round(L.p5050 * 100)}%` : ''}</small></div>
        <div class="kpi"><b>${ch?.avgPity ? ch.avgPity.toFixed(1) : '–'}</b><span>Avg character pity</span><small>expected ${expectedPity(BANNERS[11]).toFixed(1)}</small></div>
        <div class="kpi"><b>${lc?.avgPity ? lc.avgPity.toFixed(1) : '–'}</b><span>Avg light cone pity</span><small>expected ${expectedPity(BANNERS[12]).toFixed(1)}</small></div>
        <div class="kpi"><b>${ch ? ch.pity : '–'}</b><span>Character pity now</span><small>${ch?.guaranteed ? 'next 5★ is guaranteed' : '50/50 on next 5★'}</small></div>
        <div class="kpi"><b>${lc ? lc.pity : '–'}</b><span>Light cone pity now</span><small>${lc?.guaranteed ? 'next 5★ is guaranteed' : '75/25 on next 5★'}</small></div>
      </div>
      ${L ? html`<div class="card spot span-12">
        <div class="card-head"><h3>Where you land</h3><span class="faint" style="font-size:12px">limited 5★ from the same pulls, 4,000 simulated accounts</span></div>
        <div class="chart-box" style="height:180px"><canvas id="luckChart" aria-label="Distribution of limited 5-star counts in simulated accounts"></canvas></div>
      </div>` : ''}
    </section>

    <section class="section banner-grid">
      <div class="legend"><span><i style="background:var(--win)"></i>Won 50/50</span><span><i style="background:var(--loss)"></i>Lost 50/50</span><span><i style="background:var(--guar)"></i>Guaranteed</span><span><i style="background:var(--g-D)"></i>Standard banner</span></div>
      ${banners.map((b) => html`<article class="card spot">
        <div class="card-head">
          <h3>${b.cfg.name}</h3>
          <div class="row" style="gap:6px"><span class="tag mono">${b.total} pulls</span><span class="tag mono">pity ${b.pity}</span>${b.guaranteed ? html`<span class="tag info">guaranteed</span>` : ''}
            ${b.avgPity ? html`<span class="tag mono">avg ${b.avgPity.toFixed(1)}</span>` : ''}</div>
        </div>
        ${b.fives.length ? html`<div class="chart-box"><canvas data-banner="${b.type}" aria-label="Pity of each 5-star on ${b.cfg.name}"></canvas></div>
          <div class="fives" data-stagger>${[...b.fives].reverse().map((f) => html`<div class="five ${({ win: 'win', loss: 'loss', guaranteed: 'guar' })[f.outcome] || ''}" title="${f.time}">
            <span class="av">${img(itemIcon(f), { alt: '' })}</span>
            <b>${f.name}</b>
            <span class="pity">${f.pity} pity · ${({ win: 'won 50/50', loss: 'lost 50/50', guaranteed: 'guaranteed', standard: 'standard' })[f.outcome]}${b.cfg.kind === 'lc' && f.outcome !== 'standard' ? '' : ''}</span>
          </div>`)}</div>` : html`<p class="muted" style="margin:0;font-size:13.5px">No 5★ yet: ${b.pity} pulls into pity.</p>`}
      </article>`)}
    </section>`;
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawCharts(root, cur) {
  if (!window.Chart) return;
  const a = cur.analysis;
  const still = reducedMotion();
  const muted = css('--muted');
  const line = css('--line');
  const font = { family: css('--font') || 'Geist, sans-serif', size: 11 };
  const color = { win: css('--win'), loss: css('--loss'), guaranteed: css('--guar'), standard: css('--g-D') };
  const anim = still ? false : {
    duration: 900,
    easing: 'easeOutQuart',
    delay: (ctx) => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * 35 : 0),
  };
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: anim,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--surface-solid'), titleColor: css('--text'), bodyColor: muted, borderColor: line, borderWidth: 1, padding: 10, cornerRadius: 10, titleFont: font, bodyFont: font } },
    scales: {
      x: { grid: { display: false }, ticks: { color: muted, font, maxRotation: 0, autoSkip: true }, border: { color: line } },
      y: { grid: { color: line }, ticks: { color: muted, font }, border: { display: false } },
    },
  };

  const luck = root.querySelector('#luckChart');
  if (luck && a.luck) {
    const h = a.luck.hist;
    charts.push(new window.Chart(luck, {
      type: 'bar',
      data: {
        labels: h.map((x) => x.k),
        datasets: [{
          data: h.map((x) => +(x.p * 100).toFixed(2)),
          backgroundColor: h.map((x) => (x.k === a.luck.mine ? css('--accent') : css('--surface-2') || 'rgba(255,255,255,.08)')),
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        ...base,
        plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { title: (i) => `${i[0].label} limited 5★${Number(i[0].label) === a.luck.mine ? ' (you)' : ''}`, label: (i) => `${i.raw}% of accounts` } } },
        scales: { ...base.scales, y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, callback: (v) => v + '%' } } },
      },
    }));
  }

  root.querySelectorAll('canvas[data-banner]').forEach((cv) => {
    const b = a.byBanner[cv.dataset.banner];
    charts.push(new window.Chart(cv, {
      type: 'bar',
      data: {
        labels: b.fives.map((f) => f.name),
        datasets: [{
          data: b.fives.map((f) => f.pity),
          backgroundColor: b.fives.map((f) => color[f.outcome]),
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 34,
        }],
      },
      options: {
        ...base,
        plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: (i) => `pity ${i.raw} · ${b.fives[i.dataIndex].outcome} · ${b.fives[i.dataIndex].time.slice(0, 10)}` } } },
        scales: { ...base.scales, y: { ...base.scales.y, suggestedMax: b.cfg.hard, ticks: { ...base.scales.y.ticks, stepSize: 20 } } },
      },
    }));
  });
}
