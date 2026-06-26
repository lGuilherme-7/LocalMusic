/**
 * queue.js
 * Gerencia a fila de reprodução.
 * Suporta modos: normal, repeat-one, repeat-all, shuffle.
 * O shuffle embaralha uma cópia da fila sem alterar a biblioteca original.
 */

const Queue = (() => {

  /** @type {'normal'|'repeat-one'|'repeat-all'} */
  let _repeatMode = 'normal';

  /** @type {boolean} */
  let _shuffle = false;

  /** Fila original (ordem da biblioteca ou playlist) */
  let _queue = [];

  /** Fila embaralhada (usada quando shuffle está ativo) */
  let _shuffled = [];

  /** Índice atual na fila ativa */
  let _index = 0;

  /**
   * Embaralha um array usando Fisher-Yates.
   * @param {any[]} arr
   * @returns {any[]}
   */
  function _shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Retorna a fila ativa (embaralhada ou normal) */
  function _active() {
    return _shuffle ? _shuffled : _queue;
  }

  /**
   * Define a fila de reprodução.
   * @param {object[]} tracks  Array de faixas
   * @param {number}   startIndex  Índice inicial
   */
  function set(tracks, startIndex = 0) {
    _queue    = [...tracks];
    _shuffled = _shuffleArray(tracks);

    // No shuffle, coloca a faixa inicial na posição 0
    if (_shuffle && tracks[startIndex]) {
      const target = tracks[startIndex];
      const pos    = _shuffled.findIndex(t => t.id === target.id);
      if (pos > 0) {
        [_shuffled[0], _shuffled[pos]] = [_shuffled[pos], _shuffled[0]];
      }
      _index = 0;
    } else {
      _index = startIndex;
    }
  }

  /**
   * Retorna a faixa atual.
   * @returns {object|null}
   */
  function current() {
    const q = _active();
    return q[_index] || null;
  }

  /**
   * Avança para a próxima faixa.
   * Respeita repeat-all e retorna null ao fim em modo normal.
   * @returns {object|null}
   */
  function next() {
    const q = _active();
    if (!q.length) return null;

    if (_repeatMode === 'repeat-one') {
      return q[_index];
    }

    _index++;
    if (_index >= q.length) {
      if (_repeatMode === 'repeat-all') {
        _index = 0;
      } else {
        _index = q.length - 1;
        return null; // fim da fila
      }
    }
    return q[_index];
  }

  /**
   * Volta para a faixa anterior.
   * @returns {object|null}
   */
  function prev() {
    const q = _active();
    if (!q.length) return null;

    if (_repeatMode === 'repeat-one') {
      return q[_index];
    }

    _index--;
    if (_index < 0) {
      _index = _repeatMode === 'repeat-all' ? q.length - 1 : 0;
    }
    return q[_index];
  }

  /**
   * Verifica se há próxima faixa disponível.
   * @returns {boolean}
   */
  function hasNext() {
    if (_repeatMode !== 'normal') return true;
    return _index < _active().length - 1;
  }

  /**
   * Verifica se há faixa anterior disponível.
   * @returns {boolean}
   */
  function hasPrev() {
    if (_repeatMode !== 'normal') return true;
    return _index > 0;
  }

  /**
   * Ativa ou desativa o modo shuffle.
   * @param {boolean} enabled
   */
  function setShuffle(enabled) {
    const currentTrack = current();
    _shuffle = enabled;

    if (enabled) {
      _shuffled = _shuffleArray(_queue);
      // Coloca a faixa atual na posição 0 do shuffle
      if (currentTrack) {
        const pos = _shuffled.findIndex(t => t.id === currentTrack.id);
        if (pos > 0) {
          [_shuffled[0], _shuffled[pos]] = [_shuffled[pos], _shuffled[0]];
        }
        _index = 0;
      }
    } else {
      // Ao sair do shuffle, sincroniza índice com a fila original
      if (currentTrack) {
        _index = _queue.findIndex(t => t.id === currentTrack.id);
        if (_index < 0) _index = 0;
      }
    }
  }

  /**
   * Cicla entre os modos de repeat: normal → repeat-all → repeat-one → normal
   * @returns {'normal'|'repeat-all'|'repeat-one'} novo modo
   */
  function cycleRepeat() {
    if (_repeatMode === 'normal')      _repeatMode = 'repeat-all';
    else if (_repeatMode === 'repeat-all') _repeatMode = 'repeat-one';
    else                               _repeatMode = 'normal';
    return _repeatMode;
  }

  /**
   * Define o modo repeat diretamente.
   * @param {'normal'|'repeat-all'|'repeat-one'} mode
   */
  function setRepeat(mode) {
    _repeatMode = mode;
  }

  /** @returns {'normal'|'repeat-all'|'repeat-one'} */
  function getRepeatMode() { return _repeatMode; }

  /** @returns {boolean} */
  function isShuffled() { return _shuffle; }

  /** @returns {number} índice atual */
  function getIndex() { return _index; }

  /** @returns {object[]} fila ativa completa */
  function getQueue() { return [..._active()]; }

  return {
    set, current, next, prev, hasNext, hasPrev,
    setShuffle, cycleRepeat, setRepeat,
    getRepeatMode, isShuffled, getIndex, getQueue
  };

})();

export default Queue;