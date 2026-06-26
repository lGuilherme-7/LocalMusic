/**
 * storage.js
 * Único ponto de acesso ao localStorage.
 * Serializa/desserializa JSON automaticamente.
 * Chaves usadas pelo app:
 *   lm_favorites, lm_playlists, lm_theme,
 *   lm_volume, lm_last_track, lm_user_profile
 */

const Storage = (() => {

  /**
   * Lê um valor do localStorage e desserializa o JSON.
   * @param {string} key
   * @returns {*} valor ou null se não existir / erro
   */
  function get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Serializa e salva um valor no localStorage.
   * @param {string} key
   * @param {*} value
   */
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Silencioso — quota exceeded ou modo privado
    }
  }

  /**
   * Remove uma chave do localStorage.
   * @param {string} key
   */
  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silencioso
    }
  }

  return { get, set, remove };

})();

export default Storage;