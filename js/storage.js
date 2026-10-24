/**
 * storage.js
 * Único ponto de acesso ao localStorage.
 * Serializa/desserializa JSON automaticamente.
 * Chaves usadas pelo app:
 *   lm_favorites, lm_playlists, lm_theme,
 *   lm_volume, lm_last_track, lm_user_profile
 */

const Storage = (() => {
  const reportedErrors = new Set();

  function warnOnce(operation, error) {
    if (reportedErrors.has(operation)) return;
    reportedErrors.add(operation);
    console.warn(`Local Music storage: falha ao ${operation}.`, {
      name: error?.name || 'StorageError'
    });
  }

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
    } catch (error) {
      warnOnce('ler dados locais', error);
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
    } catch (error) {
      warnOnce('salvar dados locais', error);
    }
  }

  /**
   * Remove uma chave do localStorage.
   * @param {string} key
   */
  function remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      warnOnce('remover dados locais', error);
    }
  }

  return { get, set, remove };

})();

export default Storage;
