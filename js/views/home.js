import { html, icon, img } from '../ui.js';
import { uidForm, wireUidForms } from '../actions.js';
import { asset, D, rankableBuilds } from '../data.js';
import { go } from '../state.js';

export function renderHome(root) {
  const sample = ['1308', '1407', '1309', '1401', '1310', '1303'].filter((id) => D.game.characters[id]);
  root.innerHTML = String(html`
    <section class="hero">
      <span class="eyebrow rise">Honkai: Star Rail · relic intelligence</span>
      <h1 class="rise" style="--i:1">Every relic, <em>weighed</em> for every character.</h1>
      <p class="lede rise" style="--i:2">Enter your UID and relicwise grades each relic in your showcase against all ${rankableBuilds().length} characters' builds, tells you who should
        really be wearing it, and points at the one upgrade that matters most.</p>
      <div class="rise" style="--i:3;display:grid;gap:12px">${uidForm()}</div>
    </section>

    <section class="bento features" data-stagger>
      <article class="card spot feature span-6" data-go="#/relics">
        <span class="num">01 · Relics</span>
        <h3>Scored for everyone, not just the wearer</h3>
        <p>Every piece is ranked across the whole roster with real stat weights, main stats and sets. Roll counts, upgrade odds and a “better than X% of drops” check come with it.</p>
        <div class="art">${sample.map((id, i) => html`<span class="av" style="--s:${44 - i * 3}px">${img(asset(D.game.characters[id].icon), { alt: '' })}</span>`)}</div>
      </article>
      <article class="card spot feature span-6" data-go="#/scan">
        <span class="num">02 · Scanner</span>
        <h3>Point it at your game window</h3>
        <p>Share your screen and click through your inventory. OCR reads each relic's name to find its set and slot at any resolution, then checks every number against the game's roll math.</p>
        <div class="art" style="color:var(--accent)">${icon('scan', 'width="40" height="40"')}</div>
      </article>
      <article class="card spot feature span-4" data-go="#/builds">
        <span class="num">03 · Builds</span>
        <h3>Sets, mains, priorities</h3>
        <p>Recommended sets, main stats and substat weights for every character, with speed-tier targets.</p>
      </article>
      <article class="card spot feature span-4" data-go="#/synergies">
        <span class="num">04 · Synergies</span>
        <h3>Teams you can field</h3>
        <p>Recommended teams and frequent partners, filtered by who you actually own.</p>
      </article>
      <article class="card spot feature span-4" data-go="#/warps">
        <span class="num">05 · Warps</span>
        <h3>How lucky are you, really?</h3>
        <p>Pity, 50/50 wins and losses, and a luck percentile against thousands of simulated accounts.</p>
      </article>
    </section>
  `);
  wireUidForms(root);
  root.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => go(el.dataset.go)));
}
