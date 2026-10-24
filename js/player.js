import Storage from './storage.js';
import Queue from './queue.js';

/**
 * Controla um único HTMLAudioElement e mantém a interface sincronizada com a
 * fonte efetivamente carregada. Cada troca recebe uma geração para que
 * Promises e eventos atrasados não alterem a faixa mais recente.
 */
const Player = (() => {
  const audio = document.getElementById('audio-player');
  const callbacks = {
    play: [],
    pause: [],
    track: [],
    time: [],
    seek: [],
    end: [],
    error: [],
    state: [],
    playbackBlocked: []
  };

  let currentTrack = null;
  let audioUrl = null;
  let generation = 0;
  let state = 'idle';
  let wantsPlayback = false;
  let switchingSource = false;
  let activePlayRequest = null;
  const haveMetadata = typeof HTMLMediaElement === 'undefined'
    ? 1
    : HTMLMediaElement.HAVE_METADATA;
  const haveFutureData = typeof HTMLMediaElement === 'undefined'
    ? 3
    : HTMLMediaElement.HAVE_FUTURE_DATA;

  function subscribe(type, callback) {
    if (typeof callback === 'function') callbacks[type].push(callback);
  }

  function emit(type, ...args) {
    callbacks[type].forEach(callback => {
      try {
        const result = callback(...args);
        if (result?.catch) {
          result.catch(error => {
            console.error(`Local Music player: falha assíncrona no callback ${type}.`, error);
          });
        }
      } catch (error) {
        console.error(`Local Music player: falha no callback ${type}.`, error);
      }
    });
  }

  function setState(nextState, details = {}) {
    if (state === nextState && !details.force) return;
    state = nextState;
    emit('state', { state, track: currentTrack, ...details });
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, '0')}`;
  }

  function playableFile(file) {
    if (file.type) return file;
    if (file.name.toLowerCase().endsWith('.opus')) {
      return new Blob([file], { type: 'audio/ogg; codecs=opus' });
    }
    return file;
  }

  function sourceMatchesCurrent() {
    if (!audioUrl) return false;
    const selectedSource = audio.currentSrc || audio.src;
    return !selectedSource || selectedSource === audioUrl;
  }

  function emitTime(current = audio.currentTime, duration = audio.duration) {
    const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    emit('time', {
      current: safeCurrent,
      duration: safeDuration,
      ratio: safeDuration ? Math.min(1, safeCurrent / safeDuration) : 0
    });
  }

  function detachCurrentSource() {
    const previousUrl = audioUrl;
    switchingSource = true;
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } finally {
      switchingSource = false;
    }
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    audioUrl = null;
  }

  /**
   * Carrega uma faixa e solicita reprodução. O tempo é zerado de forma
   * síncrona, antes de qualquer metadado da nova fonte chegar.
   */
  function loadTrack(track) {
    if (!track?.file) return false;

    generation += 1;
    wantsPlayback = true;
    detachCurrentSource();

    currentTrack = track;
    audioUrl = URL.createObjectURL(playableFile(track.file));
    audio.src = audioUrl;
    try {
      audio.currentTime = 0;
    } catch {
      // Safari pode rejeitar currentTime antes de selecionar a nova fonte.
    }

    Storage.set('lm_last_track', track.id);
    Storage.set('lm_current_track', track.id);
    Storage.set('lm_current_time', 0);
    setState('loading', { generation, force: true });
    emit('track', track);
    emitTime(0, 0);
    audio.load();
    void play();
    return true;
  }

  /**
   * Solicita reprodução e expõe o resultado para controles e testes.
   * Rejeições de autoplay são estados recuperáveis, não sucessos silenciosos.
   */
  async function play() {
    if (!currentTrack || !audioUrl) return false;
    const requestedGeneration = generation;
    const request = { generation: requestedGeneration };
    wantsPlayback = true;
    activePlayRequest = request;
    if (state !== 'playing' && state !== 'buffering') setState('loading');

    try {
      await Promise.resolve(audio.play());
      if (activePlayRequest !== request || requestedGeneration !== generation) return false;
      activePlayRequest = null;
      return wantsPlayback;
    } catch (error) {
      if (activePlayRequest !== request || requestedGeneration !== generation) return false;
      activePlayRequest = null;
      wantsPlayback = false;
      const blocked = error?.name === 'NotAllowedError';
      setState(blocked ? 'blocked' : 'error', { error, force: true });
      emit('pause');
      if (blocked) emit('playbackBlocked', { error, track: currentTrack });
      else emit('error', error, { operation: 'play', track: currentTrack });
      return false;
    }
  }

  function pause() {
    wantsPlayback = false;
    activePlayRequest = null;
    audio.pause();
    if (state !== 'paused') {
      setState('paused');
      emit('pause');
    }
  }

  function togglePlayPause() {
    if (wantsPlayback || state === 'playing' || state === 'buffering') pause();
    else void play();
  }

  function seek(time) {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!Number.isFinite(time) || !duration) return false;
    audio.currentTime = Math.max(0, Math.min(time, duration));
    return true;
  }

  function seekRatio(ratio) {
    if (!Number.isFinite(ratio)) return false;
    return seek(Math.max(0, Math.min(1, ratio)) * getDuration());
  }

  function setVolume(value) {
    const volume = Math.max(0, Math.min(100, Number(value) || 0));
    audio.volume = volume / 100;
    Storage.set('lm_volume', volume);
  }

  const getVolume = () => Math.round(audio.volume * 100);
  const getCurrentTime = () => Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  const getDuration = () => Number.isFinite(audio.duration) ? audio.duration : 0;
  const getCurrentTrack = () => currentTrack;
  const getState = () => state;
  const isPlaying = () => state === 'playing' || state === 'buffering';

  function next() {
    const track = Queue.next();
    return track ? loadTrack(track) : false;
  }

  function prev() {
    if (getCurrentTime() > 3) return seek(0);
    const track = Queue.prev();
    return track ? loadTrack(track) : false;
  }

  audio.addEventListener('loadstart', () => {
    if (sourceMatchesCurrent() && wantsPlayback) setState('loading');
  });
  audio.addEventListener('loadedmetadata', () => {
    if (sourceMatchesCurrent() && audio.readyState >= haveMetadata) emitTime();
  });
  audio.addEventListener('durationchange', () => {
    if (sourceMatchesCurrent() && audio.readyState >= haveMetadata) emitTime();
  });
  audio.addEventListener('playing', () => {
    if (!sourceMatchesCurrent() || !wantsPlayback || audio.paused || audio.readyState < haveFutureData) return;
    setState('playing');
    emit('play');
  });
  audio.addEventListener('waiting', () => {
    if (sourceMatchesCurrent() && wantsPlayback) setState('buffering');
  });
  audio.addEventListener('stalled', () => {
    if (sourceMatchesCurrent() && wantsPlayback) setState('buffering');
  });
  audio.addEventListener('pause', () => {
    if (switchingSource || !sourceMatchesCurrent()) return;
    if (wantsPlayback && (activePlayRequest?.generation === generation || !audio.paused)) return;
    wantsPlayback = false;
    setState('paused');
    emit('pause');
  });
  audio.addEventListener('timeupdate', () => {
    if (!sourceMatchesCurrent()) return;
    const current = getCurrentTime();
    if (Math.floor(current) % 5 === 0) Storage.set('lm_current_time', current);
    emitTime(current, getDuration());
  });
  audio.addEventListener('seeking', () => {
    if (sourceMatchesCurrent()) emit('seek', getCurrentTime());
  });
  audio.addEventListener('seeked', () => {
    if (sourceMatchesCurrent()) emit('seek', getCurrentTime());
  });
  audio.addEventListener('ended', () => {
    if (!sourceMatchesCurrent() || !audio.ended) return;
    wantsPlayback = false;
    activePlayRequest = null;
    setState('ended');
    emit('end');
    const track = Queue.next({ automatic: true });
    if (track) loadTrack(track);
  });
  audio.addEventListener('error', () => {
    if (!sourceMatchesCurrent() || !audio.error) return;
    wantsPlayback = false;
    activePlayRequest = null;
    const error = audio.error || new Error('Falha desconhecida no elemento de áudio.');
    setState('error', { error, force: true });
    emit('pause');
    emit('error', error, { operation: 'media', track: currentTrack });
  });

  const savedVolume = Storage.get('lm_volume');
  setVolume(savedVolume === null ? 80 : savedVolume);

  return {
    loadTrack,
    play,
    pause,
    togglePlayPause,
    seek,
    seekRatio,
    setVolume,
    getVolume,
    getCurrentTime,
    getDuration,
    isPlaying,
    getCurrentTrack,
    getState,
    next,
    prev,
    formatTime,
    onPlay: callback => subscribe('play', callback),
    onPause: callback => subscribe('pause', callback),
    onTrack: callback => subscribe('track', callback),
    onTime: callback => subscribe('time', callback),
    onSeek: callback => subscribe('seek', callback),
    onEnd: callback => subscribe('end', callback),
    onError: callback => subscribe('error', callback),
    onState: callback => subscribe('state', callback),
    onPlaybackBlocked: callback => subscribe('playbackBlocked', callback)
  };
})();

export default Player;
