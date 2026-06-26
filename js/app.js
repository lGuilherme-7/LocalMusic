/**
 * app.js
 * Ponto de entrada do Local Music.
 * Inicializa o app, carrega estado do localStorage,
 * registra o service worker, conecta os módulos
 * e define o roteamento entre telas via navbar.
 */

import Storage   from './storage.js';
import Library   from './library.js';
import Player    from './player.js';
import Queue     from './queue.js';
import Search    from './search.js';
import Playlists from './playlists.js';
import Favorites from './favorites.js';
import Download  from './download.js';
import UI        from './ui.js';

// ── Referências de DOM ────────────────────────────────────────

const $ = id => document.getElementById(id);

// ── Estado da aplicação ───────────────────────────────────────

/** Ordenação atual da lista de músicas */
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

  // Estado inicial: sem biblioteca
  UI.setHomeState(false);
  UI.showScreen('home');
  _updateFavoritesCount();
  _updateStats();
}

// ── Restauração de estado ─────────────────────────────────────

function _restoreTheme() {
  const light = Storage.get('lm_theme') === 'light';
  if (light) document.documentElement.classList.add('light-mode');
  const toggle = $('toggle-theme');
  if (toggle) toggle.checked = light;
}

function _restoreProfile() {
  const profile = Storage.get('lm_user_profile') || {};
  UI.renderAvatar(profile.avatar || null, profile.name || 'Seu nome');
}

function _restoreVolume() {
  const vol    = Storage.get('lm_volume') ?? 80;
  const slider = $('volume-slider');
  if (slider) slider.value = vol;
  Player.setVolume(vol);
}

// ── Navegação ─────────────────────────────────────────────────

function _bindNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      UI.showScreen(btn.dataset.screen);
    });
  });
}

// ── Home ──────────────────────────────────────────────────────

function _bindHome() {
  $('btn-open-folder').addEventListener('click',       _openFolder);
  $('btn-open-folder-empty').addEventListener('click', _openFolder);
  $('btn-play-last').addEventListener('click',         _playLastTrack);

  $('player-track-info').addEventListener('click', UI.openExpandedPlayer);
  $('player-cover').addEventListener('click',      UI.openExpandedPlayer);
}

async function _openFolder() {
  try {
    await Library.openFolder();
  } catch {
    UI.showToast('Não foi possível abrir a pasta.', 'error');
  }
}

function _playLastTrack() {
  const id = Storage.get('lm_last_track');
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

    // Última tocada
    const lastId    = Storage.get('lm_last_track');
    const lastTrack = lastId ? Library.getTrackById(lastId) : tracks[0];
    if (lastTrack) UI.renderLastTrack(lastTrack);

    // Home
    UI.renderRecentTracks([...tracks].reverse(), (t) => _playTrack(t, tracks));
    UI.renderHomeAlbums(Library.getAlbums(), _onAlbumClick);
    UI.renderHomeArtists(Library.getArtists(), _onArtistClick);

    // Explorar
    _renderExploreTab(_sortMode);
    UI.renderAlbumsGrid(Library.getAlbums(), _onAlbumClick);
    UI.renderArtistsList(Library.getArtists(), _onArtistClick);

    _updateStats();
  });
}

// ── Reprodução ────────────────────────────────────────────────

/**
 * Carrega uma faixa na Queue e reproduz.
 * @param {object} track  faixa alvo
 * @param {object[]} context  lista de contexto para a fila
 */
function _playTrack(track, context) {
  const idx = context.findIndex(t => t.id === track.id);
  Queue.set(context, idx >= 0 ? idx : 0);
  Player.loadTrack(track);
}

// ── Player ────────────────────────────────────────────────────

function _bindPlayer() {
  // Barra compacta
  $('btn-prev').addEventListener('click', Player.prev);
  $('btn-next').addEventListener('click', Player.next);
  $('btn-play-pause').addEventListener('click', Player.togglePlayPause);

  // Progresso compacto
  $('player-progress-bg').addEventListener('click', (e) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    Player.seekRatio(ratio);
  });

  // Player expandido
  $('btn-collapse-player').addEventListener('click', UI.closeExpandedPlayer);
  $('btn-prev-exp').addEventListener('click', Player.prev);
  $('btn-next-exp').addEventListener('click', Player.next);
  $('btn-play-pause-exp').addEventListener('click', Player.togglePlayPause);

  // Progresso expandido
  $('expanded-progress-bg').addEventListener('click', (e) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    Player.seekRatio(ratio);
  });

  // Volume
  $('volume-slider').addEventListener('input', (e) => {
    Player.setVolume(Number(e.target.value));
  });

  // Favorito
  $('btn-favorite').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (!track) return;
    Favorites.toggle(track.id);
    UI.toggleFavoriteIcon(track.id);
    _updateFavoritesCount();
    const msg = Favorites.isFavorite(track.id)
      ? 'Adicionado aos favoritos'
      : 'Removido dos favoritos';
    UI.showToast(msg, 'success');
  });

  // Shuffle
  const shuffleBtn = $('btn-shuffle');
  shuffleBtn.addEventListener('click', () => {
    const next = !Queue.isShuffled();
    Queue.setShuffle(next);
    UI.updateShuffleBtn(next, shuffleBtn);
    UI.showToast(next ? 'Aleatório ativado' : 'Aleatório desativado', 'info');
  });

  // Repeat
  const repeatBtn = $('btn-repeat');
  repeatBtn.addEventListener('click', () => {
    const mode = Queue.cycleRepeat();
    UI.updateRepeatBtn(mode, repeatBtn);
  });

  // Adicionar à playlist (do player expandido)
  $('btn-add-to-playlist').addEventListener('click', () => {
    const track = Player.getCurrentTrack();
    if (!track) return;
    _openAddToPlaylist(track.id);
  });

  // Callbacks do player
  Player.onTrack((track) => {
    UI.updatePlayerTrack(track);
    UI.updatePlayState(true);
  });

  Player.onPlay(()  => UI.updatePlayState(true));
  Player.onPause(() => UI.updatePlayState(false));
  Player.onTime((t) => UI.updateProgress(t));
}

// ── Explorar ─────────────────────────────────────────────────

function _bindExplore() {
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      UI.showTab(tab.dataset.tab);
    });
  });

  // Busca
  const searchInput = $('search-input');
  const searchClear = $('search-clear');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !q);

    if (q) {
      const results = Search.filter(q);
      UI.renderSearchResults(results, (t) => _playTrack(t, results), true);
    } else {
      UI.renderSearchResults([], null, false);
    }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    UI.renderSearchResults([], null, false);
  });

  // Ordenação
  $('sort-tracks').addEventListener('change', (e) => {
    _sortMode = e.target.value;
    _renderExploreTab(_sortMode);
  });

  // Download
  $('btn-download').addEventListener('click', () => {
    const url = $('download-url').value;
    Download.downloadFromYouTube(url);
  });

  Download.onStatus((status) => {
    UI.updateDownloadStatus(status);
    if (status.state !== 'loading') {
      UI.showToast(status.message, status.state === 'success' ? 'success' : 'error');
    }
  });
}

/**
 * Renderiza a aba de músicas com o modo de ordenação aplicado.
 * @param {string} mode  'name'|'artist'|'album'|'duration'
 */
function _renderExploreTab(mode) {
  const tracks = [...Library.getTracks()].sort((a, b) => {
    switch (mode) {
      case 'artist':   return a.artist.localeCompare(b.artist);
      case 'album':    return a.album.localeCompare(b.album);
      case 'duration': return (b.duration || 0) - (a.duration || 0);
      default:         return a.title.localeCompare(b.title);
    }
  });
  UI.renderAllTracks(tracks, (t) => _playTrack(t, tracks));
}

function _onAlbumClick(album) {
  const tracks = Library.getTracks().filter(t => t.album === album.name);
  if (!tracks.length) return;
  _playTrack(tracks[0], tracks);
  UI.showScreen('explore');
  UI.showTab('tracks');
  UI.renderAllTracks(tracks, (t) => _playTrack(t, tracks));
  UI.showToast(`Álbum: ${album.name}`, 'info');
}

function _onArtistClick(artist) {
  const tracks = Library.getTracks().filter(t => t.artist === artist.name);
  if (!tracks.length) return;
  UI.showScreen('explore');
  UI.showTab('tracks');
  UI.renderAllTracks(tracks, (t) => _playTrack(t, tracks));
  UI.showToast(`Artista: ${artist.name}`, 'info');
}

// ── Playlists ─────────────────────────────────────────────────

function _bindPlaylists() {
  $('btn-new-playlist').addEventListener('click', UI.openNewPlaylistModal);

  $('card-favorites').addEventListener('click', _openFavoritesDetail);
  $('card-favorites').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') _openFavoritesDetail();
  });

  $('btn-back-playlist').addEventListener('click', UI.closePlaylistDetail);
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
      // Re-abre o detalhe atualizado
      const updated = Playlists.getById(plId);
      if (updated) _openPlaylistDetail(updated);
      _renderPlaylists();
    }
  );
}

function _openFavoritesDetail() {
  const favIds = Favorites.getAll();
  const tracks = favIds
    .map(id => Library.getTrackById(id))
    .filter(Boolean);

  UI.openPlaylistDetail(
    { id: 'favorites', name: 'Favoritos' },
    tracks,
    (t) => _playTrack(t, tracks),
    (_, trackId) => {
      Favorites.remove(trackId);
      _updateFavoritesCount();
      _openFavoritesDetail(); // re-abre atualizado
    }
  );
}

function _openAddToPlaylist(trackId) {
  const playlists = Playlists.getAll();
  UI.openAddToPlaylistModal(playlists, (playlistId) => {
    Playlists.addTrack(playlistId, trackId);
    _renderPlaylists();
    UI.showToast('Adicionado à playlist!', 'success');
  });
}

function _updateFavoritesCount() {
  UI.updateFavoritesCount(Favorites.count());
}

// ── Perfil ────────────────────────────────────────────────────

function _bindProfile() {
  // Toggle de tema
  $('toggle-theme').addEventListener('change', (e) => {
    const light = e.target.checked;
    document.documentElement.classList.toggle('light-mode', light);
    Storage.set('lm_theme', light ? 'light' : 'dark');
  });

  // Nome editável
  const nameEl = $('profile-name');
  nameEl.addEventListener('blur', () => {
    const profile = Storage.get('lm_user_profile') || {};
    profile.name  = nameEl.textContent.trim() || 'Seu nome';
    Storage.set('lm_user_profile', profile);
    nameEl.textContent = profile.name;
  });

  // Avatar
  $('avatar-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataURL = ev.target.result;
      const profile = Storage.get('lm_user_profile') || {};
      profile.avatar = dataURL;
      Storage.set('lm_user_profile', profile);
      UI.renderAvatar(dataURL, profile.name);
    };
    reader.readAsDataURL(file);
  });

  // Trocar pasta
  $('btn-change-folder').addEventListener('click', _openFolder);

  // Exportar playlists
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

  // Importar playlists
  $('btn-import-playlists').addEventListener('click', () => {
    $('import-input').click();
  });

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
        UI.showToast('Erro ao importar — arquivo inválido.', 'error');
      }
    };
    reader.readAsText(file);
  });
}

function _updateStats() {
  const libStats = Library.getStats();
  UI.renderStats({
    tracks:    libStats.tracks,
    artists:   libStats.artists,
    albums:    libStats.albums,
    playlists: Playlists.count()
  });
}

// ── Modais ────────────────────────────────────────────────────

function _bindModals() {
  // Overlay fecha modal
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
    navigator.serviceWorker
      .register('./service-worker.js')
      .catch(() => { /* Silencioso em dev */ });
  }
}

// ── Bootstrap ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);