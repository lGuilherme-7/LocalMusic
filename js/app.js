import Storage from './storage.js';
import Library from './library.js';
import Player from './player.js';
import Queue from './queue.js';
import Lyrics from './lyrics.js';
import Favorites from './favorites.js';
import Playlists from './playlists.js';
import MediaSession from './media-session.js';

const $ = id => document.getElementById(id);
const text = (value, fallback = '—') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const formatDuration = value => Player.formatTime(Number(value) || 0);
const themeColors = Object.freeze({ light: '#f8f7fb', dark: '#0b0811' });

const iconClasses = Object.freeze({
  play: ['fa-solid', 'fa-play'],
  pause: ['fa-solid', 'fa-pause'],
  spinner: ['fa-solid', 'fa-spinner', 'fa-spin'],
  folder: ['fa-solid', 'fa-folder-open'],
  music: ['fa-solid', 'fa-music'],
  home: ['fa-solid', 'fa-house'],
  compass: ['fa-solid', 'fa-magnifying-glass'],
  library: ['fa-solid', 'fa-list-ul'],
  user: ['fa-solid', 'fa-user'],
  search: ['fa-solid', 'fa-magnifying-glass'],
  close: ['fa-solid', 'fa-xmark'],
  plus: ['fa-solid', 'fa-plus'],
  heart: ['fa-solid', 'fa-heart'],
  'chevron-right': ['fa-solid', 'fa-chevron-right'],
  'chevron-left': ['fa-solid', 'fa-chevron-left'],
  'chevron-down': ['fa-solid', 'fa-chevron-down'],
  more: ['fa-solid', 'fa-ellipsis'],
  previous: ['fa-solid', 'fa-backward-step'],
  next: ['fa-solid', 'fa-forward-step'],
  shuffle: ['fa-solid', 'fa-shuffle'],
  repeat: ['fa-solid', 'fa-repeat'],
  queue: ['fa-solid', 'fa-list'],
  edit: ['fa-solid', 'fa-pen-to-square'],
  trash: ['fa-solid', 'fa-trash'],
  'arrow-up': ['fa-solid', 'fa-chevron-up'],
  'arrow-down': ['fa-solid', 'fa-chevron-down'],
  external: ['fa-solid', 'fa-arrow-up-right-from-square']
});

function icon(name, className = 'icon') {
  const element = document.createElement('i');
  element.classList.add(...className.split(' ').filter(Boolean), ...(iconClasses[name] || iconClasses.music));
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function setIcon(element, name) {
  element.replaceChildren(icon(name));
}

let currentPlaylist = null;
let currentAlbum = null;
let currentLyrics = [];
let currentLyricsStatus = 'unavailable';
let currentLyricIndex = -1;
let showTranslations = false;
let lyricsAutoScroll = true;
let lyricLineElements = [];
let lyricWordElements = [];
let lyricsFrameId = null;
let lyricsProgrammaticScroll = false;
let lyricsProgrammaticScrollTimer = null;
let lyricsResumeTimer = null;
let lyricLoadRevision = 0;
let pendingTrack = null;
let pendingContext = null;
let queueRestored = false;
let toastTimer = null;
let deferredInstallPrompt = null;
let currentCoverKey = null;
let exploreRenderRevision = 0;
let viewportBaselineHeight = 0;
let viewportUpdateFrame = null;
const coverRevisions = new WeakMap();
const observedCovers = new Set();

const coverObserver = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      coverObserver.unobserve(entry.target);
      observedCovers.delete(entry.target);
      entry.target.__loadLocalMusicCover?.();
    });
  }, { rootMargin: '320px 0px' })
  : null;

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function isTextInput(element) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element?.isContentEditable;
}

function updateViewportState({ resetBaseline = false } = {}) {
  const viewport = window.visualViewport;
  const visibleHeight = viewport?.height || window.innerHeight;
  if (resetBaseline) viewportBaselineHeight = visibleHeight;
  viewportBaselineHeight = Math.max(viewportBaselineHeight, visibleHeight);
  const focusedInput = isTextInput(document.activeElement);
  const heightLoss = viewportBaselineHeight - visibleHeight;
  const keyboardOpen = focusedInput && heightLoss > Math.max(100, viewportBaselineHeight * 0.16);
  const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
  const keyboardInset = keyboardOpen
    ? Math.max(0, layoutHeight - visibleHeight - (viewport?.offsetTop || 0))
    : 0;
  document.documentElement.toggleAttribute('data-keyboard-open', keyboardOpen);
  document.documentElement.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
  document.documentElement.style.setProperty('--visual-viewport-height', `${visibleHeight}px`);
}

function scheduleViewportUpdate(options) {
  if (viewportUpdateFrame) cancelAnimationFrame(viewportUpdateFrame);
  viewportUpdateFrame = requestAnimationFrame(() => {
    viewportUpdateFrame = null;
    updateViewportState(options);
  });
}

function updateInstallOption() {
  const button = $('install-app');
  if (!button) return;
  button.hidden = isStandalone() || !deferredInstallPrompt;
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallOption();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  updateInstallOption();
  toast('Local Music foi instalado.');
});

function cleanupCoverObservers() {
  observedCovers.forEach(element => {
    if (element.isConnected) return;
    coverObserver?.unobserve(element);
    observedCovers.delete(element);
  });
}

function cover(element, track, large = false, priority = false) {
  if (!element) return;
  coverObserver?.unobserve(element);
  observedCovers.delete(element);
  const revision = (coverRevisions.get(element) || 0) + 1;
  coverRevisions.set(element, revision);
  element.replaceChildren();
  element.classList.toggle('cover-large', large);
  element.classList.remove('cover-loading', 'cover-error');
  element.removeAttribute('aria-busy');
  element.append(icon('music'));
  const sourceTrack = track?.coverSourceTrack || track;
  if (!sourceTrack || (!sourceTrack.cover && !sourceTrack.coverFile && !sourceTrack.coverData)) {
    element.dataset.coverState = 'missing';
    return;
  }
  element.dataset.coverState = 'loading';
  element.classList.add('cover-loading');
  element.setAttribute('aria-busy', 'true');
  element.__loadLocalMusicCover = () => {
    if (coverRevisions.get(element) !== revision) return;
    const source = Library.getCoverUrl(sourceTrack, { pin: priority });
    if (!source) {
      element.dataset.coverState = 'missing';
      element.classList.remove('cover-loading');
      element.removeAttribute('aria-busy');
      return;
    }
    const loadSource = (imageSource, canRefreshBlobUrl) => {
      const image = new Image();
      image.alt = `Capa de ${text(track.title || track.name, 'música')}`;
      image.loading = priority ? 'eager' : 'lazy';
      image.decoding = 'async';
      if (priority) image.fetchPriority = 'high';
      image.addEventListener('load', () => {
        if (coverRevisions.get(element) !== revision) return;
        element.replaceChildren(image);
        element.dataset.coverState = 'loaded';
        element.classList.remove('cover-loading', 'cover-error');
        element.removeAttribute('aria-busy');
      }, { once: true });
      image.addEventListener('error', async () => {
        if (coverRevisions.get(element) !== revision) return;
        if (canRefreshBlobUrl) {
          const refreshed = Library.refreshCoverUrl(sourceTrack, imageSource);
          if (refreshed) {
            loadSource(refreshed, false);
            return;
          }
        }
        const fallback = await Library.recoverCover(sourceTrack, imageSource);
        if (coverRevisions.get(element) !== revision) return;
        if (fallback) {
          loadSource(fallback, false);
          return;
        }
        element.dataset.coverState = 'missing';
        element.classList.remove('cover-loading');
        element.classList.add('cover-error');
        element.removeAttribute('aria-busy');
      }, { once: true });
      image.src = imageSource;
    };
    loadSource(source, source.startsWith('blob:'));
  };
  if (priority || !coverObserver) {
    element.__loadLocalMusicCover();
  } else {
    observedCovers.add(element);
    coverObserver.observe(element);
  }
}

function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2400);
}

function createTrackCopy(track, showDuration = true) {
  const copy = document.createElement('span');
  copy.className = 'track-copy';
  const title = document.createElement('strong');
  title.textContent = text(track.title);
  const meta = document.createElement('small');
  meta.textContent = `${text(track.artist, 'Artista desconhecido')}${showDuration ? ` · ${formatDuration(track.duration)}` : ''}`;
  copy.append(title, meta);
  return copy;
}

function bindLongPress(element, callback) {
  let timer = null;
  let fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  element.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      callback();
      navigator.vibrate?.(15);
    }, 550);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(type => element.addEventListener(type, cancel));
  element.addEventListener('click', event => {
    if (!fired) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    fired = false;
  }, true);
}

function renderTrackRow(track, context, options = {}) {
  const row = document.createElement('li');
  row.className = 'track-row';
  row.dataset.trackId = track.id;
  row.classList.toggle('playing', Player.getCurrentTrack()?.id === track.id);
  const play = document.createElement('button');
  play.type = 'button';
  play.setAttribute('aria-label', `Reproduzir ${text(track.title)}`);
  const art = document.createElement('span');
  art.className = 'cover';
  cover(art, track);
  play.append(art, createTrackCopy(track));
  play.addEventListener('click', () => playTrack(track, context));
  bindLongPress(play, () => openTrackMenu(track, options));
  row.append(play);
  if (options.reorder) {
    const reorder = document.createElement('span');
    reorder.className = 'row-reorder';
    const up = document.createElement('button');
    const down = document.createElement('button');
    up.type = down.type = 'button';
    setIcon(up, 'arrow-up');
    setIcon(down, 'arrow-down');
    up.setAttribute('aria-label', 'Mover para cima');
    down.setAttribute('aria-label', 'Mover para baixo');
    up.disabled = options.index === 0;
    down.disabled = options.index === options.total - 1;
    up.addEventListener('click', () => options.reorder(options.index, options.index - 1));
    down.addEventListener('click', () => options.reorder(options.index, options.index + 1));
    reorder.append(up, down);
    row.append(reorder);
  }
  const menu = document.createElement('button');
  menu.type = 'button';
  menu.className = 'track-more';
  setIcon(menu, 'more');
  menu.setAttribute('aria-label', `Opções para ${text(track.title)}`);
  menu.addEventListener('click', event => {
    event.stopPropagation();
    openTrackMenu(track, options);
  });
  row.append(menu);
  return row;
}

function playTrack(track, context) {
  const list = context?.length ? context : Library.getTracks();
  Queue.set(list, Math.max(0, list.findIndex(item => item.id === track.id)));
  Player.loadTrack(track);
  updateModeButtons();
}

function mediaCard(track, context) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'media-card';
  const art = document.createElement('span');
  art.className = 'cover';
  cover(art, track);
  const title = document.createElement('strong');
  title.textContent = text(track.title || track.name);
  const subtitle = document.createElement('small');
  subtitle.textContent = text(track.artist, track.count ? `${track.count} músicas` : 'Artista desconhecido');
  button.append(art, title, subtitle);
  button.addEventListener('click', () => {
    if (track.id) playTrack(track, context);
    else {
      showScreen('explore');
      $('search-input').value = track.name;
      showExploreTab('albums');
      renderExplore();
    }
  });
  return button;
}

function coverKey(track) {
  if (!track) return '';
  if (track.coverFile) {
    return [
      track.coverName || track.coverFile.name,
      track.coverFile.size,
      track.coverFile.lastModified
    ].join(':');
  }
  if (track.coverData) return `data:${track.coverData.length}`;
  return track.cover || '';
}

function updateCurrentCovers(track, force = false) {
  const nextKey = coverKey(track);
  if (!force && nextKey === currentCoverKey) return;
  currentCoverKey = nextKey;
  cover($('mini-cover'), track, false, true);
  cover($('full-cover'), track, false, true);
  cover($('lyrics-cover'), track, false, true);
  MediaSession.updateTrack(track);
}

function homePlaylistCard(playlist) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'media-card home-playlist-card';
  button.dataset.playlist = playlist.id;
  const tracks = playlistTracks(playlist);
  const art = document.createElement('span');
  art.className = 'cover';
  cover(art, tracks[0]);
  if (!tracks[0]) art.classList.add('playlist-placeholder');
  const title = document.createElement('strong');
  title.textContent = text(playlist.name, 'Sem título');
  const subtitle = document.createElement('small');
  subtitle.textContent = `${tracks.length} música${tracks.length === 1 ? '' : 's'}`;
  button.append(art, title, subtitle);
  button.addEventListener('click', () => {
    showScreen('playlists');
    openPlaylist(playlist.id);
  });
  return button;
}

function renderHome() {
  const tracks = Library.getTracks();
  const hasLibrary = tracks.length > 0;
  $('home-empty').hidden = hasLibrary;
  $('home-content').hidden = !hasLibrary;
  if (!hasLibrary) return;
  const last = Library.getTrackById(Storage.get('lm_last_track'));
  $('last-track').hidden = !last;
  if (last) {
    cover($('last-cover'), last);
    $('last-title').textContent = text(last.title);
    $('last-artist').textContent = text(last.artist, 'Artista desconhecido');
  }
  const recent = [...tracks].sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded))).slice(0, 10);
  $('recent-tracks').replaceChildren(...recent.map(track => mediaCard(track, tracks)));
  const playlists = [{ id: 'favorites', name: 'Favoritos', readOnly: true }, ...allPlaylists()];
  $('home-playlists').replaceChildren(...playlists.map(homePlaylistCard));
  cleanupCoverObservers();
}

function normalized(value) {
  return String(value || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function filteredTracks() {
  const query = normalized($('search-input').value.trim());
  const mode = $('sort-tracks').value;
  const result = Library.getTracks().filter(track => !query || [track.title, track.artist, track.album].some(value => normalized(value).includes(query)));
  result.sort((a, b) => {
    if (mode === 'za') return text(b.title).localeCompare(text(a.title));
    if (mode === 'recent') return String(b.dateAdded).localeCompare(String(a.dateAdded));
    if (mode === 'plays') return (b.playCount || 0) - (a.playCount || 0);
    if (mode === 'artist') return text(a.artist).localeCompare(text(b.artist));
    if (mode === 'album') return text(a.album).localeCompare(text(b.album));
    return text(a.title).localeCompare(text(b.title));
  });
  return result;
}

function renderIncrementally(container, values, createElement, revision, emptyMessage = '') {
  container.replaceChildren();
  if (!values.length) {
    if (emptyMessage) container.append(emptyList(emptyMessage));
    return;
  }
  let cursor = 0;
  const appendBatch = () => {
    if (revision !== exploreRenderRevision || !container.isConnected) return;
    const fragment = document.createDocumentFragment();
    const end = Math.min(cursor + 100, values.length);
    while (cursor < end) {
      fragment.append(createElement(values[cursor], cursor));
      cursor += 1;
    }
    container.append(fragment);
    cleanupCoverObservers();
    if (cursor < values.length) {
      const schedule = window.requestIdleCallback
        ? callback => window.requestIdleCallback(callback, { timeout: 120 })
        : callback => setTimeout(callback, 0);
      schedule(appendBatch);
    }
  };
  appendBatch();
}

function renderExplore() {
  const revision = ++exploreRenderRevision;
  const tracks = filteredTracks();
  syncSearchControls();
  renderIncrementally(
    $('all-tracks'),
    tracks,
    track => renderTrackRow(track, tracks),
    revision,
    'Nenhuma música encontrada.'
  );
  const query = normalized($('search-input').value.trim());
  const albums = Library.getAlbums().filter(album => !query || normalized(album.name).includes(query) || normalized(album.artist).includes(query));
  renderIncrementally($('albums'), albums, album => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'album-card';
    const art = document.createElement('span');
    art.className = 'cover';
    cover(art, album);
    const title = document.createElement('strong');
    title.textContent = text(album.name, 'Álbum');
    const subtitle = document.createElement('small');
    subtitle.textContent = text(album.artist, `${album.count} músicas`);
    button.append(art, title, subtitle);
    button.addEventListener('click', () => openAlbum(album.id));
    return button;
  }, revision, 'Nenhum álbum identificado.');
  const artists = Library.getArtists().filter(artist => !query || normalized(artist.name).includes(query));
  renderIncrementally($('artists'), artists, artist => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'artist-row';
    const name = document.createElement('span');
    name.textContent = text(artist.name, 'Artista desconhecido');
    const count = document.createElement('small');
    count.textContent = `${artist.count} música${artist.count === 1 ? '' : 's'}`;
    button.append(name, count);
    button.addEventListener('click', () => filterByArtist(artist.name));
    item.append(button);
    return item;
  }, revision);
}

function setExploreOverviewVisible(visible) {
  const elements = [
    document.querySelector('#screen-explore > .app-header'),
    document.querySelector('#screen-explore > .search-field'),
    document.querySelector('#screen-explore > .filters'),
    document.querySelector('#screen-explore > .tabs'),
    ...document.querySelectorAll('#screen-explore > .tab-panel')
  ];
  elements.forEach(element => {
    if (!element) return;
    if (visible && element.classList.contains('tab-panel')) {
      const selected = document.querySelector('.tab.active')?.dataset.tab;
      element.hidden = element.id !== `tab-${selected}`;
    } else {
      element.hidden = !visible;
    }
  });
  $('album-detail').hidden = visible;
}

function openAlbum(id) {
  currentAlbum = Library.getAlbums().find(album => album.id === id) || null;
  if (!currentAlbum) return;
  setExploreOverviewVisible(false);
  cover($('album-cover'), currentAlbum, true, true);
  $('album-title').textContent = currentAlbum.name;
  $('album-artist').textContent = text(currentAlbum.artist, 'Artista desconhecido');
  const year = currentAlbum.year ? ` · ${currentAlbum.year}` : '';
  $('album-summary').textContent = `${currentAlbum.count} música${currentAlbum.count === 1 ? '' : 's'}${year}`;
  $('album-tracks').replaceChildren(...currentAlbum.tracks.map(track => renderTrackRow(track, currentAlbum.tracks)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeAlbum() {
  currentAlbum = null;
  setExploreOverviewVisible(true);
}

function syncSearchControls() {
  const input = $('search-input');
  $('clear-search').hidden = !input.value.trim();
}

function emptyList(message) {
  const item = document.createElement('li');
  item.className = 'empty-list';
  item.textContent = message;
  return item;
}

function playlistTracks(playlist) {
  if (!playlist) return [];
  const ids = playlist.id === 'favorites' ? Favorites.getAll() : (playlist.tracks || []);
  const uniqueIds = [...new Set(ids)];
  return uniqueIds.map(id => Library.getTrackById(id)).filter(Boolean);
}

function allPlaylists() {
  const unique = new Map();
  [...Library.getFolders(), ...Playlists.getAll()].forEach(playlist => {
    if (playlist?.kind === 'imported-collection' && Playlists.isCollectionHidden(playlist.id)) return;
    if (playlist?.id && playlist.id !== 'favorites' && !unique.has(playlist.id)) unique.set(playlist.id, playlist);
  });
  return [...unique.values()];
}

function playlistCard(playlist, onSelect = () => openPlaylist(playlist.id)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'playlist-card';
  button.dataset.playlist = playlist.id;
  const iconWrap = document.createElement('span');
  iconWrap.className = 'playlist-icon';
  iconWrap.append(icon(playlist.id === 'favorites' ? 'heart' : playlist.readOnly ? 'folder' : 'music'));
  const copy = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = text(playlist.name, 'Sem título');
  const count = document.createElement('small');
  count.textContent = `${playlistTracks(playlist).length} músicas`;
  copy.append(name, count);
  const arrow = icon('chevron-right', 'icon playlist-arrow');
  button.append(iconWrap, copy, arrow);
  button.addEventListener('click', onSelect);
  return button;
}

function renderPlaylists() {
  $('favorites-count').textContent = `${Favorites.count()} música${Favorites.count() === 1 ? '' : 's'}`;
  $('playlists').replaceChildren(...allPlaylists().map(playlist => playlistCard(playlist)));
}

function findPlaylist(id) {
  if (id === 'favorites') return { id: 'favorites', name: 'Favoritos', readOnly: true };
  return Library.getFolders().find(folder => folder.id === id) || Playlists.getById(id);
}

function openPlaylist(id) {
  currentPlaylist = findPlaylist(id);
  if (!currentPlaylist) return;
  $('playlist-overview').hidden = true;
  $('playlist-detail').hidden = false;
  $('playlist-name').textContent = currentPlaylist.name;
  $('playlist-title').textContent = currentPlaylist.name;
  const editable = !currentPlaylist.readOnly && currentPlaylist.id !== 'favorites';
  $('rename-playlist').hidden = !editable;
  $('delete-playlist').hidden = currentPlaylist.id === 'favorites';
  $('delete-playlist').setAttribute('aria-label', currentPlaylist.readOnly ? 'Ocultar coleção importada' : 'Excluir playlist');
  renderPlaylistDetail();
}

function renderPlaylistDetail() {
  const tracks = playlistTracks(currentPlaylist);
  const total = tracks.reduce((sum, track) => sum + (Number(track.duration) || 0), 0);
  $('playlist-summary').textContent = `${tracks.length} música${tracks.length === 1 ? '' : 's'} · ${formatDuration(total)}`;
  cover($('playlist-cover'), tracks[0], true);
  const editable = currentPlaylist && !currentPlaylist.readOnly && currentPlaylist.id !== 'favorites';
  $('playlist-tracks').replaceChildren(...tracks.map((track, index) => renderTrackRow(track, tracks, {
    playlist: currentPlaylist,
    removable: currentPlaylist?.id === 'favorites' || editable,
    reorder: editable ? (from, to) => {
      if (Playlists.moveTrack(currentPlaylist.id, from, to)) renderPlaylistDetail();
    } : null,
    index,
    total: tracks.length
  })));
  if (!tracks.length) $('playlist-tracks').append(emptyList('Nenhuma música nesta playlist.'));
}

function closePlaylist() {
  $('playlist-overview').hidden = false;
  $('playlist-detail').hidden = true;
  currentPlaylist = null;
}

async function updatePlayer(track) {
  if (!track) return;
  const lyricsRevision = ++lyricLoadRevision;
  $('mini-player').hidden = false;
  updateCurrentCovers(track, true);
  $('mini-title').textContent = text(track.title);
  $('mini-artist').textContent = text(track.artist, 'Artista desconhecido');
  $('full-title').textContent = text(track.title);
  $('full-artist').textContent = text(track.artist, 'Artista desconhecido');
  $('lyrics-title').textContent = text(track.title);
  $('lyrics-artist').textContent = text(track.artist, 'Artista desconhecido');
  updateFavoriteButton(track);
  Library.recordPlay(track.id);
  void Library.ensureMetadata(track, { refresh: true }).then(updated => {
    if (!updated || Player.getCurrentTrack()?.id !== track.id) return;
    $('mini-title').textContent = text(track.title);
    $('mini-artist').textContent = text(track.artist, 'Artista desconhecido');
    $('full-title').textContent = text(track.title);
    $('full-artist').textContent = text(track.artist, 'Artista desconhecido');
    $('lyrics-title').textContent = text(track.title);
    $('lyrics-artist').textContent = text(track.artist, 'Artista desconhecido');
    updateCurrentCovers(track, true);
    renderHome();
  });
  const lyricResult = await Lyrics.loadWithStatus(track);
  if (lyricsRevision !== lyricLoadRevision || Player.getCurrentTrack()?.id !== track.id) return;
  currentLyrics = lyricResult.lines;
  currentLyricsStatus = lyricResult.status;
  currentLyricIndex = -1;
  stopLyricsAnimation();
  setLyricsAutoScroll(true);
  showTranslations = false;
  $('lyrics-translation').classList.remove('active');
  $('lyrics-translation').setAttribute('aria-pressed', 'false');
  $('lyrics-translation').setAttribute('aria-label', 'Mostrar tradução');
  renderLyrics();
  updateLyricsTime(Player.getCurrentTime(), { immediate: true, force: true });
  renderPlayingRows();
  renderHome();
  renderQueue();
}

function updateFavoriteButton(track) {
  const active = Favorites.isFavorite(track.id);
  setIcon($('favorite'), 'heart');
  $('favorite').classList.toggle('active', active);
  $('favorite').setAttribute('aria-label', active ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
}

function renderPlayingRows() {
  const id = Player.getCurrentTrack()?.id;
  document.querySelectorAll('[data-track-id]').forEach(row => row.classList.toggle('playing', row.dataset.trackId === id));
}

function updatePlayState() {
  const state = Player.getState();
  const playing = Player.isPlaying();
  const loading = state === 'loading';
  ['toggle-play', 'toggle-play-full', 'toggle-play-lyrics'].forEach(id => {
    setIcon($(id), loading ? 'spinner' : playing ? 'pause' : 'play');
    $(id).setAttribute('aria-label', loading ? 'Carregando música' : playing ? 'Pausar' : 'Reproduzir');
    $(id).setAttribute('aria-busy', String(loading));
  });
}

function updateTime({ current, duration: total, ratio }) {
  const percentage = `${Math.max(0, Math.min(100, ratio * 100))}%`;
  $('mini-progress').style.setProperty('--value', percentage);
  $('full-progress').style.setProperty('--value', percentage);
  $('lyrics-progress').style.setProperty('--value', percentage);
  $('current-time').textContent = formatDuration(current);
  $('duration').textContent = formatDuration(total || Player.getCurrentTrack()?.duration);
  $('lyrics-current-time').textContent = formatDuration(current);
  $('lyrics-duration').textContent = formatDuration(total || Player.getCurrentTrack()?.duration);
  updateLyricsTime(current);
}

function createLyricOriginal(line, index) {
  const original = document.createElement('span');
  original.className = 'lyric-original';
  const base = document.createElement('span');
  base.className = 'lyric-base';
  lyricWordElements[index] = [];
  if (!line.tokens.length) {
    base.textContent = line.original;
    original.append(base);
    return original;
  }
  let cursor = 0;
  line.tokens.forEach((token, tokenIndex) => {
    if (token.startChar > cursor) base.append(document.createTextNode(line.original.slice(cursor, token.startChar)));
    const word = document.createElement('span');
    word.className = 'lyric-word';
    word.dataset.token = tokenIndex;
    const wordBase = document.createElement('span');
    wordBase.className = 'lyric-word-base';
    wordBase.textContent = line.original.slice(token.startChar, token.endChar);
    const wordFill = document.createElement('span');
    wordFill.className = 'lyric-word-fill';
    wordFill.setAttribute('aria-hidden', 'true');
    wordFill.textContent = wordBase.textContent;
    word.append(wordBase, wordFill);
    base.append(word);
    lyricWordElements[index].push(word);
    cursor = token.endChar;
  });
  if (cursor < line.original.length) base.append(document.createTextNode(line.original.slice(cursor)));
  original.append(base);
  return original;
}

function renderLyrics({ preservePosition = false } = {}) {
  const root = $('lyrics');
  const activeElement = lyricLineElements[currentLyricIndex];
  const anchor = preservePosition && activeElement
    ? { index: currentLyricIndex, offset: activeElement.offsetTop - root.scrollTop }
    : null;
  root.replaceChildren();
  lyricLineElements = [];
  lyricWordElements = [];
  if (!currentLyrics.length) {
    const message = document.createElement('p');
    message.className = 'lyrics-empty';
    message.textContent = currentLyricsStatus === 'invalid'
      ? 'A letra desta faixa não pôde ser interpretada.'
      : currentLyricsStatus === 'error'
        ? 'Não foi possível carregar a letra desta faixa.'
        : 'Letra não disponível para esta faixa.';
    root.append(message);
    return;
  }
  currentLyrics.forEach((line, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lyric-line';
    button.dataset.index = index;
    button.classList.toggle('static', !line.timed);
    button.classList.toggle('word-timed', line.tokens.length > 0);
    button.disabled = !line.timed;
    button.append(createLyricOriginal(line, index));
    if (showTranslations && line.translated) {
      const translation = document.createElement('span');
      translation.className = 'translation';
      translation.textContent = line.translated;
      button.append(translation);
    }
    if (line.timed) {
      button.addEventListener('click', () => {
        setLyricsAutoScroll(true);
        Player.seek(line.start);
        updateLyricsTime(line.start, { immediate: true, force: true });
      });
    }
    lyricLineElements[index] = button;
    root.append(button);
  });
  if (anchor && lyricLineElements[anchor.index]) {
    root.scrollTop = Math.max(0, lyricLineElements[anchor.index].offsetTop - anchor.offset);
  }
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function setWordProgress(element, progress) {
  const value = `${Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10}%`;
  if (element.style.getPropertyValue('--word-progress') !== value) element.style.setProperty('--word-progress', value);
}

function updateLineWordProgress(index, time, completed = false) {
  const words = lyricWordElements[index] || [];
  if (!words.length) return;
  const progress = completed ? words.map(() => 1) : Lyrics.tokenProgresses(currentLyrics[index], time);
  words.forEach((word, wordIndex) => setWordProgress(word, progress[wordIndex] || 0));
}

function updateLyricStates(activeIndex, time) {
  lyricLineElements.forEach((element, index) => {
    element.classList.toggle('active', index === activeIndex);
    element.classList.toggle('past', activeIndex >= 0 && index < activeIndex);
    updateLineWordProgress(index, time, activeIndex >= 0 && index < activeIndex);
  });
}

function scrollActiveLyricIntoView(index, immediate = false) {
  const root = $('lyrics');
  const element = lyricLineElements[index];
  if (!element || !root || !lyricsAutoScroll) return;
  const readingPosition = root.clientHeight * 0.38;
  const target = Math.max(0, Math.min(
    root.scrollHeight - root.clientHeight,
    element.offsetTop + element.offsetHeight / 2 - readingPosition
  ));
  if (Math.abs(root.scrollTop - target) < 12) return;
  lyricsProgrammaticScroll = true;
  root.scrollTo({ top: target, behavior: immediate || prefersReducedMotion() ? 'auto' : 'smooth' });
  clearTimeout(lyricsProgrammaticScrollTimer);
  lyricsProgrammaticScrollTimer = window.setTimeout(() => {
    lyricsProgrammaticScroll = false;
  }, immediate ? 100 : 900);
}

function updateLyricsTime(time, { immediate = false, force = false } = {}) {
  const activeIndex = Lyrics.activeIndex(currentLyrics, time);
  const changed = force || activeIndex !== currentLyricIndex;
  if (changed) {
    currentLyricIndex = activeIndex;
    updateLyricStates(activeIndex, time);
    if (activeIndex >= 0 && $('lyrics-dialog').open) scrollActiveLyricIntoView(activeIndex, immediate);
    return;
  }
  if (activeIndex >= 0) updateLineWordProgress(activeIndex, time);
}

function setLyricsAutoScroll(enabled) {
  lyricsAutoScroll = enabled;
  $('lyrics-return-current').hidden = enabled;
  clearTimeout(lyricsResumeTimer);
  lyricsResumeTimer = null;
  if (!enabled) {
    lyricsResumeTimer = window.setTimeout(() => {
      if (!$('lyrics-dialog').open) return;
      setLyricsAutoScroll(true);
      updateLyricsTime(Player.getCurrentTime(), { force: true });
    }, 4500);
  }
}

function startLyricsAnimation() {
  if (lyricsFrameId || !Player.isPlaying() || !$('lyrics-dialog').open || document.hidden
    || !currentLyrics.some(line => line.timed)) return;
  const tick = () => {
    if (!Player.isPlaying() || !$('lyrics-dialog').open || document.hidden) {
      lyricsFrameId = null;
      return;
    }
    updateLyricsTime(Player.getCurrentTime());
    lyricsFrameId = requestAnimationFrame(tick);
  };
  lyricsFrameId = requestAnimationFrame(tick);
}

function stopLyricsAnimation() {
  if (lyricsFrameId) cancelAnimationFrame(lyricsFrameId);
  lyricsFrameId = null;
}

function renderQueue() {
  const queue = Queue.getQueue();
  const currentIndex = Queue.getIndex();
  const current = Queue.current();
  $('queue-current').replaceChildren(current ? createTrackCopy(current, false) : document.createTextNode('Nada tocando'));
  $('queue-list').replaceChildren(...queue.slice(currentIndex + 1).map((track, offset) => {
    const position = currentIndex + offset + 1;
    const item = document.createElement('li');
    item.className = 'queue-item';
    item.draggable = true;
    item.dataset.position = position;
    const drag = document.createElement('span');
    drag.className = 'drag';
    drag.append(icon('queue'));
    item.append(drag, createTrackCopy(track, false));
    const actions = document.createElement('span');
    actions.className = 'queue-actions';
    [['arrow-up', 'Subir', position - 1], ['arrow-down', 'Descer', position + 1]].forEach(([iconName, aria, target]) => {
      const button = document.createElement('button');
      button.type = 'button';
      setIcon(button, iconName);
      button.setAttribute('aria-label', aria);
      button.disabled = target <= currentIndex || target >= queue.length;
      button.addEventListener('click', () => { Queue.moveTrack(position, target); renderQueue(); });
      actions.append(button);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    setIcon(remove, 'close');
    remove.setAttribute('aria-label', 'Remover da fila');
    remove.addEventListener('click', () => { Queue.removeTrack(position); renderQueue(); });
    actions.append(remove);
    item.append(actions);
    item.querySelector('.track-copy').addEventListener('click', () => {
      const selected = Queue.playAt(position);
      if (selected) Player.loadTrack(selected);
      $('queue-dialog').close();
    });
    item.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', String(position)));
    item.addEventListener('dragover', event => event.preventDefault());
    item.addEventListener('drop', event => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain'));
      if (Queue.moveTrack(from, position)) renderQueue();
    });
    return item;
  }));
}

function openTrackMenu(track, options = {}) {
  pendingTrack = track;
  pendingContext = options;
  cover($('track-menu-cover'), track);
  $('track-menu-title').textContent = text(track.title);
  $('track-menu-artist').textContent = text(track.artist, 'Artista desconhecido');
  const favorite = document.querySelector('[data-track-action="favorite"]');
  favorite.textContent = Favorites.isFavorite(track.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
  document.querySelector('[data-track-action="remove"]').hidden = !options.removable;
  $('track-menu-dialog').showModal();
}

function openAdd(track) {
  pendingTrack = track;
  const playlists = Playlists.getAll();
  $('add-playlist-list').replaceChildren(...playlists.map(playlist => {
    const button = playlistCard(playlist, () => {
      Playlists.addTrack(playlist.id, track.id);
      $('add-dialog').close();
      renderPlaylists();
      renderHome();
      toast('Adicionada à playlist');
    });
    return button;
  }));
  if (!playlists.length) $('add-playlist-list').append(emptyList('Crie uma playlist primeiro.'));
  $('add-dialog').showModal();
}

function handleTrackAction(action) {
  const track = pendingTrack;
  if (!track) return;
  $('track-menu-dialog').close();
  if (action === 'next') { Queue.addNext(track); toast('Será reproduzida a seguir'); }
  if (action === 'queue') { Queue.addEnd(track); toast('Adicionada ao final da fila'); }
  if (action === 'favorite') {
    Favorites.toggle(track.id);
    renderPlaylists();
    renderHome();
    if (Player.getCurrentTrack()?.id === track.id) updateFavoriteButton(track);
  }
  if (action === 'playlist') openAdd(track);
  if (action === 'artist') filterByArtist(track.artist);
  if (action === 'remove') {
    if (pendingContext.playlist?.id === 'favorites') Favorites.remove(track.id);
    else if (pendingContext.playlist) Playlists.removeTrack(pendingContext.playlist.id, track.id);
    renderPlaylistDetail();
    renderPlaylists();
    renderHome();
    toast('Removida da playlist');
  }
}

function closeOpenDialogs() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
}

function filterByArtist(artist) {
  closeOpenDialogs();
  showScreen('explore');
  $('search-input').value = artist;
  showExploreTab('tracks');
  renderExplore();
}

function showExploreTab(name) {
  if (currentAlbum) closeAlbum();
  document.querySelectorAll('.tab').forEach(tab => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach(panel => { panel.hidden = panel.id !== `tab-${name}`; });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('active', screen.id === `screen-${name}`));
  document.querySelectorAll('.nav-item').forEach(button => {
    const active = button.dataset.go === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (name === 'explore') {
    if (!currentAlbum) setExploreOverviewVisible(true);
    renderExplore();
  }
  if (name === 'playlists') renderPlaylists();
  if (name === 'profile') renderProfile();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderProfile() {
  const stats = Library.getStats();
  $('stat-tracks').textContent = stats.tracks;
  $('stat-artists').textContent = stats.artists;
  $('stat-albums').textContent = stats.albums;
  const visibleCollections = Library.getFolders().filter(folder => !Playlists.isCollectionHidden(folder.id));
  $('stat-playlists').textContent = Playlists.count() + visibleCollections.length + 1;
  const profile = Storage.get('lm_user_profile') || {};
  $('profile-name').value = profile.name || 'Seu nome';
  $('avatar').replaceChildren();
  if (profile.avatar) {
    const image = new Image();
    image.src = profile.avatar;
    image.alt = '';
    $('avatar').append(image);
  } else {
    $('avatar').textContent = (profile.name || '?').slice(0, 1).toUpperCase();
  }
}

function openPlaylistDialog(playlist = null) {
  $('playlist-dialog').dataset.id = playlist?.id || '';
  $('playlist-dialog-title').textContent = playlist ? 'Renomear playlist' : 'Nova playlist';
  $('playlist-input').value = playlist?.name || '';
  $('playlist-dialog').showModal();
  $('playlist-input').focus();
}

function updateModeButtons() {
  $('shuffle').classList.toggle('active', Queue.isShuffled());
  $('shuffle').setAttribute('aria-pressed', String(Queue.isShuffled()));
  const repeat = Queue.getRepeatMode();
  $('repeat').classList.toggle('active', repeat !== 'normal');
  $('repeat').dataset.mode = repeat;
  $('repeat').setAttribute('aria-pressed', String(repeat !== 'normal'));
  $('repeat').setAttribute('aria-label', repeat === 'repeat-one' ? 'Repetir música atual' : repeat === 'repeat-all' ? 'Repetir fila' : 'Repetição desativada');
}

function bindSeek(element) {
  const seekFromEvent = event => {
    const bounds = element.getBoundingClientRect();
    Player.seekRatio(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)));
  };
  element.addEventListener('pointerdown', event => {
    element.setPointerCapture?.(event.pointerId);
    seekFromEvent(event);
  });
  element.addEventListener('pointermove', event => {
    if (element.hasPointerCapture?.(event.pointerId)) seekFromEvent(event);
  });
  element.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') Player.seek(Player.getCurrentTime() - 5);
    if (event.key === 'ArrowRight') Player.seek(Player.getCurrentTime() + 5);
  });
}

function openLyrics() {
  if (!Player.getCurrentTrack()) return;
  setLyricsAutoScroll(true);
  $('player-dialog').close();
  $('lyrics-dialog').showModal();
  updateLyricsTime(Player.getCurrentTime(), { immediate: true, force: true });
  startLyricsAnimation();
}

function closeLyrics() {
  stopLyricsAnimation();
  $('lyrics-dialog').close();
  $('player-dialog').showModal();
}

function bind() {
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showScreen(button.dataset.go)));
  const importSummary = () => {
    const result = Library.getLastImportReport();
    const tracks = result.imported + result.updated;
    if (!tracks) return 'Nenhuma música compatível foi encontrada.';
    const details = [];
    if (result.lyrics) details.push(result.lyrics + ' letra' + (result.lyrics === 1 ? '' : 's'));
    if (result.translations) details.push(result.translations + ' tradução' + (result.translations === 1 ? '' : 'ões'));
    return tracks + ' faixa' + (tracks === 1 ? '' : 's') + ' importada' + (tracks === 1 ? '' : 's') + (details.length ? ' · ' + details.join(', ') : '');
  };
  const openLibrary = () => Library.openFolder()
    .then(opened => toast(opened ? importSummary() : 'Nenhuma música compatível foi encontrada.'))
    .catch(() => toast('Não foi possível abrir a biblioteca.'));
  ['open-folder', 'open-folder-empty', 'change-folder'].forEach(id => $(id).addEventListener('click', openLibrary));
  $('import-files').addEventListener('click', () => {
    Library.importFiles()
      .then(opened => toast(opened ? importSummary() : 'Nenhuma música compatível foi encontrada.'))
      .catch(() => toast('Não foi possível importar os arquivos selecionados.'));
  });
  $('install-app').addEventListener('click', async () => {
    const prompt = deferredInstallPrompt;
    if (!prompt) return;
    deferredInstallPrompt = null;
    updateInstallOption();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice?.outcome === 'accepted') toast('Instalação iniciada.');
    } catch {
      toast('Não foi possível iniciar a instalação.');
    }
  });
  $('play-last').addEventListener('click', () => {
    const track = Library.getTrackById(Storage.get('lm_last_track'));
    if (track) playTrack(track, Library.getTracks());
  });
  $('search-input').addEventListener('input', renderExplore);
  $('search-input').addEventListener('search', renderExplore);
  $('clear-search').addEventListener('click', () => {
    $('search-input').value = '';
    renderExplore();
    $('search-input').focus();
  });
  $('sort-tracks').addEventListener('change', renderExplore);
  document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => showExploreTab(button.dataset.tab)));
  $('close-album').addEventListener('click', closeAlbum);
  $('play-album').addEventListener('click', () => {
    if (currentAlbum?.tracks.length) playTrack(currentAlbum.tracks[0], currentAlbum.tracks);
  });
  $('queue-album').addEventListener('click', () => {
    if (!currentAlbum?.tracks.length) return;
    currentAlbum.tracks.forEach(track => Queue.addEnd(track));
    toast('Álbum adicionado à fila');
  });

  document.querySelector('#playlist-overview [data-playlist="favorites"]')
    .addEventListener('click', () => openPlaylist('favorites'));
  $('create-playlist').addEventListener('click', () => openPlaylistDialog());
  $('close-playlist').addEventListener('click', closePlaylist);
  $('play-playlist').addEventListener('click', () => {
    const tracks = playlistTracks(currentPlaylist);
    if (tracks.length) playTrack(tracks[0], tracks);
  });
  $('shuffle-playlist').addEventListener('click', () => {
    const tracks = playlistTracks(currentPlaylist);
    if (!tracks.length) return;
    Queue.set(tracks, 0);
    Queue.setShuffle(true);
    Player.loadTrack(Queue.current());
    updateModeButtons();
  });
  $('queue-playlist').addEventListener('click', () => {
    playlistTracks(currentPlaylist).forEach(track => Queue.addEnd(track));
    toast('Playlist adicionada à fila');
  });
  $('rename-playlist').addEventListener('click', () => openPlaylistDialog(currentPlaylist));
  $('delete-playlist').addEventListener('click', () => {
    const importedCollection = currentPlaylist?.kind === 'imported-collection';
    const question = importedCollection
      ? 'Ocultar esta coleção importada? As músicas continuarão na biblioteca.'
      : 'Excluir esta playlist?';
    if (confirm(question)) {
      const removed = importedCollection
        ? Playlists.hideCollection(currentPlaylist.id)
        : Playlists.remove(currentPlaylist.id);
      if (!removed) {
        toast('Não foi possível salvar a exclusão.');
        return;
      }
      closePlaylist();
      renderPlaylists();
      renderHome();
      renderProfile();
      toast(importedCollection ? 'Coleção ocultada' : 'Playlist excluída');
    }
  });
  $('playlist-save').addEventListener('click', () => {
    const name = $('playlist-input').value.trim();
    if (!name) return;
    const id = $('playlist-dialog').dataset.id;
    if (id) Playlists.rename(id, name); else Playlists.create(name);
    $('playlist-dialog').close();
    renderPlaylists();
    renderHome();
  });
  $('playlist-cancel').addEventListener('click', () => $('playlist-dialog').close());

  $('mini-open').addEventListener('click', () => $('player-dialog').showModal());
  $('close-player').addEventListener('click', () => $('player-dialog').close());
  ['prev', 'prev-full', 'prev-lyrics'].forEach(id => $(id).addEventListener('click', Player.prev));
  ['next', 'next-full', 'next-lyrics'].forEach(id => $(id).addEventListener('click', Player.next));
  ['toggle-play', 'toggle-play-full', 'toggle-play-lyrics'].forEach(id => $(id).addEventListener('click', Player.togglePlayPause));
  ['mini-progress', 'full-progress', 'lyrics-progress'].forEach(id => bindSeek($(id)));
  $('shuffle').addEventListener('click', () => {
    Queue.setShuffle(!Queue.isShuffled());
    updateModeButtons();
  });
  $('repeat').addEventListener('click', () => {
    Queue.cycleRepeat();
    updateModeButtons();
  });
  $('favorite').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (!track) return;
    Favorites.toggle(track.id);
    updateFavoriteButton(track);
    renderPlaylists();
    renderHome();
  });
  $('focus-lyrics').addEventListener('click', openLyrics);
  $('close-lyrics').addEventListener('click', closeLyrics);
  $('lyrics-translation').addEventListener('click', () => {
    if (!currentLyrics.some(line => line.translated)) {
      toast('Tradução não disponível');
      return;
    }
    showTranslations = !showTranslations;
    $('lyrics-translation').classList.toggle('active', showTranslations);
    $('lyrics-translation').setAttribute('aria-pressed', String(showTranslations));
    $('lyrics-translation').setAttribute('aria-label', showTranslations ? 'Ocultar tradução' : 'Mostrar tradução');
    renderLyrics({ preservePosition: true });
    updateLyricsTime(Player.getCurrentTime(), { immediate: true, force: true });
  });
  const pauseAutoScroll = () => setLyricsAutoScroll(false);
  $('lyrics').addEventListener('wheel', pauseAutoScroll, { passive: true });
  $('lyrics').addEventListener('touchmove', pauseAutoScroll, { passive: true });
  $('lyrics').addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) pauseAutoScroll();
  });
  $('lyrics').addEventListener('scroll', () => {
    if (!lyricsProgrammaticScroll) pauseAutoScroll();
  }, { passive: true });
  $('lyrics-return-current').addEventListener('click', () => {
    setLyricsAutoScroll(true);
    updateLyricsTime(Player.getCurrentTime(), { immediate: true, force: true });
  });

  $('player-menu').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (track) openTrackMenu(track);
  });
  $('lyrics-queue').addEventListener('click', () => {
    renderQueue();
    $('queue-dialog').showModal();
  });
  $('lyrics-menu').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (track) openTrackMenu(track);
  });
  $('clear-queue-modal').addEventListener('click', () => {
    if (confirm('Limpar todas as próximas músicas?')) {
      Queue.clear();
      renderQueue();
    }
  });
  $('theme-toggle').addEventListener('change', event => {
    const theme = applyTheme(event.target.checked ? 'light' : 'dark');
    Storage.set('lm_theme', theme);
  });
  $('profile-name').addEventListener('change', event => {
    const profile = Storage.get('lm_user_profile') || {};
    profile.name = event.target.value.trim() || 'Seu nome';
    Storage.set('lm_user_profile', profile);
    renderProfile();
  });
  $('avatar').addEventListener('click', () => $('avatar-input').click());
  $('avatar-input').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2_000_000) {
      toast('Escolha uma imagem de até 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const profile = Storage.get('lm_user_profile') || {};
      profile.avatar = reader.result;
      Storage.set('lm_user_profile', profile);
      renderProfile();
    }, { once: true });
    reader.readAsDataURL(file);
  });

  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $(button.dataset.closeDialog).close()));
  document.querySelectorAll('[data-track-action]').forEach(button => button.addEventListener('click', () => handleTrackAction(button.dataset.trackAction)));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  }));
  $('lyrics-dialog').addEventListener('close', stopLyricsAnimation);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLyricsAnimation();
    else {
      updateLyricsTime(Player.getCurrentTime(), { immediate: true, force: true });
      startLyricsAnimation();
    }
  });
  window.addEventListener('resize', () => {
    if ($('lyrics-dialog').open && currentLyricIndex >= 0 && lyricsAutoScroll) {
      scrollActiveLyricIntoView(currentLyricIndex, true);
    }
    scheduleViewportUpdate();
  }, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleViewportUpdate, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate, { passive: true });
  document.addEventListener('focusin', () => scheduleViewportUpdate());
  document.addEventListener('focusout', () => window.setTimeout(scheduleViewportUpdate, 80));
  window.addEventListener('orientationchange', () => {
    viewportBaselineHeight = 0;
    window.setTimeout(() => scheduleViewportUpdate({ resetBaseline: true }), 250);
  }, { passive: true });
}

function applyTheme(theme) {
  const activeTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = activeTheme;
  document.querySelector('meta[name="theme-color"]').content = themeColors[activeTheme];
  return activeTheme;
}

function renderAll() {
  renderHome();
  renderPlaylists();
  renderProfile();
  if ($('screen-explore').classList.contains('active')) renderExplore();
  if (currentAlbum && !$('album-detail').hidden) openAlbum(currentAlbum.id);
  if (!$('playlist-detail').hidden && currentPlaylist) renderPlaylistDetail();
}

function handleFatalStartup(error) {
  console.error('Local Music: falha durante a inicialização.', error);
  window.__localMusicStartupFailed?.(error);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  try {
    if (sessionStorage.getItem('lm_sw_reload_pending') === '1') {
      sessionStorage.removeItem('lm_sw_reload_pending');
    }
  } catch {
    // sessionStorage é opcional para a recuperação da atualização.
  }
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      try {
        sessionStorage.setItem('lm_sw_reload_pending', '1');
      } catch {
        // A atualização continua válida mesmo sem sessionStorage.
      }
      location.reload();
    }, { once: true });
  }
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
    void registration.update().catch(() => {});
  } catch (error) {
    console.warn('Local Music: o modo offline não pôde ser atualizado.', error);
  }
}

async function init() {
  const theme = applyTheme(Storage.get('lm_theme'));
  $('theme-toggle').checked = theme === 'light';
  updateModeButtons();
  bind();
  updateViewportState({ resetBaseline: true });
  updateInstallOption();
  Library.onUpdate(tracks => {
    if (!queueRestored && tracks.length) {
      Queue.restore(tracks);
      queueRestored = true;
      updateModeButtons();
    }
    renderAll();
    const currentTrack = Player.getCurrentTrack();
    if (currentTrack) updateCurrentCovers(currentTrack);
  });
  Player.onTrack(updatePlayer);
  Player.onPlay(() => {
    updatePlayState();
    startLyricsAnimation();
  });
  Player.onPause(() => {
    updatePlayState();
    stopLyricsAnimation();
  });
  Player.onState(updatePlayState);
  Player.onTime(updateTime);
  Player.onSeek(time => {
    setLyricsAutoScroll(true);
    updateLyricsTime(time, { immediate: true, force: true });
  });
  Player.onPlaybackBlocked(() => {
    toast('Toque em reproduzir para continuar esta música.');
  });
  Player.onError((error, context) => {
    console.warn('Local Music player:', context?.operation || 'media', {
      trackId: context?.track?.id || Player.getCurrentTrack()?.id || null,
      name: error?.name || 'MediaError'
    });
    toast('Não foi possível reproduzir esta música. Tente novamente ou avance para a próxima.');
  });
  MediaSession.setup(Player);
  void registerServiceWorker();
  renderAll();
  try {
    const restored = await Library.restore();
    if (restored) {
      Playlists.removeOrphanedTrackReferences(new Set(Library.getTracks().map(track => track.id)));
    }
  } catch (error) {
    console.warn('Local Music: não foi possível restaurar a biblioteca.', error);
    toast('Ocorreu um problema ao abrir a biblioteca. Você pode tentar novamente recarregando o app.');
  }
  renderAll();
  $('startup-error').hidden = true;
  document.documentElement.dataset.appReady = 'true';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    void init().catch(handleFatalStartup);
  }, { once: true });
} else {
  void init().catch(handleFatalStartup);
}
