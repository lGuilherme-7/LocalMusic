import Metadata from './metadata.js';
import { readZipEntries } from './zip.js';

/** Importa, associa e persiste a biblioteca local sem depender de um backend. */
const Library = (() => {
  const audioFormats = new Set(['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus']);
  const lyricFormats = new Set(['lrc', 'txt', 'srt']);
  const imageFormats = new Set(['webp', 'png', 'jpg', 'jpeg']);
  const databaseName = 'local-music-library';
  const storeName = 'tracks';
  let tracks = [];
  let folders = new Map();
  let listeners = [];
  const coverUrls = new Map();
  let pinnedCoverTrack = null;
  const enrichmentTasks = new WeakMap();
  const enrichmentRevisions = new WeakMap();
  let databaseConnection = null;
  let databasePromise = null;
  let restorePromise = null;
  let diagnostics = [];
  let lastImportReport = emptyReport();
  const coverUrlLimit = 192;
  const metadataConcurrency = 4;
  const unknownAlbum = 'Álbum desconhecido';

  const emit = () => listeners.forEach(listener => listener(getTracks()));
  const extension = name => String(name || '').split('.').pop().toLocaleLowerCase();
  const baseName = name => String(name || '').replace(/\.[^.]+$/, '');
  const dirname = path => path.includes('/') ? path.replace(/\/[^/]+$/, '') : '';
  const clean = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const normalizePath = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  const isAudio = name => audioFormats.has(extension(name));
  const isLyrics = name => lyricFormats.has(extension(name));
  const isImage = name => imageFormats.has(extension(name));
  const isZip = name => extension(name) === 'zip';

  function positiveInteger(value) {
    const match = String(value ?? '').match(/\d+/);
    const number = Number(match?.[0]);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function isKnownAlbum(value) {
    const album = clean(value);
    return Boolean(album) && normalizedName(album) !== normalizedName(unknownAlbum);
  }

  function emptyReport() {
    return { imported: 0, updated: 0, skipped: 0, lyrics: 0, translations: 0, covers: 0, errors: [] };
  }

  async function runWithConcurrency(values, limit, operation) {
    let cursor = 0;
    const worker = async () => {
      while (cursor < values.length) {
        const value = values[cursor];
        cursor += 1;
        await operation(value);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  }

  function report(level, code, message, details = {}) {
    diagnostics = [...diagnostics, { at: new Date().toISOString(), level, code, message, details }].slice(-100);
    if (level === 'warning' || level === 'error') console.warn('Local Music import:', code, message);
  }

  function stableKey(value) {
    let hash = 2166136261;
    for (const character of String(value).normalize('NFC').toLocaleLowerCase()) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function normalizedName(value) {
    return String(value || '').normalize('NFC').toLocaleLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  function extractIdentifier(value) {
    const name = baseName(value).trim();
    const bracketed = name.match(/\[([A-Za-z0-9_-]{6,})\]\s*$/);
    if (bracketed) return bracketed[1];
    return /^[_A-Za-z0-9-]{6,}$/.test(name) ? name : null;
  }

  function displayBaseName(value) {
    return baseName(value).replace(/\s*\[[A-Za-z0-9_-]{6,}\]\s*$/, '').trim() || baseName(value);
  }

  function lyricIdentity(name) {
    const stem = baseName(name);
    const language = stem.match(/^(.*)\.([a-z]{2,3}(?:-[a-z0-9]{2,8})*)$/i);
    return {
      base: language ? language[1] : stem,
      language: language ? language[2] : null,
      identifier: extractIdentifier(language ? language[1] : stem)
    };
  }

  function normalizeLyrics(meta) {
    if (Array.isArray(meta.lyrics)) return meta.lyrics;
    if (Array.isArray(meta.lyrics?.lines)) return meta.lyrics.lines;
    return null;
  }

  function createIdentityKeys(track) {
    const keys = [];
    if (track.sourceId) keys.push('meta:' + track.sourceId);
    if (track.referenceId) keys.push('reference:' + track.referenceId);
    if (track.pathKey) keys.push('path:' + track.pathKey);
    return keys;
  }

  function normalize(file, path, meta = {}) {
    const audioValue = typeof meta.audio === 'object' ? meta.audio.path : meta.audio;
    const coverValue = typeof meta.cover === 'object' ? meta.cover.path : meta.cover;
    const sourceValue = typeof meta.source === 'object' ? meta.source.label : meta.source;
    const sourceId = clean(meta.id);
    const track = {
      id: sourceId || file.name,
      sourceId: sourceId || null,
      referenceId: extractIdentifier(file.name),
      file,
      fileName: file.name,
      fileType: file.type || '',
      fileLastModified: Number(file.lastModified) || Date.now(),
      path: normalizePath(path || file.name),
      pathKey: normalizedName(normalizePath(path || file.name).replace(/\.[^.]+$/, '')),
      title: clean(meta.title, displayBaseName(file.name)),
      artist: clean(meta.artist, 'Artista desconhecido'),
      album: clean(meta.album, unknownAlbum),
      albumArtist: clean(meta.albumArtist),
      releaseId: clean(meta.releaseId) || clean(meta.release?.id) || null,
      releaseType: clean(meta.releaseType) || clean(meta.release?.type) || null,
      trackNumber: positiveInteger(meta.trackNumber ?? meta.track),
      discNumber: positiveInteger(meta.discNumber ?? meta.disc),
      year: Number(meta.year) || null,
      genre: clean(meta.genre),
      duration: Number(meta.duration) || 0,
      audio: clean(audioValue, file.name),
      cover: null,
      coverData: null,
      coverFile: null,
      coverName: null,
      coverInfo: null,
      coverReference: clean(coverValue),
      source: clean(sourceValue) || null,
      language: clean(meta.language) || clean(meta.lyrics?.language) || null,
      lyrics: normalizeLyrics(meta),
      lyricsFile: null,
      lyricsFormat: null,
      translationFile: null,
      translationFormat: null,
      dateAdded: clean(meta.dateAdded) || clean(meta.export?.createdAt) || new Date(file.lastModified || Date.now()).toISOString(),
      playCount: Number(meta.playCount) || 0,
      lastPlayed: meta.lastPlayed || null
    };
    track.identityKeys = createIdentityKeys(track);
    return track;
  }

  function revokeCover(track) {
    const url = coverUrls.get(track);
    if (!url) return;
    URL.revokeObjectURL(url);
    coverUrls.delete(track);
    if (track.cover === url) track.cover = null;
  }

  function trimCoverUrls() {
    while (coverUrls.size > coverUrlLimit) {
      const [oldestTrack, url] = coverUrls.entries().next().value;
      if (oldestTrack === pinnedCoverTrack) {
        coverUrls.delete(oldestTrack);
        coverUrls.set(oldestTrack, url);
        continue;
      }
      coverUrls.delete(oldestTrack);
      URL.revokeObjectURL(url);
      if (oldestTrack.cover === url) oldestTrack.cover = null;
    }
  }

  function getCoverUrl(track, { pin = false } = {}) {
    if (!track) return null;
    if (pin) pinnedCoverTrack = track;
    if (track.cover) {
      if (coverUrls.has(track)) {
        const url = coverUrls.get(track);
        coverUrls.delete(track);
        coverUrls.set(track, url);
      }
      return track.cover;
    }
    if (track.coverFile) {
      const url = URL.createObjectURL(track.coverFile);
      track.cover = url;
      coverUrls.set(track, url);
      trimCoverUrls();
      return url;
    }
    return track.coverData || null;
  }

  function refreshCoverUrl(track, failedUrl) {
    if (!track?.coverFile || track.cover !== failedUrl) return null;
    revokeCover(track);
    return getCoverUrl(track, { pin: track === pinnedCoverTrack });
  }

  async function recoverCover(track, failedUrl) {
    if (!track?.coverFile || track.cover !== failedUrl) return null;
    clearExternalCover(track);
    await ensureMetadata(track, { refresh: true });
    emit();
    return getCoverUrl(track, { pin: track === pinnedCoverTrack });
  }

  async function getCoverInfo(file) {
    const fallback = { width: 0, height: 0, bytes: Number(file?.size) || 0, type: file?.type || '', valid: null };
    if (!file) return fallback;
    try {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        const info = { ...fallback, width: bitmap.width, height: bitmap.height, valid: bitmap.width > 0 && bitmap.height > 0 };
        bitmap.close?.();
        return info;
      }
      if (typeof Image !== 'function') return fallback;
      const url = URL.createObjectURL(file);
      return await new Promise(resolve => {
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve({
            ...fallback,
            width: image.naturalWidth || 0,
            height: image.naturalHeight || 0,
            valid: image.naturalWidth > 0 && image.naturalHeight > 0
          });
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ ...fallback, valid: false });
        };
        image.src = url;
      });
    } catch {
      return { ...fallback, valid: false };
    }
  }

  function coverScore(info) {
    if (!info) return 0;
    if (info.valid === false) return -1;
    const width = Math.max(0, Number(info.width) || 0);
    const height = Math.max(0, Number(info.height) || 0);
    const area = width * height;
    const squareRatio = width && height ? Math.min(width, height) / Math.max(width, height) : 0;
    return area
      ? squareRatio * 1_000_000_000_000_000 + area * 1_000_000 + (Number(info.bytes) || 0)
      : Number(info.bytes) || 0;
  }

  function setCover(track, file, info) {
    revokeCover(track);
    track.coverFile = file;
    track.coverName = file.name;
    track.coverInfo = info;
    track.coverData = null;
    track.cover = null;
  }

  function uniqueCoverCandidates(candidates) {
    const unique = new Map();
    candidates.forEach(candidate => {
      if (!candidate?.file) return;
      const key = [
        normalizedName(candidate.file.name),
        Number(candidate.file.size) || 0,
        Number(candidate.file.lastModified) || 0
      ].join('|');
      unique.set(key, candidate);
    });
    return [...unique.values()];
  }

  function clearExternalCover(track) {
    revokeCover(track);
    track.coverFile = null;
    track.coverName = null;
    track.coverInfo = null;
    track.cover = track.coverData || null;
  }

  function chooseFile(current, candidate) {
    if (!candidate) return current;
    if (!current) return candidate;
    const priority = { lrc: 3, srt: 2, txt: 1 };
    return (priority[extension(candidate.file.name)] || 0) > (priority[extension(current.file.name)] || 0) ? candidate : current;
  }

  function isGenericCoverName(name) {
    return ['cover', 'folder', 'front', 'artwork'].includes(normalizedName(baseName(name)));
  }

  function hasReference(track, entry) {
    if (!track.coverReference) return false;
    const reference = normalizePath(track.coverReference).toLocaleLowerCase();
    const path = normalizePath(entry.path).toLocaleLowerCase();
    const parent = dirname(track.path).toLocaleLowerCase();
    return path === reference || path === normalizePath(parent + '/' + reference).toLocaleLowerCase();
  }

  function associatedTrack(entry, candidates, kind) {
    const identity = kind === 'lyrics'
      ? lyricIdentity(entry.file.name)
      : { base: baseName(entry.file.name), identifier: extractIdentifier(entry.file.name) };
    const references = kind === 'image' ? candidates.filter(track => hasReference(track, entry)) : [];
    if (references.length === 1) return references[0];
    const byIdentifier = identity.identifier ? candidates.filter(track => track.referenceId === identity.identifier) : [];
    if (byIdentifier.length === 1) return byIdentifier[0];
    if (byIdentifier.length > 1) return null;
    const parent = normalizedName(dirname(entry.path));
    const base = normalizedName(displayBaseName(identity.base));
    const sameFolder = candidates.filter(track => normalizedName(dirname(track.path)) === parent);
    const exact = sameFolder.filter(track => normalizedName(displayBaseName(track.file.name)) === base);
    if (exact.length === 1) return exact[0];
    if (kind === 'image' && isGenericCoverName(entry.file.name) && sameFolder.length === 1) return sameFolder[0];
    return null;
  }

  function associateFiles(importedTracks, entries, reportData) {
    const originalLyrics = new Map();
    const translatedLyrics = new Map();
    const images = new Map();
    entries.filter(entry => isLyrics(entry.file.name)).forEach(entry => {
      const track = associatedTrack(entry, importedTracks, 'lyrics');
      if (!track) return;
      const bucket = lyricIdentity(entry.file.name).language ? translatedLyrics : originalLyrics;
      bucket.set(track, chooseFile(bucket.get(track), { file: entry.file, format: extension(entry.file.name) }));
    });
    entries.filter(entry => isImage(entry.file.name)).forEach(entry => {
      const track = associatedTrack(entry, importedTracks, 'image');
      if (!track) return;
      const candidates = images.get(track) || [];
      candidates.push({ file: entry.file, info: null });
      images.set(track, candidates);
    });
    for (const track of importedTracks) {
      const original = originalLyrics.get(track);
      const translation = translatedLyrics.get(track);
      if (original) {
        track.lyricsFile = original.file;
        track.lyricsFormat = original.format;
        reportData.lyrics += 1;
      }
      if (translation) {
        track.translationFile = translation.file;
        track.translationFormat = translation.format;
        reportData.translations += 1;
      }
      const covers = images.get(track) || [];
      covers.forEach(candidate => {
        candidate.info = {
          width: 0,
          height: 0,
          bytes: Number(candidate.file.size) || 0,
          type: candidate.file.type || ''
        };
      });
      const cover = covers.reduce((best, candidate) => (
        !best || coverScore(candidate.info) > coverScore(best.info) ? candidate : best
      ), null);
      if (cover) {
        setCover(track, cover.file, cover.info);
        track.pendingCoverCandidates = covers;
        reportData.covers += 1;
      }
    }
  }

  function collectDirectory(handle, rootFolder = null, path = '', files = []) {
    return (async () => {
      for await (const entry of handle.values()) {
        const entryPath = path ? path + '/' + entry.name : entry.name;
        if (entry.kind === 'directory') {
          await collectDirectory(entry, rootFolder || entry.name, entryPath, files);
        } else {
          try {
            files.push({ file: await entry.getFile(), folder: rootFolder, path: entryPath });
          } catch (error) {
            report('warning', 'file-read-failed', 'Arquivo ignorado: ' + entryPath, { error: String(error) });
          }
        }
      }
      return files;
    })();
  }

  function acceptedTypes() {
    return [...audioFormats].map(type => '.' + type).concat(['.zip', '.json', '.lrc', '.txt', '.srt', '.webp', '.png', '.jpg', '.jpeg']).join(',');
  }

  function selectDirectoryFiles() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.setAttribute('webkitdirectory', '');
      input.accept = acceptedTypes();
      input.onchange = () => {
        const files = Array.from(input.files || []).map(file => {
          const path = normalizePath(file.webkitRelativePath || file.name);
          const parts = path.split('/');
          return { file, path, folder: parts.length > 2 ? parts[1] : null };
        });
        resolve(files);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  function selectImportFiles() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = acceptedTypes();
      input.onchange = () => resolve(Array.from(input.files || []).map(file => ({ file, path: file.name, folder: null })));
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async function expandArchives(entries, reportData) {
    const expanded = [];
    for (const entry of entries) {
      if (!isZip(entry.file.name)) {
        expanded.push(entry);
        continue;
      }
      try {
        const archiveEntries = await readZipEntries(entry.file);
        archiveEntries.forEach(item => expanded.push({ ...item, path: normalizePath(item.path), folder: entry.folder || null }));
      } catch (error) {
        const message = 'Não foi possível importar ' + entry.file.name + ': ' + (error.message || 'ZIP inválido.');
        report('error', 'zip-read-failed', message, { file: entry.file.name });
        reportData.errors.push(message);
        reportData.skipped += 1;
      }
    }
    return expanded;
  }

  async function readMetadata(entries) {
    const metadata = new Map();
    for (const entry of entries.filter(item => item.file.name.toLocaleLowerCase() === 'track.json')) {
      try {
        const parsed = JSON.parse(await entry.file.text());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('conteúdo não é um objeto');
        metadata.set(normalizedName(dirname(entry.path)), parsed);
      } catch (error) {
        report('warning', 'metadata-invalid', 'track.json ignorado: ' + entry.path, { error: String(error) });
      }
    }
    return metadata;
  }

  function findExisting(incoming, pool) {
    const keys = new Set(incoming.identityKeys || []);
    const byIdentity = pool.filter(track => track.identityKeys?.some(key => keys.has(key)));
    if (byIdentity.length === 1) return byIdentity[0];
    const byId = pool.filter(track => track.id === incoming.id);
    return byId.length === 1 ? byId[0] : null;
  }

  function fileQuality(file, format) {
    if (!file || !file.size) return 0;
    return ({ lrc: 3, srt: 2, txt: 1 }[format || extension(file.name)] || 0) * 1_000_000_000 + file.size;
  }

  function replaceLyrics(existing, incoming, field, formatField) {
    if (!incoming[field]?.size) return false;
    const currentFormat = existing[formatField] || extension(existing[field]?.name);
    const incomingFormat = incoming[formatField] || extension(incoming[field].name);
    const currentQuality = fileQuality(existing[field], currentFormat);
    const incomingQuality = fileQuality(incoming[field], incomingFormat);
    if (!currentQuality || incomingFormat === currentFormat || incomingQuality > currentQuality) {
      existing[field] = incoming[field];
      existing[formatField] = incoming[formatField];
      return true;
    }
    return false;
  }

  function mergeTrack(existing, incoming) {
    const priorFileName = existing.fileName;
    existing.file = incoming.file;
    existing.fileName = incoming.fileName;
    existing.fileType = incoming.fileType;
    existing.fileLastModified = incoming.fileLastModified;
    existing.path = incoming.path;
    existing.pathKey = incoming.pathKey;
    existing.referenceId = existing.referenceId || incoming.referenceId;
    existing.sourceId = existing.sourceId || incoming.sourceId;
    existing.identityKeys = [...new Set([...(existing.identityKeys || []), ...(incoming.identityKeys || [])])];
    if (!existing.title || existing.title === displayBaseName(priorFileName)) existing.title = incoming.title;
    if (!existing.artist || existing.artist === 'Artista desconhecido') existing.artist = incoming.artist;
    if (!isKnownAlbum(existing.album) && isKnownAlbum(incoming.album)) existing.album = incoming.album;
    if (!existing.albumArtist && incoming.albumArtist) existing.albumArtist = incoming.albumArtist;
    if (!existing.releaseId && incoming.releaseId) existing.releaseId = incoming.releaseId;
    if (!existing.releaseType && incoming.releaseType) existing.releaseType = incoming.releaseType;
    if (!existing.trackNumber && incoming.trackNumber) existing.trackNumber = incoming.trackNumber;
    if (!existing.discNumber && incoming.discNumber) existing.discNumber = incoming.discNumber;
    if (!existing.year && incoming.year) existing.year = incoming.year;
    if (!existing.genre && incoming.genre) existing.genre = incoming.genre;
    if (!existing.duration && incoming.duration) existing.duration = incoming.duration;
    if (!existing.lyrics?.length && incoming.lyrics?.length) existing.lyrics = incoming.lyrics;
    replaceLyrics(existing, incoming, 'lyricsFile', 'lyricsFormat');
    replaceLyrics(existing, incoming, 'translationFile', 'translationFormat');
    let replacedByNewerCover = false;
    if (incoming.coverFile) {
      const sameCover = normalizedName(incoming.coverName) === normalizedName(existing.coverName);
      const currentModified = Number(existing.coverFile?.lastModified || 0);
      const incomingModified = Number(incoming.coverFile.lastModified || 0);
      const changedSameCover = sameCover
        && (incomingModified > currentModified
          || (incomingModified === currentModified && incoming.coverFile.size !== existing.coverFile?.size));
      if (!existing.coverFile || changedSameCover || coverScore(incoming.coverInfo) > coverScore(existing.coverInfo)) {
        setCover(existing, incoming.coverFile, incoming.coverInfo);
        if (changedSameCover) {
          existing.pendingCoverCandidates = [...(incoming.pendingCoverCandidates || [])];
          replacedByNewerCover = true;
        }
      } else if (!incoming.pendingCoverCandidates?.length) {
        existing.pendingCoverCandidates = uniqueCoverCandidates([
          ...(existing.pendingCoverCandidates || []),
          { file: incoming.coverFile, info: incoming.coverInfo }
        ]);
      }
    }
    if (incoming.pendingCoverCandidates?.length && !replacedByNewerCover) {
      existing.pendingCoverCandidates = uniqueCoverCandidates([
        ...(existing.pendingCoverCandidates || []),
        ...incoming.pendingCoverCandidates
      ]);
    }
    return existing;
  }

  function ensureUniqueId(track, usedIds) {
    if (!usedIds.has(track.id)) {
      usedIds.add(track.id);
      return;
    }
    track.id = track.path + '#' + stableKey(track.path);
    usedIds.add(track.id);
  }

  function openDatabase() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    if (databaseConnection) return Promise.resolve(databaseConnection);
    if (databasePromise) return databasePromise;
    let pendingPromise;
    pendingPromise = new Promise(resolve => {
      let settled = false;

      const useDatabase = database => {
        if (!database) return null;
        if (databaseConnection && databaseConnection !== database) {
          database.close?.();
          return databaseConnection;
        }
        databaseConnection = database;
        const forgetDatabase = () => {
          if (databaseConnection === database) {
            databaseConnection = null;
            databasePromise = null;
          }
        };
        database.onversionchange = () => {
          database.close?.();
          forgetDatabase();
        };
        database.onclose = forgetDatabase;
        return database;
      };

      const finish = database => {
        if (settled) {
          useDatabase(database);
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const availableDatabase = useDatabase(database);
        resolve(availableDatabase);
        queueMicrotask(() => {
          if (!availableDatabase && databasePromise === pendingPromise) databasePromise = null;
        });
      };
      const timeout = setTimeout(() => {
        report('warning', 'persistence-timeout', 'O armazenamento da biblioteca demorou demais para responder.');
        finish(null);
      }, 5000);
      try {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: 'id' });
        };
        request.onsuccess = () => finish(request.result);
        request.onerror = () => {
          report('warning', 'persistence-unavailable', 'O armazenamento persistente da biblioteca não está disponível.', { error: String(request.error) });
          finish(null);
        };
        request.onblocked = () => {
          report('warning', 'persistence-blocked', 'Outra versão do aplicativo está usando o armazenamento da biblioteca.');
          finish(null);
        };
      } catch (error) {
        report('warning', 'persistence-unavailable', 'O armazenamento persistente da biblioteca não está disponível.', { error: String(error) });
        finish(null);
      }
    });
    databasePromise = pendingPromise;
    return databasePromise;
  }

  function asStoredTrack(track) {
    return {
      id: track.id, sourceId: track.sourceId, referenceId: track.referenceId, identityKeys: track.identityKeys,
      file: track.file, fileName: track.fileName, fileType: track.fileType, fileLastModified: track.fileLastModified,
      path: track.path, pathKey: track.pathKey, title: track.title, artist: track.artist, album: track.album,
      albumArtist: track.albumArtist, releaseId: track.releaseId, releaseType: track.releaseType,
      trackNumber: track.trackNumber, discNumber: track.discNumber, year: track.year, genre: track.genre,
      duration: track.duration, audio: track.audio,
      coverData: track.coverData, coverFile: track.coverFile, coverName: track.coverName, coverInfo: track.coverInfo,
      coverLastModified: Number(track.coverFile?.lastModified) || null,
      coverReference: track.coverReference, source: track.source, language: track.language, lyrics: track.lyrics,
      lyricsFile: track.lyricsFile, lyricsFormat: track.lyricsFormat, translationFile: track.translationFile,
      translationFormat: track.translationFormat, dateAdded: track.dateAdded, playCount: track.playCount, lastPlayed: track.lastPlayed
    };
  }

  function reviveFile(blob, name, type, lastModified) {
    if (!blob) return null;
    if (typeof File === 'function') return new File([blob], name, { type: blob.type || type || '', lastModified: Number(lastModified) || Date.now() });
    Object.defineProperties(blob, {
      name: { value: name, configurable: true },
      lastModified: { value: Number(lastModified) || Date.now(), configurable: true }
    });
    return blob;
  }

  function reviveTrack(record) {
    const track = { ...record };
    track.file = reviveFile(record.file, record.fileName || record.id, record.fileType, record.fileLastModified);
    track.coverFile = reviveFile(
      record.coverFile,
      record.coverName || 'cover',
      record.coverFile?.type,
      record.coverLastModified || record.coverFile?.lastModified || record.fileLastModified
    );
    track.lyricsFile = reviveFile(
      record.lyricsFile,
      record.lyricsFile?.name || 'lyrics.lrc',
      record.lyricsFile?.type,
      record.lyricsFile?.lastModified || record.fileLastModified
    );
    track.translationFile = reviveFile(
      record.translationFile,
      record.translationFile?.name || 'translation.lrc',
      record.translationFile?.type,
      record.translationFile?.lastModified || record.fileLastModified
    );
    track.identityKeys = Array.isArray(record.identityKeys) ? record.identityKeys : createIdentityKeys(track);
    track.cover = record.coverData || null;
    return track;
  }

  async function persistTracks(values) {
    if (!values.length) return true;
    const database = await openDatabase();
    if (!database) return false;
    return new Promise(resolve => {
      try {
        const transaction = database.transaction(storeName, 'readwrite');
        const objectStore = transaction.objectStore(storeName);
        let settled = false;
        const finish = result => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        const fail = () => {
          if (settled) return;
          report('warning', 'persistence-write-failed', 'Não foi possível salvar a atualização da biblioteca.', {
            count: values.length,
            error: String(transaction.error)
          });
          finish(false);
        };
        values.forEach(track => objectStore.put(asStoredTrack(track)));
        transaction.oncomplete = () => finish(true);
        transaction.onerror = fail;
        transaction.onabort = fail;
      } catch (error) {
        report('warning', 'persistence-write-failed', 'Não foi possível salvar a atualização da biblioteca.', {
          count: values.length,
          error: String(error)
        });
        resolve(false);
      }
    });
  }

  const persistTrack = track => persistTracks([track]);

  async function restore() {
    if (restorePromise) return restorePromise;
    const pendingRestore = (async () => {
      const database = await openDatabase();
      if (!database) return false;
      const records = await new Promise(resolve => {
        let settled = false;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        };
        const timeout = setTimeout(() => {
          report('warning', 'persistence-read-timeout', 'A leitura da biblioteca demorou demais para responder.');
          finish([]);
        }, 5000);
        try {
          const transaction = database.transaction(storeName, 'readonly');
          const request = transaction.objectStore(storeName).getAll();
          request.onsuccess = () => finish(request.result || []);
          request.onerror = () => {
            if (settled) return;
            report('warning', 'persistence-read-failed', 'Não foi possível restaurar a biblioteca persistida.', { error: String(request.error) });
            finish([]);
          };
          transaction.onabort = () => {
            if (settled) return;
            report('warning', 'persistence-read-failed', 'A leitura da biblioteca persistida foi interrompida.', { error: String(transaction.error) });
            finish([]);
          };
        } catch (error) {
          report('warning', 'persistence-read-failed', 'Não foi possível restaurar a biblioteca persistida.', { error: String(error) });
          finish([]);
        }
      });
      if (!records.length) return false;
      tracks = records.flatMap(record => {
        try {
          const track = reviveTrack(record);
          return track.file ? [track] : [];
        } catch (error) {
          report('warning', 'track-restore-failed', 'Uma faixa inválida foi ignorada durante a restauração.', {
            id: typeof record?.id === 'string' ? record.id : null,
            error: String(error)
          });
          return [];
        }
      });
      rebuildFolders();
      emit();
      return Boolean(tracks.length);
    })();
    restorePromise = pendingRestore;
    pendingRestore.then(
      restored => {
        if (!restored && restorePromise === pendingRestore) restorePromise = null;
      },
      () => {
        if (restorePromise === pendingRestore) restorePromise = null;
      }
    );
    return pendingRestore;
  }

  function rebuildFolders() {
    folders = new Map();
    tracks.forEach(track => {
      const parts = normalizePath(track.path).split('/');
      const folder = parts.length > 2 ? parts[1] : null;
      if (!folder) return;
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(track.id);
    });
  }

  async function importEntries(sourceEntries) {
    const reportData = emptyReport();
    const entries = await expandArchives(sourceEntries, reportData);
    const audioEntries = entries.filter(entry => isAudio(entry.file.name));
    if (!audioEntries.length) {
      const ancillaryEntries = entries.filter(entry => isLyrics(entry.file.name) || isImage(entry.file.name));
      if (ancillaryEntries.length && tracks.length) {
        const associatedTracks = new Set();
        ancillaryEntries.forEach(entry => {
          const kind = isImage(entry.file.name) ? 'image' : 'lyrics';
          const track = associatedTrack(entry, tracks, kind);
          if (track) associatedTracks.add(track);
        });
        if (associatedTracks.size) {
          const changed = [...associatedTracks];
          associateFiles(changed, ancillaryEntries, reportData);
          await runWithConcurrency(changed, metadataConcurrency, track => ensureMetadata(track, { refresh: true, persist: false }));
          await persistTracks(changed);
          reportData.updated = changed.length;
          lastImportReport = reportData;
          emit();
          return true;
        }
      }
      const message = 'Nenhum arquivo de áudio compatível foi encontrado.';
      report('warning', 'no-audio', message);
      reportData.errors.push(message);
      lastImportReport = reportData;
      return false;
    }
    const metadata = await readMetadata(entries);
    const usedIds = new Set(tracks.map(track => track.id));
    const importedTracks = audioEntries.map(entry => {
      const track = normalize(entry.file, entry.path, metadata.get(normalizedName(dirname(entry.path))) || {});
      ensureUniqueId(track, usedIds);
      return track;
    });
    associateFiles(importedTracks, entries, reportData);
    const changed = [];
    importedTracks.forEach(incoming => {
      const existing = findExisting(incoming, tracks);
      if (existing) {
        changed.push(mergeTrack(existing, incoming));
        reportData.updated += 1;
      } else {
        tracks.push(incoming);
        changed.push(incoming);
        reportData.imported += 1;
      }
    });
    rebuildFolders();
    await persistTracks(changed);
    lastImportReport = reportData;
    emit();
    void enrichMetadata(changed);
    return true;
  }

  async function openFolder() {
    let entries;
    try {
      entries = 'showDirectoryPicker' in window ? await collectDirectory(await window.showDirectoryPicker()) : await selectDirectoryFiles();
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      throw error;
    }
    return entries === null ? false : importEntries(entries);
  }

  async function importFiles(files = null) {
    const entries = files
      ? Array.from(files).map(file => ({ file, path: normalizePath(file.webkitRelativePath || file.name), folder: null }))
      : await selectImportFiles();
    return entries === null ? false : importEntries(entries);
  }

  async function inspectPendingCovers(track, revision) {
    const candidates = track.pendingCoverCandidates || [];
    if (!candidates.length) return;
    const inspected = await Promise.all(candidates.map(async candidate => ({
      file: candidate.file,
      info: await getCoverInfo(candidate.file)
    })));
    if (enrichmentRevisions.get(track) !== revision) return;
    delete track.pendingCoverCandidates;
    const validCandidates = inspected.filter(candidate => candidate.info.valid !== false);
    const best = validCandidates.reduce((winner, candidate) => (
      !winner || coverScore(candidate.info) > coverScore(winner.info) ? candidate : winner
    ), null);
    if (!best && candidates.some(candidate => candidate.file === track.coverFile)) {
      clearExternalCover(track);
      return;
    }
    if (best && (!track.coverFile || coverScore(best.info) >= coverScore(track.coverInfo))) {
      if (track.coverFile !== best.file) setCover(track, best.file, best.info);
      else track.coverInfo = best.info;
    }
  }

  function ensureMetadata(track, { refresh = false, persist = true } = {}) {
    if (!track?.file) return Promise.resolve(false);
    const running = enrichmentTasks.get(track);
    if (running && !refresh) return running;
    const revision = (enrichmentRevisions.get(track) || 0) + 1;
    enrichmentRevisions.set(track, revision);
    const task = (async () => {
      try {
        await inspectPendingCovers(track, revision);
        const metadata = await Metadata.extract(track.file);
        if (enrichmentRevisions.get(track) !== revision) return false;
        const metadataTitle = clean(metadata.title);
        if (track.title === displayBaseName(track.fileName) && metadataTitle && normalizedName(metadataTitle) !== normalizedName(baseName(track.fileName))) {
          track.title = metadataTitle;
        }
        if (track.artist === 'Artista desconhecido') track.artist = clean(metadata.artist, track.artist);
        if (!isKnownAlbum(track.album) && isKnownAlbum(metadata.album)) track.album = clean(metadata.album, track.album);
        if (!track.albumArtist) track.albumArtist = clean(metadata.albumArtist);
        if (!track.trackNumber) track.trackNumber = positiveInteger(metadata.trackNumber);
        if (!track.discNumber) track.discNumber = positiveInteger(metadata.discNumber);
        if (!track.year) track.year = Number(metadata.year) || null;
        if (!track.coverFile && !track.coverData && metadata.cover) {
          track.cover = metadata.cover;
          track.coverData = metadata.cover;
        }
        if (!track.duration) track.duration = await Metadata.getDuration(track.file);
        if (enrichmentRevisions.get(track) !== revision) return false;
        if (persist) await persistTrack(track);
        return true;
      } catch (error) {
        report('warning', 'metadata-read-failed', 'Não foi possível ler os metadados de ' + track.fileName + '.', {
          error: String(error)
        });
        return false;
      }
    })();
    enrichmentTasks.set(track, task);
    task.finally(() => {
      if (enrichmentTasks.get(track) === task) enrichmentTasks.delete(track);
    });
    return task;
  }

  async function enrichMetadata(importedTracks) {
    await runWithConcurrency(
      importedTracks,
      metadataConcurrency,
      track => ensureMetadata(track, { refresh: true, persist: false })
    );
    await persistTracks(importedTracks);
    emit();
  }

  const getTracks = () => [...tracks];
  const getTrackById = id => tracks.find(track => track.id === id);
  const getLastImportReport = () => ({ ...lastImportReport, errors: [...lastImportReport.errors] });
  const getDiagnostics = () => diagnostics.map(item => ({ ...item, details: { ...item.details } }));
  const onUpdate = listener => {
    listeners.push(listener);
    return () => { listeners = listeners.filter(candidate => candidate !== listener); };
  };

  function getAlbums() {
    const albums = new Map();
    tracks.forEach(track => {
      if (!isKnownAlbum(track.album)) return;
      const artist = clean(track.albumArtist) || clean(track.artist, 'Artista desconhecido');
      const key = track.releaseId ? `release:${normalizedName(track.releaseId)}` : [
        normalizedName(track.album),
        normalizedName(artist),
        Number(track.year) || 'unknown-year'
      ].join('|');
      if (!albums.has(key)) {
        albums.set(key, {
          id: 'album_' + stableKey(key),
          releaseId: track.releaseId || null,
          releaseType: track.releaseType || null,
          name: track.album,
          artist,
          year: Number(track.year) || null,
          coverSourceTrack: track.cover || track.coverFile || track.coverData ? track : null,
          count: 0,
          tracks: []
        });
      }
      const album = albums.get(key);
      album.count += 1;
      album.tracks.push(track);
      if (!album.coverSourceTrack && (track.cover || track.coverFile || track.coverData)) album.coverSourceTrack = track;
    });
    return [...albums.values()].map(album => ({
      ...album,
      tracks: album.tracks.sort((left, right) => (
        (left.discNumber || 1) - (right.discNumber || 1)
        || (left.trackNumber || Number.MAX_SAFE_INTEGER) - (right.trackNumber || Number.MAX_SAFE_INTEGER)
        || String(left.title).localeCompare(String(right.title))
      ))
    })).sort((left, right) => left.name.localeCompare(right.name) || left.artist.localeCompare(right.artist));
  }

  function getArtists() {
    const artists = new Map();
    tracks.forEach(track => artists.set(track.artist, (artists.get(track.artist) || 0) + 1));
    return [...artists].map(([name, count]) => ({ name, count }));
  }

  const getFolders = () => [...folders].map(([name, ids]) => ({
    id: 'folder_' + stableKey(name),
    name,
    tracks: [...new Set(ids)],
    kind: 'imported-collection',
    readOnly: true
  }));
  const getStats = () => ({ tracks: tracks.length, artists: getArtists().length, albums: getAlbums().length });

  function recordPlay(id) {
    const track = getTrackById(id);
    if (!track) return;
    track.playCount = (Number(track.playCount) || 0) + 1;
    track.lastPlayed = new Date().toISOString();
    void persistTrack(track);
  }

  return {
    openFolder, importFiles, restore, onUpdate, getTracks, getTrackById, getAlbums, getArtists, getFolders, getStats,
    getLastImportReport, getDiagnostics, getCoverUrl, refreshCoverUrl, recoverCover, ensureMetadata, recordPlay
  };
})();

export default Library;
