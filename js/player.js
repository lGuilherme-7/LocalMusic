/**
 * player.js
 * Controla a reprodução de áudio via HTMLAudioElement.
 * Atualiza a interface a cada segundo via timeupdate.
 * Salva estado no localStorage via Storage.
 * Comunica-se com Queue para navegação entre faixas.
 */

import Storage from './storage.js';
import Queue   from './queue.js';

const Player = (() => {

  /** @type {HTMLAudioElement} */
  const _audio = document.getElementById('audio-player');

  /** Faixa atualmente carregada */
  let _currentTrack = null;

  /** Callbacks registrados */
  const _onPlayCallbacks    = [];
  const _onPauseCallbacks   = [];
  const _onTrackCallbacks   = [];
  const _onTimeCallbacks    = [];
  const _onEndCallbacks     = [];

  /** Registra callback para evento de play */
  function onPlay(fn)    { _onPlayCallbacks.push(fn); }
  /** Registra callback para evento de pause */
  function onPause(fn)   { _onPauseCallbacks.push(fn); }
  /** Registra callback quando a faixa muda */
  function onTrack(fn)   { _onTrackCallbacks.push(fn); }
  /** Registra callback para atualização de tempo (timeupdate) */
  function onTime(fn)    { _onTimeCallbacks.push(fn); }
  /** Registra callback para fim de faixa */
  function onEnd(fn)     { _onEndCallbacks.push(fn); }

  function _emit(list, ...args) {
    for (const fn of list) fn(...args);
  }

  /**
   * Formata segundos em "m:ss".
   * @param {number} seconds
   * @returns {string}
   */
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Carrega e reproduz uma faixa.
   * @param {object} track  objeto do Library com .file e metadados
   */
  function loadTrack(track) {
    if (!track || !track.file) return;

    // Revoga URL antiga para liberar memória
    if (_audio.src && _audio.src.startsWith('blob:')) {
      URL.revokeObjectURL(_audio.src);
    }

    _currentTrack = track;
    _audio.src    = URL.createObjectURL(track.file);
    _audio.load();

    Storage.set('lm_last_track', track.id);
    _emit(_onTrackCallbacks, track);
    play();
  }

  /**
   * Reproduz o áudio atual.
   */
  function play() {
    if (!_audio.src) return;
    _audio.play().catch(() => {/* autoplay bloqueado — silencioso */});
  }

  /**
   * Pausa o áudio atual.
   */
  function pause() {
    _audio.pause();
  }

  /**
   * Alterna entre play e pause.
   */
  function togglePlayPause() {
    if (_audio.paused) play();
    else               pause();
  }

  /**
   * Salta para uma posição específica.
   * @param {number} time  segundos
   */
  function seek(time) {
    if (!isFinite(time)) return;
    _audio.currentTime = Math.max(0, Math.min(time, _audio.duration || 0));
  }

  /**
   * Salta para uma posição relativa (0–1).
   * @param {number} ratio  0 a 1
   */
  function seekRatio(ratio) {
    seek(ratio * (_audio.duration || 0));
  }

  /**
   * Define o volume.
   * @param {number} v  0 a 100
   */
  function setVolume(v) {
    const vol      = Math.max(0, Math.min(100, v));
    _audio.volume  = vol / 100;
    Storage.set('lm_volume', vol);
  }

  /**
   * Retorna o volume atual (0–100).
   * @returns {number}
   */
  function getVolume() {
    return Math.round(_audio.volume * 100);
  }

  /**
   * Retorna o tempo atual em segundos.
   * @returns {number}
   */
  function getCurrentTime() {
    return _audio.currentTime || 0;
  }

  /**
   * Retorna a duração total em segundos.
   * @returns {number}
   */
  function getDuration() {
    return _audio.duration || 0;
  }

  /**
   * Retorna true se o áudio está reproduzindo.
   * @returns {boolean}
   */
  function isPlaying() {
    return !_audio.paused;
  }

  /**
   * Retorna a faixa carregada atualmente.
   * @returns {object|null}
   */
  function getCurrentTrack() {
    return _currentTrack;
  }

  /**
   * Carrega e toca a próxima faixa da Queue.
   */
  function next() {
    const track = Queue.next();
    if (track) loadTrack(track);
  }

  /**
   * Carrega e toca a faixa anterior da Queue.
   * Se passou mais de 3s, reinicia a faixa atual.
   */
  function prev() {
    if (_audio.currentTime > 3) {
      seek(0);
      return;
    }
    const track = Queue.prev();
    if (track) loadTrack(track);
  }

  // ── Eventos internos do <audio> ──────────────────────────────

  _audio.addEventListener('play',  () => _emit(_onPlayCallbacks));
  _audio.addEventListener('pause', () => _emit(_onPauseCallbacks));

  _audio.addEventListener('timeupdate', () => {
    _emit(_onTimeCallbacks, {
      current:   _audio.currentTime,
      duration:  _audio.duration || 0,
      ratio:     _audio.duration ? _audio.currentTime / _audio.duration : 0
    });
  });

  _audio.addEventListener('ended', () => {
    _emit(_onEndCallbacks);
    const nextTrack = Queue.next();
    if (nextTrack) {
      loadTrack(nextTrack);
    }
  });

  // ── Restaura volume salvo ─────────────────────────────────────
  const savedVolume = Storage.get('lm_volume');
  if (savedVolume !== null) {
    setVolume(savedVolume);
  } else {
    setVolume(80);
  }

  return {
    loadTrack, play, pause, togglePlayPause,
    seek, seekRatio, setVolume, getVolume,
    getCurrentTime, getDuration, isPlaying, getCurrentTrack,
    next, prev, formatTime,
    onPlay, onPause, onTrack, onTime, onEnd
  };

})();

export default Player;