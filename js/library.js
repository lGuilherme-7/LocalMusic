/**
 * library.js
 * Gerencia a biblioteca de músicas.
 * Usa showDirectoryPicker() (Chrome/Android) ou <input webkitdirectory> (fallback).
 * Filtra por extensão, monta o array global de faixas e dispara callbacks.
 */

import Metadata from './metadata.js';
import Storage  from './storage.js';

const Library = (() => {

  /** Formatos de áudio aceitos */
  const ACCEPTED_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];

  /** Array global de faixas carregadas */
  let _tracks = [];

  /** Callbacks registrados por outros módulos */
  const _listeners = [];

  /**
   * Registra um callback chamado quando a biblioteca é atualizada.
   * @param {Function} fn  Recebe o array de faixas como argumento
   */
  function onUpdate(fn) {
    _listeners.push(fn);
  }

  /** Notifica todos os listeners com o array atual de faixas */
  function _notify() {
    for (const fn of _listeners) fn([..._tracks]);
  }

  /**
   * Verifica se um nome de arquivo tem extensão de áudio aceita.
   * @param {string} name
   * @returns {boolean}
   */
  function _isAudio(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ACCEPTED_FORMATS.includes(ext);
  }

  /**
   * Cria o objeto de faixa base a partir de um File antes de extrair metadados.
   * O id usa o nome do arquivo como identificador persistente.
   * @param {File} file
   * @returns {{ id: string, file: File, title: string, artist: string, album: string, cover: null, duration: number }}
   */
  function _baseTrack(file) {
    return {
      id:       file.name,
      file,
      title:    file.name.replace(/\.[^.]+$/, ''),
      artist:   'Artista desconhecido',
      album:    'Álbum desconhecido',
      cover:    null,
      duration: 0
    };
  }

  /**
   * Coleta todos os Files de áudio de um FileSystemDirectoryHandle recursivamente.
   * @param {FileSystemDirectoryHandle} dirHandle
   * @returns {Promise<File[]>}
   */
  async function _collectFromHandle(dirHandle) {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        if (_isAudio(entry.name)) {
          const file = await entry.getFile();
          files.push(file);
        }
      } else if (entry.kind === 'directory') {
        const nested = await _collectFromHandle(entry);
        files.push(...nested);
      }
    }
    return files;
  }

  /**
   * Abre o seletor de pasta nativo (File System Access API).
   * Chrome Desktop e Android.
   * @returns {Promise<File[]>}
   */
  async function _openWithPicker() {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    return _collectFromHandle(dirHandle);
  }

  /**
   * Fallback: abre um <input type="file" webkitdirectory> para iOS/Firefox.
   * Retorna uma Promise que resolve com o array de Files selecionados.
   * @returns {Promise<File[]>}
   */
  function _openWithInput() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.accept = ACCEPTED_FORMATS.map(e => `.${e}`).join(',');
      input.style.display = 'none';

      input.onchange = () => {
        const files = Array.from(input.files || []).filter(f => _isAudio(f.name));
        document.body.removeChild(input);
        resolve(files);
      };
      input.oncancel = () => {
        document.body.removeChild(input);
        resolve([]);
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  /**
   * Ponto de entrada principal.
   * Abre a pasta, filtra áudios, monta faixas com metadados lazy.
   * Dispara onUpdate imediatamente com títulos básicos e depois com metadados.
   */
  async function openFolder() {
    let files = [];

    try {
      if ('showDirectoryPicker' in window) {
        files = await _openWithPicker();
      } else {
        files = await _openWithInput();
      }
    } catch (err) {
      // Usuário cancelou ou permissão negada — sem erro visível
      if (err.name !== 'AbortError') {
        throw err;
      }
      return;
    }

    if (!files.length) return;

    // Monta faixas base imediatamente para render rápido
    _tracks = files.map(_baseTrack);
    _notify();

    // Extrai metadados de forma lazy (sem bloquear a UI)
    _enrichMetadata(files);
  }

  /**
   * Enriquece as faixas com metadados ID3 e durações de forma assíncrona.
   * Atualiza a biblioteca e notifica a cada faixa processada.
   * @param {File[]} files
   */
  async function _enrichMetadata(files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta = await Metadata.extract(file);
      const dur  = await Metadata.getDuration(file);

      const track = _tracks.find(t => t.id === file.name);
      if (track) {
        track.title    = meta.title;
        track.artist   = meta.artist;
        track.album    = meta.album;
        track.cover    = meta.cover;
        track.duration = dur;
      }

      // Notifica a cada 5 faixas ou na última para não sobrecarregar o DOM
      if (i % 5 === 0 || i === files.length - 1) {
        _notify();
      }
    }

    // Salva nome da pasta como indicador de biblioteca carregada
    Storage.set('lm_library_loaded', true);
  }

  /**
   * Retorna a cópia atual do array de faixas.
   * @returns {object[]}
   */
  function getTracks() {
    return [..._tracks];
  }

  /**
   * Busca uma faixa pelo id (nome do arquivo).
   * @param {string} id
   * @returns {object|undefined}
   */
  function getTrackById(id) {
    return _tracks.find(t => t.id === id);
  }

  /**
   * Retorna a faixa pelo índice.
   * @param {number} index
   * @returns {object|undefined}
   */
  function getTrackByIndex(index) {
    return _tracks[index];
  }

  /**
   * Retorna todos os álbuns únicos com a capa da primeira faixa.
   * @returns {{ name: string, artist: string, cover: string|null }[]}
   */
  function getAlbums() {
    const map = new Map();
    for (const t of _tracks) {
      if (!map.has(t.album)) {
        map.set(t.album, { name: t.album, artist: t.artist, cover: t.cover });
      }
    }
    return [...map.values()];
  }

  /**
   * Retorna todos os artistas únicos com contagem de faixas.
   * @returns {{ name: string, count: number }[]}
   */
  function getArtists() {
    const map = new Map();
    for (const t of _tracks) {
      const entry = map.get(t.artist) || { name: t.artist, count: 0 };
      entry.count++;
      map.set(t.artist, entry);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Retorna estatísticas da biblioteca.
   * @returns {{ tracks: number, artists: number, albums: number, totalDuration: number }}
   */
  function getStats() {
    return {
      tracks:        _tracks.length,
      artists:       new Set(_tracks.map(t => t.artist)).size,
      albums:        new Set(_tracks.map(t => t.album)).size,
      totalDuration: _tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
    };
  }

  return { onUpdate, openFolder, getTracks, getTrackById, getTrackByIndex, getAlbums, getArtists, getStats };

})();

export default Library;