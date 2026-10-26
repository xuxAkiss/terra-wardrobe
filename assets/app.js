/* =========================================================
   泰拉衣橱 · TERRA WARDROBE
   Vanilla JS single-page archive
   ========================================================= */

const DATA_URL = 'data/archive.json';
const OFFICIAL_ARCHIVE = 'https://ak.hypergryph.com/archive/dynamicCompile/index.html';
const FALLBACK_IMG = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">' +
  '<rect width="300" height="400" fill="#111417"/>' +
  '<path d="M150 130l54 54-54 54-54-54z" fill="none" stroke="#3a4045" stroke-width="2"/>' +
  '<text x="150" y="245" fill="#6f7472" font-family="monospace" font-size="10" text-anchor="middle" letter-spacing="3">NO IMAGE</text>' +
  '</svg>'
);

const app = {
  data: null,
  opById: new Map(),
  skinById: new Map(),
  dynamicRecords: [],
  dynamicsByKey: new Map(),
  searchIndex: [],
  filters: null,
  visible: 60,
  searchActive: 0,
  searchItems: [],
  currentTheater: null,
  modalLocks: 0,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- utilities ---------- */

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function attr(value) {
  return escapeHTML(value);
}

function enc(value) {
  return encodeURIComponent(String(value));
}

function stars(n) {
  return `<span class="stars" aria-label="${n} 星">${'★'.repeat(Number(n) || 0)}</span>`;
}

function classBadge(item) {
  return `<span class="class-badge" style="--class-color:${attr(item.classColor)}" aria-label="${attr(item.professionName)}"><span>${escapeHTML(item.classShort)}</span></span>`;
}

function dynBadge(text = '动态') {
  return `<span class="dyn-badge">${escapeHTML(text)}</span>`;
}

function fmtDate(value) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${y}.${m}.${d}`;
  }
  return value;
}

function fmtISO(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDuration(sec) {
  if (!sec) return '';
  const total = Math.round(Number(sec));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function skillSearchURL(op) {
  return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(`明日方舟 ${op.name} 技能展示PV`);
}

function outfitSearchURL(skin) {
  return 'https://search.bilibili.com/all?keyword=' + encodeURIComponent(`明日方舟 ${skin.operatorName} ${skin.name} 时装展示`);
}

function icon(name) {
  const paths = {
    search: '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4 4"></path>',
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"></path>',
    play: '<path d="M8 5v14l11-7z"></path>',
    expand: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"></path>',
    external: '<path d="M14 4h6v6M20 4l-8 8M10 5H5a1 1 0 00-1 1v13a1 1 0 001 1h13a1 1 0 001-1v-5"></path>',
    close: '<path d="M6 6l12 12M18 6L6 18"></path>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
    grid: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>',
    zoom: '<circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4 4M8 11h6M11 8v6"></path>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
}

function playIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
}

function lockBody() {
  app.modalLocks += 1;
  document.body.classList.add('modal-open');
}

function unlockBody() {
  app.modalLocks = Math.max(0, app.modalLocks - 1);
  if (!app.modalLocks) document.body.classList.remove('modal-open');
}

/* ---------- routing ---------- */

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean).map((seg) => {
    try { return decodeURIComponent(seg); } catch { return seg; }
  });
  return { segs, query: new URLSearchParams(queryPart || '') };
}

function routeSection(route) {
  const head = route.segs[0] || 'home';
  if (head === 'operator') return 'operators';
  if (head === 'skin') return 'skins';
  return head;
}

function navigate(href) {
  closeMobileMenu();
  if (location.hash === href) {
    renderRoute({ nav: true });
  } else {
    location.hash = href;
  }
}

function readFilters(route) {
  const q = route.query;
  const validClass = app.data.classes.some((c) => c.key === q.get('class')) ? q.get('class') : 'ALL';
  const rarityRaw = q.get('rarity');
  const rarity = ['1', '2', '3', '4', '5', '6'].includes(rarityRaw) ? rarityRaw : 'ALL';
  const series = app.data.brands.some((b) => b.name === q.get('series')) ? q.get('series') : 'ALL';
  const sort = ['new', 'old', 'name', 'operator', 'rarity', 'skins'].includes(q.get('sort')) ? q.get('sort') : 'new';
  const dynType = ['skin', 'promotion'].includes(q.get('type')) ? q.get('type') : 'ALL';
  return {
    class: validClass,
    rarity,
    dyn: q.get('dyn') === '1',
    series,
    sort,
    q: q.get('q') || '',
    type: dynType,
  };
}

function syncFilters() {
  const route = parseRoute();
  const section = route.segs[0];
  const params = new URLSearchParams();
  const f = app.filters;
  if (section === 'operators') {
    if (f.class !== 'ALL') params.set('class', f.class);
    if (f.rarity !== 'ALL') params.set('rarity', f.rarity);
    if (f.sort !== 'new') params.set('sort', f.sort);
    if (f.q) params.set('q', f.q);
  } else if (section === 'skins') {
    if (f.class !== 'ALL') params.set('class', f.class);
    if (f.rarity !== 'ALL') params.set('rarity', f.rarity);
    if (f.dyn) params.set('dyn', '1');
    if (f.series !== 'ALL') params.set('series', f.series);
    if (f.sort !== 'new') params.set('sort', f.sort);
    if (f.q) params.set('q', f.q);
  } else if (section === 'dynamics') {
    if (f.type !== 'ALL') params.set('type', f.type);
    if (f.class !== 'ALL') params.set('class', f.class);
    if (f.q) params.set('q', f.q);
  } else {
    return;
  }
  const qs = params.toString();
  const base = '#/' + section;
  history.replaceState(null, '', qs ? `${base}?${qs}` : base);
}

/* ---------- data ---------- */

async function loadData() {
  const res = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`数据加载失败：HTTP ${res.status}`);
  return res.json();
}

function indexData() {
  app.opById = new Map(app.data.operators.map((o) => [o.id, o]));
  app.skinById = new Map(app.data.skins.map((s) => [s.id, s]));
  app.dynamicRecords = [];
  for (const s of app.data.skins) {
    if (!s.dyn) continue;
    app.dynamicRecords.push({
      key: `s:${s.id}`,
      type: 'skin',
      label: '动态时装',
      title: s.name,
      opName: s.operatorName,
      opId: s.operatorId,
      skinId: s.id,
      href: `#/skin/${enc(s.id)}`,
      poster: s.dyn.poster || s.image,
      actions: s.dyn.actions || [],
      displayTime: s.dyn.displayTime,
      codename: s.dyn.codename,
      classShort: s.classShort,
      classColor: s.classColor,
      profession: s.profession,
      professionName: s.professionName,
      rarity: s.rarity,
    });
  }
  for (const o of app.data.operators) {
    if (!o.promotion) continue;
    app.dynamicRecords.push({
      key: `o:${o.id}`,
      type: 'promotion',
      label: '精英二动态立绘',
      title: `${o.name} · 晋升`,
      opName: o.name,
      opId: o.id,
      skinId: null,
      href: `#/operator/${enc(o.id)}`,
      poster: o.promotion.poster || o.artE2,
      actions: o.promotion.actions || [],
      displayTime: o.promotion.displayTime,
      codename: o.promotion.codename,
      classShort: o.classShort,
      classColor: o.classColor,
      profession: o.profession,
      professionName: o.professionName,
      rarity: o.rarity,
    });
  }
  app.dynamicRecords.sort((a, b) => String(b.displayTime || '').localeCompare(String(a.displayTime || '')));
  app.dynamicsByKey = new Map(app.dynamicRecords.map((r) => [r.key, r]));

  app.searchIndex = [];
  for (const o of app.data.operators) {
    app.searchIndex.push({
      kind: 'operator',
      id: o.id,
      name: o.name,
      sub: `${o.professionName} · ${o.rarity}★${o.en ? ' · ' + o.en : ''}`,
      thumb: o.portrait,
      href: `#/operator/${enc(o.id)}`,
      scoreBase: o.rarity,
    });
  }
  for (const s of app.data.skins) {
    app.searchIndex.push({
      kind: 'skin',
      id: s.id,
      name: s.name,
      sub: `${s.operatorName} · ${s.series}${s.dyn ? ' · 动态' : ''}`,
      thumb: s.thumb,
      href: `#/skin/${enc(s.id)}`,
      scoreBase: s.dyn ? 3 : 0,
      opName: s.operatorName,
    });
  }
}

/* ---------- filters ---------- */

function filteredOperators() {
  const f = app.filters;
  const q = f.q.trim().toLowerCase();
  let list = app.data.operators.filter((o) => {
    if (f.class !== 'ALL' && o.profession !== f.class) return false;
    if (f.rarity !== 'ALL' && String(o.rarity) !== f.rarity) return false;
    if (q) {
      const hay = `${o.name} ${o.en} ${o.displayNumber} ${o.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN');
  if (f.sort === 'name') list.sort(byName);
  else if (f.sort === 'skins') list.sort((a, b) => b.skinCount - a.skinCount || b.rarity - a.rarity || byName(a, b));
  else list.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  return list;
}

function filteredSkins() {
  const f = app.filters;
  const q = f.q.trim().toLowerCase();
  let list = app.data.skins.filter((s) => {
    if (f.class !== 'ALL' && s.profession !== f.class) return false;
    if (f.rarity !== 'ALL' && String(s.rarity) !== f.rarity) return false;
    if (f.dyn && !s.dyn) return false;
    if (f.series !== 'ALL' && s.series !== f.series) return false;
    if (q) {
      const hay = `${s.name} ${s.operatorName} ${s.operatorEn} ${s.series} ${s.artist}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (f.sort === 'old') list.sort((a, b) => a.release - b.release || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  else if (f.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  else if (f.sort === 'operator') list.sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'zh-Hans-CN') || b.release - a.release);
  else list.sort((a, b) => b.release - a.release || a.operatorName.localeCompare(b.operatorName, 'zh-Hans-CN'));
  return list;
}

function filteredDynamics() {
  const f = app.filters;
  const q = f.q.trim().toLowerCase();
  return app.dynamicRecords.filter((r) => {
    if (f.type !== 'ALL' && r.type !== f.type) return false;
    if (f.class !== 'ALL' && r.profession !== f.class) return false;
    if (q) {
      const hay = `${r.title} ${r.opName} ${r.codename} ${r.label}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ---------- cards ---------- */

function skinCard(s) {
  const href = `#/skin/${enc(s.id)}`;
  const fallback = s.image || s.thumb;
  return `
    <a class="skin-card" href="${href}" style="--class-color:${attr(s.classColor)}" aria-label="${attr(s.operatorName)} · ${attr(s.name)}">
      <div class="card-media" data-glyph="${attr(s.classShort)}">
        <img src="${attr(s.thumb || s.image)}" data-fallback="${attr(fallback)}" alt="${attr(s.operatorName)} ${attr(s.name)} 立绘" loading="lazy" decoding="async">
        <div class="card-badges">
          ${classBadge(s)}
          ${s.dyn ? dynBadge('动态') : ''}
        </div>
        <span class="card-hover-line"></span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHTML(s.name)}</h3>
        <p class="card-sub">${escapeHTML(s.operatorName)} <span class="en">${escapeHTML(s.operatorEn)}</span></p>
        <div class="card-foot"><span>${escapeHTML(fmtDate(s.releaseDate))}</span><span class="series">${escapeHTML(s.series)}</span></div>
      </div>
    </a>`;
}

function operatorCard(o) {
  const href = `#/operator/${enc(o.id)}`;
  return `
    <a class="op-card" href="${href}" style="--class-color:${attr(o.classColor)}" aria-label="${attr(o.name)} 干员档案">
      <div class="card-media" data-glyph="${attr(o.classShort)}">
        <img src="${attr(o.portrait || o.portraitE2)}" data-fallback="${attr(o.artE2 || o.art)}" alt="${attr(o.name)} 立绘" loading="lazy" decoding="async">
        <div class="card-badges">
          ${classBadge(o)}
          ${o.dynamicCount ? dynBadge('动态') : ''}
        </div>
        <span class="card-hover-line"></span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHTML(o.name)}</h3>
        <p class="card-sub">${escapeHTML(o.en || o.professionName)} ${stars(o.rarity)}</p>
        <div class="card-foot"><span>${o.skinCount} 套时装</span><span>${o.dynamicCount ? o.dynamicCount + ' 动态' : 'STATIC'}</span></div>
      </div>
    </a>`;
}

function dynCard(rec) {
  return `
    <article class="dyn-card" style="--class-color:${attr(rec.classColor)}">
      <button class="dyn-poster" type="button" data-action="play-record" data-key="${attr(rec.key)}" aria-label="播放 ${attr(rec.opName)} ${attr(rec.title)} 官方动态">
        <img src="${attr(rec.poster)}" data-fallback="${attr(rec.poster)}" alt="${attr(rec.opName)} ${attr(rec.title)} 官方影像" loading="lazy" decoding="async">
        ${dynBadge(rec.type === 'skin' ? '官方动态' : '晋升动态')}
        <span class="dyn-play">${playIcon()}</span>
      </button>
      <div class="dyn-body">
        <a href="${attr(rec.href)}"><h3>${escapeHTML(rec.opName)} · ${escapeHTML(rec.title)}</h3></a>
        <p>${escapeHTML(rec.label)}${rec.codename ? ' · ' + escapeHTML(rec.codename) : ''}</p>
        <div class="dyn-meta"><span>${escapeHTML(fmtISO(rec.displayTime))}</span><span>${rec.actions.length} 段动作</span></div>
      </div>
    </article>`;
}

function heroFeature(rec) {
  return `
    <aside class="hero-feature">
      <a class="feature-link" href="${attr(rec.href)}" aria-label="查看 ${attr(rec.opName)} ${attr(rec.title)}">
        <img src="${attr(rec.poster)}" data-fallback="${attr(rec.poster)}" alt="${attr(rec.opName)} ${attr(rec.title)} 官方动态影像" decoding="async">
        <div class="feature-shade"></div>
        <div class="feature-top">
          <span class="dyn-badge">最新官方动态</span>
          <span class="tag">${escapeHTML(fmtISO(rec.displayTime))}</span>
        </div>
        <div class="feature-info">
          <span class="kicker">${escapeHTML(rec.label)}</span>
          <div class="feature-op"><strong>${escapeHTML(rec.opName)}</strong><span>${escapeHTML(rec.codename || '')}</span></div>
          <h2 class="feature-name">${escapeHTML(rec.title)}</h2>
          <p class="feature-caption">点击右下角播放官方动作影像</p>
        </div>
      </a>
      <button class="feature-play" type="button" data-action="play-record" data-key="${attr(rec.key)}" aria-label="播放官方动态影像">${playIcon()}</button>
    </aside>`;
}

/* ---------- list markup ---------- */

function classChips(active, key = 'class') {
  return [
    `<button type="button" class="chip class-chip ${active === 'ALL' ? 'active' : ''}" data-filter="${key}" data-value="ALL">全部</button>`,
    ...app.data.classes.map((c) => `
      <button type="button" class="chip class-chip ${active === c.key ? 'active' : ''}"
        style="--chip-color:${attr(c.color)}" data-filter="${key}" data-value="${attr(c.key)}">${escapeHTML(c.name)}</button>`),
  ].join('');
}

function rarityChips(active) {
  return [
    `<button type="button" class="chip ${active === 'ALL' ? 'active' : ''}" data-filter="rarity" data-value="ALL">全部</button>`,
    ...[6, 5, 4, 3, 2, 1].map((n) => `
      <button type="button" class="chip ${active === String(n) ? 'active' : ''}" data-filter="rarity" data-value="${n}">${n}★</button>`),
  ].join('');
}

function moreButton(list, total, visible) {
  if (total <= visible) return '';
  return `<button class="btn ghost" type="button" data-action="load-more" data-list="${attr(list)}">显示更多 <span>${total - visible}</span> ${icon('arrow')}</button>`;
}

/* ---------- home ---------- */

function renderHome() {
  const d = app.data;
  const feature = app.dynamicRecords[0];
  const latest = app.dynamicRecords.slice(0, 3);
  const classTiles = d.classes.map((c) => `
    <a class="class-tile" href="#/operators?class=${attr(c.key)}" style="--class-color:${attr(c.color)}" data-glyph="${attr(c.short)}">
      <span class="class-badge" style="--class-color:${attr(c.color)}"><span>${escapeHTML(c.short)}</span></span>
      <span><strong>${escapeHTML(c.name)}</strong><span>${d.operators.filter((o) => o.profession === c.key).length} 位干员</span></span>
    </a>`).join('');

  return `
  <div class="page">
    <section class="hero">
      <div class="container">
        <div class="hero-grid">
          <div class="hero-copy">
            <span class="hero-eyebrow">NON-OFFICIAL FAN ARCHIVE · 泰拉衣橱</span>
            <h1 class="hero-title">
              <span class="line-1">先看立绘<span class="slash">/</span></span>
              <span class="line-2">再买时装。</span>
            </h1>
            <p class="hero-text">
              聚合《明日方舟》<strong>官方「干员动态集录」</strong>与全量干员、时装立绘。
              原立绘与皮肤立绘一滑对比，动态时装的官方动作直接播放——
              不用等干员上岛，也能先看清她/他穿上的样子。
            </p>
            <div class="hero-actions">
              <a class="btn" href="#/skins">开始逛时装 ${icon('arrow')}</a>
              <a class="btn ghost" href="#/operators">按干员找 ${icon('grid')}</a>
            </div>
            <div class="hero-meta">
              <span><i></i>${d.meta.operatorCount} 位干员</span>
              <span><i></i>${d.meta.skinCount} 套时装</span>
              <span><i></i>${d.meta.dynamicSkinCount} 套动态时装</span>
              <span><i></i>官方 MP4 直连</span>
            </div>
          </div>
          ${feature ? heroFeature(feature) : ''}
        </div>
      </div>
    </section>

    <div class="container">
      <div class="stats">
        <div class="stat"><span class="stat-num">${d.meta.operatorCount}<em>+</em></span><span class="stat-label">OPERATORS / 干员</span></div>
        <div class="stat"><span class="stat-num">${d.meta.skinCount}</span><span class="stat-label">OUTFITS / 时装</span></div>
        <div class="stat"><span class="stat-num">${d.meta.dynamicSkinCount}</span><span class="stat-label">DYNAMIC / 动态时装</span></div>
        <div class="stat"><span class="stat-num">${d.meta.officialClipCount}</span><span class="stat-label">OFFICIAL CLIPS / 官方动作</span></div>
      </div>
    </div>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="kicker">LATEST DYNAMIC</span>
            <h2 class="section-title">最新官方动态</h2>
          </div>
          <a class="section-link" href="#/dynamics">全部 ${app.dynamicRecords.length} 条 ${icon('arrow')}</a>
        </div>
        <div class="dynamics-grid">${latest.map(dynCard).join('')}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="kicker">BROWSE BY CLASS</span>
            <h2 class="section-title">按职业找干员</h2>
          </div>
          <p class="section-sub">不知道皮肤是谁的？先从职业和立绘认人，再进入干员页查看全部时装。</p>
        </div>
        <div class="class-grid">${classTiles}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="kicker">HOW IT WORKS</span>
            <h2 class="section-title">三步，看清再买</h2>
          </div>
        </div>
        <div class="steps">
          <div class="step" data-step="01">
            <h3>找到干员</h3>
            <p>按名字、职业或稀有度浏览。干员页同时给出精英一 / 精英二原立绘，先认清角色本身。</p>
          </div>
          <div class="step" data-step="02">
            <h3>滑动对比</h3>
            <p>进入时装页，拖动中线即可把原立绘与皮肤立绘重叠对比，构图、气质、细节变化一眼可见。</p>
          </div>
          <div class="step" data-step="03">
            <h3>播放官方动作</h3>
            <p>动态时装直接播放官网 MP4：标准动作、动作一、动作二，买前先看局内展示效果。</p>
          </div>
        </div>
        <div class="note">
          <strong>先说明：</strong>静态时装通常只替换立绘与战斗小人，不改变技能特效；动态时装会额外包含立绘动作、入场动画等内容。
          本站展示的是官方公开影像与立绘，是否值得购买仍取决于你的审美与预算。
        </div>
      </div>
    </section>
  </div>`;
}

/* ---------- operators page ---------- */

function renderOperators() {
  const f = app.filters;
  const list = filteredOperators();
  const shown = list.slice(0, app.visible);
  return `
  <div class="page">
    <div class="container">
      <header class="page-head">
        <div class="page-head-row">
          <div>
            <span class="kicker">OPERATOR ARCHIVE</span>
            <h1 class="page-title">干员档案<span class="en">ALL OPERATORS / ${app.data.meta.operatorCount}</span></h1>
          </div>
          <p class="page-desc">从干员进入，查看精英一 / 精英二原立绘与全部已收录时装。动态标记代表该干员拥有官方动态影像。</p>
        </div>
      </header>

      <div class="filterbar">
        <div class="filter-group"><span class="filter-label">职业</span>${classChips(f.class)}</div>
        <div class="filter-sep"></div>
        <div class="filter-group"><span class="filter-label">星级</span>${rarityChips(f.rarity)}</div>
        <div class="filter-sep"></div>
        <div class="filter-group">
          <span class="filter-label">排序</span>
          <select class="select" data-select="operator-sort" aria-label="干员排序">
            <option value="rarity" ${f.sort === 'rarity' ? 'selected' : ''}>稀有度优先</option>
            <option value="name" ${f.sort === 'name' ? 'selected' : ''}>名称 A-Z</option>
            <option value="skins" ${f.sort === 'skins' ? 'selected' : ''}>时装数量</option>
          </select>
        </div>
        <div class="filter-spacer"></div>
        <label class="field">
          ${icon('search')}
          <input id="operator-search" type="search" value="${attr(f.q)}" placeholder="搜索干员 / 英文名 / 编号" autocomplete="off">
        </label>
      </div>

      <div class="result-meta"><span><strong id="operator-count">${list.length}</strong> 位干员</span><span>点击卡片查看立绘与时装</span></div>
      <div class="card-grid" id="operator-grid">${shown.map(operatorCard).join('')}</div>
      <div class="load-more" id="operator-more">${moreButton('operators', list.length, app.visible)}</div>
      ${list.length === 0 ? emptyState('没有找到这位干员', '换个关键词，或清空职业 / 星级筛选。') : ''}
    </div>
  </div>`;
}

/* ---------- skins page ---------- */

function renderSkins() {
  const f = app.filters;
  const list = filteredSkins();
  const shown = list.slice(0, app.visible);
  return `
  <div class="page">
    <div class="container">
      <header class="page-head">
        <div class="page-head-row">
          <div>
            <span class="kicker">OUTFIT ARCHIVE</span>
            <h1 class="page-title">时装回廊<span class="en">ALL OUTFITS / ${app.data.meta.skinCount}</span></h1>
          </div>
          <p class="page-desc">全量时装立绘与官方动态影像。拖动详情页的中线，就能把原立绘和皮肤叠在一起看；动态时装可直接播放官方动作。</p>
        </div>
      </header>

      <div class="filterbar">
        <div class="filter-group"><span class="filter-label">职业</span>${classChips(f.class)}</div>
        <div class="filter-sep"></div>
        <div class="filter-group"><span class="filter-label">星级</span>${rarityChips(f.rarity)}</div>
        <div class="filter-sep"></div>
        <div class="filter-group">
          <button type="button" class="toggle" data-filter="dyn" aria-pressed="${f.dyn}"><span class="switch"></span>只看动态</button>
        </div>
        <div class="filter-spacer"></div>
        <div class="filter-group">
          <span class="filter-label">系列</span>
          <select class="select" data-select="series" aria-label="时装系列">
            <option value="ALL">全部系列</option>
            ${app.data.brands.map((b) => `<option value="${attr(b.name)}" ${f.series === b.name ? 'selected' : ''}>${escapeHTML(b.name)}（${b.count}）</option>`).join('')}
          </select>
          <span class="filter-label" style="margin-left:6px">排序</span>
          <select class="select" data-select="skin-sort" aria-label="时装排序">
            <option value="new" ${f.sort === 'new' ? 'selected' : ''}>最新上架</option>
            <option value="old" ${f.sort === 'old' ? 'selected' : ''}>最早上架</option>
            <option value="name" ${f.sort === 'name' ? 'selected' : ''}>时装名 A-Z</option>
            <option value="operator" ${f.sort === 'operator' ? 'selected' : ''}>按干员</option>
          </select>
        </div>
        <label class="field">
          ${icon('search')}
          <input id="skin-search" type="search" value="${attr(f.q)}" placeholder="搜索时装 / 干员 / 系列 / 画师" autocomplete="off">
        </label>
      </div>

      <div class="result-meta"><span><strong id="skin-count">${list.length}</strong> 套时装 · <strong id="skin-dyn-count">${list.filter((s) => s.dyn).length}</strong> 套动态</span><span>拖动详情页中线进行对比</span></div>
      <div class="card-grid" id="skin-grid">${shown.map(skinCard).join('')}</div>
      <div class="load-more" id="skin-more">${moreButton('skins', list.length, app.visible)}</div>
      ${list.length === 0 ? emptyState('没有找到这套时装', '试试清空「只看动态」，或换个系列 / 关键词。') : ''}
    </div>
  </div>`;
}

/* ---------- dynamics page ---------- */

function renderDynamics() {
  const f = app.filters;
  const list = filteredDynamics();
  const shown = list.slice(0, app.visible);
  return `
  <div class="page">
    <div class="container">
      <header class="page-head">
        <div class="page-head-row">
          <div>
            <span class="kicker">DYNAMIC COMPILE</span>
            <h1 class="page-title">动态集录<span class="en">OFFICIAL MOTION / ${app.dynamicRecords.length}</span></h1>
          </div>
          <p class="page-desc">来自《明日方舟》官方网站「干员动态集录」的公开影像。动态时装的立绘动作、精英二晋升动态，都在这里直接播放。</p>
        </div>
      </header>

      <div class="filterbar">
        <div class="filter-group">
          <span class="filter-label">类型</span>
          <button type="button" class="chip ${f.type === 'ALL' ? 'active' : ''}" data-filter="type" data-value="ALL">全部</button>
          <button type="button" class="chip ${f.type === 'skin' ? 'active' : ''}" data-filter="type" data-value="skin">动态时装</button>
          <button type="button" class="chip ${f.type === 'promotion' ? 'active' : ''}" data-filter="type" data-value="promotion">晋升动态</button>
        </div>
        <div class="filter-sep"></div>
        <div class="filter-group"><span class="filter-label">职业</span>${classChips(f.class)}</div>
        <div class="filter-spacer"></div>
        <label class="field">${icon('search')}<input id="dyn-search" type="search" value="${attr(f.q)}" placeholder="搜索干员 / 时装 / 代号" autocomplete="off"></label>
      </div>

      <div class="result-meta"><span><strong id="dyn-count">${list.length}</strong> 条官方影像 · <strong id="dyn-action-count">${list.reduce((n, r) => n + r.actions.length, 0)}</strong> 段动作</span><span>点击封面直接播放官方 MP4</span></div>
      <div class="dynamics-grid" id="dyn-grid">${shown.map(dynCard).join('')}</div>
      <div class="load-more" id="dyn-more">${moreButton('dynamics', list.length, app.visible)}</div>
      ${list.length === 0 ? emptyState('没有找到相关动态', '换个干员名，或切换类型 / 职业筛选。') : ''}
    </div>
  </div>`;
}

/* ---------- detail: operator ---------- */

function renderOperatorDetail(op) {
  const skins = op.skinIds.map((id) => app.skinById.get(id)).filter(Boolean);
  const e2 = op.hasE2 ? op.artE2 : op.art;
  const e0 = op.hasE0 ? op.art : e2;
  const stageLabel = op.hasE2 ? '精英二立绘' : (op.hasE0 ? '精英一立绘' : '干员立绘');
  const promo = op.promotion;
  return `
  <div class="page">
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/">首页</a><span>/</span><a href="#/operators">干员</a><span>/</span><span>${escapeHTML(op.name)}</span>
      </nav>

      <div class="op-hero" style="--class-color:${attr(op.classColor)}">
        <div class="op-portrait">
          <img src="${attr(op.portrait || e2)}" data-fallback="${attr(e2)}" alt="${attr(op.name)} 立绘">
        </div>
        <div class="op-hero-copy">
          <div class="detail-overline">
            <span class="tag">${escapeHTML(op.professionName)}</span>
            ${stars(op.rarity)}
            ${op.dynamicCount ? `<span class="tag accent">${op.dynamicCount} 套动态时装</span>` : ''}
          </div>
          <h1 class="detail-title">${escapeHTML(op.name)}</h1>
          <p class="detail-en">${escapeHTML(op.en || '')} ${op.displayNumber ? ' / ' + escapeHTML(op.displayNumber) : ''}</p>
          <div class="detail-tags">${op.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>
          ${op.desc ? `<p class="detail-desc">${escapeHTML(op.desc)}</p>` : ''}
          <div class="op-stats">
            <div class="op-stat"><strong>${op.skinCount}</strong><span>OUTFITS / 时装</span></div>
            <div class="op-stat"><strong>${op.dynamicCount}</strong><span>DYNAMIC / 动态</span></div>
            <div class="op-stat"><strong>${op.promotion ? 'YES' : '—'}</strong><span>E2 MOTION / 晋升动态</span></div>
          </div>
          <div class="action-row">
            <a class="btn ghost small" href="${attr(skillSearchURL(op))}" target="_blank" rel="noopener noreferrer">B站找技能演示 ${icon('external')}</a>
            <a class="btn ghost small" href="${OFFICIAL_ARCHIVE}" target="_blank" rel="noopener noreferrer">官方动态集录 ${icon('external')}</a>
          </div>
        </div>
      </div>

      <div class="detail-top">
        <div class="stage-wrap">
          <div class="art-stage" id="op-stage" style="--class-color:${attr(op.classColor)}" data-index="${escapeHTML(op.displayNumber || 'OP')}">
            <img class="layer" id="op-stage-img" src="${attr(e2)}" data-fallback="${attr(e0)}" alt="${attr(op.name)} ${stageLabel}">
            <span class="stage-label" id="op-stage-label">${stageLabel}</span>
            <div class="stage-tools">
              <button class="stage-tool" type="button" data-action="open-lightbox" data-src="${attr(e2)}" data-cap="${attr(op.name)} · ${stageLabel}" aria-label="查看完整立绘">${icon('expand')}</button>
            </div>
          </div>
          <div class="stage-controls">
            ${(op.hasE2 || op.hasE0) ? `<div class="segmented">
              ${op.hasE2 ? `<button type="button" class="active" data-op-art="E2" data-label="精英二立绘" data-src="${attr(op.artE2)}">精英二</button>` : ''}
              ${op.hasE0 ? `<button type="button" class="${op.hasE2 ? '' : 'active'}" data-op-art="E0" data-label="精英一立绘" data-src="${attr(op.art)}">精英一</button>` : ''}
            </div>` : ''}
            <span class="stage-hint">点击右上角查看完整立绘</span>
          </div>
        </div>

        <aside class="info-panel">
          <div class="facts">
            <div class="facts-head"><strong>干员信息</strong><span>OPERATOR DATA</span></div>
            <dl class="fact"><dt>职业</dt><dd><strong>${escapeHTML(op.professionName)}</strong> / ${escapeHTML(op.position === 'MELEE' ? '近战位' : '远程位')}</dd></dl>
            <dl class="fact"><dt>稀有度</dt><dd>${stars(op.rarity)} ${op.rarity} 星</dd></dl>
            <dl class="fact"><dt>编号</dt><dd>${escapeHTML(op.displayNumber || '—')}</dd></dl>
            <dl class="fact"><dt>时装</dt><dd><strong>${op.skinCount}</strong> 套已收录 · <strong>${op.dynamicCount}</strong> 套动态</dd></dl>
            <dl class="fact"><dt>晋升动态</dt><dd>${op.promotion ? '<span class="yes">已收录官方影像</span>' : '<span class="no">未收录</span>'}</dd></dl>
          </div>
          ${op.quote ? `<div class="note">“${escapeHTML(op.quote)}”</div>` : ''}
        </aside>
      </div>

      ${promo ? `
      <section class="dynamic-section">
        <div class="section-head">
          <div><span class="kicker">E2 PROMOTION MOTION</span><h2 class="section-title" style="font-size:clamp(28px,3.4vw,44px)">精英二动态立绘</h2></div>
          <a class="section-link" href="#/dynamics">更多动态 ${icon('arrow')}</a>
        </div>
        <div class="video-card">
          <div class="video-shell">
            <video controls playsinline preload="none" poster="${attr(promo.poster || e2)}"></video>
            <button class="video-cover" type="button" data-action="play-record" data-key="o:${attr(op.id)}" aria-label="播放 ${attr(op.name)} 精英二动态">
              <img src="${attr(promo.poster || e2)}" alt="">
              <span class="play-ring">${playIcon()}</span>
            </button>
          </div>
          <div class="video-caption"><strong>${escapeHTML(op.name)} · 精英二动态</strong><span>${promo.actions.length} 段动作 · 官方 MP4</span></div>
        </div>
      </section>` : ''}

      <section class="dynamic-section">
        <div class="section-head">
          <div><span class="kicker">ALL OUTFITS</span><h2 class="section-title" style="font-size:clamp(28px,3.4vw,44px)">全部时装</h2></div>
          <a class="section-link" href="#/skins?q=${enc(op.name)}">在时装页搜索 ${icon('arrow')}</a>
        </div>
        ${skins.length ? `<div class="card-grid">${skins.map(skinCard).join('')}</div>` : emptyState('暂无收录时装', '该干员目前没有已收录的时装立绘。')}
      </section>
    </div>
  </div>`;
}

/* ---------- detail: skin ---------- */

function renderSkinDetail(skin) {
  const op = app.opById.get(skin.operatorId);
  const e2 = op ? (op.hasE2 ? op.artE2 : (op.art || skin.image)) : skin.image;
  const e0 = op && op.hasE0 ? op.art : e2;
  const canToggleBase = Boolean(op && op.hasE2 && op.hasE0);
  const related = app.data.skins
    .filter((s) => s.operatorId === skin.operatorId && s.id !== skin.id)
    .sort((a, b) => b.release - a.release)
    .slice(0, 8);
  const dyn = skin.dyn;
  const actionCount = dyn ? dyn.actions.length : 0;

  return `
  <div class="page">
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/">首页</a><span>/</span><a href="#/skins">时装</a><span>/</span><span>${escapeHTML(skin.name)}</span>
      </nav>

      <div class="detail">
        <div class="detail-top">
          <div class="stage-wrap">
            <div class="art-stage compare" id="skin-stage" style="--class-color:${attr(skin.classColor)};--split:50%" data-index="${escapeHTML(skin.releaseDate ? skin.releaseDate.slice(0, 4) : 'OUTFIT')}" data-op-id="${attr(skin.operatorId)}">
              <img class="layer base" id="base-layer" src="${attr(e2)}" data-e2="${attr(e2)}" data-e0="${attr(e0)}" data-fallback="${attr(e0)}" alt="${attr(skin.operatorName)} 原立绘">
              <img class="layer skin" id="skin-layer" src="${attr(skin.image)}" data-fallback="${attr(skin.thumb)}" alt="${attr(skin.operatorName)} ${attr(skin.name)} 皮肤立绘">
              <div class="compare-divider"><span class="compare-handle">↔</span></div>
              <input class="compare-range" type="range" min="0" max="100" value="50" aria-label="拖动对比原立绘与皮肤立绘">
              <span class="stage-label" id="stage-label">对比中</span>
              <div class="stage-tools">
                <button class="stage-tool" type="button" data-action="open-lightbox" data-src="${attr(skin.image)}" data-cap="${attr(skin.operatorName)} · ${attr(skin.name)}" aria-label="查看完整皮肤立绘">${icon('expand')}</button>
              </div>
            </div>
            <div class="stage-controls">
              <div class="segmented" id="stage-modes">
                <button type="button" data-stage-mode="base">原立绘</button>
                <button type="button" data-stage-mode="skin">皮肤</button>
                <button type="button" class="active" data-stage-mode="compare">对比</button>
              </div>
              ${canToggleBase ? `<div class="segmented">
                <button type="button" id="base-toggle" data-base-toggle="E2">基准：精英二</button>
              </div>` : ''}
              <span class="stage-hint">拖动画面中的中线</span>
            </div>
          </div>

          <aside class="info-panel">
            <div class="detail-overline">
              <span class="tag" style="border-color:${attr(skin.classColor)};color:${attr(skin.classColor)}">${escapeHTML(skin.professionName)}</span>
              ${stars(skin.rarity)}
              ${dyn ? '<span class="tag accent">动态时装</span>' : '<span class="tag">静态时装</span>'}
            </div>
            <h1 class="detail-title"><span class="op"><a href="#/operator/${enc(skin.operatorId)}">${escapeHTML(skin.operatorName)}</a></span>${escapeHTML(skin.name)}</h1>
            <p class="detail-en">${escapeHTML(skin.id)} ${dyn && dyn.codename ? ' / ' + escapeHTML(dyn.codename) : ''}</p>

            ${skin.description ? `<p class="detail-desc">${escapeHTML(skin.description)}</p>` : ''}

            <dl class="meta-grid">
              <div class="meta-item"><dt>所属系列</dt><dd>${escapeHTML(skin.series || '—')}</dd></div>
              <div class="meta-item"><dt>画师</dt><dd>${escapeHTML(skin.artist || '—')}</dd></div>
              <div class="meta-item"><dt>上架时间</dt><dd>${escapeHTML(fmtDate(skin.releaseDate))}</dd></div>
              <div class="meta-item"><dt>获取方式</dt><dd>${escapeHTML(skin.obtain || '—')}</dd></div>
              <div class="meta-item"><dt>所属时装组</dt><dd>${escapeHTML(skin.group || '—')}</dd></div>
              <div class="meta-item"><dt>官方动态</dt><dd>${dyn ? `<span class="yes">${actionCount} 段动作</span>` : '<span class="no">未收录 / 静态</span>'}</dd></div>
            </dl>

            <div class="action-row">
              ${dyn ? `<button class="btn" type="button" data-action="play-record" data-key="s:${attr(skin.id)}">播放官方动态 ${playIcon()}</button>` : ''}
              <a class="btn ghost" href="${attr(skin.operatorId ? '#/operator/' + enc(skin.operatorId) : '#/skins')}">${skin.operatorId ? '查看干员' : '返回列表'} ${icon('arrow')}</a>
              <a class="btn ghost small" href="${attr(outfitSearchURL(skin))}" target="_blank" rel="noopener noreferrer">B站找演示 ${icon('external')}</a>
            </div>

            <div class="facts">
              <div class="facts-head"><strong>购买前先看</strong><span>QUICK FACTS</span></div>
              <dl class="fact"><dt>立绘类型</dt><dd>${dyn ? '<span class="yes">动态立绘</span> · 含官方动作影像' : '静态立绘'}</dd></dl>
              <dl class="fact"><dt>局内动作</dt><dd>${dyn ? '官方展示了额外立绘动作与入场表现' : '通常不改变技能特效，仅替换立绘与战斗小人'}</dd></dl>
              <dl class="fact"><dt>获取方式</dt><dd>${escapeHTML(skin.obtain || '以游戏内公告为准')}</dd></dl>
              <dl class="fact"><dt>上架时间</dt><dd>${escapeHTML(fmtDate(skin.releaseDate))}</dd></dl>
              <dl class="fact"><dt>官方影像</dt><dd>${dyn ? `<span class="yes">已收录 ${actionCount} 段</span> · 可直接播放` : '<span class="no">暂无动态影像</span>'}</dd></dl>
            </div>

            <div class="note">
              <strong>判断提示：</strong>先看原立绘与皮肤的重叠差异，再播放动态动作。静态时装不会改变技能特效；动态时装的卖点主要是立绘动作、入场动画与配套内容。是否购买，请结合自己的审美与预算。
            </div>
          </aside>
        </div>

        <section class="dynamic-section">
          <div class="section-head">
            <div>
              <span class="kicker">OFFICIAL MOTION</span>
              <h2 class="section-title" style="font-size:clamp(28px,3.4vw,44px)">官方动态演示</h2>
            </div>
            ${dyn ? `<a class="section-link" href="${OFFICIAL_ARCHIVE}" target="_blank" rel="noopener noreferrer">官方来源 ${icon('external')}</a>` : ''}
          </div>
          ${dyn ? `
          <div class="video-card">
            <div class="video-shell">
              <video controls playsinline preload="none" poster="${attr(dyn.poster || skin.image)}"></video>
              <button class="video-cover" type="button" data-action="play-record" data-key="s:${attr(skin.id)}" aria-label="播放 ${attr(skin.operatorName)} ${attr(skin.name)} 官方动态">
                <img src="${attr(dyn.poster || skin.image)}" alt="">
                <span class="play-ring">${playIcon()}</span>
              </button>
            </div>
            <div class="video-caption"><strong>${escapeHTML(skin.operatorName)} · ${escapeHTML(skin.name)}</strong><span>${actionCount} 段动作 · 官方 MP4 · 约 ${Math.round(dyn.actions.reduce((n, a) => n + (a.duration || 0), 0))} 秒</span></div>
            <div class="action-tabs">
              ${dyn.actions.map((a, i) => `<button class="action-tab ${i === 0 ? 'active' : ''}" type="button" data-action="play-record" data-key="s:${attr(skin.id)}" data-index="${i}">${escapeHTML(a.name)}<small>${escapeHTML(fmtDuration(a.duration))}</small></button>`).join('')}
            </div>
          </div>` : `
          <div class="empty-video">
            <strong>这套时装没有官方动态影像</strong>
            静态时装通常不改变技能特效。你仍然可以用上方的对比滑块查看立绘差异，或前往 B 站搜索官方时装展示。
            <div class="action-row"><a class="btn ghost small" href="${attr(outfitSearchURL(skin))}" target="_blank" rel="noopener noreferrer">去 B 站找官方演示 ${icon('external')}</a></div>
          </div>`}
        </section>

        ${related.length ? `
        <section class="dynamic-section related-strip">
          <div class="section-head">
            <div><span class="kicker">MORE FROM THIS OPERATOR</span><h2 class="section-title" style="font-size:clamp(24px,2.8vw,36px)">${escapeHTML(skin.operatorName)} 的其他时装</h2></div>
            <a class="section-link" href="#/operator/${enc(skin.operatorId)}">干员档案 ${icon('arrow')}</a>
          </div>
          <div class="related-row">${related.map(skinCard).join('')}</div>
        </section>` : ''}
      </div>
    </div>
  </div>`;
}

/* ---------- about / 404 ---------- */

function renderAbout() {
  return `
  <div class="page">
    <div class="container">
      <header class="page-head">
        <div class="page-head-row">
          <div><span class="kicker">ABOUT THIS ARCHIVE</span><h1 class="page-title">关于本站<span class="en">A FAN-MADE OUTFIT VIEWER</span></h1></div>
          <p class="page-desc">不是攻略，也不是评分站。只是一个让博士在买皮肤前，能先把官方立绘和动作看清楚的小工具。</p>
        </div>
      </header>
      <div class="prose">
        <h2>为什么要做这个站</h2>
        <p>萌新没有某位干员，却想买她/他的皮肤；商店里只有一张缩略图，很难判断原立绘长什么样、皮肤改动大不大、动态动作是否好看。这个站把官方公开的立绘和动态影像放在一起，让你在购买前能自己判断。</p>
        <h2>数据从哪里来</h2>
        <div class="source-list">
          <div class="source-item"><span>动态时装 / 精英二动态影像与官方海报</span><a href="https://ak.hypergryph.com/archive/dynamicCompile/index.html" target="_blank" rel="noopener noreferrer">干员动态集录 ↗</a></div>
          <div class="source-item"><span>干员、时装、画师、上架时间等结构化数据</span><a href="https://github.com/Kengxxiao/ArknightsGameData" target="_blank" rel="noopener noreferrer">ArknightsGameData ↗</a></div>
          <div class="source-item"><span>立绘 / 头像资源（经 jsDelivr 读取）</span><a href="https://github.com/yuanyan3060/ArknightsGameResource" target="_blank" rel="noopener noreferrer">ArknightsGameResource ↗</a></div>
          <div class="source-item"><span>补充资料与官方公告索引</span><a href="https://prts.wiki/" target="_blank" rel="noopener noreferrer">PRTS Wiki ↗</a></div>
        </div>
        <h2>关于版权</h2>
        <p>《明日方舟》及其角色、时装、影像、音乐等内容的版权归上海鹰角网络科技有限公司所有。本站是非官方粉丝项目，与鹰角网络无隶属关系。</p>
        <ul>
          <li>本站不存储视频文件，只引用官方公开 CDN 上的 MP4 地址，并以流式方式播放。</li>
          <li>立绘资源来自公开的游戏资源镜像，仅用于展示与对比。</li>
          <li>如版权方认为内容不妥，请联系站点维护者，我们会及时移除相关内容。</li>
        </ul>
        <h2>使用说明</h2>
        <ul>
          <li>点击任意时装卡片进入详情页，拖动画面中线即可对比原立绘与皮肤立绘。</li>
          <li>动态标记代表官方发布了动态影像，可在详情页或「动态集录」中直接播放。</li>
          <li>静态时装通常不改变技能特效；动态时装的卖点主要是立绘动作与入场表现。</li>
          <li>数据会随官方更新而重新构建；未收录的内容以游戏内公告与官方账号为准。</li>
        </ul>
        <h2>技术说明</h2>
        <p>纯静态站点，无账号、无追踪、无广告。数据在构建时抓取并清洗，前端使用原生 JavaScript，图片与视频均从公开来源懒加载。</p>
        <div class="note">本站不提供「值不值得买」的主观评分。皮肤是审美消费，官方展示只能帮你把事实看清楚，最终决定仍然属于你。</div>
      </div>
    </div>
  </div>`;
}

function emptyState(title, desc) {
  return `<div class="empty"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(desc)}</p></div>`;
}

function renderNotFound() {
  return `
  <div class="page">
    <div class="container">
      <div class="page-head"><span class="kicker">404 / LOST IN TERRA</span><h1 class="page-title">页面走丢了<span class="en">THIS PAGE IS NOT ON THE LAND SHIP</span></h1></div>
      <div class="empty" style="margin-top:32px">
        <strong>没有找到这个页面</strong>
        <p>可能是链接过期，或者这套时装还没有收录。</p>
        <div class="action-row" style="justify-content:center"><a class="btn" href="#/skins">回到时装回廊 ${icon('arrow')}</a><a class="btn ghost" href="#/">返回首页</a></div>
      </div>
    </div>
  </div>`;
}

/* ---------- render / route ---------- */

function setActiveNav(section) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
}

function setTitle(text) {
  document.title = text ? `${text} · 泰拉衣橱` : '泰拉衣橱 · 明日方舟时装档案';
}

function renderRoute(options = {}) {
  const nav = options.nav !== false;
  const route = parseRoute();
  if (nav) {
    closeTheater();
    closeSearch();
    closeLightbox();
  }
  const section = routeSection(route);
  if (nav) app.visible = section === 'dynamics' ? 24 : 60;
  app.filters = readFilters(route);

  setActiveNav(section);
  const view = $('#view');
  let html = '';
  let title = '';

  if (!route.segs.length) {
    html = renderHome();
    title = '';
  } else if (section === 'operators' && route.segs.length === 1) {
    html = renderOperators();
    title = '干员档案';
  } else if (route.segs[0] === 'operator' && route.segs[1]) {
    const op = app.opById.get(route.segs[1]);
    if (op) { html = renderOperatorDetail(op); title = `${op.name} · 干员档案`; }
    else html = renderNotFound();
  } else if (section === 'skins' && route.segs.length === 1) {
    html = renderSkins();
    title = '时装回廊';
  } else if (route.segs[0] === 'skin' && route.segs[1]) {
    const skin = app.skinById.get(route.segs[1]);
    if (skin) { html = renderSkinDetail(skin); title = `${skin.name} · ${skin.operatorName}`; }
    else html = renderNotFound();
  } else if (section === 'dynamics' && route.segs.length === 1) {
    html = renderDynamics();
    title = '动态集录';
  } else if (section === 'about' && route.segs.length === 1) {
    html = renderAbout();
    title = '关于本站';
  } else {
    html = renderNotFound();
    title = '页面未找到';
  }

  view.innerHTML = html;
  setTitle(title);
  afterRender(route);
  if (nav) {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
}

function afterRender(route) {
  if (route.segs[0] === 'skin' && route.segs[1]) initCompareStage();
  if (route.segs[0] === 'operator' && route.segs[1]) initOperatorStage();
  closeMobileMenu();
}

function initCompareStage() {
  const stage = $('#skin-stage');
  if (!stage) return;
  const range = $('.compare-range', stage);
  if (range) {
    range.addEventListener('input', () => {
      stage.style.setProperty('--split', `${range.value}%`);
    });
  }
  const modeButtons = $$('#stage-modes button');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.stageMode;
      stage.classList.remove('mode-base', 'mode-skin');
      if (mode === 'base') stage.classList.add('mode-base');
      if (mode === 'skin') stage.classList.add('mode-skin');
      modeButtons.forEach((b) => b.classList.toggle('active', b === btn));
      const label = $('#stage-label');
      if (label) label.textContent = mode === 'base' ? '原立绘' : mode === 'skin' ? '皮肤立绘' : '对比中';
      if (mode === 'compare') stage.style.setProperty('--split', '50%');
      if (range && mode === 'compare') range.value = 50;
    });
  });
  const baseToggle = $('#base-toggle');
  const baseLayer = $('#base-layer');
  if (baseToggle && baseLayer) {
    baseToggle.addEventListener('click', () => {
      const useE0 = baseToggle.dataset.baseToggle === 'E2';
      const src = useE0 ? baseLayer.dataset.e0 : baseLayer.dataset.e2;
      baseLayer.src = src;
      baseToggle.dataset.baseToggle = useE0 ? 'E0' : 'E2';
      baseToggle.textContent = useE0 ? '基准：精英一' : '基准：精英二';
    });
  }
}

function initOperatorStage() {
  const img = $('#op-stage-img');
  if (!img) return;
  const label = $('#op-stage-label');
  const buttons = $$('[data-op-art]');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      img.src = btn.dataset.src;
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
      if (label) label.textContent = btn.dataset.label || '立绘';
    });
  });
}

/* ---------- list updates ---------- */

function updateOperatorResults() {
  const grid = $('#operator-grid');
  if (!grid) return;
  const list = filteredOperators();
  grid.innerHTML = list.slice(0, app.visible).map(operatorCard).join('');
  const count = $('#operator-count');
  if (count) count.textContent = list.length;
  const more = $('#operator-more');
  if (more) more.innerHTML = moreButton('operators', list.length, app.visible);
  const empty = list.length === 0;
  let emptyEl = $('.empty', grid.parentElement);
  if (empty && !emptyEl) {
    grid.insertAdjacentHTML('afterend', emptyState('没有找到这位干员', '换个关键词，或清空职业 / 星级筛选。'));
  } else if (!empty && emptyEl) {
    emptyEl.remove();
  }
}

function updateSkinResults() {
  const grid = $('#skin-grid');
  if (!grid) return;
  const list = filteredSkins();
  grid.innerHTML = list.slice(0, app.visible).map(skinCard).join('');
  const count = $('#skin-count');
  if (count) count.textContent = list.length;
  const dynCount = $('#skin-dyn-count');
  if (dynCount) dynCount.textContent = list.filter((s) => s.dyn).length;
  const more = $('#skin-more');
  if (more) more.innerHTML = moreButton('skins', list.length, app.visible);
  const empty = list.length === 0;
  let emptyEl = $('.empty', grid.parentElement);
  if (empty && !emptyEl) {
    grid.insertAdjacentHTML('afterend', emptyState('没有找到这套时装', '试试清空「只看动态」，或换个系列 / 关键词。'));
  } else if (!empty && emptyEl) {
    emptyEl.remove();
  }
}

function updateDynResults() {
  const grid = $('#dyn-grid');
  if (!grid) return;
  const list = filteredDynamics();
  grid.innerHTML = list.slice(0, app.visible).map(dynCard).join('');
  const count = $('#dyn-count');
  if (count) count.textContent = list.length;
  const actionCount = $('#dyn-action-count');
  if (actionCount) actionCount.textContent = list.reduce((n, r) => n + r.actions.length, 0);
  const more = $('#dyn-more');
  if (more) more.innerHTML = moreButton('dynamics', list.length, app.visible);
  const empty = list.length === 0;
  let emptyEl = $('.empty', grid.parentElement);
  if (empty && !emptyEl) {
    grid.insertAdjacentHTML('afterend', emptyState('没有找到相关动态', '换个干员名，或切换类型 / 职业筛选。'));
  } else if (!empty && emptyEl) {
    emptyEl.remove();
  }
}

/* ---------- search ---------- */

let searchTimer = 0;

function openSearch() {
  const modal = $('#search-modal');
  if (!modal) return;
  if (modal.hidden) {
    modal.hidden = false;
    lockBody();
  }
  const input = $('#search-input');
  if (input) {
    input.value = '';
    renderSearchResults('');
    setTimeout(() => input.focus(), 30);
  }
}

function closeSearch() {
  const modal = $('#search-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  unlockBody();
  const trigger = $('[data-action="open-search"]');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function searchScore(item, q) {
  const name = item.name.toLowerCase();
  const sub = item.sub.toLowerCase();
  const op = (item.opName || '').toLowerCase();
  if (name === q) return 120;
  if (name.startsWith(q)) return 100;
  if (op === q) return 95;
  if (name.includes(q)) return 80;
  if (op.startsWith(q)) return 70;
  if (sub.includes(q)) return 50;
  return 0;
}

function renderSearchResults(rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  const resultsEl = $('#search-results');
  const hint = $('#search-hint');
  if (!resultsEl) return;

  let groups = [];
  if (!q) {
    const dyn = app.data.skins.filter((s) => s.dyn).sort((a, b) => b.release - a.release).slice(0, 4);
    const ops = app.data.operators.filter((o) => o.rarity >= 5).slice(0, 4);
    groups = [
      { label: '动态时装 · DYNAMIC', items: dyn.map((s) => ({
        kind: 'skin', name: s.name, sub: `${s.operatorName} · ${s.series}`, thumb: s.thumb,
        href: `#/skin/${enc(s.id)}`, badge: '动态',
      })) },
      { label: '干员 · OPERATORS', items: ops.map((o) => ({
        kind: 'operator', name: o.name, sub: `${o.professionName} · ${o.rarity}★`, thumb: o.portrait,
        href: `#/operator/${enc(o.id)}`, badge: '干员',
      })) },
    ];
  } else {
    const scored = app.searchIndex
      .map((item) => ({ item, score: searchScore(item, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.item.scoreBase || 0) - (a.item.scoreBase || 0))
      .slice(0, 14)
      .map((x) => x.item);
    groups = [
      { label: '干员 · OPERATORS', items: scored.filter((i) => i.kind === 'operator').slice(0, 6).map((i) => ({ ...i, badge: '干员' })) },
      { label: '时装 · OUTFITS', items: scored.filter((i) => i.kind === 'skin').slice(0, 8).map((i) => ({ ...i, badge: i.sub.includes('动态') ? '动态' : '时装' })) },
    ].filter((g) => g.items.length);
  }

  app.searchItems = [];
  let index = 0;
  const html = groups.map((g) => `
    <div class="search-group-label">${escapeHTML(g.label)}</div>
    ${g.items.map((item) => {
      const i = index++;
      app.searchItems.push({ href: item.href, index: i });
      return `<button class="search-item" type="button" data-search-href="${attr(item.href)}" data-index="${i}">
        <span class="search-thumb"><img src="${attr(item.thumb)}" data-fallback="${attr(item.thumb)}" alt="" loading="lazy"></span>
        <span class="search-copy"><strong>${escapeHTML(item.name)}</strong><span>${escapeHTML(item.sub)}</span></span>
        <span class="search-type">${escapeHTML(item.badge)}</span>
      </button>`;
    }).join('')}
  `).join('');

  if (!app.searchItems.length) {
    resultsEl.innerHTML = `<div class="search-empty"><strong>没有找到「${escapeHTML(rawQuery.trim())}」</strong>试试干员中文名、英文名或时装名。</div>`;
    if (hint) hint.textContent = '没有匹配结果。';
    return;
  }
  resultsEl.innerHTML = html;
  app.searchActive = 0;
  setSearchActive(0);
  if (hint) hint.textContent = q ? `找到 ${app.searchItems.length} 个结果；↑↓ 选择，Enter 打开。` : '试试搜索「黍」「能天使」「动态时装」；↑↓ 选择，Enter 打开。';
}

function setSearchActive(index) {
  const items = $$('.search-item');
  if (!items.length) return;
  app.searchActive = Math.max(0, Math.min(index, items.length - 1));
  items.forEach((el, i) => el.classList.toggle('active', i === app.searchActive));
  const active = items[app.searchActive];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function moveSearch(delta) {
  setSearchActive(app.searchActive + delta);
}

/* ---------- theater ---------- */

function openTheaterByKey(key, startIndex = 0) {
  const rec = app.dynamicsByKey.get(key);
  if (!rec || !rec.actions.length) return;
  app.currentTheater = rec;
  const modal = $('#theater');
  const title = $('#theater-title');
  const sub = $('#theater-sub');
  const kicker = $('#theater-kicker');
  const actions = $('#theater-actions');
  if (!modal || !actions) return;

  if (modal.hidden) {
    modal.hidden = false;
    lockBody();
  }
  if (title) title.textContent = `${rec.opName} · ${rec.title}`;
  if (sub) sub.textContent = `${rec.label}${rec.codename ? ' / ' + rec.codename : ''} · ${fmtISO(rec.displayTime)}`;
  if (kicker) kicker.textContent = rec.type === 'skin' ? 'OFFICIAL DYNAMIC OUTFIT' : 'OFFICIAL E2 PROMOTION';
  actions.innerHTML = rec.actions.map((a, i) => `
    <button class="action-tab ${i === startIndex ? 'active' : ''}" type="button" data-theater-index="${i}">
      ${escapeHTML(a.name)}<small>${escapeHTML(fmtDuration(a.duration))}</small>
    </button>`).join('');
  actions.querySelectorAll('[data-theater-index]').forEach((btn) => {
    btn.addEventListener('click', () => setTheaterAction(Number(btn.dataset.theaterIndex)));
  });
  setTheaterAction(startIndex);
}

function setTheaterAction(index) {
  const rec = app.currentTheater;
  if (!rec) return;
  const action = rec.actions[index];
  if (!action) return;
  const video = $('#theater-video');
  const loading = $('#theater-loading');
  if (!video) return;
  $$('#theater-actions .action-tab').forEach((b, i) => b.classList.toggle('active', i === index));
  if (loading) {
    loading.hidden = false;
    loading.innerHTML = '<span></span>正在连接官方 CDN…';
  }
  video.poster = rec.poster || '';
  video.src = action.url;
  video.load();
  const playPromise = video.play();
  if (playPromise && playPromise.catch) playPromise.catch(() => {});
}

function initMedia() {
  const video = $('#theater-video');
  const loading = $('#theater-loading');
  if (!video || !loading) return;
  const hideLoading = () => { loading.hidden = true; };
  video.addEventListener('loadeddata', hideLoading);
  video.addEventListener('canplay', hideLoading);
  video.addEventListener('playing', hideLoading);
  video.addEventListener('waiting', () => {
    if (!video.paused) {
      loading.hidden = false;
      loading.innerHTML = '<span></span>缓冲中…';
    }
  });
  video.addEventListener('error', () => {
    loading.hidden = false;
    loading.innerHTML = '官方视频加载失败，请检查网络或前往官方来源观看。';
  });
}

function closeTheater() {
  const modal = $('#theater');
  const video = $('#theater-video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  if (modal && !modal.hidden) {
    modal.hidden = true;
    unlockBody();
  }
  app.currentTheater = null;
}

/* ---------- lightbox ---------- */

function openLightbox(src, cap) {
  const modal = $('#lightbox');
  const img = $('#lightbox-img');
  const caption = $('#lightbox-cap');
  if (!modal || !img) return;
  img.src = src;
  img.alt = cap || '完整立绘';
  if (caption) caption.textContent = cap || '';
  if (modal.hidden) {
    modal.hidden = false;
    lockBody();
  }
}

function closeLightbox() {
  const modal = $('#lightbox');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  const img = $('#lightbox-img');
  if (img) img.removeAttribute('src');
  unlockBody();
}

/* ---------- mobile menu ---------- */

function closeMobileMenu() {
  const menu = $('#mobile-menu');
  const trigger = $('.menu-trigger');
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
}

function toggleMobileMenu() {
  const menu = $('#mobile-menu');
  const trigger = $('.menu-trigger');
  if (!menu || !trigger) return;
  const open = menu.hidden;
  menu.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}

/* ---------- events ---------- */

document.addEventListener('click', (event) => {
  const target = event.target;

  const actionEl = target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'open-search') { event.preventDefault(); openSearch(); return; }
    if (action === 'close-search') { event.preventDefault(); closeSearch(); return; }
    if (action === 'toggle-menu') { event.preventDefault(); toggleMobileMenu(); return; }
    if (action === 'play-record') {
      event.preventDefault();
      openTheaterByKey(actionEl.dataset.key, Number(actionEl.dataset.index || 0));
      return;
    }
    if (action === 'close-theater') { event.preventDefault(); closeTheater(); return; }
    if (action === 'open-lightbox') {
      event.preventDefault();
      openLightbox(actionEl.dataset.src, actionEl.dataset.cap);
      return;
    }
    if (action === 'close-lightbox') { event.preventDefault(); closeLightbox(); return; }
    if (action === 'load-more') {
      event.preventDefault();
      app.visible += actionEl.dataset.list === 'dynamics' ? 24 : 60;
      if (actionEl.dataset.list === 'operators') updateOperatorResults();
      else if (actionEl.dataset.list === 'skins') updateSkinResults();
      else updateDynResults();
      return;
    }
  }

  const filterEl = target.closest('[data-filter]');
  if (filterEl) {
    event.preventDefault();
    const key = filterEl.dataset.filter;
    if (key === 'dyn') app.filters.dyn = !app.filters.dyn;
    else app.filters[key] = filterEl.dataset.value;
    app.visible = 60;
    syncFilters();
    renderRoute({ nav: false });
    return;
  }

  const searchHit = target.closest('[data-search-href]');
  if (searchHit) {
    event.preventDefault();
    closeSearch();
    navigate(searchHit.dataset.searchHref);
    return;
  }

  const navLink = target.closest('a[href^="#/"]');
  if (navLink) closeMobileMenu();
});

document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-select]');
  if (!select) return;
  if (select.dataset.select === 'operator-sort') app.filters.sort = select.value;
  if (select.dataset.select === 'skin-sort') app.filters.sort = select.value;
  if (select.dataset.select === 'series') app.filters.series = select.value;
  app.visible = 60;
  syncFilters();
  renderRoute({ nav: false });
});

let inputDebounce = 0;
document.addEventListener('input', (event) => {
  const target = event.target;
  if (!['skin-search', 'operator-search', 'dyn-search', 'search-input'].includes(target.id)) return;
  if (target.id === 'search-input') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderSearchResults(target.value), 60);
    return;
  }
  clearTimeout(inputDebounce);
  inputDebounce = setTimeout(() => {
    app.filters.q = target.value;
    app.visible = 60;
    syncFilters();
    if (target.id === 'skin-search') updateSkinResults();
    if (target.id === 'operator-search') updateOperatorResults();
    if (target.id === 'dyn-search') updateDynResults();
  }, 110);
});

document.addEventListener('keydown', (event) => {
  const searchOpen = !$('#search-modal')?.hidden;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
    return;
  }
  if (event.key === '/' && !searchOpen) {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      event.preventDefault();
      openSearch();
    }
    return;
  }
  if (event.key === 'Escape') {
    if (!$('#lightbox')?.hidden) { closeLightbox(); return; }
    if (searchOpen) { closeSearch(); return; }
    if (!$('#theater')?.hidden) { closeTheater(); return; }
    closeMobileMenu();
    return;
  }
  if (searchOpen) {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveSearch(1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveSearch(-1); }
    if (event.key === 'Enter') {
      const active = $('.search-item.active');
      if (active) { event.preventDefault(); active.click(); }
    }
  }
});

document.addEventListener('error', (event) => {
  const img = event.target;
  if (!img || img.tagName !== 'IMG') return;
  if (img.dataset.fallback && img.dataset.fbTried !== '1') {
    img.dataset.fbTried = '1';
    img.src = img.dataset.fallback;
    return;
  }
  if (img.src !== FALLBACK_IMG) {
    img.src = FALLBACK_IMG;
    img.classList.add('img-broken');
  }
}, true);

window.addEventListener('hashchange', () => renderRoute({ nav: true }));

/* ---------- boot ---------- */

async function boot() {
  try {
    app.data = await loadData();
    indexData();
    initMedia();
    const version = $('#footer-version');
    if (version) version.textContent = `数据版本 ${app.data.meta.version} · 构建于 ${app.data.meta.generatedAt.slice(0, 10)}`;
    renderRoute({ nav: true });
  } catch (error) {
    const view = $('#view');
    if (view) {
      view.innerHTML = `<div class="page"><div class="container"><div class="empty" style="margin-top:12vh">
        <strong>数据装载失败</strong>
        <p>${escapeHTML(error.message || '请检查网络后重试。')}</p>
        <div class="action-row" style="justify-content:center"><button class="btn" type="button" data-action="retry">重新加载</button></div>
      </div></div></div>`;
    }
    console.error(error);
  }
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="retry"]')) location.reload();
});

boot();