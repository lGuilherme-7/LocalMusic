/**
 * ui.js
 * Único módulo com acesso direto ao DOM. 
 * Renderiza listas, cards, modais, toasts e atualiza o player.
 */

import Player    from './player.js';
import Favorites from './favorites.js';

const UI = (() => {

  const $ = id => document.getElementById(id);

  // ── Referências DOM ───────────────────────────────────────────

  const playerBar          = $('player-bar');
  const playerName         = $('player-name');
  const playerArtist       = $('player-artist');
  const playerCover        = $('player-cover');
  const playerProgressFill = $('player-progress-fill');
  const iconPlay           = $('icon-play');
  const iconPause          = $('icon-pause');

  const playerExpanded     = $('player-expanded');
  const expandedName       = $('expanded-name');
  const expandedArtist     = $('expanded-artist');
  const expandedCover      = $('expanded-cover');
  const expandedCurrent    = $('expanded-current');
  const expandedDuration   = $('expanded-duration');
  const expandedFill       = $('expanded-progress-fill');
  const iconPlayExp        = $('icon-play-exp');
  const iconPauseExp       = $('icon-pause-exp');
  const iconHeartEmpty     = $('icon-heart-empty');
  const iconHeartFull      = $('icon-heart-full');

  const homeEmpty          = $('home-empty');
  const homeContent        = $('home-content');
  const lastTrackName      = $('last-track-name');
  const lastTrackArtist    = $('last-track-artist');
  const lastTrackCover     = $('last-track-cover');
  const recentTracks       = $('recent-tracks');
  const homeAlbums         = $('home-albums');
  const homeArtists        = $('home-artists');

  const allTracksList      = $('all-tracks-list');
  const albumsGrid         = $('albums-grid');
  const artistsList        = $('artists-list');
  const searchResults      = $('search-results');
  const searchList         = $('search-list');
  const exploreTabsWrap    = $('explore-tabs-wrap');

  const playlistsList      = $('playlists-list');
  const playlistsEmpty     = $('playlists-empty');
  const favoritesCount     = $('favorites-count');
  const playlistDetail     = $('playlist-detail');
  const detailPlaylistName = $('detail-playlist-name');
  const detailTracksList   = $('detail-tracks-list');

  const statTracks         = $('stat-tracks');
  const statArtists        = $('stat-artists');
  const statAlbums         = $('stat-albums');
  const statPlaylists      = $('stat-playlists');
  const avatarInitials     = $('avatar-initials');
  const avatarImg          = $('avatar-img');
  const profileName        = $('profile-name');

  const toast              = $('toast');
  const modalOverlay       = $('modal-overlay');

  let _toastTimer  = null;
  let _detailTracks  = [];
  let _detailOnClick = null;
  let _detailOnRemove = null;

  // ── Helpers ──────────────────────────────────────────────────

  function _coverEl(cover) {
    if (cover) {
      const img   = document.createElement('img');
      img.src     = cover;
      img.alt     = '';
      img.loading = 'lazy';
      return img;
    }
    const div = document.createElement('div');
    div.className   = 'default-cover';
    div.textContent = '♪';
    return div;
  }

  function _fmt(s) { return Player.formatTime(s); }

  // ── Item de faixa genérico ───────────────────────────────────

  function _trackItem(track, onClick, showRemove = false, onRemove = null, onAction = null) {
    const li = document.createElement('li');
    li.className  = 'track-item';
    li.dataset.id = track.id;

    const coverWrap = document.createElement('div');
    coverWrap.className = 'track-item-cover';
    coverWrap.appendChild(_coverEl(track.cover));

    const info = document.createElement('div');
    info.className = 'track-item-info';

    const title = document.createElement('p');
    title.className   = 'track-item-name';
    title.textContent = track.title;

    const meta = document.createElement('p');
    meta.className   = 'track-item-artist';
    meta.textContent = `${track.artist} · ${_fmt(track.duration)}`;

    info.appendChild(title);
    info.appendChild(meta);
    li.appendChild(coverWrap);
    li.appendChild(info);

    if (showRemove && onRemove) {
      const btn = document.createElement('button');
      btn.className = 'track-item-remove';
      btn.title     = 'Remover da playlist';
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); onRemove(track.id); });
      li.appendChild(btn);
    }

    if (onAction) {
      const btn = document.createElement('button');
      btn.className   = 'track-item-action';
      btn.title       = 'Adicionar à playlist ou artista';
      btn.setAttribute('aria-label', 'Mais opções');
      btn.innerHTML   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
      btn.addEventListener('click', (e) => { e.stopPropagation(); onAction(track); });
      li.appendChild(btn);
    }

    li.addEventListener('click', () => onClick(track));
    return li;
  }

  // ── Home ─────────────────────────────────────────────────────

  function setHomeState(hasContent) {
    homeEmpty.classList.toggle('hidden', hasContent);
    homeContent.classList.toggle('hidden', !hasContent);
  }

  function renderLastTrack(track) {
    if (!track) return;
    lastTrackName.textContent   = track.title;
    lastTrackArtist.textContent = track.artist;
    lastTrackCover.innerHTML    = '';
    lastTrackCover.appendChild(_coverEl(track.cover));
  }

  function renderRecentTracks(tracks, onClick) {
    recentTracks.innerHTML = '';
    tracks.slice(0, 20).forEach(track => {
      const card = document.createElement('div');
      card.className = 'track-card-small';

      const cover = document.createElement('div');
      cover.className = 'cover';
      cover.appendChild(_coverEl(track.cover));

      const name = document.createElement('p');
      name.className   = 'name';
      name.textContent = track.title;

      const artist = document.createElement('p');
      artist.className   = 'artist';
      artist.textContent = track.artist;

      card.appendChild(cover);
      card.appendChild(name);
      card.appendChild(artist);
      card.addEventListener('click', () => onClick(track));
      recentTracks.appendChild(card);
    });
  }

  function renderHomeAlbums(albums, onClick) {
    homeAlbums.innerHTML = '';
    albums.slice(0, 16).forEach(album => {
      const card = document.createElement('div');
      card.className = 'album-card';

      const cover = document.createElement('div');
      cover.className = 'cover';
      cover.appendChild(_coverEl(album.cover));

      const name = document.createElement('p');
      name.className   = 'name';
      name.textContent = album.name;

      card.appendChild(cover);
      card.appendChild(name);
      card.addEventListener('click', () => onClick(album));
      homeAlbums.appendChild(card);
    });
  }

  function renderHomeArtists(artists, onClick) {
    homeArtists.innerHTML = '';
    artists.slice(0, 12).forEach(artist => {
      homeArtists.appendChild(_artistItem(artist, onClick));
    });
  }

  // ── Explorar ─────────────────────────────────────────────────

  function renderAllTracks(tracks, onClick, onAction) {
    allTracksList.innerHTML = '';
    if (!tracks.length) {
      allTracksList.innerHTML = '<li class="empty-list-msg">Nenhuma música encontrada.</li>';
      return;
    }
    tracks.forEach(t => allTracksList.appendChild(_trackItem(t, onClick, false, null, onAction)));
  }

  function renderAlbumsGrid(albums, onClick) {
    albumsGrid.innerHTML = '';
    albums.forEach(album => {
      const card = document.createElement('div');
      // Reutiliza .album-card já definido no CSS para grid também
      card.className = 'album-card';
      card.style.width = '100%'; // dentro do grid não precisa de width fixo

      const cover = document.createElement('div');
      cover.className = 'cover';
      cover.appendChild(_coverEl(album.cover));

      const name = document.createElement('p');
      name.className   = 'name';
      name.textContent = album.name;

      const artist = document.createElement('p');
      artist.className   = 'artist';
      artist.textContent = album.artist || '';

      card.appendChild(cover);
      card.appendChild(name);
      card.appendChild(artist);
      card.addEventListener('click', () => onClick(album));
      albumsGrid.appendChild(card);
    });
  }

  function renderArtistsList(artists, onClick) {
    artistsList.innerHTML = '';
    artists.forEach(artist => {
      artistsList.appendChild(_artistItem(artist, onClick));
    });
  }

  function renderSearchResults(tracks, onClick, visible, onAction) {
    searchResults.classList.toggle('hidden', !visible);
    exploreTabsWrap.classList.toggle('hidden', visible);
    searchList.innerHTML = '';
    if (!tracks.length) {
      searchList.innerHTML = '<li class="empty-list-msg">Nenhum resultado.</li>';
      return;
    }
    tracks.forEach(t => searchList.appendChild(_trackItem(t, onClick, false, null, onAction)));
  }

  // ── Helper artista ────────────────────────────────────────────

  function _artistItem(artist, onClick) {
    const li = document.createElement('li');
    li.className = 'artist-item';

    const avatar = document.createElement('div');
    avatar.className   = 'artist-avatar';
    avatar.textContent = artist.name.charAt(0).toUpperCase();

    const info = document.createElement('div');
    // reutiliza classes do CSS
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
    return li;
  }

  // ── Playlists ─────────────────────────────────────────────────

  function updateFavoritesCount(count) {
    if (favoritesCount) {
      favoritesCount.textContent = `${count} música${count !== 1 ? 's' : ''}`;
    }
  }

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

      const firstTrack = allTracks.find(t => t.id === pl.tracks[0]);
      const coverWrap  = document.createElement('div');
      coverWrap.className = 'playlist-cover';
      coverWrap.appendChild(_coverEl(firstTrack?.cover || null));

      const info = document.createElement('div');
      info.className = 'playlist-info';

      const name = document.createElement('p');
      name.className   = 'playlist-name';
      name.textContent = pl.name;

      const countEl = document.createElement('p');
      countEl.className   = 'playlist-count';
      countEl.textContent = `${pl.tracks.length} música${pl.tracks.length !== 1 ? 's' : ''}`;

      info.appendChild(name);
      info.appendChild(countEl);

      const deleteBtn = onDelete ? document.createElement('button') : null;
      if (deleteBtn) {
        deleteBtn.className = 'icon-btn';
        deleteBtn.title     = 'Excluir playlist';
        deleteBtn.style.color = 'var(--text-muted)';
        deleteBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
        deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); onDelete(pl.id); });
      }

      const arrow = document.createElement('span');
      arrow.innerHTML = `<svg class="playlist-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

      card.appendChild(coverWrap);
      card.appendChild(info);
      if (deleteBtn) card.appendChild(deleteBtn);
      card.appendChild(arrow);
      card.addEventListener('click', () => onClick(pl));
      playlistsList.appendChild(card);
    });
  }

  function openPlaylistDetail(playlist, tracks, onTrackClick, onRemoveTrack) {
    _detailTracks   = tracks;
    _detailOnClick  = onTrackClick;
    _detailOnRemove = onRemoveTrack;

    detailPlaylistName.textContent = playlist.name;
    _renderDetailList(tracks, onTrackClick, onRemoveTrack);

    // Limpa busca interna ao abrir
    const si = $('playlist-search-input');
    if (si) si.value = '';

    playlistDetail.classList.remove('hidden');
  }

  function _renderDetailList(tracks, onClick, onRemove) {
    detailTracksList.innerHTML = '';
    if (!tracks.length) {
      detailTracksList.innerHTML = '<li class="empty-list-msg">Nenhuma música aqui.</li>';
      return;
    }
    tracks.forEach(track => {
      detailTracksList.appendChild(
        _trackItem(
          track,
          onClick || _detailOnClick,
          !!onRemove,
          onRemove ? (id) => onRemove(null, id) : null
        )
      );
    });
  }

  // Filtra faixas do detalhe em tempo real (playlist-search-input)
  function filterDetailTracks(query) {
    const term = query.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtered = term
      ? _detailTracks.filter(t => {
          const title  = t.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const artist = t.artist.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return title.includes(term) || artist.includes(term);
        })
      : _detailTracks;
    _renderDetailList(filtered, _detailOnClick, _detailOnRemove);
  }

  function closePlaylistDetail() {
    playlistDetail.classList.add('hidden');
    _detailTracks = [];
  }

  // Tela de artistas dentro do detalhe de playlists (card-artists)
  function openArtistsDetail(artists, onArtistClick) {
    detailPlaylistName.textContent = 'Artistas';
    detailTracksList.innerHTML     = '';
    _detailTracks                  = [];

    const si = $('playlist-search-input');
    if (si) si.value = '';

    if (!artists.length) {
      detailTracksList.innerHTML = '<li class="empty-list-msg">Nenhum artista encontrado.</li>';
    } else {
      const ul = document.createElement('ul');
      ul.className = 'artist-list';
      artists.forEach(artist => {
        ul.appendChild(_artistItem(artist, (a) => {
          closePlaylistDetail();
          setTimeout(() => onArtistClick(a), 10);
        }));
      });
      detailTracksList.appendChild(ul);
    }

    playlistDetail.classList.remove('hidden');
  }

  // ── Perfil ────────────────────────────────────────────────────

  function renderStats(stats) {
    if (statTracks)    statTracks.textContent    = stats.tracks;
    if (statArtists)   statArtists.textContent   = stats.artists;
    if (statAlbums)    statAlbums.textContent     = stats.albums;
    if (statPlaylists) statPlaylists.textContent  = stats.playlists;
  }

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

  // ── Player bar ────────────────────────────────────────────────

  function updatePlayerTrack(track) {
    if (!track) { playerBar.classList.add('hidden'); return; }
    playerBar.classList.remove('hidden');
    playerName.textContent   = track.title;
    playerArtist.textContent = track.artist;
    playerCover.innerHTML    = '';
    playerCover.appendChild(_coverEl(track.cover));
    expandedName.textContent   = track.title;
    expandedArtist.textContent = track.artist;
    expandedCover.innerHTML    = '';
    expandedCover.appendChild(_coverEl(track.cover));
    _updateFavoriteIcon(track.id);
  }

  function updatePlayState(playing) {
    iconPlay.classList.toggle('hidden',     playing);
    iconPause.classList.toggle('hidden',    !playing);
    iconPlayExp.classList.toggle('hidden',  playing);
    iconPauseExp.classList.toggle('hidden', !playing);
  }

  function updateProgress(time) {
    const pct = `${(time.ratio * 100).toFixed(2)}%`;
    playerProgressFill.style.width = pct;
    expandedFill.style.width       = pct;
    expandedCurrent.textContent    = Player.formatTime(time.current);
    expandedDuration.textContent   = Player.formatTime(time.duration);
  }

  function _updateFavoriteIcon(trackId) {
    const fav = Favorites.isFavorite(trackId);
    iconHeartEmpty.classList.toggle('hidden', fav);
    iconHeartFull.classList.toggle('hidden',  !fav);
  }

  function toggleFavoriteIcon(trackId) { _updateFavoriteIcon(trackId); }

  function openExpandedPlayer() {
    playerExpanded.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeExpandedPlayer() {
    playerExpanded.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function updateShuffleBtn(active, btn) {
    btn.classList.toggle('mode-active', active);
  }

  function updateRepeatBtn(mode, btn) {
    btn.classList.toggle('mode-active', mode !== 'normal');
    btn.dataset.mode = mode;
    btn.title = mode === 'repeat-one' ? 'Repetir esta música'
              : mode === 'repeat-all' ? 'Repetir tudo'
              : 'Repetição desativada';
  }

  // ── Modais ────────────────────────────────────────────────────

  function openNewPlaylistModal() {
    modalOverlay.classList.remove('hidden');
    $('modal-new-playlist').classList.remove('hidden');
    $('modal-add-playlist').classList.add('hidden');
    $('playlist-name-input').value = '';
    setTimeout(() => $('playlist-name-input').focus(), 50);
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    $('modal-new-playlist').classList.add('hidden');
    $('modal-add-playlist').classList.add('hidden');
  }

  function openAddToPlaylistModal(track, playlists, onSelect, onAddToArtist) {
    modalOverlay.classList.remove('hidden');
    $('modal-new-playlist').classList.add('hidden');
    $('modal-add-playlist').classList.remove('hidden');

    const list = $('modal-playlists-list');
    list.innerHTML = '';

    if (onAddToArtist && track.artist && track.artist !== 'Artista desconhecido') {
      const sep = document.createElement('li');
      sep.className   = 'modal-list-section';
      sep.textContent = 'Artista';
      list.appendChild(sep);

      const artistLi = document.createElement('li');
      artistLi.className = 'modal-list-item modal-list-item--artist';
      artistLi.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${track.artist}`;
      artistLi.addEventListener('click', () => { onAddToArtist(); closeModal(); });
      list.appendChild(artistLi);

      const sep2 = document.createElement('li');
      sep2.className   = 'modal-list-section';
      sep2.textContent = 'Playlist';
      list.appendChild(sep2);
    }

    if (!playlists.length) {
      const empty = document.createElement('li');
      empty.className   = 'empty-list-msg';
      empty.textContent = 'Nenhuma playlist criada.';
      list.appendChild(empty);
      return;
    }
    playlists.forEach(pl => {
      const li = document.createElement('li');
      li.className   = 'modal-list-item';
      li.textContent = pl.name;
      li.addEventListener('click', () => { onSelect(pl.id); closeModal(); });
      list.appendChild(li);
    });
  }

  // ── Toast ─────────────────────────────────────────────────────

  function showToast(message, type = 'info', duration = 2800) {
    if (_toastTimer) clearTimeout(_toastTimer);
    toast.textContent = message;
    // Usa classes BEM: toast--success, toast--error, toast--info
    toast.className   = `toast toast--${type}`;
    toast.classList.remove('hidden');
    _toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
  }

  // ── Navegação ─────────────────────────────────────────────────

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

  function showTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
      t.setAttribute('aria-selected', t.dataset.tab === tabId ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      const isActive = c.id === `tab-${tabId}`;
      c.classList.toggle('active',  isActive);
      c.classList.toggle('hidden', !isActive);
    });
  }

  // ── API pública ───────────────────────────────────────────────

  return {
    // Home
    setHomeState, renderLastTrack, renderRecentTracks,
    renderHomeAlbums, renderHomeArtists,
    // Explorar
    renderAllTracks, renderAlbumsGrid, renderArtistsList, renderSearchResults,
    // Playlists
    updateFavoritesCount, renderPlaylists,
    openPlaylistDetail, closePlaylistDetail,
    filterDetailTracks, openArtistsDetail,
    // Perfil
    renderStats, renderAvatar,
    // Player
    updatePlayerTrack, updatePlayState, updateProgress,
    toggleFavoriteIcon, openExpandedPlayer, closeExpandedPlayer,
    updateShuffleBtn, updateRepeatBtn,
    // Modais
    openNewPlaylistModal, closeModal, openAddToPlaylistModal,
    // Utilitários
    showToast, showScreen, showTab
  };

})();

export default UI;