import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = await mkdtemp(join(tmpdir(), 'local-music-edge-'));
const port = 9339;
const browser = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore', windowsHide: true });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function targets() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`);
      if (response.ok) return response.json();
    } catch { /* navegador ainda iniciando */ }
    await delay(100);
  }
  throw new Error('Edge headless não iniciou a porta de depuração.');
}

try {
  const pages = await targets();
  const page = pages.find(item => item.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'alvo de página não encontrado');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let sequence = 0;
  const waiting = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      exceptions.push(details.exception?.description || details.text);
    }
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:8765/' });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('document.readyState === "complete"')) break;
    await delay(100);
  }
  await delay(500);

  assert.equal(await evaluate('document.querySelector("#screen-home").classList.contains("active")'), true);
  assert.deepEqual(await evaluate(`({
    theme: document.documentElement.dataset.theme,
    background: getComputedStyle(document.body).backgroundColor,
    iconDefault: getComputedStyle(document.documentElement).getPropertyValue('--icon-default').trim(),
    iconActive: getComputedStyle(document.documentElement).getPropertyValue('--icon-active').trim()
  })`), {
    theme: 'dark',
    background: 'rgb(11, 8, 17)',
    iconDefault: 'rgba(255, 255, 255, .62)',
    iconActive: '#d1a0ff'
  }, 'o tema escuro inicial deve aplicar seus tokens de fundo e ícones');
  assert.deepEqual(await evaluate(`({
    emptyVisible: !document.querySelector('#home-empty').hidden,
    contentHidden: document.querySelector('#home-content').hidden,
    lastHidden: document.querySelector('#last-track').hidden,
    contentDisplay: getComputedStyle(document.querySelector('#home-content')).display,
    lastDisplay: getComputedStyle(document.querySelector('#last-track')).display
  })`), { emptyVisible: true, contentHidden: true, lastHidden: true, contentDisplay: 'none', lastDisplay: 'none' }, 'estado vazio inicial incorreto');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'há overflow horizontal no mobile');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#mini-player")).display === "none"'), true, 'miniplayer vazio deve permanecer oculto');
  assert.equal(await evaluate('fetch("manifest.json").then(response => response.json()).then(manifest => manifest.start_url === "./" && manifest.scope === "./")'), true, 'manifest relativo inválido');
  assert.equal(await evaluate('Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 3000))])'), true, 'service worker não ficou pronto');

  await evaluate(`window.showDirectoryPicker = async () => ({
    async *values() {
      yield { kind: 'file', name: 'Alpha.mp3', getFile: async () => new File(['alpha'], 'Alpha.mp3', { type: 'audio/mpeg', lastModified: 1000 }) };
      yield { kind: 'file', name: 'Beta.mp3', getFile: async () => new File(['beta'], 'Beta.mp3', { type: 'audio/mpeg', lastModified: 2000 }) };
    }
  }); document.querySelector('#open-folder-empty').click()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('!document.querySelector("#home-content").hidden')) break;
    await delay(50);
  }
  assert.deepEqual(await evaluate(`({
    emptyHidden: document.querySelector('#home-empty').hidden,
    contentVisible: !document.querySelector('#home-content').hidden,
    lastHidden: document.querySelector('#last-track').hidden,
    emptyDisplay: getComputedStyle(document.querySelector('#home-empty')).display,
    lastDisplay: getComputedStyle(document.querySelector('#last-track')).display,
    recent: [...document.querySelectorAll('#recent-tracks .media-card strong')].map(node => node.textContent),
    playlists: [...document.querySelectorAll('#home-playlists [data-playlist]')].map(node => node.dataset.playlist),
    homeAlbums: document.querySelectorAll('#home-albums').length
  })`), {
    emptyHidden: true,
    contentVisible: true,
    lastHidden: true,
    emptyDisplay: 'none',
    lastDisplay: 'none',
    recent: ['Beta', 'Alpha'],
    playlists: ['favorites'],
    homeAlbums: 0
  }, 'Início carregada deve usar faixas e playlists reais sem inventar última tocada');

  await evaluate("document.querySelector('#recent-tracks .media-card').click()");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('!document.querySelector("#last-track").hidden')) break;
    await delay(50);
  }
  assert.deepEqual(await evaluate(`({
    title: document.querySelector('#last-title').textContent,
    miniVisible: !document.querySelector('#mini-player').hidden
  })`), { title: 'Beta', miniVisible: true }, 'histórico e miniplayer não acompanharam a faixa selecionada');

  assert.deepEqual(await evaluate(`(() => {
    const card = document.querySelector('.last-track').getBoundingClientRect();
    const cover = document.querySelector('#last-cover').getBoundingClientRect();
    const play = document.querySelector('#play-last').getBoundingClientRect();
    return {
      compact: card.height >= 60 && card.height <= 68,
      cover: cover.width >= 44 && cover.width <= 50 && Math.abs(cover.width - cover.height) < 1,
      play: play.width >= 30 && play.width <= 36 && Math.abs(play.width - play.height) < 1
    };
  })()`), { compact: true, cover: true, play: true }, 'Last played must remain compact and proportional');
  const miniPlayerPlacement = await evaluate(`(() => {
    const mini = document.querySelector('#mini-player').getBoundingClientRect();
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    return { distance: Math.abs(mini.bottom - nav.top), miniBottom: mini.bottom, navTop: nav.top };
  })()`);
  assert.ok(miniPlayerPlacement.distance <= 12, `Mini player must sit directly above navigation: ${JSON.stringify(miniPlayerPlacement)}`);

  for (const screen of ['explore', 'playlists', 'profile', 'home']) {
    const active = await evaluate(`document.querySelector('[data-go="${screen}"]').click(); document.querySelector('#screen-${screen}').classList.contains('active')`);
    assert.equal(active, true, `falha ao navegar para ${screen}`);
  }

  assert.equal(await evaluate(`(() => {
    const items = [...document.querySelectorAll('.nav-item')];
    const heights = items.map(item => item.getBoundingClientRect().height);
    return items.every((item, index) => {
      const itemBox = item.getBoundingClientRect();
      const iconBox = item.querySelector('.nav-icon').getBoundingClientRect();
      return Math.abs((iconBox.left + iconBox.width / 2) - (itemBox.left + itemBox.width / 2)) < 1
        && Math.abs(heights[index] - heights[0]) < 1;
    });
  })()`), true, 'ícones da navegação devem compartilhar centro e altura');

  await evaluate('document.querySelector(`[data-go="explore"]`).click()');
  for (const tab of ['tracks', 'albums', 'artists']) {
    const visible = await evaluate(`document.querySelector('[data-tab="${tab}"]').click(); !document.querySelector('#tab-${tab}').hidden`);
    assert.equal(visible, true, `falha ao abrir aba ${tab}`);
  }
  assert.equal(await evaluate("document.querySelectorAll('#albums .album-card').length > 0"), true, 'Álbuns devem permanecer em Explorar');

  const searchRegression = await evaluate(`(() => {
    const input = document.querySelector('#search-input');
    const clear = document.querySelector('#clear-search');
    input.value = 'Alpha';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const beforeTabs = {
      clearButtons: document.querySelectorAll('#clear-search:not([hidden])').length,
      rows: document.querySelectorAll('#all-tracks .track-row').length
    };
    ['albums', 'artists', 'tracks', 'albums', 'tracks'].forEach(tab => document.querySelector('[data-tab="' + tab + '"]').click());
    const afterTabs = document.querySelectorAll('#clear-search:not([hidden])').length;
    document.querySelector('[data-go="home"]').click();
    document.querySelector('[data-go="explore"]').click();
    const afterReopen = document.querySelectorAll('#clear-search:not([hidden])').length;
    clear.click();
    const row = document.querySelector('#all-tracks .track-row');
    const list = document.querySelector('#all-tracks');
    const menu = row.querySelector('.track-more');
    return {
      beforeTabs,
      afterTabs,
      afterReopen,
      cleared: input.value === '',
      focusRetained: document.activeElement === input,
      selectedTab: document.querySelector('.tab.active').dataset.tab,
      clearVisibleAfterReset: !clear.hidden,
      listUsesAvailableWidth: Math.abs(row.getBoundingClientRect().width - list.getBoundingClientRect().width) < 1,
      menuHitArea: menu.getBoundingClientRect().width >= 44 && menu.getBoundingClientRect().height >= 42
    };
  })()`);
  assert.deepEqual(searchRegression, {
    beforeTabs: { clearButtons: 1, rows: 1 },
    afterTabs: 1,
    afterReopen: 1,
    cleared: true,
    focusRetained: true,
    selectedTab: 'tracks',
    clearVisibleAfterReset: false,
    listUsesAvailableWidth: true,
    menuHitArea: true
  }, 'a busca deve manter um único controle de limpeza e a lista deve usar toda a largura útil');

  const albumSquare = await evaluate("document.querySelector('#albums').innerHTML = '<button class=album-card><span class=cover></span><strong>Álbum</strong><small>Artista</small></button>'; document.querySelector('[data-tab=albums]').click(); (() => { const box = document.querySelector('.album-card .cover').getBoundingClientRect(); return Math.abs(box.width - box.height) < 1 && box.width > 100; })()");
  assert.equal(albumSquare, true, 'capas de álbum devem permanecer quadradas');

  const playerFullscreen = await evaluate("document.querySelector('#player-dialog').showModal(); (() => { const dialog = document.querySelector('#player-dialog').getBoundingClientRect(); const cover = document.querySelector('#full-cover').getBoundingClientRect(); return Math.abs(dialog.width - cover.width) < 1 && Math.abs(dialog.height - cover.height) < 1; })()");
  assert.equal(playerFullscreen, true, 'capa do player deve preencher o modal');
  assert.equal(await evaluate(`(() => {
    const shuffle = document.querySelector('#shuffle').getBoundingClientRect();
    const repeat = document.querySelector('#repeat').getBoundingClientRect();
    return Math.abs(shuffle.width - repeat.width) < 1 && Math.abs(shuffle.height - repeat.height) < 1;
  })()`), true, 'shuffle e repeat devem ter áreas clicáveis equivalentes');
  assert.deepEqual(await evaluate(`(() => {
    const repeat = document.querySelector('#repeat');
    repeat.click();
    const queueMode = { mode: repeat.dataset.mode, active: repeat.classList.contains('active') };
    repeat.click();
    const oneMode = { mode: repeat.dataset.mode, oneVisible: getComputedStyle(repeat.querySelector('.repeat-one')).display === 'grid' };
    repeat.click();
    return { queueMode, oneMode, normalMode: repeat.dataset.mode };
  })()`), {
    queueMode: { mode: 'repeat-all', active: true },
    oneMode: { mode: 'repeat-one', oneVisible: true },
    normalMode: 'normal'
  }, 'os três estados de repeat devem permanecer funcionais e legíveis');
  await evaluate("document.querySelector('#player-dialog').close(); document.querySelector('#lyrics-dialog').showModal(); document.querySelector('#lyrics').innerHTML = '<button class=\"lyric-line past\">Verso anterior</button><button class=\"lyric-line active\">Verso atual<span class=translation>Tradução</span></button><button class=lyric-line>Próximo verso</button>'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#lyrics-dialog')).position === 'fixed'"), true, 'letras devem abrir em tela fullscreen');
  await evaluate("document.querySelector('#lyrics-dialog').close()");

  const playlistRegression = await evaluate(`(() => {
    document.querySelector('[data-go="playlists"]').click();
    document.querySelector('#create-playlist').click();
    document.querySelector('#playlist-input').value = 'Playlist de teste';
    document.querySelector('#playlist-save').click();
    const cards = document.querySelectorAll('#playlists [data-playlist]');
    const favorite = document.querySelector('#playlist-overview [data-playlist="favorites"]');
    const gap = cards[0].getBoundingClientRect().top - favorite.getBoundingClientRect().bottom;
    cards[0]?.click();
    return {
      cards: cards.length,
      gap,
      title: document.querySelector('#playlist-title').textContent,
      details: document.querySelectorAll('#playlist-detail').length
    };
  })()`);
  assert.deepEqual(exceptions, [], `exceções antes do fluxo de playlist: ${exceptions.join('; ')}`);
  assert.deepEqual(playlistRegression, { cards: 1, gap: 12, title: 'Playlist de teste', details: 1 }, 'playlists devem abrir uma vez, com o nome correto e espaçamento vertical real');
  await evaluate("document.querySelector('#close-playlist').click()");
  const homePlaylists = await evaluate(`document.querySelector('[data-go="home"]').click(); (() => {
    const cards = [...document.querySelectorAll('#home-playlists [data-playlist]')];
    const ids = cards.map(card => card.dataset.playlist);
    cards[1]?.click();
    return { ids, unique: new Set(ids).size, opened: document.querySelector('#playlist-title').textContent };
  })()`);
  assert.equal(homePlaylists.ids[0], 'favorites', 'Favoritos deve ser a primeira playlist da Início');
  assert.equal(homePlaylists.ids.length, 2, 'Início deve listar Favoritos e a playlist real uma única vez');
  assert.equal(homePlaylists.unique, 2, 'playlists duplicadas na Início');
  assert.equal(homePlaylists.opened, 'Playlist de teste', 'card da Início deve abrir a playlist correspondente');
  await evaluate("document.querySelector('#close-playlist').click()");

  const favoritesRegression = await evaluate(`document.querySelector('[data-go="playlists"]').click(); document.querySelector('[data-playlist="favorites"]').click(); ({
    title: document.querySelector('#playlist-title').textContent,
    detailVisible: !document.querySelector('#playlist-detail').hidden,
    overviewHidden: document.querySelector('#playlist-overview').hidden
  })`);
  assert.deepEqual(favoritesRegression, {
    title: 'Favoritos',
    detailVisible: true,
    overviewHidden: true
  }, 'Favoritos must open its detail even when empty');
  await evaluate("document.querySelector('#close-playlist').click()");

  const playlistDialog = await evaluate('document.querySelector(`[data-go="playlists"]`).click(); document.querySelector(`#create-playlist`).click(); document.querySelector(`#playlist-dialog`).open');
  assert.equal(playlistDialog, true, 'modal de playlist não abriu');
  await evaluate('document.querySelector(`#playlist-dialog`).close()');
  const themeChanged = await evaluate("document.querySelector('[data-go=profile]').click(); document.querySelector('#theme-toggle').click(); document.documentElement.dataset.theme === 'light'");
  assert.equal(themeChanged, true, 'interruptor de tema não alterou o tema');
  await delay(250);
  assert.deepEqual(await evaluate(`({
    background: getComputedStyle(document.body).backgroundColor,
    iconDefault: getComputedStyle(document.documentElement).getPropertyValue('--icon-default').trim(),
    iconActive: getComputedStyle(document.documentElement).getPropertyValue('--icon-active').trim()
  })`), {
    background: 'rgb(248, 247, 251)',
    iconDefault: '#71677d',
    iconActive: '#7e40ca'
  }, 'o tema claro deve atualizar imediatamente os tokens de fundo e ícones');
  assert.equal(await evaluate(`(() => {
    const rows = [...document.querySelectorAll('#screen-profile .settings-row')];
    const heights = rows.map(row => row.getBoundingClientRect().height);
    return document.querySelector('#change-folder .fa-chevron-right') !== null
      && heights.every(height => Math.abs(height - heights[0]) < 1);
  })()`), true, 'Settings rows must align and library change must indicate navigation');

  assert.deepEqual(await evaluate(`(() => {
    const active = document.querySelector('.nav-item.active');
    const style = getComputedStyle(active);
    return {
      background: style.backgroundImage,
      borderTop: style.borderTopWidth,
      shadow: style.boxShadow,
      activeColorDiffersFromInactive: style.color !== getComputedStyle(document.querySelector('.nav-item:not(.active)')).color
    };
  })()`), {
    background: 'none',
    borderTop: '0px',
    shadow: 'none',
    activeColorDiffersFromInactive: true
  }, 'a navegação ativa deve usar somente a cor roxa');

  const favoritesWithTracks = await evaluate(`(() => {
    document.querySelector('[data-go="home"]').click();
    document.querySelector('#mini-open').click();
    document.querySelector('#favorite').click();
    document.querySelector('#close-player').click();
    document.querySelector('[data-go="explore"]').click();
    document.querySelector('[data-tab="tracks"]').click();
    document.querySelector('#all-tracks .track-row > button').click();
    document.querySelector('#mini-open').click();
    document.querySelector('#favorite').click();
    document.querySelector('#close-player').click();
    document.querySelector('[data-go="playlists"]').click();
    document.querySelector('#playlist-overview [data-playlist="favorites"]').click();
    return {
      title: document.querySelector('#playlist-title').textContent,
      tracks: [...document.querySelectorAll('#playlist-tracks .track-copy strong')].map(node => node.textContent),
      count: document.querySelector('#favorites-count').textContent
    };
  })()`);
  assert.deepEqual(favoritesWithTracks, {
    title: 'Favoritos',
    tracks: ['Beta', 'Alpha'],
    count: '2 músicas'
  }, 'Favoritos deve abrir após trocar tema e navegar pelas abas, com todas as músicas curtidas');

  const favoriteRemoval = await evaluate(`(() => {
    document.querySelector('#playlist-tracks .track-more').click();
    document.querySelector('[data-track-action="remove"]').click();
    return {
      tracks: [...document.querySelectorAll('#playlist-tracks .track-copy strong')].map(node => node.textContent),
      count: document.querySelector('#favorites-count').textContent
    };
  })()`);
  assert.deepEqual(favoriteRemoval, {
    tracks: ['Alpha'],
    count: '1 música'
  }, 'remover uma faixa dos Favoritos deve atualizar o detalhe e a contagem');
  await evaluate("document.querySelector('#close-playlist').click()");

  await evaluate("document.querySelector('[data-go=home]').click()");
  for (const viewport of [
    { width: 375, height: 812, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 430, height: 932, mobile: true },
    { width: 768, height: 1024, mobile: false },
    { width: 1280, height: 800, mobile: false }
  ]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1 });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `há overflow horizontal em ${viewport.width}x${viewport.height}`);
  }
  assert.equal(await evaluate('getComputedStyle(document.querySelector(`.bottom-nav`)).position === "fixed"'), true, 'sidebar desktop não está fixa');

  await send('Page.reload', { ignoreCache: false });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('document.readyState === "complete"')) break;
    await delay(100);
  }
  await delay(300);
  assert.deepEqual(await evaluate(`({
    emptyVisible: !document.querySelector('#home-empty').hidden,
    contentHidden: document.querySelector('#home-content').hidden,
    miniHidden: document.querySelector('#mini-player').hidden,
    contentDisplay: getComputedStyle(document.querySelector('#home-content')).display,
    miniDisplay: getComputedStyle(document.querySelector('#mini-player')).display,
    persistedPlaylist: JSON.parse(localStorage.getItem('lm_playlists') || '[]').length,
    theme: document.documentElement.dataset.theme,
    background: getComputedStyle(document.body).backgroundColor
  })`), { emptyVisible: false, contentHidden: false, miniHidden: true, contentDisplay: 'block', miniDisplay: 'none', persistedPlaylist: 1, theme: 'light', background: 'rgb(248, 247, 251)' }, 'recarregar deve restaurar a biblioteca persistida e preservar o tema');

  await evaluate(`window.showDirectoryPicker = async () => ({
    async *values() {
      yield { kind: 'file', name: 'Alpha.mp3', getFile: async () => new File(['alpha'], 'Alpha.mp3', { type: 'audio/mpeg', lastModified: 1000 }) };
      yield { kind: 'file', name: 'Beta.mp3', getFile: async () => new File(['beta'], 'Beta.mp3', { type: 'audio/mpeg', lastModified: 2000 }) };
    }
  }); document.querySelector('#open-folder-empty').click()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('!document.querySelector("#home-content").hidden')) break;
    await delay(50);
  }
  const favoritePersistence = await evaluate(`(() => {
    document.querySelector('[data-go="playlists"]').click();
    document.querySelector('#playlist-overview [data-playlist="favorites"]').click();
    return {
      title: document.querySelector('#playlist-title').textContent,
      tracks: [...document.querySelectorAll('#playlist-tracks .track-copy strong')].map(node => node.textContent)
    };
  })()`);
  assert.deepEqual(favoritePersistence, {
    title: 'Favoritos',
    tracks: ['Alpha']
  }, 'Favoritos persistidos devem abrir depois de recarregar e reabrir a biblioteca');
  await evaluate('document.querySelector("#close-playlist").click(); document.querySelector("[data-go=explore]").click(); window.showDirectoryPicker = async () => ({ async *values() { yield { kind: "file", name: "Use Your Heart (Interlude) [_RVCDKS5D4c].mp3", getFile: async () => new File(["ID3audio"], "Use Your Heart (Interlude) [_RVCDKS5D4c].mp3", { type: "audio/mpeg", lastModified: 3000 }) }; yield { kind: "file", name: "Use Your Heart (Interlude) [_RVCDKS5D4c].lrc", getFile: async () => new File(["[00:17.539]Use your heart\\n[00:21.199]And not your eyes"], "Use Your Heart (Interlude) [_RVCDKS5D4c].lrc", { type: "text/plain", lastModified: 3000 }) }; yield { kind: "file", name: "Use Your Heart (Interlude) [_RVCDKS5D4c].pt-BR.lrc", getFile: async () => new File(["[00:17.539]Use seu coração\\n[00:21.199]E não seus olhos"], "Use Your Heart (Interlude) [_RVCDKS5D4c].pt-BR.lrc", { type: "text/plain", lastModified: 3000 }) }; } }); document.querySelector("#open-folder").click()');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('[...document.querySelectorAll("#all-tracks .track-copy strong")].some(node => node.textContent === "Use Your Heart (Interlude)")')) break;
    await delay(50);
  }
  await evaluate('const row = [...document.querySelectorAll("#all-tracks .track-row")].find(item => item.querySelector(".track-copy strong").textContent === "Use Your Heart (Interlude)"); row.querySelector("button").click()');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('document.querySelectorAll("#lyrics .lyric-line").length === 2')) break;
    await delay(50);
  }
  assert.deepEqual(await evaluate('({ original: [...document.querySelectorAll("#lyrics .lyric-base")].map(node => node.textContent), static: document.querySelectorAll("#lyrics .lyric-line.static").length })'), {
    original: ['Use your heart', 'And not your eyes'],
    static: 0
  }, 'LRC do Nexo não foi carregado no player');
  assert.equal(await evaluate('document.querySelector("#lyrics-dialog").showModal(); document.querySelector("#lyrics").dispatchEvent(new WheelEvent("wheel", { bubbles: true })); !document.querySelector("#lyrics-return-current").hidden'), true, 'rolagem manual deve oferecer retorno ao verso atual');
  assert.equal(await evaluate('document.querySelector("#lyrics-return-current").click(); document.querySelector("#lyrics-return-current").hidden'), true, 'controle deve restaurar o acompanhamento automático');
  await evaluate('document.querySelector("#lyrics-dialog").close(); document.querySelector("#lyrics-translation").click()');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#lyrics .translation")].map(node => node.textContent)'), ['Use seu coração', 'E não seus olhos'], 'tradução LRC não foi associada à letra original');
  await evaluate('window.showDirectoryPicker = async () => ({ async *values() { yield { kind: "file", name: "Playback fixture.wav", getFile: async () => { const bytes = new Uint8Array(8044); const view = new DataView(bytes.buffer); bytes.set([82, 73, 70, 70], 0); view.setUint32(4, 8036, true); bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true); bytes.set([100, 97, 116, 97], 36); view.setUint32(40, 8000, true); bytes.fill(128, 44); return new File([bytes], "Playback fixture.wav", { type: "audio/wav", lastModified: 4000 }); } }; } }); document.querySelector("#open-folder").click()');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('[...document.querySelectorAll("#all-tracks .track-copy strong")].some(node => node.textContent.startsWith("Playback fixture"))')) break;
    await delay(50);
  }
  await evaluate('(() => { const playbackRow = [...document.querySelectorAll("#all-tracks .track-row")].find(item => item.querySelector(".track-copy strong").textContent.startsWith("Playback fixture")); playbackRow.querySelector("button").click(); })()');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate('document.querySelector("#audio-player").readyState >= 1')) break;
    await delay(50);
  }
  assert.equal(await evaluate('document.querySelector("#audio-player").readyState >= 1'), true, 'o player não carregou uma faixa WAV válida');
  assert.deepEqual(exceptions, [], `exceções no navegador: ${exceptions.join('; ')}`);
  socket.close();
  console.log('browser-smoke.mjs: navegação, manifest e layouts móvel/desktop passaram');
} finally {
  browser.kill();
  await delay(350);
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
}
