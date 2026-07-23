import Metadata from './metadata.js';
import Storage  from './storage.js';

const Library = (() => {

  const ACCEPTED_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];

  let _tracks    = [];
  let _folderMap = new Map(); // folderName -> trackId[]
  let _lyricsMap = new Map(); // nomeBaseSemExtensao -> File (.srt)
  const _listeners = [];

  function onUpdate(fn) { _listeners.push(fn); }
  function _notify()    { for (const fn of _listeners) fn([..._tracks]); }

  function _isAudio(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ACCEPTED_FORMATS.includes(ext);
  }

  function _isSrt(name) {
    return name.toLowerCase().endsWith('.srt');
  }

  function _baseName(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  /**
   * Normaliza um nome de arquivo (sem extensão) para permitir comparação
   * tolerante entre o MP3 e o .srt correspondente. Isso é necessário
   * porque o pytubefix sanitiza nomes de forma diferente para áudio e
   * legenda, e ainda adiciona sufixos de código de idioma ao final do
   * nome do .srt (ex: "_en-US_", "_a_en_", "_pt_"). Remove acentos,
   * pontuação e esses sufixos, deixando só letras/números para comparar.
   */
  function _normalizarParaComparacao(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    // Remove sufixo de idioma só quando estiver isolado entre parênteses
    // ("(en-US)", "(pt)") ou após separador explícito ("_pt", "_a_en_") —
    // nunca as duas últimas letras de uma palavra comum (ex: "VERSION").
    .replace(/\s*\(a?[_-]?[a-z]{2}(-[a-z]{2})?\)\s*$/i, '')
    .replace(/[_\s]+(a[_-])?[a-z]{2}(-[a-z]{2})?[_\s]*$/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

  function _baseTrack(file) {
    const chaveNormalizada = _normalizarParaComparacao(_baseName(file.name));
    return {
      id:       file.name,
      file,
      title:    file.name.replace(/\.[^.]+$/, ''),
      artist:   'Artista desconhecido',
      album:    'Álbum desconhecido',
      cover:    null,
      duration: 0,
      lyricsFile: _lyricsMap.get(chaveNormalizada) || null
    };
  }

  // Coleta arquivos recursivamente, registrando a pasta de primeiro nível.
  // Também coleta arquivos .srt à parte, para associar às faixas depois.
  async function _collectWithFolders(dirHandle, topFolder = null) {
    const results = [];
    const srts     = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && _isAudio(entry.name)) {
        const file = await entry.getFile();
        results.push({ file, folder: topFolder });
      } else if (entry.kind === 'file' && _isSrt(entry.name)) {
        const file = await entry.getFile();
        srts.push(file);
      } else if (entry.kind === 'directory') {
        const sub = await _collectWithFolders(entry, topFolder ?? entry.name);
        results.push(...sub);
      }
    }
    for (const srt of srts) {
      _lyricsMap.set(_normalizarParaComparacao(_baseName(srt.name)), srt);
    }
    return results;
  }

  async function _openWithPicker() {
    _lyricsMap = new Map();
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    return _collectWithFolders(dirHandle);
  }

  function _openWithInput() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type  = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      // Aceita os formatos de áudio E .srt no seletor de pasta
      input.accept = [...ACCEPTED_FORMATS.map(e => `.${e}`), '.srt'].join(',');
      input.style.display = 'none';

      input.onchange = () => {
        _lyricsMap = new Map();
        const todosArquivos = Array.from(input.files || []);

        // Primeiro indexa todos os .srt encontrados
        todosArquivos
          .filter(f => _isSrt(f.name))
          .forEach(f => _lyricsMap.set(_normalizarParaComparacao(_baseName(f.name)), f));

        // Depois monta a lista de faixas de áudio
        const results = todosArquivos
          .filter(f => _isAudio(f.name))
          .map(f => {
            const parts  = f.webkitRelativePath ? f.webkitRelativePath.split('/') : [];
            const folder = parts.length > 2 ? parts[1] : null;
            return { file: f, folder };
          });
        document.body.removeChild(input);
        resolve(results);
      };
      input.oncancel = () => { document.body.removeChild(input); resolve([]); };
      document.body.appendChild(input);
      input.click();
    });
  }

  async function openFolder() {
    let results = [];
    try {
      if ('showDirectoryPicker' in window) {
        results = await _openWithPicker();
      } else {
        results = await _openWithInput();
      }
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
      return;
    }
    if (!results.length) return;

    _tracks = results.map(r => _baseTrack(r.file));

    _folderMap = new Map();
    for (const r of results) {
      if (r.folder) {
        if (!_folderMap.has(r.folder)) _folderMap.set(r.folder, []);
        _folderMap.get(r.folder).push(r.file.name);
      }
    }

    _notify();
    _enrichMetadata(results.map(r => r.file));
  }

  async function _enrichMetadata(files) {
    for (let i = 0; i < files.length; i++) {
      const file  = files[i];
      const meta  = await Metadata.extract(file);
      const dur   = await Metadata.getDuration(file);
      const track = _tracks.find(t => t.id === file.name);
      if (track) {
        track.title    = meta.title;
        track.artist   = meta.artist;
        track.album    = meta.album;
        track.cover    = meta.cover;
        track.duration = dur;
      }
      if (i % 5 === 0 || i === files.length - 1) _notify();
    }
    Storage.set('lm_library_loaded', true);
  }

  function getTracks()          { return [..._tracks]; }
  function getTrackById(id)     { return _tracks.find(t => t.id === id); }
  function getTrackByIndex(i)   { return _tracks[i]; }

  function getAlbums() {
    const map = new Map();
    for (const t of _tracks) {
      if (!map.has(t.album)) map.set(t.album, { name: t.album, artist: t.artist, cover: t.cover });
    }
    return [...map.values()];
  }

  function getArtists() {
    const map = new Map();
    for (const t of _tracks) {
      const e = map.get(t.artist) || { name: t.artist, count: 0 };
      e.count++;
      map.set(t.artist, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Retorna subpastas detectadas como "playlists"
  function getFolders() {
    return [..._folderMap.entries()]
      .map(([name, tracks]) => ({ id: 'folder_' + name, name, tracks }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function getStats() {
    return {
      tracks:        _tracks.length,
      artists:       new Set(_tracks.map(t => t.artist)).size,
      albums:        new Set(_tracks.map(t => t.album)).size,
      totalDuration: _tracks.reduce((sum, t) => sum + (t.duration || 0), 0)
    };
  }

  return { onUpdate, openFolder, getTracks, getTrackById, getTrackByIndex, getAlbums, getArtists, getFolders, getStats };

})();

export default Library;