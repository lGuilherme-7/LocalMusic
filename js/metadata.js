/**
 * metadata.js
 * Extrai metadados de arquivos de áudio usando jsmediatags (CDN global).
 * Obtém: título, artista, álbum, capa (base64 data URL).
 * Aplica fallbacks para campos ausentes.
 */

const Metadata = (() => {

  /**
   * Converte um ArrayBuffer de imagem em data URL base64.
   * @param {{ format: string, data: number[] }} picture
   * @returns {string} data URL
   */
  function _pictureToDataURL(picture) {
    const bytes = new Uint8Array(picture.data);
    const chunks = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return `data:${picture.format};base64,${btoa(chunks.join(''))}`;
  }

  /**
   * Remove extensão do nome de arquivo para usar como título fallback.
   * @param {string} filename
   * @returns {string}
   */
  function _nameFromFile(filename) {
    return filename.replace(/\.[^.]+$/, '');
  }

  /**
   * Extrai metadados de um File de áudio.
   * Retorna uma Promise com o objeto de metadados normalizados.
   * @param {File} file
   * @returns {Promise<{ title: string, artist: string, album: string, cover: string|null, duration: number }>}
   */
  function extract(file) {
    return new Promise((resolve) => {
      // jsmediatags é carregado via CDN como global window.jsmediatags
      if (typeof window.jsmediatags === 'undefined') {
        resolve(_fallback(file));
        return;
      }

      let settled = false;
      const finish = metadata => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(metadata);
      };
      const timeout = setTimeout(() => finish(_fallback(file)), 8000);
      window.jsmediatags.read(file, {
        onSuccess(tag) {
          if (settled) return;
          const t = tag.tags;
          const title  = (t.title  && t.title.trim())  || _nameFromFile(file.name);
          const artist = (t.artist && t.artist.trim()) || 'Artista desconhecido';
          const album  = (t.album  && t.album.trim())  || 'Álbum desconhecido';
          const cover  = (t.picture) ? _pictureToDataURL(t.picture) : null;

          finish({ title, artist, album, cover, duration: 0 });
        },
        onError() {
          finish(_fallback(file));
        }
      });
    });
  }

  /**
   * Retorna metadados de fallback quando jsmediatags falha.
   * @param {File} file
   * @returns {{ title: string, artist: string, album: string, cover: null, duration: number }}
   */
  function _fallback(file) {
    return {
      title:    _nameFromFile(file.name),
      artist:   'Artista desconhecido',
      album:    'Álbum desconhecido',
      cover:    null,
      duration: 0
    };
  }

  /**
   * Preenche a duração de uma faixa usando um elemento <audio> temporário.
   * Resolve com a duração em segundos (ou 0 se falhar).
   * @param {File} file
   * @returns {Promise<number>}
   */
  function getDuration(file) {
    return new Promise((resolve) => {
      // No Windows, .opus costuma chegar com file.type vazio, o que
      // impede o <audio> de decodificar via blob URL.
      const playable = (!file.type && file.name.toLowerCase().endsWith('.opus'))
        ? new Blob([file], { type: 'audio/ogg; codecs=opus' })
        : file;
      const url   = URL.createObjectURL(playable);
      const audio = new Audio();
      let settled = false;
      const finish = duration => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        audio.removeAttribute?.('src');
        audio.load?.();
        URL.revokeObjectURL(url);
        resolve(duration);
      };
      const timeout = setTimeout(() => finish(0), 10000);
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const dur = isFinite(audio.duration) ? audio.duration : 0;
        finish(dur);
      };
      audio.onerror = () => finish(0);
      audio.src = url;
    });
  }

  return { extract, getDuration };

})();

export default Metadata;
