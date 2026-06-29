/**
 * download.js
 * Integração com cobalt.tools API para download de músicas do YouTube em MP3.
 * Sem backend, sem chave de API, funciona direto no browser.
 * Endpoint: POST https://api.cobalt.tools/
 */

const Download = (() => {

  const API_URL = 'https://api.cobalt.tools/';

  /** Callbacks de estado registrados por ui.js */
  const _statusCallbacks = [];

  /**
   * Registra callback para atualizações de estado do download.
   * @param {Function} fn  Recebe { state: 'loading'|'success'|'error', message: string }
   */
  function onStatus(fn) {
    _statusCallbacks.push(fn);
  }

  /**
   * Notifica todos os callbacks de status.
   * @param {'loading'|'success'|'error'} state
   * @param {string} message
   */
  function _emit(state, message) {
    for (const fn of _statusCallbacks) fn({ state, message });
  }

  /**
   * Valida se a string é uma URL do YouTube válida.
   * @param {string} url
   * @returns {boolean}
   */
  function _isYouTubeURL(url) {
    try {
      const u = new URL(url);
      return (
        u.hostname === 'www.youtube.com' ||
        u.hostname === 'youtube.com'     ||
        u.hostname === 'youtu.be'        ||
        u.hostname === 'music.youtube.com'
      );
    } catch {
      return false;
    }
  }

  /**
   * Dispara o download de um arquivo a partir de uma URL.
   * Cria um <a download> temporário e simula o clique.
   * @param {string} url
   * @param {string} [filename]
   */
  function _triggerDownload(url, filename = 'musica.mp3') {
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 1000);
  }

  /**
   * Faz a requisição para a cobalt.tools API e inicia o download.
   * @param {string} youtubeURL  URL do vídeo/música do YouTube
   * @returns {Promise<void>}
   */
  async function downloadFromYouTube(youtubeURL) {
    const url = youtubeURL.trim();

    if (!url) {
      _emit('error', 'Cole uma URL do YouTube antes de baixar.');
      return;
    }

    if (!_isYouTubeURL(url)) {
      _emit('error', 'URL inválida. Use um link do YouTube (youtube.com ou youtu.be).');
      return;
    }

    _emit('loading', 'Processando...');

    try {
      const response = await fetch(API_URL, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept':       'application/json',
          'X-API-Version': '1'
        },
        body: JSON.stringify({
          url,
          downloadMode: 'audio',
          audioFormat:  'mp3',
          audioBitrate: '128',
          filenameStyle: 'basic'
        })
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status}`);
      }

      const data = await response.json();

      // cobalt.tools retorna { status: "tunnel"|"redirect", url: "..." }
      if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
        _triggerDownload(data.url, 'musica.mp3');
        _emit('success', 'Download iniciado! Mova o arquivo MP3 para sua pasta de músicas.');
      } else if (data.status === 'error') {
        const msg = data.error?.code || 'erro desconhecido';
        throw new Error(msg);
      } else {
        throw new Error('Resposta inesperada da API.');
      }

    } catch (err) {
      const msg = err.message || 'Não foi possível baixar. Tente novamente.';
      _emit('error', `Falha: ${msg}`);
    }
  }

  return { downloadFromYouTube, onStatus };

})();

export default Download;