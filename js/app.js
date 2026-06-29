/**
 * app.js
 * Ponto de entrada do Local Music.
 * Inicializa o app, carrega estado, registra service worker,
 * conecta módulos e define roteamento via navbar.
 */

import Storage   from './storage.js';
import Library   from './library.js';
import Player    from './player.js';
import Queue     from './queue.js';
import Search    from './search.js';
import Playlists from './playlists.js';
import Favorites from './favorites.js';
import UI        from './ui.js';

const $ = id => document.getElementById(id);

let _sortMode = 'name';

// ── Inicialização ─────────────────────────────────────────────

function init() {
  _restoreTheme();
  _restoreProfile();
  _restoreVolume();
  _bindNav();
  _bindHome();
  _bindPlayer();
  _bindExplore();
  _bindPlaylists();
  _bindProfile();
  _bindModals();
  _bindLibraryUpdates();
  _registerServiceWorker();

  UI.setHomeState(false);
  UI.showScreen('home');
  _updateFavoritesCount();
  _updateArtistsCount();
  _updateStats();
}

// ── Restauração de estado ─────────────────────────────────────

function _restoreTheme() {
  // index.html usa data-theme="dark|light" no <html>, não classe light-mode
  const theme = Storage.get('lm_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = $('toggle-theme');
  if (toggle) toggle.checked = theme === 'light';
}

function _restoreProfile() {
  const profile = Storage.get('lm_user_profile') || {};
  UI.renderAvatar(profile.avatar || null, profile.name || 'Seu nome');
}

function _restoreVolume() {
  const vol    = Storage.get('lm_volume') ?? 80;
  const slider = $('volume-slider');
  if (slider) {
    slider.value = vol;
    slider.style.setProperty('--vol', `${vol}%`);
  }
  Player.setVolume(vol);
}

// ── Navegação ─────────────────────────────────────────────────

function _bindNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      UI.showScreen(btn.dataset.screen);
      if (btn.dataset.screen === 'playlists') {
        _renderPlaylists();
        _updateFavoritesCount();
        _updateArtistsCount();
      }
    });
  });
}

// ── Home ──────────────────────────────────────────────────────

function _bindHome() {
  $('btn-open-folder').addEventListener('click',       _openFolder);
  $('btn-open-folder-empty').addEventListener('click', _openFolder);
  $('btn-play-last').addEventListener('click',         _playLastTrack);
  $('player-track-info').addEventListener('click',     UI.openExpandedPlayer);
  $('player-cover').addEventListener('click',          UI.openExpandedPlayer);
}

async function _openFolder() {
  try {
    await Library.openFolder();
  } catch {
    UI.showToast('Não foi possível abrir a pasta.', 'error');
  }
}

function _playLastTrack() {
  const id    = Storage.get('lm_last_track');
  if (!id) return;
  const track = Library.getTrackById(id);
  if (track) _playTrack(track, Library.getTracks());
}

// ── Atualizações da biblioteca ────────────────────────────────

function _bindLibraryUpdates() {
  Library.onUpdate((tracks) => {
    const hasContent = tracks.length > 0;
    UI.setHomeState(hasContent);
    if (!hasContent) return;

    const lastId    = Storage.get('lm_last_track');
    const lastTrack = lastId ? Library.getTrackById(lastId) : tracks[0];
    if (lastTrack) UI.renderLastTrack(lastTrack);

    UI.renderRecentTracks([...tracks].reverse(), (t) => _playTrack(t, tracks));
    UI.renderHomeAlbums(Library.getAlbums(),   _onAlbumClick);
    UI.renderHomeArtists(Library.getArtists(), _onArtistClick);

    _renderExploreTab(_sortMode);
    UI.renderAlbumsGrid(Library.getAlbums(),   _onAlbumClick);
    UI.renderArtistsList(Library.getArtists(), _onArtistClick);

    _updateArtistsCount();
    _updateStats();
    _renderPlaylists();
  });
}

// ── Reprodução ────────────────────────────────────────────────

function _playTrack(track, context) {
  const idx = context.findIndex(t => t.id === track.id);
  Queue.set(context, idx >= 0 ? idx : 0);
  Player.loadTrack(track);
}

// ── Player ────────────────────────────────────────────────────

function _bindSeekBar(el) {
  let active = false;
  function seek(clientX) {
    const rect  = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    Player.seekRatio(ratio);
  }
  el.addEventListener('pointerdown', (e) => {
    active = true;
    el.classList.add('dragging');
    el.setPointerCapture(e.pointerId);
    seek(e.clientX);
  });
  el.addEventListener('pointermove', (e) => { if (active) seek(e.clientX); });
  el.addEventListener('pointerup',   () => { active = false; el.classList.remove('dragging'); });
  el.addEventListener('pointercancel', () => { active = false; el.classList.remove('dragging'); });
}

function _bindPlayer() {
  $('btn-prev').addEventListener('click',       Player.prev);
  $('btn-next').addEventListener('click',       Player.next);
  $('btn-play-pause').addEventListener('click', Player.togglePlayPause);

  $('player-progress-bg').addEventListener('click', (e) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    Player.seekRatio(Math.max(0, Math.min(1, ratio)));
  });

  $('btn-collapse-player').addEventListener('click', UI.closeExpandedPlayer);
  $('btn-prev-exp').addEventListener('click',        Player.prev);
  $('btn-next-exp').addEventListener('click',        Player.next);
  $('btn-play-pause-exp').addEventListener('click',  Player.togglePlayPause);

  _bindSeekBar($('expanded-progress-bg'));

  const volSlider = $('volume-slider');
  function _applyVolumeGradient(val) {
    volSlider.style.setProperty('--vol', `${val}%`);
  }

  volSlider.addEventListener('input', (e) => {
    const vol = Number(e.target.value);
    _applyVolumeGradient(vol);
    Player.setVolume(vol);
    Storage.set('lm_volume', vol);
  });

  $('btn-favorite').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (!track) return;
    Favorites.toggle(track.id);
    UI.toggleFavoriteIcon(track.id);
    _updateFavoritesCount();
    UI.showToast(
      Favorites.isFavorite(track.id) ? 'Adicionado aos favoritos' : 'Removido dos favoritos',
      'success'
    );
  });

  const shuffleBtn = $('btn-shuffle');
  shuffleBtn.addEventListener('click', () => {
    const next = !Queue.isShuffled();
    Queue.setShuffle(next);
    UI.updateShuffleBtn(next, shuffleBtn);
    UI.showToast(next ? 'Aleatório ativado' : 'Aleatório desativado', 'info');
  });

  const repeatBtn = $('btn-repeat');
  repeatBtn.addEventListener('click', () => {
    const mode = Queue.cycleRepeat();
    UI.updateRepeatBtn(mode, repeatBtn);
  });

  $('btn-add-to-playlist').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (!track) return;
    _openAddToPlaylist(track);
  });

  $('btn-go-artist').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (!track) return;
    UI.closeExpandedPlayer();

    const artistName   = track.artist;
    const artistTracks = Library.getTracks().filter(t => t.artist === artistName);

    // Cria pasta do artista se não existir, e adiciona a música atual
    let pl      = Playlists.getAll().find(p => p.name === artistName);
    let created = false;
    if (!pl) {
      pl      = Playlists.create(artistName);
      created = true;
    }

    const wasAdded = !pl.tracks.includes(track.id);
    Playlists.addTrack(pl.id, track.id);

    if (created) {
      _renderPlaylists();
      _updateStats();
      UI.showToast(`Artista "${artistName}" criado!`, 'success');
    } else if (wasAdded) {
      UI.showToast(`Música adicionada ao artista "${artistName}"!`, 'success');
    } else {
      UI.showToast(`Artista "${artistName}"`, 'info');
    }

    // Mostra todas as músicas do artista da biblioteca
    UI.showScreen('playlists');
    UI.openPlaylistDetail(
      { id: `artist_${artistName}`, name: artistName },
      artistTracks,
      (t) => _playTrack(t, artistTracks),
      null
    );
  });

  Player.onTrack((track) => {
    UI.updatePlayerTrack(track);
    UI.updatePlayState(true);
    Storage.set('lm_last_track', track.id);
  });

  Player.onPlay(()  => UI.updatePlayState(true));
  Player.onPause(() => UI.updatePlayState(false));
  Player.onTime((t) => UI.updateProgress(t));
}

// ── Explorar ─────────────────────────────────────────────────

function _bindExplore() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => UI.showTab(tab.dataset.tab));
  });

  const searchInput = $('search-input');
  const searchClear = $('search-clear');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !q);
    if (q) {
      const results = Search.filter(q);
      UI.renderSearchResults(results, (t) => _playTrack(t, results), true, _openAddToPlaylist);
    } else {
      UI.renderSearchResults([], null, false, null);
    }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    UI.renderSearchResults([], null, false);
  });

  $('sort-tracks').addEventListener('change', (e) => {
    _sortMode = e.target.value;
    _renderExploreTab(_sortMode);
  });
}

function _renderExploreTab(mode) {
  const tracks = [...Library.getTracks()].sort((a, b) => {
    switch (mode) {
      case 'artist':   return a.artist.localeCompare(b.artist);
      case 'album':    return a.album.localeCompare(b.album);
      case 'duration': return (b.duration || 0) - (a.duration || 0);
      default:         return a.title.localeCompare(b.title);
    }
  });
  UI.renderAllTracks(tracks, (t) => _playTrack(t, tracks), _openAddToPlaylist);
}

function _onAlbumClick(album) {
  const tracks = Library.getTracks().filter(t => t.album === album.name);
  if (!tracks.length) return;
  UI.showScreen('explore');
  UI.showTab('tracks');
  UI.renderAllTracks(tracks, (t) => _playTrack(t, tracks));
  UI.showToast(`Álbum: ${album.name}`, 'info');
}

function _onArtistClick(artist) {
  const tracks = Library.getTracks().filter(t => t.artist === artist.name);
  if (!tracks.length) return;
  UI.showScreen('playlists');
  UI.openPlaylistDetail(
    { id: `artist_${artist.name}`, name: artist.name },
    tracks,
    (t) => _playTrack(t, tracks),
    null
  );
}

// ── Playlists ─────────────────────────────────────────────────

function _bindPlaylists() {
  $('btn-new-playlist').addEventListener('click', UI.openNewPlaylistModal);

  $('card-favorites').addEventListener('click', _openFavoritesDetail);
  $('card-favorites').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') _openFavoritesDetail();
  });

  // card-artists: presente no novo index.html
  $('card-artists').addEventListener('click', _openArtistsDetail);
  $('card-artists').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') _openArtistsDetail();
  });

  $('btn-back-playlist').addEventListener('click', () => {
    UI.closePlaylistDetail();
    const si = $('playlist-search-input');
    if (si) si.value = '';
  });

  // playlist-search-input: presente no novo index.html
  const playlistSearch = $('playlist-search-input');
  if (playlistSearch) {
    playlistSearch.addEventListener('input', () => {
      UI.filterDetailTracks(playlistSearch.value);
    });
  }
}

function _renderPlaylists() {
  const all    = Playlists.getAll();
  const tracks = Library.getTracks();
  UI.renderPlaylists(all, tracks, _openPlaylistDetail, (id) => {
    Playlists.remove(id);
    _renderPlaylists();
    _updateStats();
    UI.showToast('Playlist excluída', 'info');
  });
}

function _openPlaylistDetail(playlist) {
  const tracks = playlist.tracks
    .map(id => Library.getTrackById(id))
    .filter(Boolean);

  UI.openPlaylistDetail(
    playlist,
    tracks,
    (t) => _playTrack(t, tracks),
    (plId, trackId) => {
      Playlists.removeTrack(plId, trackId);
      const updated = Playlists.getById(plId);
      if (updated) _openPlaylistDetail(updated);
      _renderPlaylists();
    }
  );
}

function _openFavoritesDetail() {
  const favIds = Favorites.getAll();
  const tracks = favIds.map(id => Library.getTrackById(id)).filter(Boolean);
  UI.openPlaylistDetail(
    { id: 'favorites', name: 'Favoritos' },
    tracks,
    (t) => _playTrack(t, tracks),
    (_, trackId) => {
      Favorites.remove(trackId);
      _updateFavoritesCount();
      _openFavoritesDetail();
    }
  );
}

function _openArtistsDetail() {
  UI.openArtistsDetail(Library.getArtists(), _onArtistClick);
}

function _openAddToPlaylist(track) {
  const playlists = Playlists.getAll();
  UI.openAddToPlaylistModal(
    track,
    playlists,
    (playlistId) => {
      Playlists.addTrack(playlistId, track.id);
      _renderPlaylists();
      UI.showToast('Adicionado à playlist!', 'success');
    },
    () => {
      const name    = track.artist || 'Artista desconhecido';
      let   pl      = Playlists.getAll().find(p => p.name === name);
      let   created = false;
      if (!pl) { pl = Playlists.create(name); created = true; }
      const wasNew  = !pl.tracks.includes(track.id);
      Playlists.addTrack(pl.id, track.id);
      _renderPlaylists();
      _updateStats();
      UI.showToast(
        created     ? `Artista "${name}" criado!` :
        wasNew      ? `Adicionado ao artista "${name}"!` :
                      `Já está no artista "${name}"`,
        created || wasNew ? 'success' : 'info'
      );
    }
  );
}

function _updateFavoritesCount() {
  UI.updateFavoritesCount(Favorites.count());
}

// artists-count: presente no novo index.html
function _updateArtistsCount() {
  const el    = $('artists-count');
  if (!el) return;
  const count = Library.getArtists().length;
  el.textContent = `${count} artista${count !== 1 ? 's' : ''}`;
}

// ── Perfil ────────────────────────────────────────────────────

function _bindProfile() {
  $('toggle-theme').addEventListener('change', (e) => {
    // Usa data-theme no <html>, não classe light-mode
    const theme = e.target.checked ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    Storage.set('lm_theme', theme);
  });

  const nameEl = $('profile-name');
  nameEl.addEventListener('blur', () => {
    const profile = Storage.get('lm_user_profile') || {};
    profile.name  = nameEl.textContent.trim() || 'Seu nome';
    Storage.set('lm_user_profile', profile);
    nameEl.textContent = profile.name;
  });

  $('avatar-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataURL  = ev.target.result;
      const profile  = Storage.get('lm_user_profile') || {};
      profile.avatar = dataURL;
      Storage.set('lm_user_profile', profile);
      UI.renderAvatar(dataURL, profile.name);
    };
    reader.readAsDataURL(file);
  });

  $('btn-change-folder').addEventListener('click', _openFolder);

  $('btn-export-playlists').addEventListener('click', () => {
    const json = Playlists.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'local-music-playlists.json';
    a.click();
    URL.revokeObjectURL(url);
    UI.showToast('Playlists exportadas!', 'success');
  });

  $('btn-import-playlists').addEventListener('click', () => $('import-input').click());

  $('import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ok = Playlists.importJSON(ev.target.result);
      if (ok) {
        _renderPlaylists();
        _updateStats();
        UI.showToast('Playlists importadas!', 'success');
      } else {
        UI.showToast('Arquivo inválido.', 'error');
      }
    };
    reader.readAsText(file);
  });
}

function _updateStats() {
  const s = Library.getStats();
  UI.renderStats({
    tracks:    s.tracks,
    artists:   s.artists,
    albums:    s.albums,
    playlists: Playlists.count()
  });
}

// ── Modais ────────────────────────────────────────────────────

function _bindModals() {
  $('modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('modal-overlay')) UI.closeModal();
  });

  $('btn-cancel-playlist').addEventListener('click', UI.closeModal);
  $('btn-cancel-add').addEventListener('click',      UI.closeModal);

  $('btn-confirm-playlist').addEventListener('click', () => {
    const name = $('playlist-name-input').value.trim();
    if (!name) return;
    Playlists.create(name);
    _renderPlaylists();
    _updateStats();
    UI.closeModal();
    UI.showToast(`Playlist "${name}" criada!`, 'success');
  });

  $('playlist-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-confirm-playlist').click();
  });
}

// ── Service Worker ────────────────────────────────────────────

function _registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

// ── Bootstrap ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);