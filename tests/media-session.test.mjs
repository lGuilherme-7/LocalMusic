import assert from 'node:assert/strict';

const handlers = new Map();
const positions = [];
const mediaSession = {
  metadata: null,
  playbackState: 'none',
  setActionHandler(name, handler) {
    handlers.set(name, handler);
  },
  setPositionState(value) {
    positions.push(value);
  }
};

Object.defineProperty(globalThis, 'navigator', {
  value: { mediaSession },
  configurable: true
});
globalThis.MediaMetadata = class {
  constructor(value) {
    Object.assign(this, value);
  }
};

const listeners = {};
const calls = [];
const Player = {
  play() { calls.push(['play']); },
  pause() { calls.push(['pause']); },
  prev() { calls.push(['previous']); },
  next() { calls.push(['next']); },
  seek(value) { calls.push(['seek', value]); },
  getCurrentTime: () => 20,
  onTrack: callback => { listeners.track = callback; },
  onPlay: callback => { listeners.play = callback; },
  onPause: callback => { listeners.pause = callback; },
  onState: callback => { listeners.state = callback; },
  onTime: callback => { listeners.time = callback; }
};

const { default: MediaSession } = await import('../js/media-session.js');
MediaSession.setup(Player);

assert.deepEqual([...handlers.keys()].sort(), [
  'nexttrack',
  'pause',
  'play',
  'previoustrack',
  'seekbackward',
  'seekforward',
  'seekto'
]);

listeners.track({
  title: 'Música 🎵',
  artist: 'Beyoncé',
  album: '日本語',
  cover: 'blob:cover-atual'
});
assert.equal(mediaSession.metadata.title, 'Música 🎵');
assert.deepEqual(mediaSession.metadata.artwork, [{ src: 'blob:cover-atual' }]);

listeners.play();
assert.equal(mediaSession.playbackState, 'playing');
listeners.state({ state: 'loading' });
assert.equal(mediaSession.playbackState, 'paused', 'carregamento não pode permanecer anunciado como reprodução');
listeners.pause();
assert.equal(mediaSession.playbackState, 'paused');

await new Promise(resolve => setTimeout(resolve, 1001));
listeners.time({ current: 134, duration: 180 });
assert.deepEqual(positions.at(-1), {
  duration: 180,
  playbackRate: 1,
  position: 134
});

handlers.get('seekto')({ seekTime: 42 });
handlers.get('seekbackward')();
handlers.get('seekforward')({ seekOffset: 15 });
handlers.get('play')();
handlers.get('pause')();
handlers.get('nexttrack')();
handlers.get('previoustrack')();
assert.deepEqual(calls, [
  ['seek', 42],
  ['seek', 10],
  ['seek', 35],
  ['play'],
  ['pause'],
  ['next'],
  ['previous']
]);

delete globalThis.MediaMetadata;
handlers.clear();
assert.doesNotThrow(() => MediaSession.setup(Player));
assert.equal(handlers.size, 7, 'controles devem funcionar mesmo quando MediaMetadata não existe');
assert.doesNotThrow(() => MediaSession.updateTrack({ title: 'Sem construtor' }));

Object.defineProperty(globalThis, 'navigator', {
  value: {},
  configurable: true
});
assert.doesNotThrow(() => MediaSession.setup(Player));
assert.doesNotThrow(() => MediaSession.updateTrack({ title: 'Sem API' }));

console.log('media-session.test.mjs: metadados, ações, ausência parcial da API, estado e posição passaram');
