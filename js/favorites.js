/**
 * favorites.js
 * Atalho para a playlist especial de favoritos.
 * Persiste usando o nome do arquivo como identificador.
 * ID fixo da playlist de favoritos: "favorites"
 */

import Storage from './storage.js';

const STORAGE_KEY = 'lm_favorites';

const Favorites = (() => {

  /**
   * Lê o Set de ids favoritos do localStorage.
   * @returns {Set<string>}
   */
  function _load() {
    const data = Storage.get(STORAGE_KEY);
    return new Set(Array.isArray(data) ? data : []);
  }

  /**
   * Salva o Set de ids favoritos no localStorage.
   * @param {Set<string>} set
   */
  function _save(set) {
    Storage.set(STORAGE_KEY, [...set]);
  }

  /**
   * Verifica se uma faixa está nos favoritos.
   * @param {string} trackId  nome do arquivo (ex: "song.mp3")
   * @returns {boolean}
   */
  function isFavorite(trackId) {
    return _load().has(trackId);
  }

  /**
   * Alterna o status de favorito de uma faixa.
   * @param {string} trackId
   * @returns {boolean} true se foi favoritado, false se removido
   */
  function toggle(trackId) {
    const set = _load();
    if (set.has(trackId)) {
      set.delete(trackId);
      _save(set);
      return false;
    } else {
      set.add(trackId);
      _save(set);
      return true;
    }
  }

  /**
   * Adiciona uma faixa aos favoritos (sem toggle).
   * @param {string} trackId
   */
  function add(trackId) {
    const set = _load();
    set.add(trackId);
    _save(set);
  }

  /**
   * Remove uma faixa dos favoritos.
   * @param {string} trackId
   */
  function remove(trackId) {
    const set = _load();
    set.delete(trackId);
    _save(set);
  }

  /**
   * Retorna todos os ids favoritos.
   * @returns {string[]}
   */
  function getAll() {
    return [..._load()];
  }

  /**
   * Retorna a contagem de favoritos.
   * @returns {number}
   */
  function count() {
    return _load().size;
  }

  return { isFavorite, toggle, add, remove, getAll, count };

})();

export default Favorites;