/**
 * ui.js
 * Único módulo com acesso direto ao DOM.
 * Renderiza listas, cards, modais, toasts e atualiza o player.
 * Recebe dados dos outros módulos e nunca os chama diretamente.
 */

import Player    from './player.js';
import Favorites from './favorites.js';

const UI = (() => {

  // ── Referências de DOM ────────────────────────────────────────

  const $ = id => document.getElementById(id);

  // Player bar
  const playerBar          = $('player-bar');
  const playerName         = $('player-name');
  const playerArtist       = $('player-artist');
  const playerCover        = $('player-cover');
  const playerProgressBg   = $('player-progress-bg');
  const playerProgressFill = $('player-progress-fill');
  const iconPlay           = $('icon-play');
  const iconPause          = $('icon-pause');

  // Player expandido
  const playerExpanded     = $('player-expanded');
  const expandedName       = $('expanded-name');
  const expandedArtist     = $('expanded-artist');
  const expandedCover      = $('expanded-cover');
  const expandedCurrent    = $('expanded-current');
  const expandedDuration   = $('expanded-duration');
  const expandedFill       = $('expanded-progress-fill');
  const expandedBg         = $('expanded-progress-bg');
  const iconPlayExp        = $('icon-play-exp');
  const iconPauseExp       = $('icon-pause-exp');
  const iconHeartEmpty     = $('icon-heart-empty');
  const iconHeartFull      = $('icon-heart-full');

  // Home
  const homeEmpty          = $('home-empty');
  const homeContent        = $('home-content');
  const lastTrackName      = $('last-track-name');
  const lastTrackArtist    = $('last-track-artist');
  const lastTrackCover     = $('last-track-cover');
  const recentTracks       = $('recent-tracks');
  const homeAlbums         = $('home-albums');
  const homeArtists        = $('home-artists');

  // Explorar
  const allTracksList      = $('all-tracks-list');
  const albumsGrid         = $('albums-grid');
  const artistsList        = $('artists-list');
  const searchResults      = $('search-results');
  const searchList         = $('search-list');
  const exploreTabsWrap    = $('explore-tabs-wrap');

  // Playlists
  const playlistsList      = $('playlists-list');
  const playlistsEmpty     = $('playlists-empty');
  const favoritesCount     = $('favorites-count');
  const playlistDetail     = $('playlist-detail');
  const detailPlaylistName = $('detail-playlist-name');
  const detailTracksList   = $('detail-tracks-list');

  // Perfil
  const statTracks         = $('stat-tracks');
  const statArtists        = $('stat-artists');
  const statAlbums         = $('stat-albums');
  const statPlaylists      = $('stat-playlists');
  const avatarInitials     = $('avatar-initials');
  const avatarImg          = $('avatar-img');
  const profileName        = $('profile-name');

  // Toast
  const toast              = $('toast');
  let   _toastTimer        = null;

  // Modal overlay
  const modalOverlay       = $('modal-overlay');

  // ── Helpers ──────────────────────────────────────────────────

  /**
   * Cria um elemento <img> de capa ou um div com nota musical como fallback.
   * @param {string|null} cover  data URL ou null
   * @param {string} cls  classe CSS extra
   * @returns {HTMLElement}
   */
  function _coverEl(cover, cls = '') {
    if (cover) {
      const img   = document.createElement('img');
      img.src     = cover;
      img.alt     = '';
      img.className = `cover-img ${cls}`.trim();
      img.loading = 'lazy';
      return img;
    }
    const div = document.createElement('div');
    div.className = `default-cover ${cls}`.trim();
    div.textContent = '♪';
    return div;
  }

  /**
   * Formata duração em segundos para "m:ss".
   * @param {number} s
   * @returns {string}
   */
  function _fmt(s) {
    return Player.formatTime(s);
  }

  /**
   * Cria um item de faixa para listas (<li>).
   * @param {object} track
   * @param {Function} onClick
   * @param {boolean} [showRemove]
   * @param {Function} [onRemove]
   * @returns {HTMLLIElement}
   */
  function _trackItem(track, onClick, showRemove = false, onRemove = null) {
    const li = document.createElement('li');
    li.className   = 'track-item';
    li.dataset.id  = track.id;

    const coverWrap = document.createElement('div');
    coverWrap.className = 'track-cover';
    coverWrap.appendChild(_coverEl(track.cover, 'small'));

    const info = document.createElement('div');
    info.className = 'track-info';

    const title = document.createElement('p');
    title.className   = 'track-title';
    title.textContent = track.title;

    const meta = document.createElement('p');
    meta.className   = 'track-meta';
    meta.textContent = `${track.artist} · ${_fmt(track.duration)}`;

    info.appendChild(title);
    info.appendChild(meta);

    li.appendChild(coverWrap);
    li.appendChild(info);

    if (showRemove && onRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.className  = 'track-remove-btn';
      removeBtn.title      = 'Remover da playlist';
      removeBtn.innerHTML  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove(track.id);
      });
      li.appendChild(removeBtn);
    }

    li.addEventListener('click', () => onClick(track));
    return li;
  }

  // ── Tela: Home ───────────────────────────────────────────────

  /**
   * Exibe estado vazio ou conteúdo da biblioteca na Home.
   * @param {boolean} hasContent
   */
  function setHomeState(hasContent) {
    homeEmpty.classList.toggle('hidden', hasContent);
    homeContent.classList.toggle('hidden', !hasContent);
  }

  /**
   * Renderiza o card de última música.
   * @param {object|null} track
   */
  function renderLastTrack(track) {
    if (!track) return;
    lastTrackName.textContent   = track.title;
    lastTrackArtist.textContent = track.artist;
    lastTrackCover.innerHTML = '';
    lastTrackCover.appendChild(_coverEl(track.cover));
  }

  /**
   * Renderiza as faixas recentes em scroll horizontal.
   * @param {object[]} tracks
   * @param {Function} onClick
   */
  function renderRecentTracks(tracks, onClick) {
    recentTracks.innerHTML = '';
    tracks.slice(0, 20).forEach(track => {
      const card = document.createElement('div');
      card.className = 'scroll-card';

      const coverWrap = document.createElement('div');
      coverWrap.className = 'scroll-card-cover';
      coverWrap.appendChild(_coverEl(track.cover));

      const title = document.createElement('p');
      title.className   = 'scroll-card-title';
      title.textContent = track.title;

      const artist = document.createElement('p');
      artist.className   = 'scroll-card-artist';
      artist.textContent = track.artist;

      card.appendChild(coverWrap);
      card.appendChild(title);
      card.appendChild(artist);
      card.addEventListener('click', () => onClick(track));
      recentTracks.appendChild(card);
    });
  }

  /**
   * Renderiza álbuns em scroll horizontal na Home.
   * @param {{ name: string, artist: string, cover: string|null }[]} albums
   * @param {Function} onClick
   */
  function renderHomeAlbums(albums, onClick) {
    homeAlbums.innerHTML = '';
    albums.slice(0, 16).forEach(album => {
      const card = document.createElement('div');
      card.className = 'scroll-card album-card';

      const coverWrap = document.createElement('div');
      coverWrap.className = 'scroll-card-cover album-cover';
      coverWrap.appendChild(_coverEl(album.cover));

      const name = document.createElement('p');
      name.className   = 'scroll-card-title';
      name.textContent = album.name;

      card.appendChild(coverWrap);
      card.appendChild(name);
      card.addEventListener('click', () => onClick(album));
      homeAlbums.appendChild(card);
    });
  }

  /**
   * Renderiza lista de artistas na Home.
   * @param {{ name: string, count: number }[]} artists
   * @param {Function} onClick
   */
  function renderHomeArtists(artists, onClick) {
    homeArtists.innerHTML = '';
    artists.slice(0, 12).forEach(artist => {
      const li = document.createElement('li');
      li.className = 'artist-item';

      const avatar = document.createElement('div');
      avatar.className   = 'artist-avatar';
      avatar.textContent = artist.name.charAt(0).toUpperCase();

      const info = document.createElement('div');
      info.className = 'artist-info';

      const name = document.createElement('p');
      name.className   = 'artist-name';
      name.textContent = artist.name;

      const count = document.createElement('p');
      count.className   = 'artist-count';
      count.textContent = `${artist.count} música${artist.count !== 1 ? 's' : ''}`;

      info.appendChild(name);
      info.appendChild(count);
      li.appendChild(avatar);
      li.appendChild(info);
      li.addEventListener('click', () => onClick(artist));
      homeArtists.appendChild(li);
    });
  }

  // ── Tela: Explorar ───────────────────────────────────────────

  /**
   * Renderiza a lista completa de faixas na aba Músicas.
   * @param {object[]} tracks
   * @param {Function} onClick
   */
  function renderAllTracks(tracks, onClick) {
    allTracksList.innerHTML = '';
    if (!tracks.length) {
      allTracksList.innerHTML = '<li class="empty-list-msg">Nenhuma música encontrada.</li>';
      return;
    }
    tracks.forEach(track => {
      allTracksList.appendChild(_trackItem(track, onClick));
    });
  }

  /**
   * Renderiza o grid de álbuns na aba Álbuns.
   * @param {object[]} albums
   * @param {Function} onClick
   */
  function renderAlbumsGrid(albums, onClick) {
    albumsGrid.innerHTML = '';
    albums.forEach(album => {
      const card = document.createElement('div');
      card.className = 'album-grid-card';

      const coverWrap = document.createElement('div');
      coverWrap.className = 'album-grid-cover';
      coverWrap.appendChild(_coverEl(album.cover));

      const name = document.createElement('p');
      name.className   = 'album-grid-name';
      name.textContent = album.name;

      const artist = document.createElement('p');
      artist.className   = 'album-grid-artist';
      artist.textContent = album.artist;

      card.appendChild(coverWrap);
      card.appendChild(name);
      card.appendChild(artist);
      card.addEventListener('click', () => onClick(album));
      albumsGrid.appendChild(card);
    });
  }

  /**
   * Renderiza lista de artistas na aba Artistas.
   * @param {{ name: string, count: number }[]} artists
   * @param {Function} onClick
   */
  function renderArtistsList(artists, onClick) {
    artistsList.innerHTML = '';
    artists.forEach(artist => {
      const li = document.createElement('li');
      li.className = 'artist-item';

      const avatar = document.createElement('div');
      avatar.className   = 'artist-avatar';
      avatar.textContent = artist.name.charAt(0).toUpperCase();

      const info = document.createElement('div');
      info.className = 'artist-info';

      const name = document.createElement('p');
      name.className   = 'artist-name';
      name.textContent = artist.name;

      const count = document.createElement('p');
      count.className   = 'artist-count';
      count.textContent = `${artist.count} música${artist.count !== 1 ? 's' : ''}`;

      info.appendChild(name);
      info.appendChild(count);
      li.appendChild(avatar);
      li.appendChild(info);
      li.addEventListener('click', () => onClick(artist));
      artistsList.appendChild(li);
    });
  }

  /**
   * Renderiza os resultados de busca.
   * @param {object[]} tracks
   * @param {Function} onClick
   * @param {boolean} visible
   */
  function renderSearchResults(tracks, onClick, visible) {
    searchResults.classList.toggle('hidden', !visible);
    exploreTabsWrap.classList.toggle('hidden', visible);
    searchList.innerHTML = '';
    if (!tracks.length) {
      searchList.innerHTML = '<li class="empty-list-msg">Nenhum resultado encontrado.</li>';
      return;
    }
    tracks.forEach(track => {
      searchList.appendChild(_trackItem(track, onClick));
    });
  }

  // ── Tela: Playlists ──────────────────────────────────────────

  /**
   * Atualiza o contador de favoritos.
   * @param {number} count
   */
  function updateFavoritesCount(count) {
    favoritesCount.textContent = `${count} música${count !== 1 ? 's' : ''}`;
  }

  /**
   * Renderiza a lista de playlists do usuário.
   * @param {object[]} playlists
   * @param {object[]} allTracks  para buscar capa da primeira faixa
   * @param {Function} onClick
   * @param {Function} onDelete
   */
  function renderPlaylists(playlists, allTracks, onClick, onDelete) {
    playlistsList.innerHTML = '';

    if (!playlists.length) {
      playlistsEmpty.classList.remove('hidden');
      return;
    }
    playlistsEmpty.classList.add('hidden');

    playlists.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'playlist-card';

      // Busca capa da primeira faixa
      const firstTrack = allTracks.find(t => t.id === pl.tracks[0]);
      const coverWrap  = document.createElement('div');
      coverWrap.className = 'playlist-cover';
      coverWrap.appendChild(_coverEl(firstTrack?.cover || null));

      const info = document.createElement('div');
      info.className = 'playlist-info';

      const name = document.createElement('p');
      name.className   = 'playlist-name';
      name.textContent = pl.name;

      const count = document.createElement('p');
      count.className   = 'playlist-count';
      count.textContent = `${pl.tracks.length} música${pl.tracks.length !== 1 ? 's' : ''}`;

      info.appendChild(name);
      info.appendChild(count);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'playlist-delete-btn';
      deleteBtn.title     = 'Excluir playlist';
      deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onDelete(pl.id);
      });

      const arrow = document.createElement('span');
      arrow.innerHTML = `<svg class="playlist-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

      card.appendChild(coverWrap);
      card.appendChild(info);
      card.appendChild(deleteBtn);
      card.appendChild(arrow);
      card.addEventListener('click', () => onClick(pl));
      playlistsList.appendChild(card);
    });
  }

  /**
   * Abre o painel de detalhe de uma playlist dentro da tela Playlists.
   * @param {object} playlist
   * @param {object[]} tracks  faixas resolvidas desta playlist
   * @param {Function} onTrackClick
   * @param {Function} onRemoveTrack
   */
  function openPlaylistDetail(playlist, tracks, onTrackClick, onRemoveTrack) {
    detailPlaylistName.textContent = playlist.name;
    detailTracksList.innerHTML = '';

    if (!tracks.length) {
      detailTracksList.innerHTML = '<li class="empty-list-msg">Nenhuma música nesta playlist.</li>';
    } else {
      tracks.forEach(track => {
        detailTracksList.appendChild(
          _trackItem(track, onTrackClick, true, (id) => onRemoveTrack(playlist.id, id))
        );
      });
    }

    playlistDetail.classList.remove('hidden');
  }

  /** Fecha o painel de detalhe da playlist */
  function closePlaylistDetail() {
    playlistDetail.classList.add('hidden');
  }

  // ── Tela: Perfil ─────────────────────────────────────────────

  /**
   * Atualiza os cards de estatísticas.
   * @param {{ tracks: number, artists: number, albums: number, playlists: number }} stats
   */
  function renderStats(stats) {
    statTracks.textContent    = stats.tracks;
    statArtists.textContent   = stats.artists;
    statAlbums.textContent    = stats.albums;
    statPlaylists.textContent = stats.playlists;
  }

  /**
   * Define o avatar do usuário (imagem ou iniciais).
   * @param {string|null} imageDataURL
   * @param {string} name
   */
  function renderAvatar(imageDataURL, name) {
    if (imageDataURL) {
      avatarImg.src = imageDataURL;
      avatarImg.classList.remove('hidden');
      avatarInitials.classList.add('hidden');
    } else {
      avatarInitials.textContent = name ? name.charAt(0).toUpperCase() : '?';
      avatarInitials.classList.remove('hidden');
      avatarImg.classList.add('hidden');
    }
    if (profileName) profileName.textContent = name || 'Seu nome';
  }

  // ── Player bar ───────────────────────────────────────────────

  /**
   * Atualiza a barra do player com a faixa atual.
   * @param {object} track
   */
  function updatePlayerTrack(track) {
    if (!track) { playerBar.classList.add('hidden'); return; }
    playerBar.classList.remove('hidden');

    playerName.textContent   = track.title;
    playerArtist.textContent = track.artist;
    playerCover.innerHTML = '';
    playerCover.appendChild(_coverEl(track.cover, 'small'));

    // Player expandido
    expandedName.textContent   = track.title;
    expandedArtist.textContent = track.artist;
    expandedCover.innerHTML = '';
    expandedCover.appendChild(_coverEl(track.cover, 'large'));

    _updateFavoriteIcon(track.id);
  }

  /**
   * Atualiza os ícones de play/pause em ambos os players.
   * @param {boolean} playing
   */
  function updatePlayState(playing) {
    iconPlay.classList.toggle('hidden',  playing);
    iconPause.classList.toggle('hidden', !playing);
    iconPlayExp.classList.toggle('hidden',  playing);
    iconPauseExp.classList.toggle('hidden', !playing);
  }

  /**
   * Atualiza as barras de progresso e o tempo exibido.
   * @param {{ current: number, duration: number, ratio: number }} time
   */
  function updateProgress(time) {
    const pct = `${(time.ratio * 100).toFixed(2)}%`;
    playerProgressFill.style.width = pct;
    expandedFill.style.width       = pct;
    expandedCurrent.textContent    = Player.formatTime(time.current);
    expandedDuration.textContent   = Player.formatTime(time.duration);
  }

  /**
   * Atualiza ícone de coração do player expandido.
   * @param {string} trackId
   */
  function _updateFavoriteIcon(trackId) {
    const fav = Favorites.isFavorite(trackId);
    iconHeartEmpty.classList.toggle('hidden', fav);
    iconHeartFull.classList.toggle('hidden',  !fav);
  }

  /** Atualiza ícone de favorito ao fazer toggle */
  function toggleFavoriteIcon(trackId) {
    _updateFavoriteIcon(trackId);
  }

  /**
   * Abre o player expandido.
   */
  function openExpandedPlayer() {
    playerExpanded.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  /**
   * Fecha o player expandido.
   */
  function closeExpandedPlayer() {
    playerExpanded.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /**
   * Atualiza o indicador visual do modo de shuffle.
   * @param {boolean} active
   * @param {HTMLElement} btn
   */
  function updateShuffleBtn(active, btn) {
    btn.classList.toggle('mode-active', active);
  }

  /**
   * Atualiza o indicador visual do modo de repeat.
   * @param {'normal'|'repeat-all'|'repeat-one'} mode
   * @param {HTMLElement} btn
   */
  function updateRepeatBtn(mode, btn) {
    btn.classList.toggle('mode-active', mode !== 'normal');
    btn.title = mode === 'repeat-one' ? 'Repetir esta música' :
                mode === 'repeat-all' ? 'Repetir tudo' : 'Repetição desativada';
    // Indica repeat-one com badge numérico opcional via CSS [data-mode]
    btn.dataset.mode = mode;
  }

  // ── Modais ───────────────────────────────────────────────────

  /**
   * Exibe o modal de nova playlist.
   */
  function openNewPlaylistModal() {
    modalOverlay.classList.remove('hidden');
    $('modal-new-playlist').classList.remove('hidden');
    $('modal-add-playlist').classList.add('hidden');
    $('playlist-name-input').value = '';
    $('playlist-name-input').focus();
  }

  /**
   * Fecha todos os modais.
   */
  function closeModal() {
    modalOverlay.classList.add('hidden');
    $('modal-new-playlist').classList.add('hidden');
    $('modal-add-playlist').classList.add('hidden');
  }

  /**
   * Abre o modal de adicionar faixa a playlist.
   * @param {object[]} playlists
   * @param {Function} onSelect  (playlistId) => void
   */
  function openAddToPlaylistModal(playlists, onSelect) {
    modalOverlay.classList.remove('hidden');
    $('modal-new-playlist').classList.add('hidden');
    $('modal-add-playlist').classList.remove('hidden');

    const list = $('modal-playlists-list');
    list.innerHTML = '';

    if (!playlists.length) {
      list.innerHTML = '<li class="modal-list-empty">Nenhuma playlist criada.</li>';
      return;
    }

    playlists.forEach(pl => {
      const li = document.createElement('li');
      li.className   = 'modal-list-item';
      li.textContent = pl.name;
      li.addEventListener('click', () => {
        onSelect(pl.id);
        closeModal();
      });
      list.appendChild(li);
    });
  }

  // ── Toast ────────────────────────────────────────────────────

  /**
   * Exibe uma notificação toast temporária.
   * @param {string} message
   * @param {'success'|'error'|'info'} [type]
   * @param {number} [duration]  ms
   */
  function showToast(message, type = 'info', duration = 2800) {
    if (_toastTimer) clearTimeout(_toastTimer);
    toast.textContent = message;
    toast.className   = `toast toast--${type}`;
    toast.classList.remove('hidden');

    _toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  // ── Navegação entre telas ────────────────────────────────────

  /**
   * Ativa uma tela e atualiza o nav ativo.
   * @param {string} screenId  ex: 'home', 'explore', 'playlists', 'profile'
   */
  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.remove('active');
      b.removeAttribute('aria-current');
    });

    const screen = $(`screen-${screenId}`);
    if (screen) screen.classList.add('active');

    const navBtn = document.querySelector(`.nav-item[data-screen="${screenId}"]`);
    if (navBtn) {
      navBtn.classList.add('active');
      navBtn.setAttribute('aria-current', 'page');
    }
  }

  /**
   * Ativa uma aba interna da tela Explorar.
   * @param {string} tabId  ex: 'tracks', 'albums', 'artists', 'download'
   */
  function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
      t.setAttribute('aria-selected', t.dataset.tab === tabId ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active',  c.id === `tab-${tabId}`);
      c.classList.toggle('hidden',  c.id !== `tab-${tabId}`);
    });
  }

  // ── Download status ──────────────────────────────────────────

  /**
   * Atualiza o elemento de status do download.
   * @param {{ state: 'loading'|'success'|'error', message: string }} status
   */
  function updateDownloadStatus({ state, message }) {
    const el = $('download-status');
    el.textContent  = message;
    el.className    = `download-status download-status--${state}`;
    el.classList.remove('hidden');
  }

  return {
    // Home
    setHomeState, renderLastTrack, renderRecentTracks, renderHomeAlbums, renderHomeArtists,
    // Explorar
    renderAllTracks, renderAlbumsGrid, renderArtistsList, renderSearchResults,
    // Playlists
    updateFavoritesCount, renderPlaylists, openPlaylistDetail, closePlaylistDetail,
    // Perfil
    renderStats, renderAvatar,
    // Player
    updatePlayerTrack, updatePlayState, updateProgress, toggleFavoriteIcon,
    openExpandedPlayer, closeExpandedPlayer, updateShuffleBtn, updateRepeatBtn,
    // Modais
    openNewPlaylistModal, closeModal, openAddToPlaylistModal,
    // Toast
    showToast,
    // Navegação
    showScreen, showTab,
    // Download
    updateDownloadStatus
  };

})();

export default UI;