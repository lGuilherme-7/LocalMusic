/**
 * download.js
 * Tenta download direto via cobalt.tools API (gratuita, sem chave).
 * Se a API recusar (400/401/CORS), copia a URL pro clipboard e abre
 * cobalt.tools para o usuário baixar com um clique.
 */

const Download = (() => {

  const API_URL  = 'https://api.cobalt.tools/';
  const SITE_URL = 'https://cobalt.tools/';

  const _statusCallbacks = [];

  function onStatus(fn) { _statusCallbacks.push(fn); }

  function _emit(state, message) {
    for (const fn of _statusCallbacks) fn({ state, message });
  }

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

  function _triggerDownload(url, filename = 'musica.mp3') {
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 1000);
  }

  async function _fallback(url) {
    try {
      await navigator.clipboard.writeText(url);
      _emit('success', 'URL copiada! Abrindo cobalt.tools — cole e clique em Baixar.');
    } catch {
      _emit('success', 'Abrindo cobalt.tools — cole sua URL lá e clique em Baixar.');
    }
    window.open(SITE_URL, '_blank', 'noopener');
  }

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
          'Accept':       'application/json'
        },
        body: JSON.stringify({
          url,
          downloadMode:  'audio',
          audioFormat:   'mp3',
          audioBitrate:  '128',
          filenameStyle: 'basic'
        })
      });

      if (!response.ok) throw new Error(`${response.status}`);

      const data = await response.json();

      if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
        _triggerDownload(data.url, 'musica.mp3');
        _emit('success', 'Download iniciado! Mova o MP3 para sua pasta de músicas.');
        return;
      }

      if (data.status === 'error') throw new Error(data.error?.code || 'erro_api');

      throw new Error('resposta_inesperada');

    } catch {
      await _fallback(url);
    }
  }

  return { downloadFromYouTube, onStatus };

})();

export default Download;
