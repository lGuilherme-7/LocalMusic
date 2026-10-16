/**
 * playlists.js
 * CRUD completo de playlists do usuário.
 * Favoritos são tratados como playlist especial com id fixo "favorites".
 * Identificador de faixa: nome do arquivo (ex: "song.mp3").
 * Toda persistência passa pelo Storage.
 */

import Storage from './storage.js';

const STORAGE_KEY = 'lm_playlists';

const Playlists = (() => {

  /**
   * Lê todas as playlists do localStorage.
   * @returns {{ id: string, name: string, tracks: string[], createdAt: number }[]}
   */
  function getAll() {
    const data = Storage.get(STORAGE_KEY);
    if (!Array.isArray(data)) return [];
    let changed = false;
    const ids = new Set();
    const normalized = data.filter(item => item && typeof item === 'object').map(item => {
      let id = typeof item.id === 'string' && item.id ? item.id : _genId();
      if (ids.has(id)) {
        id = _genId();
        changed = true;
      }
      ids.add(id);
      const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Sem título';
      const tracks = Array.isArray(item.tracks) ? [...new Set(item.tracks.filter(trackId => typeof trackId === 'string' && trackId))] : [];
      if (id !== item.id || name !== item.name || tracks.length !== item.tracks?.length) changed = true;
      return { ...item, id, name, tracks, createdAt: Number(item.createdAt) || Date.now() };
    });
    if (changed || normalized.length !== data.length) _save(normalized);
    return normalized;
  }

  /**
   * Salva o array completo de playlists.
   * @param {object[]} list
   */
  function _save(list) {
    Storage.set(STORAGE_KEY, list);
  }

  /**
   * Gera um id único para nova playlist.
   * @returns {string}
   */
  function _genId() {
    if (globalThis.crypto?.randomUUID) return `pl_${crypto.randomUUID()}`;
    return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Cria uma nova playlist vazia.
   * @param {string} name
   * @returns {{ id: string, name: string, tracks: string[], createdAt: number }}
   */
  function create(name) {
    const playlist = {
      id:        _genId(),
      name:      name.trim() || 'Sem título',
      tracks:    [],
      createdAt: Date.now()
    };
    const list = getAll();
    list.push(playlist);
    _save(list);
    return playlist;
  }

  /**
   * Renomeia uma playlist pelo id.
   * @param {string} id
   * @param {string} newName
   * @returns {boolean} sucesso
   */
  function rename(id, newName) {
    const list = getAll();
    const pl   = list.find(p => p.id === id);
    if (!pl) return false;
    pl.name = newName.trim() || pl.name;
    _save(list);
    return true;
  }

  /**
   * Remove uma playlist pelo id.
   * @param {string} id
   * @returns {boolean} sucesso
   */
  function remove(id) {
    const list    = getAll();
    const updated = list.filter(p => p.id !== id);
    if (updated.length === list.length) return false;
    _save(updated);
    return true;
  }

  /**
   * Retorna uma playlist pelo id.
   * @param {string} id
   * @returns {object|undefined}
   */
  function getById(id) {
    return getAll().find(p => p.id === id);
  }

  /**
   * Adiciona uma faixa a uma playlist (evita duplicatas).
   * @param {string} playlistId
   * @param {string} trackId  nome do arquivo
   * @returns {boolean} sucesso
   */
  function addTrack(playlistId, trackId) {
    const list = getAll();
    const pl   = list.find(p => p.id === playlistId);
    if (!pl) return false;
    if (!pl.tracks.includes(trackId)) {
      pl.tracks.push(trackId);
      _save(list);
    }
    return true;
  }

  /**
   * Remove uma faixa de uma playlist.
   * @param {string} playlistId
   * @param {string} trackId
   * @returns {boolean} sucesso
   */
  function removeTrack(playlistId, trackId) {
    const list = getAll();
    const pl   = list.find(p => p.id === playlistId);
    if (!pl) return false;
    pl.tracks = pl.tracks.filter(id => id !== trackId);
    _save(list);
    return true;
  }

  /** Move uma faixa e preserva a nova ordem da playlist. */
  function moveTrack(playlistId, from, to) {
    const list = getAll();
    const pl = list.find(item => item.id === playlistId);
    if (!pl || from < 0 || to < 0 || from >= pl.tracks.length || to >= pl.tracks.length || from === to) return false;
    const [trackId] = pl.tracks.splice(from, 1);
    pl.tracks.splice(to, 0, trackId);
    _save(list);
    return true;
  }

  /**
   * Verifica se uma faixa está em uma playlist.
   * @param {string} playlistId
   * @param {string} trackId
   * @returns {boolean}
   */
  function hasTrack(playlistId, trackId) {
    const pl = getById(playlistId);
    return pl ? pl.tracks.includes(trackId) : false;
  }

  /**
   * Exporta todas as playlists como JSON string.
   * @returns {string}
   */
  function exportJSON() {
    return JSON.stringify(getAll(), null, 2);
  }

  /**
   * Importa playlists de um JSON string.
   * Mescla com as existentes (sem duplicar por id).
   * @param {string} jsonString
   * @returns {boolean} sucesso
   */
  function importJSON(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      if (!Array.isArray(imported)) return false;

      const existing = getAll();
      const existingIds = new Set(existing.map(p => p.id));

      for (const pl of imported) {
        if (pl.id && pl.name && Array.isArray(pl.tracks)) {
          if (!existingIds.has(pl.id)) {
            existing.push(pl);
            existingIds.add(pl.id);
          }
        }
      }

      _save(existing);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Conta o total de playlists do usuário.
   * @returns {number}
   */
  function count() {
    return getAll().length;
  }

  return {
    getAll, create, rename, remove, getById,
    addTrack, removeTrack, moveTrack, hasTrack,
    exportJSON, importJSON, count
  };

})();

export default Playlists;
