/**
 * search.js
 * Filtragem em tempo real da biblioteca.
 * Normaliza texto: remove acentos, converte para lowercase.
 * Filtra por título, artista e álbum.
 */

import Library from './library.js';

const Search = (() => {

  /**
   * Normaliza uma string: lowercase + remove diacríticos (acentos).
   * @param {string} str
   * @returns {string}
   */
  function _normalize(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Filtra o array de faixas por um termo de busca.
   * Busca em: título, artista, álbum.
   * @param {string} query
   * @returns {object[]} faixas correspondentes
   */
  function filter(query) {
    const term   = _normalize(query.trim());
    if (!term) return Library.getTracks();

    return Library.getTracks().filter(track => {
      return (
        _normalize(track.title).includes(term)  ||
        _normalize(track.artist).includes(term) ||
        _normalize(track.album).includes(term)
      );
    });
  }

  /**
   * Verifica se uma string de faixa contém o termo de busca.
   * Útil para highlight ou checagem pontual.
   * @param {object} track
   * @param {string} query
   * @returns {boolean}
   */
  function matches(track, query) {
    const term = _normalize(query.trim());
    if (!term) return true;
    return (
      _normalize(track.title).includes(term)  ||
      _normalize(track.artist).includes(term) ||
      _normalize(track.album).includes(term)
    );
  }

  /**
   * Filtra álbuns por termo de busca.
   * @param {string} query
   * @returns {{ name: string, artist: string, cover: string|null }[]}
   */
  function filterAlbums(query) {
    const term = _normalize(query.trim());
    if (!term) return Library.getAlbums();
    return Library.getAlbums().filter(album =>
      _normalize(album.name).includes(term) ||
      _normalize(album.artist).includes(term)
    );
  }

  /**
   * Filtra artistas por termo de busca.
   * @param {string} query
   * @returns {{ name: string, count: number }[]}
   */
  function filterArtists(query) {
    const term = _normalize(query.trim());
    if (!term) return Library.getArtists();
    return Library.getArtists().filter(artist =>
      _normalize(artist.name).includes(term)
    );
  }

  return { filter, matches, filterAlbums, filterArtists };

})();

export default Search;