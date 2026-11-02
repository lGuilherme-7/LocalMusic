/** Capas personalizadas de playlists, isoladas dos arquivos e capas das músicas. */
const PlaylistCovers = (() => {
  const databaseName = 'local-music-playlist-assets';
  const storeName = 'covers';
  const maxInputBytes = 20 * 1024 * 1024;
  const maxStoredBytes = 4 * 1024 * 1024;
  const maxDimension = 1600;
  const maxDecodedDimension = 16000;
  const maxCachedUrls = 64;
  const urlCache = new Map();
  const pendingReads = new Map();
  const knownMissing = new Set();
  let databasePromise = null;

  function createError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  function openDatabase() {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(createError('storage-unavailable', 'O armazenamento local não está disponível.'));
    }
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };
        database.onclose = () => {
          databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || createError('storage-open-failed', 'Não foi possível abrir o armazenamento de capas.'));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(createError('storage-blocked', 'Outra janela está atualizando o armazenamento de capas.'));
      };
    });
    return databasePromise;
  }

  async function readRecord(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || transaction.error);
      transaction.onabort = () => reject(transaction.error || createError('storage-read-failed', 'A leitura da capa foi interrompida.'));
    });
  }

  async function writeRecord(record) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(record);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || createError('storage-write-failed', 'A gravação da capa foi interrompida.'));
    });
  }

  async function deleteRecord(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(id);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || createError('storage-delete-failed', 'A exclusão da capa foi interrompida.'));
    });
  }

  async function inspectImage(file) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const result = { width: bitmap.width, height: bitmap.height, drawable: bitmap };
      return result;
    }
    if (typeof Image !== 'function') {
      throw createError('decode-unavailable', 'Este navegador não consegue validar a imagem selecionada.');
    }
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(createError('invalid-image', 'O arquivo selecionado não contém uma imagem válida.'));
        candidate.src = url;
      });
      return { width: image.naturalWidth, height: image.naturalHeight, drawable: image };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(createError('image-processing-failed', 'Não foi possível preparar a imagem selecionada.'));
      }, type, quality);
    });
  }

  async function prepare(file) {
    if (!(file instanceof Blob) || !String(file.type || '').toLowerCase().startsWith('image/')) {
      throw createError('unsupported-type', 'Escolha um arquivo de imagem válido.');
    }
    if (!file.size || file.size > maxInputBytes) {
      throw createError('file-too-large', 'Escolha uma imagem de até 20 MB.');
    }

    let inspection;
    try {
      inspection = await inspectImage(file);
    } catch (error) {
      if (error?.code) throw error;
      throw createError('invalid-image', 'O arquivo selecionado não pôde ser decodificado como imagem.');
    }

    const { width, height, drawable } = inspection;
    if (!width || !height || width > maxDecodedDimension || height > maxDecodedDimension) {
      drawable.close?.();
      throw createError('invalid-dimensions', 'A imagem possui dimensões inválidas ou grandes demais.');
    }

    const supportedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase());
    const needsResize = Math.max(width, height) > maxDimension || file.size > maxStoredBytes || !supportedType;
    if (!needsResize) {
      drawable.close?.();
      return { blob: file, width, height, optimized: false };
    }
    if (typeof document === 'undefined') {
      drawable.close?.();
      throw createError('image-processing-unavailable', 'Não foi possível otimizar esta imagem neste navegador.');
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      drawable.close?.();
      throw createError('image-processing-unavailable', 'Não foi possível preparar a imagem selecionada.');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(drawable, 0, 0, targetWidth, targetHeight);
    drawable.close?.();
    const blob = await canvasBlob(canvas, 'image/jpeg', 0.9);
    return { blob, width: targetWidth, height: targetHeight, optimized: true };
  }

  function releaseUrl(id) {
    const cached = urlCache.get(id);
    if (!cached) return;
    URL.revokeObjectURL(cached.url);
    urlCache.delete(id);
  }

  function cacheUrl(id, url, updatedAt) {
    urlCache.set(id, { url, updatedAt });
    while (urlCache.size > maxCachedUrls) {
      releaseUrl(urlCache.keys().next().value);
    }
  }

  async function save(id, file) {
    if (typeof id !== 'string' || !id) throw createError('invalid-playlist', 'A playlist não é válida.');
    const prepared = await prepare(file);
    await writeRecord({
      id,
      blob: prepared.blob,
      type: prepared.blob.type,
      width: prepared.width,
      height: prepared.height,
      updatedAt: Date.now()
    });
    releaseUrl(id);
    knownMissing.delete(id);
    pendingReads.delete(id);
    return getUrl(id);
  }

  async function getUrl(id) {
    if (urlCache.has(id)) {
      const cached = urlCache.get(id);
      urlCache.delete(id);
      urlCache.set(id, cached);
      return cached.url;
    }
    if (knownMissing.has(id)) return null;
    if (pendingReads.has(id)) return pendingReads.get(id);
    const pending = readRecord(id).then(record => {
      if (!record?.blob) {
        knownMissing.add(id);
        return null;
      }
      const url = URL.createObjectURL(record.blob);
      cacheUrl(id, url, record.updatedAt);
      return url;
    }).finally(() => pendingReads.delete(id));
    pendingReads.set(id, pending);
    return pending;
  }

  async function remove(id) {
    await deleteRecord(id);
    releaseUrl(id);
    pendingReads.delete(id);
    knownMissing.add(id);
    return true;
  }

  return { prepare, save, getUrl, remove };
})();

export default PlaylistCovers;
