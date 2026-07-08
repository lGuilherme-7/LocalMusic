import Metadata from './metadata.js';
import Storage  from './storage.js';

const Library = (() => {

  const ACCEPTED_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'];

  let _tracks    = [];
  let _folderMap = new Map(); // folderName -> trackId[]
  const _listeners = [];

  function onUpdate(fn) { _listeners.push(fn); }
  function _notify()    { for (const fn of _listeners) fn([..._tracks]); }

  function _isAudio(name) {
    const ext = name.split('.').pop().toLowerCase();
    return ACCEPTED_FORMATS.includes(ext);
  }

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

  // Coleta arquivos recursivamente, registrando a pasta de primeiro nível
  async function _collectWithFolders(dirHandle, topFolder = null) {
    const results = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && _isAudio(entry.name)) {
        const file = await entry.getFile();
        results.push({ file, folder: topFolder });
      } else if (entry.kind === 'directory') {
        const sub = await _collectWithFolders(entry, topFolder ?? entry.name);
        results.push(...sub);
      }
    }
    return results;
  }

  async function _openWithPicker() {
    const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    return _collectWithFolders(dirHandle);
  }

  function _openWithInput() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type  = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.accept = ACCEPTED_FORMATS.map(e => `.${e}`).join(',');
      input.style.display = 'none';

      input.onchange = () => {
        const results = Array.from(input.files || [])
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